// md 笔记导入解析（S2-F2 / PRD F2）。
// 把用户既有的 `面试经典150题/*.md` 笔记解析成可落库的题面/模板/用例：
// - 文件名开头数字 → 题号（匹配题库元数据）
// - fenced 代码块按语言约定分配 skeleton（```python→python / ```javascript→javascript /
//   无语言标注的第一个块按 defaultLang 存入；同语言多块取第一个）
// - 「输入：…/输出：…」与「Input:…/Output:…」示例正则解析为 testCases 草稿，
//   剥离 `变量名 =` 前缀，按出现顺序产出 args，输出为 expected
// - args / expected 统一存为 JSON 字面量字符串（与判题器 S0-judge 对齐：JSON.parse 后传参）
//
// 兜底：若笔记无 fenced 代码块（如手写的裸函数体），按函数定义特征识别一段裸代码作 skeleton。
// entry 不在此解析——由调用方对 skeleton 调 parseEntry（按语言分别）。

import type { Lang, TestCase } from '@/lib/types'

export interface ParsedProblem {
  id: number
  statement: string
  skeleton: { python?: string; javascript?: string }
  solution?: string
  testCases: TestCase[]
}

/** 从文件名提取开头题号（`88. 合并两个有序数组.md` → 88） */
export function parseIdFromFilename(name: string): number | undefined {
  const base = name.split(/[\\/]/).pop() ?? name
  const m = base.match(/^(\d+)/)
  return m ? Number(m[1]) : undefined
}

/**
 * 解析一份 md 笔记。返回 null 表示文件名无题号（无法匹配题库）。
 * @param defaultLang 无语言标注的代码块 / 兜底裸代码归入哪种语言
 */
export function parseMdFile(filename: string, content: string, defaultLang: Lang): ParsedProblem | null {
  const id = parseIdFromFilename(filename)
  if (id == null) return null
  const { statement, skeleton } = extractBlocks(content, defaultLang)
  const testCases = parseExamples(content)
  return { id, statement, skeleton, testCases }
}

// ---------- 代码块抽取 ----------

interface Blocks {
  statement: string
  skeleton: { python?: string; javascript?: string }
}

function extractBlocks(content: string, defaultLang: Lang): Blocks {
  const skeleton: { python?: string; javascript?: string } = {}
  const lines = content.split(/\r?\n/)
  const statementLines: string[] = []
  let unlabeledUsed = false

  let i = 0
  while (i < lines.length) {
    const fence = lines[i].match(/^\s*```(\w*)\s*$/)
    if (fence) {
      const lang = fence[1] || null
      const buf: string[] = []
      i++
      while (i < lines.length && !/^\s*```\s*$/.test(lines[i])) {
        buf.push(lines[i])
        i++
      }
      i++ // 跳过闭合围栏
      assignSkeleton(skeleton, lang, buf.join('\n').trim(), defaultLang, () => {
        if (lang || unlabeledUsed) return false
        unlabeledUsed = true
        return true
      })
      continue
    }
    statementLines.push(lines[i])
    i++
  }

  let statement = statementLines.join('\n').trim()

  // 兜底：无任何 fenced 代码块 → 识别裸函数体作 skeleton
  if (!skeleton.python && !skeleton.javascript) {
    const bare = extractBareCode(lines)
    if (bare) {
      skeleton[bare.lang] = bare.code
      statement = lines.slice(0, bare.startLine).join('\n').trim()
    }
  }
  return { statement, skeleton }
}

/** 按 F2 代码块约定把一段代码分入对应语言的 skeleton（同语言多块取第一个） */
function assignSkeleton(
  skeleton: { python?: string; javascript?: string },
  lang: string | null,
  code: string,
  defaultLang: Lang,
  consumeUnlabeled: () => boolean,
): void {
  if (lang === 'python') {
    if (!skeleton.python) skeleton.python = code
  } else if (lang === 'javascript' || lang === 'js') {
    if (!skeleton.javascript) skeleton.javascript = code
  } else if (!lang) {
    // 无语言标注：仅第一个此类块按 defaultLang 存入
    if (consumeUnlabeled()) skeleton[defaultLang] = code
  }
  // 其它语言（java/c++ 等）忽略
}

/** 裸代码兜底：找到第一个函数定义行，取到文件尾作 skeleton */
function extractBareCode(lines: string[]): { lang: Lang; code: string; startLine: number } | undefined {
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    // 用冒号/花括号区分两种语言的 class Solution，避免 JS 的 `class Solution {` 被误判为 Python。
    // Python 分支用 `.*:` 兼容 `class Solution:` 与 `class Solution(object):` 两种写法
    if (/^\s*def\s+\w+\s*\(/.test(line) || /^\s*class\s+Solution\b.*:/.test(line)) {
      return { lang: 'python', code: lines.slice(i).join('\n').trim(), startLine: i }
    }
    if (
      /^\s*function\s+\w+\s*\(/.test(line) ||
      /^\s*(?:var|const|let)\s+\w+\s*=\s*(?:function|\()/.test(line) ||
      /^\s*class\s+Solution\s*\{/.test(line)
    ) {
      return { lang: 'javascript', code: lines.slice(i).join('\n').trim(), startLine: i }
    }
  }
  return undefined
}

// ---------- 示例用例解析 ----------

const RE_LABEL = /^\s*(?:示例|Example)\s*([-]?\d+)\b/i
const RE_INPUT = /^\s*(?:输入|Input)\s*[:：]\s*(.+)$/i
const RE_OUTPUT = /^\s*(?:输出|Output)\s*[:：]\s*(.+)$/i

/**
 * 从 md 正文解析示例用例。兼容中英文、剥离 `变量名 =` 前缀。
 * 解析失败的用例不产出（留给用户在用例表手填）。
 */
export function parseExamples(content: string): TestCase[] {
  const cases: TestCase[] = []
  const lines = content.split(/\r?\n/)
  let pendingInput: string | null = null
  let pendingLabel: string | null = null
  let idx = 0

  for (const line of lines) {
    const lm = line.match(RE_LABEL)
    if (lm) {
      pendingLabel = `示例${lm[1]}`
      continue
    }
    const im = line.match(RE_INPUT)
    if (im) {
      pendingInput = im[1]
      continue
    }
    const om = line.match(RE_OUTPUT)
    if (om && pendingInput != null) {
      idx++
      const expected = parseValue(stripExplanation(om[1]))
      const args = parseArgs(pendingInput)
      cases.push({ label: pendingLabel ?? `用例${idx}`, args, expected })
      pendingInput = null
      pendingLabel = null
    }
  }
  return cases
}

/** 输出行可能跟「解释：…」同段，剥掉 */
function stripExplanation(out: string): string {
  return out.replace(/\s*(?:解释|Explanation)\s*[:：].*$/i, '').trim()
}

/** 输入行按顶层逗号切分，每段剥 `变量名 =` 前缀，规范成 JSON 字面量串 */
function parseArgs(line: string): string[] {
  return splitTopLevel(line)
    .map((seg) => stripVarPrefix(seg.trim()))
    .filter((v) => v !== '')
    .map(parseValue)
}

/** 剥离开头的 `变量名 =`（仅当等号前是裸标识符/下标，避免误剥值内的 =） */
function stripVarPrefix(v: string): string {
  const m = v.match(/^[\w[\]]+\s*=\s*(.+)$/s)
  return m ? m[1].trim() : v
}

/** 规范成 JSON 字面量串：能 parse 就重新 stringify，不能则原样保留（用户在表里改） */
function parseValue(v: string): string {
  const t = v.trim()
  if (t === '') return ''
  try {
    return JSON.stringify(JSON.parse(t))
  } catch {
    return t
  }
}

/** 顶层逗号切分（忽略 []/{}() 内部的逗号） */
function splitTopLevel(s: string): string[] {
  const out: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of s) {
    if (ch === '[' || ch === '{' || ch === '(') depth++
    else if (ch === ']' || ch === '}' || ch === ')') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += ch
  }
  if (cur.trim()) out.push(cur)
  return out
}