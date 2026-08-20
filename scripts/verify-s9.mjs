// S9-F9 协议级验收：导出 → 清空 → 导入还原 + 校验失败不覆盖
// 用法：node scripts/verify-s9.mjs http://localhost:5174
import { writeFileSync, unlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://localhost:5174'
const exp = join(tmpdir(), 'moxie-s9-export.json')
let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('  ✓', m) } else { fail++; console.log('  ✗', m) } }

// 1. 导出（GET）
const r1 = await fetch(`${BASE}/api/db`)
ok(r1.ok, `GET /api/db -> ${r1.status}`)
const text = await r1.text()
writeFileSync(exp, text)
const orig = JSON.parse(text)
ok(Array.isArray(orig.problems) && typeof orig.settings === 'object', `导出结构合法 (problems=${orig.problems.length})`)
console.log(`\n导出 ${orig.problems.length} 题，存 ${exp}`)

// 2. 清空（PUT problems:[], 保留 settings）
const cleared = JSON.stringify({ problems: [], settings: orig.settings })
const r2 = await fetch(`${BASE}/api/db`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: cleared })
ok(r2.status === 204, `清空 PUT -> ${r2.status}`)
const r3 = await fetch(`${BASE}/api/db`)
const afterClear = JSON.parse(await r3.text())
ok(afterClear.problems.length === 0, '清空后 problems 为空')
ok(JSON.stringify(afterClear.settings) === JSON.stringify(orig.settings), '清空后 settings 保留')

// 3. 导入还原（PUT 回导出文件）
const r4 = await fetch(`${BASE}/api/db`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: text })
ok(r4.status === 204, `导入 PUT -> ${r4.status}`)
const r5 = await fetch(`${BASE}/api/db`)
const restored = JSON.parse(await r5.text())
ok(restored.problems.length === orig.problems.length, '还原后题数一致')
ok(JSON.stringify(restored.problems) === JSON.stringify(orig.problems), '还原后 problems 内容一致')
ok(JSON.stringify(restored.settings) === JSON.stringify(orig.settings), '还原后 settings 一致')

// 4. 校验失败不覆盖：PUT 一个缺 settings 的对象应被拒（middleware 只校验 JSON 合法性，
//    结构守门在 store 侧——这里测 server 不会因结构拒绝，所以改测「坏 JSON」走 400）
const r6 = await fetch(`${BASE}/api/db`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: '{not json' })
ok(r6.status === 400, `坏 JSON PUT -> ${r6.status}（不落盘）`)
const r7 = await fetch(`${BASE}/api/db`)
const afterBad = JSON.parse(await r7.text())
ok(afterBad.problems.length === orig.problems.length, '坏 JSON 后数据未变（未被覆盖）')

unlinkSync(exp)
console.log(`\n结果：${pass} 通过 / ${fail} 失败`)
if (fail) process.exitCode = 1