// ===== S7-F7：AI 教练前端客户端 =====
// 统一经 /ai-api/chat/completions 代理调用大模型（key/model 由代理从 db.json 读，
// 前端不持有 key）。传 onDelta 走流式（SSE 打字机），否则整段返回。
// 错误用 AiError.code 分类：NO_KEY 引导去设置页，其余给重试。

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }

export type AiErrorCode = 'NO_KEY' | 'UPSTREAM' | 'HTTP' | 'ABORT'

export class AiError extends Error {
  readonly code: AiErrorCode
  constructor(code: AiErrorCode, message: string) {
    super(message)
    this.name = 'AiError'
    this.code = code
  }
}

export interface ChatAIOptions {
  temperature?: number
  maxTokens?: number
  /** 外部取消（组件卸载/切页） */
  signal?: AbortSignal
  /** 传入则启用流式，每收到一个增量回调一次 */
  onDelta?: (delta: string) => void
}

/**
 * SSE 行切割（纯函数，便于自测）：吃进半个 chunk，吐出其中完整的行（已去 \r），
 * 返回未完的半行缓冲。SSE 事件按 \n 分行，chunk 边界断在半行是常态。
 */
export function feedSse(buffer: string, chunk: string): { lines: string[]; rest: string } {
  const parts = (buffer + chunk).split('\n')
  const rest = parts.pop() ?? ''
  return { lines: parts.map((l) => l.replace(/\r$/, '')), rest }
}

/** 单个 SSE data: 行 -> 增量文本；[DONE]/空行/非 data 行/坏 JSON 一律返回空串 */
export function sseLineDelta(line: string): string {
  if (!line.startsWith('data:')) return ''
  const payload = line.slice(5).trim()
  if (!payload || payload === '[DONE]') return ''
  try {
    const json = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: unknown } }> }
    const delta = json.choices?.[0]?.delta?.content
    return typeof delta === 'string' ? delta : ''
  } catch {
    return ''
  }
}

/** 读流式响应：边解析边回调，返回全文。流必须以 [DONE] 结尾，否则视为被中断 */
async function readStream(res: Response, onDelta: (d: string) => void): Promise<string> {
  if (!res.body) throw new AiError('UPSTREAM', 'AI 未返回流式响应体')
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let rest = ''
  let full = ''
  let sawDone = false
  const emit = (lines: string[]) => {
    for (const line of lines) {
      if (line.startsWith('data:') && line.slice(5).trim() === '[DONE]') {
        sawDone = true
        continue
      }
      const d = sseLineDelta(line)
      if (d) {
        full += d
        onDelta(d)
      }
    }
  }
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    const fed = feedSse(rest, decoder.decode(value, { stream: true }))
    rest = fed.rest
    emit(fed.lines)
  }
  emit([rest.replace(/\r$/, '')]) // 收尾：缓冲里可能还压着最后一行
  // 流断开却没收到 [DONE]：多半是代理超时/上游中断掐了连接，半截内容不能当完成品
  if (!sawDone) throw new AiError('UPSTREAM', '生成被中断（未收到结束标记），请重试')
  return full
}

/** 把非 2xx 响应转成分类错误（代理的 {error,message} 与上游透传的错误体都认） */
async function errorFromResponse(res: Response): Promise<AiError> {
  let code: AiErrorCode = 'HTTP'
  let msg = `AI 请求失败（HTTP ${res.status}）`
  try {
    const body = (await res.json()) as { error?: string | { message?: string }; message?: string }
    if (body.error === 'NO_KEY') return new AiError('NO_KEY', '未配置 API Key -- 到「设置 -> AI 教练」填写')
    if (body.error === 'UPSTREAM') code = 'UPSTREAM'
    const upstreamMsg = typeof body.error === 'object' && body.error !== null ? body.error.message : undefined
    const m = body.message ?? upstreamMsg
    if (typeof m === 'string' && m) msg = m
  } catch {
    // 非 JSON 错误体：保持默认文案
  }
  return new AiError(code, msg)
}

/** 调用 AI：一次对话补全。流式传 opts.onDelta；文本在 Promise resolve 时全文返回 */
export async function chatAI(messages: ChatMessage[], opts: ChatAIOptions = {}): Promise<string> {
  const onDelta = typeof opts.onDelta === 'function' ? opts.onDelta : undefined
  try {
    const res = await fetch('/ai-api/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        ...(onDelta ? { stream: true } : {}),
        ...(opts.temperature != null ? { temperature: opts.temperature } : {}),
        ...(opts.maxTokens != null ? { max_tokens: opts.maxTokens } : {}),
      }),
      signal: opts.signal,
    })
    if (!res.ok) throw await errorFromResponse(res)
    // reasoning 模型思考耗光 max_tokens 时正文为空：对四件套来说空结果毫无意义，直接报错引导重试
    const emptyErr = new AiError('UPSTREAM', 'AI 返回了空内容（可能思考超限），请重试')
    if (onDelta) {
      const text = await readStream(res, onDelta)
      if (!text.trim()) throw emptyErr
      return text
    }
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: unknown } }> }
    const text = data.choices?.[0]?.message?.content
    if (typeof text !== 'string') throw new AiError('UPSTREAM', 'AI 返回格式异常（缺少 choices[0].message.content）')
    if (!text.trim()) throw emptyErr
    return text
  } catch (err) {
    if (err instanceof AiError) throw err
    if (err instanceof DOMException && err.name === 'AbortError') throw new AiError('ABORT', '请求已取消')
    throw new AiError('UPSTREAM', `AI 请求失败：${(err as Error)?.message ?? err}`)
  }
}
