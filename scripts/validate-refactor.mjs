// 状态模型重构 §9 验证（playwright + 本地 chromium-1228）。
// 迁移在客户端 StoreProvider 跑，必须真浏览器加载才触发；curl /api/db 不会迁移。
// 流程：备份真实 db → PUT 手造旧状态测试 db → 加载触发迁移 → 读回校验 A1-A6
//       → 刷新验幂等 A7 → 加载复习入口验 B6(reviewing 不落库) → 恢复真实 db。
// 运行：需 dev server 在 localhost:5173，然后 node scripts/validate-refactor.mjs
import { chromium } from 'playwright'
import { copyFileSync, existsSync, unlinkSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CHROME = join(homedir(), 'AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe')
const BASE = process.env.BASE || 'http://localhost:5178'
const DB = join(__dirname, '..', 'data', 'db.json')
const BAK = join(__dirname, '..', 'data', 'db.json.bak-validate')
const FLUSH = 1800 // store debounce 1s + 余量
const TODAY = '2026-08-20'
const FUTURE = '2026-09-01'

let pass = 0, fail = 0
const ok = (n, c, x) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`) }

const dbGet = async () => await (await fetch(`${BASE}/api/db`)).json()
const dbPut = async (db) => { await fetch(`${BASE}/api/db`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(db) }) }
const find = (ps, id) => ps.find(p => p.id === id)
const OLD = new Set(['self-solved', 'pending-review', 'reviewing'])
const noOld = (ps) => ps.every(p => !OLD.has(p.status))

// 完整 settings（与 seedSettings 一致，保证 app 渲染不缺字段）
const settings = {
  ai: { baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' },
  intervalsDays: [3, 7, 14],
  timeLimitMin: { easy: 15, medium: 25, hard: 25 },
  defaultLang: 'python',
}

// 手造测试 db：假 id（99001+）不进 problems（meta 驱动），但留 userById 被迁移+落盘。
// id 88 用真 meta，给 statement 让它成为复习入口（B6）。
const testProblems = [
  // A1: self-solved 未达顶 + 未来排期 → learned + self=true + lastFail=false + nextReviewAt 保留
  { id: 99001, status: 'self-solved', srsLevel: 0, nextReviewAt: FUTURE, lastLang: 'python', history: [] },
  // A2: self-solved 达顶 → mastered + self=true + nextReviewAt 清空
  { id: 99002, status: 'self-solved', srsLevel: 3, nextReviewAt: FUTURE, lastLang: 'python', history: [] },
  // A3: pending-review + 今天到期 → learned + lastFail=true
  { id: 99003, status: 'pending-review', nextReviewAt: TODAY, srsLevel: 0, history: [] },
  // A4: reviewing + 今天到期 → learned + lastFail=false
  { id: 99004, status: 'reviewing', nextReviewAt: TODAY, srsLevel: 0, history: [] },
  // A5: 新形状原样不变
  { id: 99005, status: 'new', history: [] },
  { id: 99006, status: 'in-progress', history: [] },
  { id: 99007, status: 'learned', nextReviewAt: FUTURE, srsLevel: 1, history: [] },
  { id: 99008, status: 'mastered', srsLevel: 3, history: [] },
  { id: 99009, status: 'skipped', history: [] },
  // 边缘：mastered 残留 stale nextReviewAt → 迁移清排期（§7.1 line 153）
  { id: 99010, status: 'mastered', srsLevel: 3, nextReviewAt: FUTURE, history: [] },
  // B6: 真实 meta id 88，learned + 今天到期 + 易错 + 题面 → 复习入口（进 reproduce）
  { id: 88, status: 'learned', lastFail: true, nextReviewAt: TODAY, srsLevel: 0, lastLang: 'python',
    statement: '测试题面：写一个函数。', testCases: [], history: [],
    skeleton: { python: 'def f():\n    pass\n', javascript: 'var f = function() {};' } },
]

async function main() {
  copyFileSync(DB, BAK)
  await dbPut({ problems: testProblems, settings })

  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage()
  const putCount = { n: 0 }
  page.on('request', (req) => {
    if (req.url().includes('/api/db') && req.method() === 'PUT') putCount.n++
  })
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 200)) })

  // ===== 加载触发迁移 =====
  console.log('== 加载触发客户端迁移 ==')
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(FLUSH)
  ok('迁移触发了 scheduleSave（至少 1 次 PUT）', putCount.n >= 1, `PUT=${putCount.n}`)

  const ps = (await dbGet()).problems
  console.log('== A. 迁移无损 ==')

  // A1
  const a1 = find(ps, 99001)
  ok('A1 self-solved→learned', a1.status === 'learned', `status=${a1.status}`)
  ok('A1 self=true', a1.self === true, `self=${a1.self}`)
  ok('A1 lastFail=false', a1.lastFail === false, `lastFail=${a1.lastFail}`)
  ok('A1 nextReviewAt 保留', a1.nextReviewAt === FUTURE, `nextReviewAt=${a1.nextReviewAt}`)

  // A2
  const a2 = find(ps, 99002)
  ok('A2 self-solved 达顶→mastered', a2.status === 'mastered', `status=${a2.status}`)
  ok('A2 self=true', a2.self === true, `self=${a2.self}`)
  ok('A2 nextReviewAt 清空', a2.nextReviewAt === undefined, `nextReviewAt=${a2.nextReviewAt}`)

  // A3
  const a3 = find(ps, 99003)
  ok('A3 pending-review→learned', a3.status === 'learned', `status=${a3.status}`)
  ok('A3 lastFail=true', a3.lastFail === true, `lastFail=${a3.lastFail}`)
  ok('A3 nextReviewAt 保留', a3.nextReviewAt === TODAY, `nextReviewAt=${a3.nextReviewAt}`)

  // A4
  const a4 = find(ps, 99004)
  ok('A4 reviewing→learned', a4.status === 'learned', `status=${a4.status}`)
  ok('A4 lastFail=false', a4.lastFail === false, `lastFail=${a4.lastFail}`)
  ok('A4 nextReviewAt 保留', a4.nextReviewAt === TODAY, `nextReviewAt=${a4.nextReviewAt}`)

  // A5 原样不变（status/srsLevel/nextReviewAt 不动；self/lastFail 显式 false）
  const a5n = find(ps, 99005); ok('A5 new 不变', a5n.status === 'new', `status=${a5n.status}`)
  const a5ip = find(ps, 99006); ok('A5 in-progress 不变', a5ip.status === 'in-progress', `status=${a5ip.status}`)
  const a5l = find(ps, 99007)
  ok('A5 learned 不变', a5l.status === 'learned' && a5l.nextReviewAt === FUTURE && a5l.srsLevel === 1,
    `status=${a5l.status} nextReviewAt=${a5l.nextReviewAt} srsLevel=${a5l.srsLevel}`)
  const a5m = find(ps, 99008)
  ok('A5 mastered 不变', a5m.status === 'mastered' && a5m.srsLevel === 3 && a5m.nextReviewAt === undefined,
    `status=${a5m.status} srsLevel=${a5m.srsLevel} nextReviewAt=${a5m.nextReviewAt}`)
  const a5s = find(ps, 99009); ok('A5 skipped 不变', a5s.status === 'skipped', `status=${a5s.status}`)

  // 边缘：mastered 残留 stale nextReviewAt 被清
  const e10 = find(ps, 99010)
  ok('边缘 mastered+stale排期→清 nextReviewAt', e10.status === 'mastered' && e10.nextReviewAt === undefined,
    `status=${e10.status} nextReviewAt=${e10.nextReviewAt}`)

  // A6: 整库落成新形状（无任何旧状态残留）
  ok('A6 整库无 self-solved/pending-review/reviewing', noOld(ps), `残留=${ps.filter(p => OLD.has(p.status)).map(p => p.id)}`)

  // ===== A7 幂等：刷新再加载，状态不变 + 不二次写库 =====
  console.log('== A7 幂等 ==')
  const snapshot = JSON.stringify(ps)
  putCount.n = 0
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(FLUSH)
  ok('A7 刷新后 0 次 PUT（不二次写库）', putCount.n === 0, `PUT=${putCount.n}`)
  const ps2 = (await dbGet()).problems
  ok('A7 刷新后 db 内容不变', JSON.stringify(ps2) === snapshot, '内容变化')

  // ===== B6 reviewing 不持久化 =====
  console.log('== B6 复习入口不写 reviewing ==')
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(1000) // 进 reproduce 后等够 debounce
  const p88a = find((await dbGet()).problems, 88)
  ok('B6 进复习入口后 status 仍 learned（非 reviewing）', p88a.status === 'learned', `status=${p88a.status}`)
  ok('B6 lastFail 保留', p88a.lastFail === true, `lastFail=${p88a.lastFail}`)
  // 离开复习页
  await page.goto(`${BASE}/problems`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(FLUSH)
  const p88b = find((await dbGet()).problems, 88)
  ok('B6 离开复习后 status 仍 learned', p88b.status === 'learned', `status=${p88b.status}`)
  ok('B6 整库仍无 reviewing', noOld((await dbGet()).problems), '有 reviewing 残留')

  await browser.close()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exitCode = 1
}

main().catch((e) => { console.error('VALIDATE ERROR:', e); process.exitCode = 1 })
  .finally(() => { if (existsSync(BAK)) { copyFileSync(BAK, DB); try { unlinkSync(BAK) } catch {} } })