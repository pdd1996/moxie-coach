// S6-F6「重置本题 SRS」实机验证（方案 B：重置后跳题单）。
//   R1 重置复习中(未到期)题 → 跳题单 + db new + 字段清 + history/note/题面保留
//   R2 自解题重置撤徽章   R3 易错题重置清 lastFail   R4 mastered 重置回可建议新题
//   R5 取消不落库        R6 重置后重自解 → +3 天(验 srsLevel=undefined 修正)
//   R7 从 done 屏重置    R8 到期题落 reproduce 态可重置(不污染 history)
// 运行：需 dev server，BASE=http://localhost:<port> node scripts/validate-reset.mjs
import { chromium } from 'playwright'
import { copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CHROME = join(homedir(), 'AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe')
const BASE = process.env.BASE || 'http://localhost:5178'
const DB = join(__dirname, '..', 'data', 'db.json')
const BAK = join(__dirname, '..', 'data', 'db.json.bak-reset')
const FLUSH = 1800
const TODAY = '2026-08-20'
const FUTURE = '2026-08-25' // 未到期 → 落 attempt（非 reproduce），重置按钮可见

let pass = 0, fail = 0
const ok = (n, c, x) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`) }
const dbGet = async () => await (await fetch(`${BASE}/api/db`)).json()
const dbPut = async (db) => { await fetch(`${BASE}/api/db`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(db) }) }
const find = (ps, id) => ps.find(p => p.id === id)

const settings = {
  ai: { baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' },
  intervalsDays: [3, 7, 14],
  timeLimitMin: { easy: 15, medium: 25, hard: 25 },
  defaultLang: 'javascript',
}

const base88 = {
  statement: '两数相加。输入两个整数 a、b，返回它们的和。',
  skeleton: { python: 'def add(a, b):\n    pass\n', javascript: 'var add = function(a, b) {\n  // 写这里\n};' },
  solution: '## 套路：直接返回 a + b。\n```javascript\nvar add = function(a, b) { return a + b; };\n```',
  entry: { javascript: { name: 'add', callType: 'function' } },
  testCases: [
    { label: 'c1', args: ['1', '2'], expected: '3' },
    { label: 'c2', args: ['10', '-5'], expected: '5' },
  ],
}
const CORRECT = 'var add = function(a, b) { return a + b; };'

async function putState(state) {
  await dbPut({ problems: [{ id: 88, history: [{ ts: '2026-08-10T00:00:00.000Z', phase: 'attempt', outcome: 'pass', elapsedMin: 5, pausedMin: 0, peekCount: 0, lang: 'javascript' }], note: '看到求和就用加法', ...base88, ...state }], settings })
}

async function fillCode(page, code) {
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type(code)
}

async function runAndWaitPass(page, btnText) {
  await page.locator('button:has-text("运行用例")').first().click()
  await page.waitForFunction(
    (t) => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(t)); return b && !b.disabled },
    btnText, { timeout: 20000 },
  )
}

// 点题头「重置重学」→ 弹窗确认「重置」→ 等跳题单。
// 不轮询 GET：app 的 navigate 是 SPA 路由（不 pagehide、不重载），重置靠 1s debounce PUT
// 落库；轮询 GET 会触发 maybeBackup copyFile，与飞行中的 debounce PUT 在 Windows 上抢
// rename 出 500。改成等 debounce 干净落库（1s+余量）后再让调用方单次读 db。
async function doReset(page) {
  await page.locator('button:has-text("重置重学")').click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '重置', exact: true }).click()
  await page.waitForURL('**/problems', { timeout: 5000 })
  await page.waitForTimeout(1500) // debounce(1s) 触发并完成后再放行，避免与下条 putState 抢 .tmp
}

async function main() {
  copyFileSync(DB, BAK)
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage()
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 200)) })
  page.on('response', (r) => { if (!r.ok() && !r.url().includes('favicon')) console.log(`  [resp ${r.status()}] ${r.url().slice(-60)}`) })

  // ===== R1 重置复习中(未到期)题 =====
  console.log('== R1 重置未到期 learned 题 ==')
  await putState({ status: 'learned', self: true, lastFail: false, srsLevel: 1, nextReviewAt: FUTURE, lastLang: 'javascript' })
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  ok('R1 落 attempt(重置按钮可见)', await page.locator('button:has-text("重置重学")').count() === 1)
  await doReset(page)
  await page.waitForTimeout(FLUSH)
  ok('R1 跳到题单', page.url().endsWith('/problems'), page.url())
  const p1 = find((await dbGet()).problems, 88)
  ok('R1 status=new', p1.status === 'new', `status=${p1.status}`)
  ok('R1 srsLevel 清空', p1.srsLevel === undefined, `srsLevel=${p1.srsLevel}`)
  ok('R1 nextReviewAt 清空', p1.nextReviewAt === undefined, `nextReviewAt=${p1.nextReviewAt}`)
  ok('R1 self 清空', p1.self === undefined, `self=${p1.self}`)
  ok('R1 lastFail 清空', p1.lastFail === undefined, `lastFail=${p1.lastFail}`)
  ok('R1 history 保留', Array.isArray(p1.history) && p1.history.length === 1, `len=${p1.history?.length}`)
  ok('R1 note 保留', p1.note === '看到求和就用加法', `note=${p1.note}`)
  ok('R1 statement 保留', p1.statement.includes('两数相加'))
  ok('R1 skeleton 保留', !!p1.skeleton?.javascript)

  // ===== R2 自解题重置撤徽章 =====
  console.log('== R2 自解题重置撤徽章 ==')
  await putState({ status: 'learned', self: true, lastFail: false, srsLevel: 1, nextReviewAt: FUTURE, lastLang: 'javascript' })
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  await doReset(page)
  await page.waitForTimeout(FLUSH)
  const p2 = find((await dbGet()).problems, 88)
  ok('R2 self 清空(撤徽章)', p2.self === undefined, `self=${p2.self}`)

  // ===== R3 易错题重置清 lastFail =====
  console.log('== R3 易错题重置清 lastFail ==')
  await putState({ status: 'learned', self: false, lastFail: true, srsLevel: 0, nextReviewAt: FUTURE, lastLang: 'javascript' })
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  await doReset(page)
  await page.waitForTimeout(FLUSH)
  const p3 = find((await dbGet()).problems, 88)
  ok('R3 lastFail 清空', p3.lastFail === undefined, `lastFail=${p3.lastFail}`)

  // ===== R4 mastered 重置回可建议新题 =====
  console.log('== R4 mastered 重置 ==')
  await putState({ status: 'mastered', self: true, lastFail: false, srsLevel: 3, lastLang: 'javascript' })
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  ok('R4 mastered 落 attempt(重置可见)', await page.locator('button:has-text("重置重学")').count() === 1)
  await doReset(page)
  await page.waitForTimeout(FLUSH)
  const p4 = find((await dbGet()).problems, 88)
  ok('R4 status=new', p4.status === 'new', `status=${p4.status}`)
  ok('R4 nextReviewAt 清空', p4.nextReviewAt === undefined, `nextReviewAt=${p4.nextReviewAt}`)

  // ===== R5 取消不落库 =====
  console.log('== R5 取消不落库 ==')
  await putState({ status: 'learned', self: true, lastFail: true, srsLevel: 2, nextReviewAt: FUTURE, lastLang: 'javascript' })
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  const before = JSON.stringify(find((await dbGet()).problems, 88))
  await page.locator('button:has-text("重置重学")').click()
  await page.waitForTimeout(300)
  await page.getByRole('button', { name: '取消', exact: true }).click()
  await page.waitForTimeout(FLUSH)
  const after = JSON.stringify(find((await dbGet()).problems, 88))
  ok('R5 取消后 db 无变化', before === after)

  // ===== R6 重置后重自解 → +3 天(验 srsLevel=undefined 修正) =====
  console.log('== R6 重置后重自解 → +3 天 ==')
  await putState({ status: 'learned', self: true, lastFail: false, srsLevel: 2, nextReviewAt: FUTURE, lastLang: 'javascript' })
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  await doReset(page) // → db new, srsLevel undefined
  await page.waitForTimeout(FLUSH)
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' }) // 重新点开重学
  await page.waitForTimeout(600)
  await fillCode(page, CORRECT)
  await runAndWaitPass(page, '直接过了')
  await page.locator('button:has-text("直接过了")').click()
  await page.waitForTimeout(FLUSH)
  const p6 = find((await dbGet()).problems, 88)
  ok('R6 status=learned', p6.status === 'learned', `status=${p6.status}`)
  ok('R6 srsLevel=0(未跳级)', p6.srsLevel === 0, `srsLevel=${p6.srsLevel}`)
  ok('R6 nextReviewAt=+3(今天+3)', p6.nextReviewAt === '2026-08-23', `nextReviewAt=${p6.nextReviewAt}`)
  ok('R6 self=true(重获徽章)', p6.self === true, `self=${p6.self}`)

  // ===== R7 从 done 屏重置 =====
  console.log('== R7 从 done 屏重置 ==')
  await putState({ status: 'new' })
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await fillCode(page, CORRECT)
  await runAndWaitPass(page, '直接过了')
  await page.locator('button:has-text("直接过了")').click() // → done 屏(self-solved)
  await page.waitForTimeout(500)
  ok('R7 done 屏有重置按钮', await page.locator('button:has-text("重置重学")').count() === 1)
  await doReset(page)
  await page.waitForTimeout(FLUSH)
  const p7 = find((await dbGet()).problems, 88)
  ok('R7 done 重置后 status=new', p7.status === 'new', `status=${p7.status}`)
  ok('R7 done 重置后 self 清空', p7.self === undefined, `self=${p7.self}`)

  // ===== R8 到期题落 reproduce 态 → 可重置(不污染 history) =====
  // 原已知限制:reproduce 态无重置按钮,用户得先「默写失败」混进 done 屏才能重置,
  // 那次假失败会写进 history/置 lastFail,再被 reset 清掉 —— 为重置被迫污染历史。
  // 现放开 reproduce 态重置:不用假失败就能「我不想复习了,重学」。
  console.log('== R8 到期题落 reproduce 态可重置 ==')
  await putState({ status: 'learned', self: true, lastFail: false, srsLevel: 0, nextReviewAt: TODAY, lastLang: 'javascript' })
  const histLenBefore = find((await dbGet()).problems, 88).history.length
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  const isReproduce = await page.locator('text=默写模式 · 题解已收起').count() > 0
  ok('R8 到期题落 reproduce 态', isReproduce)
  ok('R8 reproduce 态有重置按钮', await page.locator('button:has-text("重置重学")').count() === 1)
  ok('R8 reproduce 态无编辑题目按钮(不泄露题解)', await page.locator('button:has-text("编辑题目")').count() === 0)
  await doReset(page)
  await page.waitForTimeout(FLUSH)
  const p8 = find((await dbGet()).problems, 88)
  ok('R8 status=new', p8.status === 'new', `status=${p8.status}`)
  ok('R8 srsLevel 清空', p8.srsLevel === undefined, `srsLevel=${p8.srsLevel}`)
  ok('R8 self 清空', p8.self === undefined, `self=${p8.self}`)
  ok('R8 history 长度不变(无假失败脏记录)', p8.history.length === histLenBefore, `before=${histLenBefore} after=${p8.history.length}`)

  await browser.close()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exitCode = 1
}

main().catch((e) => { console.error('VALIDATE-RESET ERROR:', e); process.exitCode = 1 })
  .finally(() => { if (existsSync(BAK)) { copyFileSync(BAK, DB); try { unlinkSync(BAK) } catch {} } })