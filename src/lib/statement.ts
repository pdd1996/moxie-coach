/**
 * 题面分节：贴进来的题面是纯文本，把「示例 N：+ 输入/输出/解释」切成结构化块，
 * 交给渲染层做层级间距（题目与示例拉开、示例之间收紧）。
 * 中英文口径与 import.ts 的 parseExamples 保持一致。
 */
export type StatementSeg =
  | { kind: 'md'; text: string }
  | { kind: 'example'; head: string; lines: string[] }

const RE_EXAMPLE_HEAD = /^\s*(?:示例|Example)\s*([-]?\d+)\s*[:：]\s*$/i
const RE_EXAMPLE_LINE = /^\s*(?:输入|输出|解释|Input|Output|Explanation)\s*[:：]/i

export function splitStatement(text: string): StatementSeg[] {
  const segs: StatementSeg[] = []
  let md: string[] = []
  let ex: { head: string; lines: string[] } | null = null

  const flushMd = () => {
    if (md.length > 0) segs.push({ kind: 'md', text: md.join('\n') })
    md = []
  }
  const flushEx = () => {
    if (ex) segs.push({ kind: 'example', ...ex })
    ex = null
  }

  for (const line of text.split('\n')) {
    const t = line.trim()
    if (RE_EXAMPLE_HEAD.test(t)) {
      flushMd()
      flushEx()
      ex = { head: t, lines: [] }
    } else if (ex && t === '') {
      // 示例头与输入/输出之间常夹空行，空行不切段
    } else if (ex && RE_EXAMPLE_LINE.test(t)) {
      ex.lines.push(t)
    } else {
      flushEx()
      md.push(line)
    }
  }
  flushMd()
  flushEx()
  return segs
}
