# S0-scaffold — 脚手架与数据访问抽象（地基 · 无对应 PRD 功能）

## 目标
把已复制的原型骨架对齐 PRD 第 8 节技术栈，补齐正式版必需的「类型化数据访问层」，让后续所有功能只依赖这一层，不再直接 `import mockProblems`。这是从原型（全本地 state）到正式版（持久化）的关键重构。

## 验收标准
- `npm run dev` 一条命令起服务，浏览器打开能看到四大页面骨架。
- 技术栈：React 18 + Vite + TS + Tailwind v4 + shadcn/ui + CodeMirror + react-markdown，与 PRD 第 8 节一致。
- 存在一个 `src/lib/store.ts`（或 `src/store/` 目录）暴露类型化接口：`useProblem(id)`、`useProblems()`、`useSettings()`、`updateProblem(id, patch)`、`updateSettings(patch)`，返回类型严格对应 PRD 第 6 节数据模型（含 v1.2 新字段 `srsLevel` / `lastLang` / `defaultLang`，状态改名 `pending-review`）。
- 全项目无对 `mockProblems` 的直接引用（除 `src/data/seed.ts` 种子数据外）。
- `tsc --noEmit` 通过。

## 数据读写点
本 spec 只定义抽象接口，实现委托给 S0-data-layer；当前阶段接口背后可先返回内存种子数据，但签名必须与持久化版一致，便于无缝替换。

## 涉及文件
- `src/lib/types.ts` — 对齐 v1.2 数据模型（补字段、改状态名）
- `src/lib/store.ts` — 新建，数据访问层
- `src/data/seed.ts` — 用原型 mock 数据整理为种子（仅开发期）
- `src/App.tsx`、`src/components/Layout.tsx`、路由 — 保留原型已验证结构
- 四个页面 `src/pages/*` — 把对 `mockProblems` 的引用换成 store 接口

## 依赖前序 spec
无（地基起点）

## 实现要点
- 类型先行：`types.ts` 严格按 PRD 第 6 节 + v1.2 字段说明，`STATUS_LABEL` 同步改 `pending-review`。
- store 接口设计为 React hook + 命令式更新两类，内部用一个统一的数据源（S0-data-layer 接入后是 fetch `/api/db`；当前可先内存）。
- `updateProblem` / `updateSettings` 要支持局部 patch，避免整对象覆盖竞态。
- 顺手修原型的已知小 bug：`switchLang` 在 attempt 阶段不应覆盖用户已写代码（只有 reproduce 才清空）。

## 不做
- 不实现持久化（S0-data-layer 做）。
- 不实现真判题（S0-judge 做）。
- 不引入状态管理库（React context + hook 即可，单用户单标签页）。