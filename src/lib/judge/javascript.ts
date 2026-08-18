// JS 判题（S0-judge）：每条用例独立 module worker，主线程 5s 到点 terminate 判 timeout。
//
// 取入口（spec B）在 js.worker.ts 内：用 `new Function(code + '\n;return ' + name)()`
// 一次性覆盖 var/function/const/let 四种声明形态。不用 eval + globalThis[name]——
// const/let 顶层声明不挂 globalThis，取不到。语法错误时 new Function 构造期抛
// SyntaxError，worker 内 catch 后报错。
//
// 超时（spec A）：用户死循环同步阻塞 worker 线程，Promise.race 的定时器拿不到结果，
// 故不用 race——主线程到 5s 直接 worker.terminate() 判 timeout。用同源 module worker
// （非 blob）以规避 COEP require-corp 下 blob: URL 的 CORP 不确定性。

import type { RawCaseResult } from './shared'
import { TIMEOUT_MS } from './shared'

/** 跑单条 JS 用例，含 5s 超时（到点 terminate） */
export function runJsCase(opts: {
  code: string
  entry: { name: string; callType: 'function' | 'method' }
  argStrings: string[]
  outArg?: number
}): Promise<RawCaseResult> {
  return new Promise((resolve) => {
    const worker = new Worker(new URL('./js.worker.ts', import.meta.url), { type: 'module' })
    let settled = false
    const finish = (r: RawCaseResult) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      resolve(r)
    }
    const timer = setTimeout(() => finish({ ok: false, timeout: true }), TIMEOUT_MS)
    worker.onmessage = (e: MessageEvent<RawCaseResult>) => finish(e.data)
    worker.onerror = () => finish({ ok: false, error: 'worker 崩溃' })
    worker.postMessage({
      code: opts.code,
      entry: opts.entry,
      argStrings: opts.argStrings,
      outArg: opts.outArg ?? null,
    })
  })
}