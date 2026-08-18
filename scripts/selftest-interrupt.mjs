// 验证 S0-judge 超时方案 A：pyodide.setInterruptBuffer + SharedArrayBuffer。
// 复刻浏览器模型——一个线程跑 Pyodide 死循环，另一线程到点向 SAB 写信号，
// 触发 CPython KeyboardInterrupt。浏览器里是「主线程写 / worker 跑」，
// 这里用 worker_threads 等效（主线程跑 Pyodide、子线程写）。
import { Worker, isMainThread } from 'node:worker_threads'
import { loadPyodide } from '../public/pyodide/pyodide.mjs'

if (!isMainThread) {
  // 子线程：等 200ms 后向 SAB 写 SIGINT(2)
  const { parentPort, workerData } = await import('node:worker_threads')
  const view = new Int32Array(workerData.sab)
  await new Promise((r) => setTimeout(r, 200))
  view[0] = 2
  parentPort.postMessage('signaled')
} else {
  const py = await loadPyodide({ indexURL: 'public/pyodide/' })
  const sab = new SharedArrayBuffer(4)
  const view = new Int32Array(sab)
  py.setInterruptBuffer(view)

  // 起子线程持 SAB
  const w = new Worker(new URL(import.meta.url), { workerData: { sab } })
  w.on('message', (m) => console.log('[child]', m))

  const t0 = Date.now()
  let interrupted = false
  let elapsed = 0
  try {
    py.runPython(`
i = 0
while True:
    i += 1
`)
  } catch (e) {
    elapsed = Date.now() - t0
    interrupted = /KeyboardInterrupt|Interrupt/i.test(String(e.message || e))
    console.log('[main] caught:', String(e.message || e).slice(0, 80))
  }
  // 之后 Pyodide 仍可用（下条用例能正常跑）
  const ok2 = py.runPython('1+1') === 2
  console.log(`interrupted=${interrupted} elapsed=${elapsed}ms (expect ~200ms)  pyodideStillUsable=${ok2}`)
  console.log(interrupted && ok2 ? 'PASS interrupt' : 'FAIL interrupt')
  process.exit(interrupted && ok2 ? 0 : 1)
}