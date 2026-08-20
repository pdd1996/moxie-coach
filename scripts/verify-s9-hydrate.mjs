// S9 hydrate 客户端变换回归测试：直接 import 真实的 dbHydrate.ts（node 24 类型剥离）。
// 覆盖 store hydrate→persist→reload 这一协议层测试（打 /api/db）测不到的路径。
// 起因：曾把 hydrate 写成 migrateUserState(stripMeta(p))，stripMeta 连 id 一起剥 →
// 落盘 db 全库丢 id → 重载塌缩成单条 → 数据丢失。此测试专守这条不变式。
// 用法：node scripts/verify-s9-hydrate.mjs
import { hydrateProblem, stripMeta } from '../src/lib/dbHydrate.ts'

let pass = 0, fail = 0
const ok = (c, m) => { c ? pass++ : fail++; console.log(c ? '  ✓' : '  ✗', m) }

// 1. 关键：hydrate 保留 id（防 db 全库丢 id、重载塌缩）
const p = { id: 88, status: 'learned', title: '合并两个有序数组', slug: 'merge', stage: 1, pattern: '双指针', history: [{ ts: 'x' }] }
const h = hydrateProblem(p, [3, 7, 14])
ok(h.id === 88, 'hydrateProblem 保留 id')
ok(!('title' in h) && !('slug' in h) && !('stage' in h) && !('pattern' in h), '剥掉 stale meta (title/slug/stage/pattern)')
ok('status' in h && 'history' in h, '保留用户状态 (status/history)')

// 2. 状态迁移跑通（self-solved -> learned + self）
const old = { id: 27, status: 'self-solved', srsLevel: 0, history: [] }
const m = hydrateProblem(old, [3, 7, 14])
ok(m.status === 'learned' && m.self === true, '旧状态 self-solved 迁移成 learned + self')
ok(m.lastFail === false, 'self-solved 清 lastFail')

// 3. 完整 hydrate→persist→reload 周期不塌缩（正是曾出 bug 的场景）
const db = [
  { id: 88, status: 'learned', title: 'A', history: [] },
  { id: 27, status: 'new', title: 'B', history: [] },
  { id: 1, status: 'mastered', title: 'C', history: [] },
]
const userById = {}
for (const q of db) userById[String(q.id)] = hydrateProblem(q, [3, 7, 14])
// persist 写 Object.values(userById)
const written = { problems: Object.values(userById) }
ok(written.problems.every((q) => typeof q.id === 'number'), '落盘的每条都带 numeric id')
// reload
const reloaded = {}
for (const q of written.problems) reloaded[String(q.id)] = q
ok(Object.keys(reloaded).length === 3, `重载后题数 = 3（无塌缩，实际 ${Object.keys(reloaded).length}）`)

// 4. 文档化 stripMeta 的 footgun：它剥 id，调用方必须补回
const s = stripMeta({ id: 5, title: 'x', status: 'new', history: [] })
ok(!('id' in s) && !('title' in s), 'stripMeta 剥 id + meta（调用方须补 id）')

console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (fail) process.exitCode = 1