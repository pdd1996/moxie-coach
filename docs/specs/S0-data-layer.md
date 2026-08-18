# S0-data-layer — db.json 持久化与 Vite 中间件（地基 · 对应 F9 部分）

## 目标
实现磁盘持久化：Vite 开发中间件读写 `data/db.json`，前端经 `/api/db` 读写，原子写入 + 1 秒防抖自动保存 + 每日自动备份。完成后刷新/重启数据不丢。S0-scaffold 的 store 接口背后换成真实的 `/api/db`。

## 验收标准（来自 PRD F9）
- 清浏览器存储后数据完好（全在 `data/db.json`）。
- 导出 → 清空 → 导入 可完整还原。
- 当天多次刷新只产生一份备份；`data/backups/` 保留最近 30 份，超出按最旧删除。
- 写入防抖 1 秒：连续编辑只落盘一次。
- 中途断电不写半截文件（原子写入：写临时文件再 rename）。

## 数据读写点
- `GET /api/db` → 返回整个 db.json；同时触发「每日首次备份」判定（读 `data/backups/` 当天是否已有文件）。
- `PUT /api/db` → 原子写入整个 db.json（1 秒防抖在中间件侧或前端侧均可，建议前端侧 debounce 后整体 PUT）。
- 导出：前端拉 `GET /api/db` 下载；导入：读文件后 `PUT /api/db`。

## 涉及文件
- `server/middleware.ts` — Vite 插件，挂 `/api/db` 路由（新建）
- `vite.config.ts` — 引入中间件
- `data/db.json` — 运行期生成，gitignore
- `data/backups/` — gitignore
- `src/lib/store.ts` — 背后实现换成 fetch `/api/db` + 本地缓存 + debounce 保存
- `.gitignore` — 排除 `data/`、`node_modules/`

## 依赖前序 spec
S0-scaffold（store 接口已定义）

## 实现要点
- 中间件用 TS 写，Vite 原生支持（`vite.config.ts` 引 `server/` 下插件）。
- 原子写入：写 `data/db.json.tmp` → `fs.rename` 覆盖。
- **首次启动顺序（D）**：`GET /api/db` 时若 `db.json` 不存在 → **先**从 `src/data/seed.ts` 生成并落盘，**再**做备份判定。顺序写死，否则会备份到空文件。
- 备份判定：`GET` 时 `readdir` `data/backups/`，若不存在 `db-YYYYMMDD.json` 则复制当前 db；同时清理超过 30 份的最旧文件。
- 前端 store：首次 `GET` 拉全量到内存，之后 `updateProblem` 改内存 + debounce 1s 后 `PUT` 全量。单用户单标签页，不做差分/并发。
- **防抖丢数据窗口（C）**：debounce 1s 后才 PUT，用户在 1s 内刷新/关页会丢最后一次编辑。补救：监听 `pagehide` / `visibilitychange:hidden`，若有未保存改动立即 flush；flush 用 `fetch(url, { method:'PUT', body, keepalive:true })`（`keepalive` 保证卸载期间请求能发完；`sendBeacon` 只能 POST，不能用于 PUT）。
- 中间件同时配 COOP/COEP 跨源隔离头（供 S0-judge 的 `SharedArrayBuffer` 用，见 S0-judge）。

## 不做
- 不做 AI 代理 `/ai-api`（S7-F7 做，V1.0 不含）。
- 不做多标签页并发同步（PRD 第 7 节已 scope out）。
- 不做加密（PRD 明文，单机自用）。