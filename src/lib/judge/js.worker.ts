/// <reference lib="webworker" />
// JS 判题 worker（S0-judge）：同源 module worker，受 Vite 处理、COEP 安全。
// 收 code/entry/argStrings/outArg，用 new Function 取入口执行，回传实际输出值；
// 比对在主线程统一做。死循环由主线程到点 terminate 兜底（见 javascript.ts）。

self.onmessage = (e: MessageEvent) => {
  const { code, entry, argStrings, outArg } = e.data as {
    code: string
    entry: { name: string; callType: 'function' | 'method' }
    argStrings: string[]
    outArg: number | null
  }
  try {
    const args = argStrings.map((s) => JSON.parse(s))
    // 取入口（spec B）：new Function 一次性覆盖 function/var/const/let 四种声明
    // eslint-disable-next-line @typescript-eslint/no-implied-eval, no-new-func
    const target = new Function(code + '\n;return ' + entry.name)() as
      | ((...a: unknown[]) => unknown)
      | (new (...a: unknown[]) => { [k: string]: (...a: unknown[]) => unknown })
    let fn: (...a: unknown[]) => unknown
    if (entry.callType === 'method') {
      // class Solution：实例化后取方法并绑 this（与 Python 侧 PyProxy 取方法已绑定对齐）
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const inst = new (target as any)() as Record<string, (...a: unknown[]) => unknown>
      fn = inst[entry.name].bind(inst)
    } else {
      fn = target as (...a: unknown[]) => unknown
    }
    const t0 = performance.now()
    let actual: unknown
    if (outArg != null) {
      fn(...args) // 原地修改型：结果在第 outArg 个入参里
      actual = args[outArg]
    } else {
      actual = fn(...args)
    }
    const elapsedMs = performance.now() - t0
    ;(self as DedicatedWorkerGlobalScope).postMessage({ ok: true, actual, elapsedMs })
  } catch (err) {
    ;(self as DedicatedWorkerGlobalScope).postMessage({
      ok: false,
      error: String((err as Error)?.message ?? err),
    })
  }
}