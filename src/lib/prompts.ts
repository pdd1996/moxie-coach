// ===== S7-F7：AI 教练四件套提示词 =====
// 全部纯函数：输入题目/代码上下文，输出 ChatMessage[]，供 chatAI 直接消费。
// 方法论来源：docs/specs/S1-F1/套路映射.md 的「找入口三步法」「边界三问」。
// 设计要点（PRD 风险表）：F7.1 把「禁止输出完整代码」写成硬约束 + 分层设计，
// 防止给出变相答案；四件套的输出形态各自钉死（纯文本 / 题解模板 / 要点+JSON / 一句话）。
import type { ChatMessage } from '@/lib/ai'
import type { Lang, Problem, TestCase } from '@/lib/types'

/** 题目上下文（四件套共用）：题号/标题/难度/套路/判断信号 + 题面全文 */
function problemBlock(p: Problem): string {
  const head = [`题目：${p.id}. ${p.title}（${p.difficulty}）`, `套路：${p.pattern}`]
  if (p.signal) head.push(`判断信号：${p.signal}`)
  head.push('', '【题面】', p.statement?.trim() || '（用户未粘贴题面，按题号、标题与套路推理）')
  return head.join('\n')
}

/** 用户当前代码；过长截断，空白时明说（教练要区分「没动笔」和「写到一半」） */
function codeBlock(code: string, lang: Lang): string {
  const trimmed = code.trim()
  const clipped = trimmed.length > 2000 ? `${trimmed.slice(0, 2000)}\n…（过长截断）` : trimmed
  return `【用户当前${lang === 'python' ? 'Python' : 'JavaScript'}代码】\n${
    clipped ? `\`\`\`${lang}\n${clipped}\n\`\`\`` : '（还是空白，用户没动笔）'
  }`
}

// ---------- F7.1 卡住提示 ----------

const HINT_SYSTEM = `你是「默写教练」里的 AI 刷题教练。用户正在尝试独立解一道算法题，卡住了来要提示。你的职责是引导他自己想出来，不是替他解题。

铁律（任何情况下不可违反）：
- 禁止输出代码、伪代码、或能直接照抄的分步算法（「i 从 0 循环到 n，比较 a[i] 和 b[j]，小的放进 c」这种就是照抄级）。
- 只说「做什么」，不说「怎么写」：不描述具体的循环/下标/赋值逻辑。
- 一次只给当前这一层，不预告、不补充别的层。
- 回复 2~4 句中文，口吻像坐在旁边的教练，多提问、少说教。

提示共三层，对应「找入口三步法」：
- 第 1 层 · 引导手算：完全不提代码。让用户拿题面里的一个具体例子（或自造小例子）在纸上一步步走一遍，以问句收尾（问他在重复做什么动作）。
- 第 2 层 · 观察动作：帮用户把手算时重复的动作「命名」成机器可执行的步骤（可以点出套路名，用户本来就看得见套路标签）。只说每一步在做什么，不说怎么用代码实现。
- 第 3 层 · 点破陷阱：指出这道题最典型的一个坑（覆盖/越界/方向/边界/相等时的处理），给方向性纠正（「换个方向填」「想想谁先到头」），不给具体实现。`

/** F7.1 卡住提示：level 1~3 逐层按需请求，带上已给过的层保证递进 */
export function buildHintMessages(
  problem: Problem,
  lang: Lang,
  code: string,
  level: number,
  prevHints: string[],
): ChatMessage[] {
  const layerTask = [
    '第 1 层 · 引导手算：完全不提代码，引导用户手算一个具体例子，以问句收尾。',
    '第 2 层 · 观察动作：帮用户把手算重复的动作命名成机器步骤（可点名套路），不给实现。',
    '第 3 层 · 点破陷阱：点出这题最典型的坑并给方向性纠正，不给实现。',
  ][level - 1]
  const parts = [problemBlock(problem), codeBlock(code, lang)]
  if (prevHints.length) {
    parts.push(`【已给过的提示（用户看完仍然卡着）】\n${prevHints.map((h, i) => `第 ${i + 1} 层：${h}`).join('\n')}`)
  }
  parts.push(`用户要第 ${level} 层提示。${layerTask}\n只输出这一层提示本身：不要标题、不要编号、不要重复前面的层、不要代码。`)
  return [
    { role: 'system', content: HINT_SYSTEM },
    { role: 'user', content: parts.join('\n\n') },
  ]
}

// ---------- F7.3 题解生成 ----------

const SOLUTION_SYSTEM = `你是「默写教练」的 AI 教练，为 LeetCode 题目生成结构化题解。用户已放弃独立尝试、决定看题解，此时可以给出完整代码。

输出 Markdown，严格用以下结构（与本地题解模板一致，标题不许改）：

## 套路：<套路名>

**判断信号**：<看到什么特征该想起这个套路，一两句>

## 思路（找入口三步法）

1. **手算一个例子**：<拿题面示例或自造小例子走一遍>
2. **观察动作**：<把重复动作拆成机器步骤，点出套路名>
3. **陷阱与调整**：<这题最容易踩的坑与对策>

## 模板代码

\`\`\`python
<Python 实现，简短、带关键行注释>
\`\`\`

\`\`\`javascript
<JavaScript 实现，与 Python 等价>
\`\`\`

## 边界三问

- **越界？** <下标/指针谁先到头、到头后怎么办>
- **空输入？** <空数组/空串等退化情况>
- **极端数据？** <最小/最大规模、全相等/重复元素等>

要求：思路讲「为什么」不啰嗦；两种语言实现等价；整体不超过 120 行 markdown。`

/** F7.3 题解生成：本地无题解时按模板结构生成（可含完整代码 -- 此时用户已放弃尝试） */
export function buildSolutionMessages(problem: Problem): ChatMessage[] {
  return [
    { role: 'system', content: SOLUTION_SYSTEM },
    { role: 'user', content: `${problemBlock(problem)}\n\n请按模板结构生成这道题的题解。` },
  ]
}

// ---------- F7.2 边界审查 ----------

const REVIEW_SYSTEM = `你是「默写教练」的 AI 教练。用户刚默写通过了这道题，你按「边界三问」审查他的代码：

1. 指针/下标会不会越界？（谁先到头？到了头还在用怎么办？）
2. 空输入会不会出事？（数量型参数各试一次 0）
3. 极端数据会不会出事？（每条 if 分支各造一个「永远只走它」的例子）

规则：
- 只挑毛病，不给修复代码、不给修改后的代码片段。
- 代码若确实健壮，如实说没挑出毛病，并把攻击用例出得更刁钻。
- 输出分两部分，缺一不可：
  ① 先用 2~4 条要点指出潜在问题（markdown 无序列表，每条一句话，说明哪个输入形状可能出事）；
  ② 然后输出一个 \`\`\`json 围栏，内含恰好 3 个攻击用例的 JSON 数组。

攻击用例 JSON 数组格式（args/expected 都是「字符串形式的 JSON 字面量」：数组 [1,2] 写 "[1,2]"，数字 5 写 "5"，字符串 a 写 "\\"a\\""；仅原地修改型题才加 "outArg": N 从 0 数）。
**args 的元素个数必须等于函数入参个数**（题目上下文会给出具体数字）。
下面是【格式范例，照抄格式即可，不是本题答案】：
\`\`\`json
[{"label":"空输入","args":["[]"],"expected":"0"},{"label":"单元素","args":["[7]"],"expected":"7"},{"label":"全相等","args":["[3,3,3]"],"expected":"3"}]
\`\`\`
必须严格照此格式输出恰好 3 条，不要用 markdown 列表或散文代替 JSON 数组，不要解释 JSON 字段。`

/** F7.2 边界审查：只挑毛病不给修复代码，末尾输出 3 个攻击用例（TestCase JSON） */
export function buildReviewMessages(problem: Problem, code: string, lang: Lang): ChatMessage[] {
  const entry = problem.entry?.[lang]
  const entryDesc = entry
    ? `入口：${entry.callType === 'method' ? 'class Solution 的方法' : '自由函数'} \`${entry.name}\`，调用语言为 ${
        lang === 'python' ? 'Python' : 'JavaScript'
      }`
    : '入口：未识别（按题面函数签名推理）'
  // 参数个数从现有用例推断（EntrySpec 不存参数数）；告知模型 + 解析时过滤，双保险
  const arity = problem.testCases[0]?.args.length
  const arityDesc = arity != null ? `该入口有 ${arity} 个参数：每个用例的 args 数组必须恰好 ${arity} 个元素。` : ''
  const cases = problem.testCases.length
    ? `\`\`\`json\n${JSON.stringify(problem.testCases)}\n\`\`\``
    : '（暂无用例）'
  return [
    { role: 'system', content: REVIEW_SYSTEM },
    {
      role: 'user',
      content: [
        problemBlock(problem),
        entryDesc,
        arityDesc,
        codeBlock(code, lang),
        `【现有测试用例（你的攻击用例不要与它们重复）】\n${cases}`,
        '请按规则审查并输出攻击用例。',
      ].filter(Boolean).join('\n\n'),
    },
  ]
}

// ---------- F7.4 错题提示卡 ----------

const HINTCARD_SYSTEM = `你是「默写教练」的 AI 教练。用户刚在这道题的默写中失败了。对比他的代码与题解（若有），找出他卡住的真正原因，为他写一张「下次提示卡」。

规则：
- 输出恰好一句话，不超过 40 个字，中文。
- 点出卡点或下次动笔前要先想清楚的事（如「先想清楚谁先到头再动笔」），不给答案、不给代码。
- 直接输出这句话本身：不要引号、不要任何前后缀。`

/** F7.4 错题复盘：对比代码与题解生成一句话提示卡（存 problem.hintCard，复习时展示） */
export function buildHintCardMessages(problem: Problem, code: string, lang: Lang): ChatMessage[] {
  const parts = [problemBlock(problem), codeBlock(code, lang)]
  if (problem.solution?.trim()) {
    parts.push(`【本地题解（对照找卡点）】\n${problem.solution.trim().slice(0, 1500)}`)
  }
  parts.push('请生成「下次提示卡」。')
  return [
    { role: 'system', content: HINTCARD_SYSTEM },
    { role: 'user', content: parts.join('\n\n') },
  ]
}

// ---------- AI 输出后处理 ----------

/** 容错提取 AI 输出里的 JSON：优先 ```json 围栏；无围栏时从每个 '[' 起逐个试到能 parse 的数组 */
export function extractJsonBlock(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i)
  const candidates: string[] = []
  if (fence?.[1]) candidates.push(fence[1].trim())
  const last = text.lastIndexOf(']')
  if (last !== -1) {
    // prose 里先出现的 [0,1] 之类括号不干扰：从它切到末尾的串 parse 失败，继续试下一个 '['
    let i = -1
    while ((i = text.indexOf('[', i + 1)) !== -1 && i < last) {
      candidates.push(text.slice(i, last + 1))
    }
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c)
    } catch {
      // 试下一个候选
    }
  }
  return null
}

/** 判题器要求 args/expected 都是合法 JSON 字面量串，非法的一律丢掉 */
function isJsonLiteral(s: string): boolean {
  try {
    JSON.parse(s)
    return true
  } catch {
    return false
  }
}

/**
 * F7.2 攻击用例 -> TestCase[]：形状不对 / 字面量非法 / 参数个数与入口不符的条目静默丢弃
 * （宁缺毋滥，坏用例进了表会让判题器报错），label 缺失兜底、数字入参自动转字面量串。
 * arity 从现有用例的 args.length 推断，不传则跳过个数校验。
 */
export function toAttackCases(v: unknown, arity?: number): TestCase[] {
  if (!Array.isArray(v)) return []
  const out: TestCase[] = []
  v.forEach((item, i) => {
    if (typeof item !== 'object' || item === null) return
    const o = item as Record<string, unknown>
    if (!Array.isArray(o.args) || o.args.length === 0) return
    if (arity != null && o.args.length !== arity) return
    const args = o.args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    if (!args.every(isJsonLiteral)) return
    const expected = typeof o.expected === 'string' ? o.expected : JSON.stringify(o.expected)
    if (!isJsonLiteral(expected)) return
    out.push({
      label: typeof o.label === 'string' && o.label.trim() ? o.label.trim().slice(0, 20) : `攻击${i + 1}`,
      args,
      expected,
      ...(typeof o.outArg === 'number' ? { outArg: o.outArg } : {}),
    })
  })
  return out
}
