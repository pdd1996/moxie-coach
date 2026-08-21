// AI 教练纯函数自测（S7-F7：SSE 流式解析 / JSON 提取 / 提示词约束 / 攻击用例清洗）。
// 运行：npx tsx scripts/selftest-ai.mts
import { feedSse, sseLineDelta } from '../src/lib/ai.ts'
import {
  buildHintMessages, buildSolutionMessages, buildReviewMessages, buildHintCardMessages,
  extractJsonBlock, toAttackCases,
} from '../src/lib/prompts.ts'
import type { Problem } from '../src/lib/types.ts'

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ' - ' + extra : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' - ' + extra : ''}`) }
}
function eq<T>(name: string, got: T, want: T) {
  const c = JSON.stringify(got) === JSON.stringify(want)
  ok(name, c, `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
}

// 题目 fixture：88 合并两个有序数组（题解模板样例题），带一条现有用例
const P: Problem = {
  id: 88,
  title: '合并两个有序数组',
  slug: 'merge-sorted-array',
  difficulty: 'Medium',
  stage: 1,
  pattern: '双指针（相向）',
  signal: '两个有序结构要合并',
  status: 'learned',
  history: [],
  testCases: [{ label: '示例1', args: ['[1,2,3,0,0,0]', '3', '[2,5,6]', '3'], expected: '[1,2,2,3,5,6]', outArg: 0 }],
}

console.log('== feedSse（跨 chunk 半行缓冲）==')
const f1 = feedSse('', 'data: {"choices":[{"delta":{"content":"你"}}]}\nda')
eq('完整行吐出、半行留存', f1, { lines: ['data: {"choices":[{"delta":{"content":"你"}}]}'], rest: 'da' })
const f2 = feedSse(f1.rest, 'ta: 1\n\n')
eq('半行拼上后续 chunk', f2.lines, ['data: 1', ''])
const f3 = feedSse('', 'data: x\r\ndata: y\r\n')
eq('CRLF 行尾去 \\r', f3.lines, ['data: x', 'data: y'])

console.log('== sseLineDelta ==')
eq('普通 delta', sseLineDelta('data: {"choices":[{"delta":{"content":"好"}}]}'), '好')
eq('[DONE] 返回空', sseLineDelta('data: [DONE]'), '')
eq('非 data 行返回空', sseLineDelta('event: ping'), '')
eq('坏 JSON 返回空', sseLineDelta('data: {oops'), '')
eq('reasoning_content 不混入', sseLineDelta('data: {"choices":[{"delta":{"reasoning_content":"思考"}}]}'), '')

console.log('== extractJsonBlock ==')
eq('json 围栏', extractJsonBlock('要点：\n- x\n```json\n[{"a":1}]\n```\n'), [{ a: 1 }])
eq('无语言标注围栏', extractJsonBlock('```[1,2]```'), [1, 2])
eq('裸数组', extractJsonBlock('前言 [1,2,3] 后记'), [1, 2, 3])
eq('prose 括号不干扰裸数组', extractJsonBlock('越界？[0,1] 会出事\n[{"label":"a","args":["[]"],"expected":"0"}]'),
  [{ label: 'a', args: ['[]'], expected: '0' }])
ok('垃圾文本返回 null', extractJsonBlock('没有任何 json') === null)

console.log('== toAttackCases（清洗规则）==')
const cases = toAttackCases([
  { label: '空数组', args: ['[]'], expected: '0' },
  { label: '数字自动转字面量', args: [5], expected: 10 },
  { args: ['[1,2]'], expected: '[1,2]', outArg: 0 }, // label 兜底
  { label: '坏字面量丢弃', args: ['[1,2'], expected: 'x' },
  'not-an-object',
])
eq('合法条目保留、非法丢弃、label 兜底', cases, [
  { label: '空数组', args: ['[]'], expected: '0' },
  { label: '数字自动转字面量', args: ['5'], expected: '10' },
  { label: '攻击3', args: ['[1,2]'], expected: '[1,2]', outArg: 0 },
])

console.log('== toAttackCases（参数个数过滤）==')
const arityCases = toAttackCases([
  { label: '参数数对', args: ['[1,2]', '3'], expected: '[0,1]' },
  { label: '参数数错', args: ['[1,2]'], expected: '[0,1]' },
  { label: '参数多', args: ['[1]', '2', '3'], expected: '[0,1]' },
], 2)
eq('按 arity=2 过滤', arityCases, [{ label: '参数数对', args: ['[1,2]', '3'], expected: '[0,1]' }])
ok('不传 arity 不过滤', toAttackCases([{ label: 'x', args: ['[1]'], expected: '0' }]).length === 1)

console.log('== buildHintMessages（F7.1 铁律与分层）==')
const hintMsgs = buildHintMessages(P, 'python', 'def merge(a, b):\n    pass', 1, [])
ok('system 含禁止输出代码硬约束', hintMsgs[0].content.includes('禁止输出代码'))
ok('system 含三层定义', hintMsgs[0].content.includes('第 1 层') && hintMsgs[0].content.includes('第 3 层'))
ok('user 含题面', hintMsgs[1].content.includes('【题面】'))
ok('user 含当前代码', hintMsgs[1].content.includes('def merge'))
ok('user 请求第 1 层', hintMsgs[1].content.includes('第 1 层'))
const hintMsgs2 = buildHintMessages(P, 'python', '', 2, ['第一层的内容'])
ok('第 2 层带上第 1 层内容', hintMsgs2[1].content.includes('第一层的内容'))
ok('空代码明说没动笔', hintMsgs2[1].content.includes('没动笔'))

console.log('== buildSolutionMessages（F7.3 模板结构）==')
const solMsgs = buildSolutionMessages(P)
ok(
  'system 钉死题解模板结构',
  ['## 套路：', '判断信号', '找入口三步法', '模板代码', '边界三问'].every((k) =>
    solMsgs[0].content.includes(k),
  ),
)

console.log('== buildReviewMessages（F7.2）==')
const revMsgs = buildReviewMessages(P, 'def merge(a, b):\n    pass', 'python')
ok('system 含只挑毛病与边界三问', revMsgs[0].content.includes('只挑毛病') && revMsgs[0].content.includes('越界'))
ok('user 带现有用例（不重复约束的输入）', revMsgs[1].content.includes('示例1'))
ok('user 写明参数个数（按现有用例推断=4）', revMsgs[1].content.includes('该入口有 4 个参数'))

console.log('== buildHintCardMessages（F7.4）==')
const cardMsgs = buildHintCardMessages(P, 'def merge(a, b):\n    pass', 'python')
ok('system 限一句话 40 字', cardMsgs[0].content.includes('40'))

console.log(fail === 0 ? `\n全部通过（${pass} 项）` : `\n${fail} 项失败（共 ${pass + fail} 项）`)
process.exit(fail === 0 ? 0 : 1)
