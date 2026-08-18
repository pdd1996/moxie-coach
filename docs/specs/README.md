# 默写教练 · 实现 Spec 索引

依据 `../../PRD-默写教练.md`（v1.2）拆分。本轮范围：**V1.0（P0）= F1–F6 + F9**，纯纪律工具，离线完整可用。F7/F8/F11（P1）留 V1.1，F10（P2）留 V2.0，本批不写 spec。

## Spec 清单

### S0 地基（无对应 PRD 功能，但所有功能都踩在它上面）
| Spec | 内容 | 对应 PRD |
|---|---|---|
| [S0-scaffold](S0-scaffold.md) | 脚手架对齐 + 类型化数据访问层 `store` | 第 8 节技术栈 |
| [S0-data-layer](S0-data-layer.md) | db.json + Vite 中间件 `/api/db` + 原子写入 + 每日备份 | F9（底层） |
| [S0-judge](S0-judge.md) | Pyodide（本地打包）+ Web Worker 真判题 + 宽松比对 | F3 判定方式、D1/D2 |

### V1.0 功能（P0）
| Spec | 内容 | 对应 PRD |
|---|---|---|
| [S1-F1](S1-F1.md) | 150 题元数据 + 仪表盘 | F1 |
| [S2-F2](S2-F2.md) | 贴题模式 + md 批量导入 + 示例解析 | F2 |
| [S3-F3](S3-F3.md) | 尝试流程（计时/暂停/编辑/运行用例/自解/跳过） | F3 |
| [S4-F4](S4-F4.md) | 默写模式（清空/重计时/偷看计数） | F4 |
| [S5-F5](S5-F5.md) | 一句话笔记 | F5 |
| [S6-F6](S6-F6.md) | SRS 排期引擎（srsLevel/nextReviewAt/队列） | F6 |
| [S9-F9](S9-F9.md) | 数据管理 UI（导出/导入/清空） | F9 |

## 施工顺序（按依赖）

```
S0-scaffold ──► S0-data-layer ──► S0-judge
                     │                │
                     ▼                ▼
                   S1-F1 ──► S2-F2 ──► S3-F3 ──► S4-F4 ──► S5-F5
                     ▲                                 │
                     │                                 ▼
                   S6-F6 ◄─────────────────────────── (排期)
                     │
                     ▼
                   S9-F9
```

文字顺序：`S0-scaffold → S0-data-layer → S0-judge → S1 → S2 → S3 → S4 → S5 → S6 → S9`

理由：
- **S0-data-layer 必须最早**——原型所有状态在 `useState` 里、刷新即丢，这是从原型到正式版最大的鸿沟。
- **S0-judge 在 S3 前**——S3「运行用例」要真判题。
- **S6 可与 S3/S4 并行设计**，但排期调用要在 S3（自解）/S4（默写）落地前定好纯函数。
- **S9 大部分逻辑在 S0-data-layer**，本 spec 只加 UI 入口，最后做。

## 数据准备（前置任务，独立于代码）

S1-F1 要求 150 题元数据先录入 `src/data/problems.json`，未录全前 F1 验收降级。建议开工前先产出：
1. 150 题清单（题号/标题/难度/LeetCode CN slug/阶段）。
2. 《刷题技巧.md》已标注套路题的映射表 → `docs/specs/S1-F1/套路映射.md`（含 `entry` 入口函数名）。

## 与原型（`../leetcode-coach/`）的关系

moxie-coach 复制原型骨架为起点，复用已验证的 UI/状态机/类型。原型的债由 spec 重建清掉：
- mock 数据 → S0-data-layer 持久化
- 假判题 → S0-judge 真判题
- 本地 state → store 抽象
- 硬编码日期/状态名 → v1.2 数据模型（`srsLevel`/`lastLang`/`pending-review`）

## 不在本轮（留 V1.1 / V2.0）

- F7 AI 教练四件套、F8 统计（热力图/掌握矩阵/指标）、F11 深色模式（V1.1）
- F10 LeetCode GraphQL 自动拉题（V2.0）