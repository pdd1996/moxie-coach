// Python 判题主线程侧（S0-judge）：单例 Pyodide worker（加载昂贵，跨多次「运行用例」复用）。
// 超时用 SharedArrayBuffer + setInterruptBuffer（spec A：不能 Promise.race——
// 死循环同步阻塞 worker，race 定时器拿不到结果）。主线程到 5s 向 SAB 写信号，
// worker 内 CPython 抛 KeyboardInterrupt 被 catch 判 timeout。
//
// SAB 前置：需跨源隔离头（COOP/COEP，已在 server/middleware.ts 配好）。
// 运行期校验 crossOriginIsolated，缺失则抛明确错误（避免静默死等）。

import type { RawCaseResult } from './shared'
import { TIMEOUT_MS } from './shared'

let worker: Worker | null = null
let ready: Promise<void> | null = null
let sabView: Int32Array | null = null

function assertSabAvailable() {
  if (typeof SharedArrayBuffer === 'undefined' || !self.crossOriginIsolated) {
    throw new Error(
      'SharedArrayBuffer 不可用：需跨源隔离头（COOP:same-origin + COEP:require-corp）。' +
        '请确认 dev server 经 server/middleware.ts 注入的响应头生效（重启 vite）。',
    )
  }
}

async function ensureWorker() {
  if (worker) return ready!
  assertSabAvailable()
  worker = new Worker(new URL('./pyodide.worker.ts', import.meta.url), { type: 'module' })

  const sab = new SharedArrayBuffer(4)
  sabView = new Int32Array(sab)

  ready = new Promise<void>((resolve, reject) => {
    const onMsg = (e: MessageEvent) => {
      if (e.data?.type === 'ready') {
        worker!.removeEventListener('message', onMsg)
        worker!.removeEventListener('error', onErr)
        resolve()
      } else if (e.data?.type === 'init-error') {
        worker!.removeEventListener('message', onMsg)
        worker!.removeEventListener('error', onErr)
        reject(new Error(`Pyodide 加载失败：${e.data.error}`))
      }
    }
    const onErr = () => {
      worker!.removeEventListener('message', onMsg)
      worker!.removeEventListener('error', onErr)
      reject(new Error('Pyodide worker 启动失败'))
    }
    worker!.addEventListener('message', onMsg)
    worker!.addEventListener('error', onErr)
  })

  worker.postMessage({ type: 'init', sab })
  return ready
}

/** 跑单条 Python 用例（含 5s 超时：到点写 SAB 中断，并设硬兜底） */
export async function runPythonCase(opts: {
  code: string
  entry: { name: string; callType: 'function' | 'method' }
  argStrings: string[]
  outArg?: number
}): Promise<RawCaseResult> {
  await ensureWorker()
  const idx = nextIdx()
  return new Promise((resolve) => {
    let settled = false
    let hardGrace: number | undefined
    const finish = (r: RawCaseResult) => {
      if (settled) return
      settled = true
      clearTimeout(hardFallback)
      if (hardGrace != null) clearTimeout(hardGrace)
      // worker 可能已被 dispose（HMR）置空，可选链避免解引用崩
      worker?.removeEventListener('message', onMsg)
      resolve(r)
    }
    const onMsg = (e: MessageEvent<RawCaseResult & { type: string; idx: number }>) => {
      const d = e.data
      if (d?.type !== 'result' || d.idx !== idx) return
      finish({ ok: d.ok, timeout: d.timeout, actual: d.actual, elapsedMs: d.elapsedMs, error: d.error })
    }
    worker!.addEventListener('message', onMsg)
    if (sabView) sabView[0] = 0
    worker!.postMessage({
      type: 'run',
      idx,
      code: opts.code,
      entry: opts.entry,
      argStrings: opts.argStrings,
      outArg: opts.outArg ?? null,
    })

    const hardFallback = setTimeout(() => {
      if (settled) return
      // 5s 到点：向 SAB 写中断信号，worker 内 Python 抛 KeyboardInterrupt 后会回 result
      if (sabView) sabView[0] = 2
      // 给中断一点时间生效；若 worker 仍无响应（如卡在不检查信号的 C 扩展），
      // 硬判 timeout 并 terminate + 重建 worker 解卡，保证后续用例能真正跑（而非被静默丢弃）
      hardGrace = setTimeout(() => {
        if (settled) return
        settled = true
        worker?.removeEventListener('message', onMsg)
        disposePyodideWorker()
        resolve({ ok: false, timeout: true })
      }, 250)
    }, TIMEOUT_MS)
  })
}

let counter = 0
function nextIdx() {
  counter = (counter + 1) | 0
  return counter
}

/** HMR/卸载时回收 worker（开发期避免重复加载 Pyodide） */
export function disposePyodideWorker() {
  worker?.terminate()
  worker = null
  ready = null
  sabView = null
}

if (import.meta.hot) {
  import.meta.hot.dispose(() => disposePyodideWorker())
}