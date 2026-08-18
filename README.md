# 默写教练 · moxie-coach（V1.0 实现）

把《刷题技巧.md》的方法论产品化：**按套路分组 → 计时卡思路 → 超时看题解 → 关掉默写 → 一句话笔记 → 3 天后间隔复习**。

本仓库是 PRD v1.2 的正式实现（V1.0 / P0），以 `../leetcode-coach/` UI 原型为起点重构：补持久化、真判题、SRS 引擎。

## 文档

- 产品需求：`../PRD-默写教练.md`（v1.2）
- 实现 spec：`docs/specs/`（施工顺序见 [docs/specs/README.md](docs/specs/README.md)）

## 本轮范围（V1.0 · P0）

F1 题库与仪表盘 · F2 贴题与 md 导入 · F3 尝试流程 · F4 默写模式 · F5 一句话笔记 · F6 SRS 间隔复习 · F9 数据管理。
（F7 AI 教练 / F8 统计 / F11 深色模式 → V1.1；F10 自动拉题 → V2.0）

## 怎么运行

```bash
npm install    # 首次
npm run dev    # http://localhost:5173
```

## 技术栈（PRD 第 8 节）

TypeScript 全栈 · React 18 + Vite · Tailwind CSS v4 · shadcn/ui · CodeMirror 6 · react-markdown
V1.0 加入：Pyodide（本地打包跑 Python）· Web Worker（跑 JS）· Vite 中间件存 db.json + 每日备份。