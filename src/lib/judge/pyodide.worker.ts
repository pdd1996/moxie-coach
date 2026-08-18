/// <reference lib="webworker" />
// Pyodide worker（S0-judge）：本地打包的 Pyodide 在此加载并跑用户 Python。
//
// - 本地 load：运行期动态 import /pyodide/pyodide.mjs。说明符用变量拼接，避免 Vite
//   dev 静态分析识别出它指向 public/（public 文件禁止经 import 引入，@vite-ignore
//   也压不住该守卫）。运行期由 dev server / 构建产物 public 目录以 text/javascript
//   提供，浏览器可作 ESM import。不走 CDN。
// - 每条用例 exec 一次用户代码 + 全新 globals 字典（spec：不跨用例复用 globals）。
// - 超时：主线程经 SharedArrayBuffer 写中断信号，pyodide.setInterruptBuffer 捕获后
//   触发 CPython KeyboardInterrupt，这里 catch 判 timeout（见 python.ts）。

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pyodide: any = null
let sabView: Int32Array | null = null
let busy = false

async function ensurePyodide() {
  if (pyodide) return
  // 拼接说明符让 Vite 静态分析无法解析→跳过 public-dir 守卫；运行期浏览器再 import
  const pyodideUrl = '/pyodide/' + 'pyodide.mjs'
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod: any = await import(/* @vite-ignore */ pyodideUrl)
  pyodide = await mod.loadPyodide()
}

/** PyProxy/标量 → 可经 postMessage 结构化克隆的纯 JS 值 */
function toJsValue(v: unknown): unknown {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const p = v as any
  if (p && typeof p.toJs === 'function') {
    const js = p.toJs()
    if (p.destroy) p.destroy()
    return js
  }
  return v
}

/** 销毁一批 PyProxy（忽略已毁/标量） */
function destroyAll(items: unknown[]) {
  for (const it of items) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const p = it as any
    if (p && typeof p.destroy === 'function') {
      try {
        p.destroy()
      } catch {
        /* 已销毁则忽略 */
      }
    }
  }
}

function post(msg: unknown) {
  ;(self as DedicatedWorkerGlobalScope).postMessage(msg)
}

self.onmessage = async (e: MessageEvent) => {
  const data = e.data
  if (data?.type === 'init') {
    try {
      await ensurePyodide()
      if (data.sab) {
        sabView = new Int32Array(data.sab)
        pyodide.setInterruptBuffer(sabView)
      }
      post({ type: 'ready' })
    } catch (err) {
      post({ type: 'init-error', error: String((err as Error)?.message ?? err) })
    }
    return
  }

  if (data?.type === 'run') {
    if (busy) return // 串行：忽略并发 run
    busy = true
    const { idx, code, entry, argStrings, outArg } = data
    const proxies: unknown[] = []
    try {
      if (sabView) sabView[0] = 0 // 清掉上一次中断信号，否则下一轮立刻触发
      const g = pyodide.toPy({}) // 全新 globals 字典（exec 自动补 __builtins__）
      proxies.push(g)
      pyodide.runPython(code, { globals: g })

      // 取入口：function 直取；method 先实例化 Solution 再取方法
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let fn: any
      if (entry.callType === 'method') {
        const Sol = g.get('Solution')
        proxies.push(Sol)
        const inst = Sol() // Python 类 PyProxy 可调用即实例化
        proxies.push(inst)
        fn = inst[entry.name]
        proxies.push(fn)
      } else {
        fn = g.get(entry.name)
        proxies.push(fn)
      }

      // args 转 Py 代理（同一对象传入，原地修改可读回）
      const pyArgs = argStrings.map((s: string) => pyodide.toPy(JSON.parse(s)))
      pyArgs.forEach((p: unknown) => proxies.push(p))

      const t0 = performance.now()
      let actual: unknown
      if (outArg != null) {
        fn(...pyArgs)
        actual = toJsValue(pyArgs[outArg])
      } else {
        actual = toJsValue(fn(...pyArgs))
      }
      const elapsedMs = performance.now() - t0
      post({ type: 'result', idx, ok: true, actual, elapsedMs })
    } catch (err) {
      const msg = String((err as Error)?.message ?? err)
      const isTimeout = sabView ? sabView[0] !== 0 && /Interrupt|KeyboardInterrupt/i.test(msg) : /KeyboardInterrupt/i.test(msg)
      post({
        type: 'result',
        idx,
        ok: false,
        timeout: isTimeout,
        error: msg,
      })
    } finally {
      destroyAll(proxies)
      if (sabView) sabView[0] = 0
      busy = false
    }
  }
}