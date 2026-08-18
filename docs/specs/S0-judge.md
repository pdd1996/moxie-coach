# S0-judge — 本地判题引擎（地基 · 对应 F3 判定方式）

## 目标
实现真判题：Python 走 Pyodide（本地打包、离线可用）、JS 走 Web Worker，宽松比对，单条 5 秒超时。替换原型 `runCases` 里写死的「attempt 第 3 条失败、reproduce 全过」假数据。

## 验收标准（来自 PRD F3 + 第 8 节约定）
- 用户写的 Python/JS 代码按 `entry`（从 skeleton 解析）调用，`testCases.args` 顺序传参，返回值与 `expected` 宽松比对（数组/对象忽略元素顺序）。
- 自由函数与 `class Solution` 方法两种形态都能正确调用（Python 实例化 `Solution()` 再调方法）。
- 单条用例 > 5 秒判 timeout 失败（含用户死循环场景，不能卡死 UI）。
- 显示实际输出 vs 期望、耗时。
- 无 `entry` 的题（未贴题 / 多线程）禁用「运行用例」，仅留编辑器。
- Pyodide 断网首载可用（本地打包，不走 CDN），加载中有进度提示。

## 数据读写点
只读 `problem.entry`（由 F2 贴题时从 skeleton 解析存入，**按语言分存**：`{ python?: { name, callType }, javascript?: { name, callType } }`，`callType ∈ 'function'|'method'`）、`problem.skeleton`、`problem.testCases`；判题按当前所选语言取 `entry[lang]`；不写数据。

## 涉及文件
- `src/lib/judge/runner.ts` — 统一判题入口，按语言分发
- `src/lib/judge/python.ts` — Pyodide 执行（worker 内）
- `src/lib/judge/javascript.ts` — Web Worker 执行
- `src/lib/judge/compare.ts` — 宽松比对
- `src/lib/judge/pyodide.worker.ts` — Pyodide worker
- `public/pyodide/` — vendored Pyodide（D2）
- `src/components/CodeEditor.tsx` — 保留
- `src/pages/ProblemView.tsx` — `runCases` 换成真 runner

## 依赖前序 spec
S0-scaffold（类型与 store）、S2-F2（`entry` 由贴题 parse 存入 problem）

## 实现要点
- **`entry` 来源（F）**：`entry` 不在 `problems.json` 静态元数据里预填，而是在 **F2 贴题时从用户粘贴的 skeleton 解析**并存到 problem 记录（见 S2-F2）。判题器读 `problem.entry`，它永远匹配用户实际粘贴的 skeleton，而非元数据里的猜测值。
- **函数调用约定（D1）**：判题器把每个 `tc.args`（JSON 字面量字符串）`JSON.parse` 成值，按顺序传参调用用户代码里的入口，取返回值比对。入口形态有两种，由 `entry.callType` 区分（贴题时识别）：
  - **自由函数** `callType: 'function'`：`def merge(...) ` / `function merge(...)` / `var|const|let merge = ...`
  - **class Solution 方法** `callType: 'method'`：`class Solution: def merge(self, ...)`（LeetCode Python 默认模板）——判题时先 `Solution()` 实例化再 `.merge(*args)`。
- **JS 取入口（B）**：用 `new Function(code + '\n;return ' + entry.name)()` 一次性覆盖 `var`/`function`/`const`/`let` 四种声明形态。**不要**用 `eval` + `globalThis[entry]`——`const`/`let` 顶层声明不挂 globalThis，取不到。语法错误时 `new Function` 构造期抛 SyntaxError，catch 后报错。
- **Python 执行**：Pyodide 里**每条用例 exec 一次用户代码 + 全新 globals 字典**（不跨用例复用 globals，避免副作用污染）；`callType==='method'` 时 exec 后 `globals()['Solution']()` 实例化再调方法。
- **超时（A）—— 不能用 Promise.race**：用户死循环会同步阻塞 worker 线程，race 的定时器到了也拿不到结果。正确方案：
  - **JS**：每条用例跑**独立 worker**，主线程 5s 到点直接 `worker.terminate()` 判 timeout。开销可接受（用例 ≤ 20）。
  - **Python**：用 Pyodide 的 `pyodide.setInterruptBuffer(sab)`（一个 `SharedArrayBuffer`），主线程到点向 buffer 写入信号值触发 CPython `KeyboardInterrupt`，catch 后判 timeout。
  - **SAB 前置**：`SharedArrayBuffer` 要求 Vite dev server 配跨源隔离头 `Cross-Origin-Opener-Policy: same-origin` + `Cross-Origin-Embedder-Policy: require-corp`（`vite.config.ts` 的 `server.headers`）；CORS 资源需配 `Cross-Origin-Resource-Policy`。spec 实现时先验证 SAB 可用，否则降级为 JS 同款「每题独立 Pyodide worker + terminate」（更重但无需 SAB）。
- **宽松比对**：`expected` 同样 `JSON.parse`；数组/对象做「忽略元素顺序」规范化（排序后深比），标量直接比。
- **Pyodide 打包（D2）**：放 `public/pyodide/`，worker 里相对路径 load，不走 CDN。首载显示进度条。
- 88 题作为真判题验收用例（用户已有真实笔记与 4 条用例）。

## 不做
- 不做 LeetCode 官方提交（PRD scope out）。
- 不做多线程题判题（无 `entry`，直接禁用运行）。
- 不做代码安全沙箱加固（用户自己的代码，单机自用，worker 隔离足够）。