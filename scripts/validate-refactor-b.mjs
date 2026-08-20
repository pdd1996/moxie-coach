// 状态模型重构 §9 B 段验证（判题驱动）：实机触发 onReproducePass/onReproduceFail/selfSolved，
// 校验结算写入。用 id 88（真 meta）+ JS 判题（defaultLang=javascript 避开 pyodide）。
//   B2 自解通过 / B1 首次默写通过 / B4 默写失败 / B5 失败后再通过(保 self)
//   B3 复习默写通过(自解保星) / B7 复习达顶 mastered(self+过关了)
// 运行：需 dev server，BASE=http://localhost:<port> node scripts/validate-refactor-b.mjs
import { chromium } from 'playwright'
import { copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const CHROME = join(homedir(), 'AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe')
const BASE = process.env.BASE || 'http://localhost:5178'
const DB = join(__dirname, '..', 'data', 'db.json')
const BAK = join(__dirname, '..', 'data', 'db.json.bak-validate-b')
const FLUSH = 1800
const TODAY = '2026-08-20'

let pass = 0, fail = 0
const ok = (n, c, x) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`) }
const dbGet = async () => await (await fetch(`${BASE}/api/db`)).json()
const dbPut = async (db) => { await fetch(`${BASE}/api/db`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(db) }) }
const find = (ps, id) => ps.find(p => p.id === id)
const OLD = new Set(['self-solved', 'pending-review', 'reviewing'])
const noOld = (ps) => ps.every(p => !OLD.has(p.status))

const settings = {
  ai: { baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-v4-flash' },
  intervalsDays: [3, 7, 14],
  timeLimitMin: { easy: 15, medium: 25, hard: 25 },
  defaultLang: 'javascript', // 强制 JS 判题，避开 pyodide
}

// id 88 题目本体（statement/skeleton/solution/entry/testCases）+ 可变状态
const base88 = {
  statement: '两数相加。输入两个整数 a、b，返回它们的和。',
  skeleton: { python: 'def add(a, b):\n    pass\n', javascript: 'var add = function(a, b) {\n  // 写这里\n};' },
  solution: '## 套路：直接返回 a + b。\n\n```javascript\nvar add = function(a, b) { return a + b; };\n```',
  entry: { javascript: { name: 'add', callType: 'function' } },
  testCases: [
    { label: 'c1', args: ['1', '2'], expected: '3' },
    { label: 'c2', args: ['10', '-5'], expected: '5' },
  ],
}
const CORRECT = 'var add = function(a, b) { return a + b; };'
const WRONG = 'var add = function(a, b) { return a - b; };'

// 用指定起始状态 PUT db（id 88 = base + state）
async function putState(state) {
  await dbPut({ problems: [{ id: 88, history: [], ...base88, ...state }], settings })
}

// 填 CodeMirror 编辑器：聚焦 .cm-content → Ctrl+A 全选 → 输入替换
async function fillCode(page, code) {
  await page.locator('.cm-content').click()
  await page.keyboard.press('Control+a')
  await page.keyboard.type(code)
}

// 运行用例并等通过按钮可用（allPass）
async function runAndWaitPass(page, btnText) {
  await page.locator('button:has-text("运行用例")').first().click()
  await page.waitForFunction(
    (t) => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes(t)); return b && !b.disabled },
    btnText, { timeout: 20000 },
  )
}

async function main() {
  copyFileSync(DB, BAK)
  const browser = await chromium.launch({ executablePath: CHROME, headless: true })
  const page = await browser.newPage()
  page.on('console', (m) => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 200)) })

  // ===== B2 自解通过 =====
  console.log('== B2 自解通过 ==')
  await putState({ status: 'new' })
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await fillCode(page, CORRECT)
  await runAndWaitPass(page, '直接过了')
  await page.locator('button:has-text("直接过了")').click()
  await page.waitForTimeout(FLUSH)
  const p2 = find((await dbGet()).problems, 88)
  ok('B2 status=learned', p2.status === 'learned', `status=${p2.status}`)
  ok('B2 self=true', p2.self === true, `self=${p2.self}`)
  ok('B2 lastFail=false', p2.lastFail === false, `lastFail=${p2.lastFail}`)
  ok('B2 srsLevel=0', p2.srsLevel === 0, `srsLevel=${p2.srsLevel}`)
  ok('B2 nextReviewAt=+3', p2.nextReviewAt === '2026-08-23', `nextReviewAt=${p2.nextReviewAt}`)
  ok('B2 history phase=attempt/pass', p2.history.at(-1)?.phase === 'attempt' && p2.history.at(-1)?.outcome === 'pass', `last=${JSON.stringify(p2.history.at(-1))}`)
  const done2 = await page.textContent('body').catch(() => '')
  ok('B2 done 屏「我顺极了」', done2.includes('我顺极了'), 'miss')

  // ===== B1 首次默写通过 =====
  console.log('== B1 首次默写通过 ==')
  await putState({ status: 'new' })
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await page.locator('button:has-text("想不出，看题解")').click()
  await page.waitForTimeout(300)
  await page.locator('button:has-text("关掉题解，进入默写")').click()
  await page.waitForTimeout(300)
  await fillCode(page, CORRECT)
  await runAndWaitPass(page, '默写通过')
  await page.locator('button:has-text("默写通过")').first().click()
  await page.waitForTimeout(FLUSH)
  const p1 = find((await dbGet()).problems, 88)
  ok('B1 status=learned', p1.status === 'learned', `status=${p1.status}`)
  ok('B1 self=false', p1.self === false, `self=${p1.self}`)
  ok('B1 lastFail=false', p1.lastFail === false, `lastFail=${p1.lastFail}`)
  ok('B1 srsLevel=0', p1.srsLevel === 0, `srsLevel=${p1.srsLevel}`)
  ok('B1 nextReviewAt=+3', p1.nextReviewAt === '2026-08-23', `nextReviewAt=${p1.nextReviewAt}`)
  ok('B1 history phase=reproduce/pass', p1.history.at(-1)?.phase === 'reproduce' && p1.history.at(-1)?.outcome === 'pass', `last=${JSON.stringify(p1.history.at(-1))}`)

  // ===== B4 默写失败 =====
  console.log('== B4 默写失败 ==')
  await putState({ status: 'new' })
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await page.locator('button:has-text("想不出，看题解")').click()
  await page.waitForTimeout(300)
  await page.locator('button:has-text("关掉题解，进入默写")').click()
  await page.waitForTimeout(300)
  await page.locator('button:has-text("反复写不出，默写失败")').click()
  await page.waitForTimeout(FLUSH)
  const p4 = find((await dbGet()).problems, 88)
  ok('B4 status=learned', p4.status === 'learned', `status=${p4.status}`)
  ok('B4 lastFail=true', p4.lastFail === true, `lastFail=${p4.lastFail}`)
  ok('B4 srsLevel=0', p4.srsLevel === 0, `srsLevel=${p4.srsLevel}`)
  ok('B4 nextReviewAt=+3', p4.nextReviewAt === '2026-08-23', `nextReviewAt=${p4.nextReviewAt}`)
  ok('B4 history phase=reproduce/fail', p4.history.at(-1)?.phase === 'reproduce' && p4.history.at(-1)?.outcome === 'fail', `last=${JSON.stringify(p4.history.at(-1))}`)

  // ===== B5 失败后再通过（保 self 星）=====
  console.log('== B5 失败后再通过（保 self）==')
  await putState({ status: 'learned', self: true, lastFail: true, srsLevel: 0, nextReviewAt: TODAY, lastLang: 'javascript' })
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  await fillCode(page, CORRECT)
  await runAndWaitPass(page, '默写通过')
  await page.locator('button:has-text("默写通过")').first().click()
  await page.waitForTimeout(FLUSH)
  const p5 = find((await dbGet()).problems, 88)
  ok('B5 status=learned', p5.status === 'learned', `status=${p5.status}`)
  ok('B5 lastFail=false（通过清挂科）', p5.lastFail === false, `lastFail=${p5.lastFail}`)
  ok('B5 self=true 保持（§8 选 A）', p5.self === true, `self=${p5.self}`)
  ok('B5 srsLevel=1（SRS 重排）', p5.srsLevel === 1, `srsLevel=${p5.srsLevel}`)
  ok('B5 nextReviewAt=+7', p5.nextReviewAt === '2026-08-27', `nextReviewAt=${p5.nextReviewAt}`)
  ok('B5 history phase=review/pass', p5.history.at(-1)?.phase === 'review' && p5.history.at(-1)?.outcome === 'pass', `last=${JSON.stringify(p5.history.at(-1))}`)

  // ===== B3 复习默写通过（自解保星）=====
  console.log('== B3 复习默写通过（自解保星）==')
  await putState({ status: 'learned', self: true, lastFail: false, srsLevel: 1, nextReviewAt: TODAY, lastLang: 'javascript' })
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  await fillCode(page, CORRECT)
  await runAndWaitPass(page, '默写通过')
  await page.locator('button:has-text("默写通过")').first().click()
  await page.waitForTimeout(FLUSH)
  const p3 = find((await dbGet()).problems, 88)
  ok('B3 status=learned', p3.status === 'learned', `status=${p3.status}`)
  ok('B3 self=true 保持', p3.self === true, `self=${p3.self}`)
  ok('B3 lastFail=false', p3.lastFail === false, `lastFail=${p3.lastFail}`)
  ok('B3 srsLevel=2', p3.srsLevel === 2, `srsLevel=${p3.srsLevel}`)
  ok('B3 nextReviewAt=+14', p3.nextReviewAt === '2026-09-03', `nextReviewAt=${p3.nextReviewAt}`)
  ok('B3 history phase=review/pass', p3.history.at(-1)?.phase === 'review' && p3.history.at(-1)?.outcome === 'pass', `last=${JSON.stringify(p3.history.at(-1))}`)
  ok('B3 db 全程无 reviewing', noOld((await dbGet()).problems), '有 reviewing 残留')

  // ===== B7 复习达顶 mastered（自解 + 过关了）=====
  console.log('== B7 复习达顶 mastered（自解+过关了）==')
  await putState({ status: 'learned', self: true, lastFail: false, srsLevel: 2, nextReviewAt: TODAY, lastLang: 'javascript' })
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(600)
  await fillCode(page, CORRECT)
  await runAndWaitPass(page, '默写通过')
  await page.locator('button:has-text("默写通过")').first().click()
  await page.waitForTimeout(500)
  // 笔记弹窗（必经步）→ 先跳过 → done
  await page.locator('button:has-text("先跳过")').click()
  await page.waitForTimeout(FLUSH)
  const p7 = find((await dbGet()).problems, 88)
  ok('B7 status=mastered', p7.status === 'mastered', `status=${p7.status}`)
  ok('B7 self=true 保持', p7.self === true, `self=${p7.self}`)
  ok('B7 lastFail=false', p7.lastFail === false, `lastFail=${p7.lastFail}`)
  ok('B7 srsLevel=3', p7.srsLevel === 3, `srsLevel=${p7.srsLevel}`)
  ok('B7 nextReviewAt=undefined（清排期）', p7.nextReviewAt === undefined, `nextReviewAt=${p7.nextReviewAt}`)
  ok('B7 history phase=review/pass', p7.history.at(-1)?.phase === 'review' && p7.history.at(-1)?.outcome === 'pass', `last=${JSON.stringify(p7.history.at(-1))}`)
  const done7 = await page.textContent('body').catch(() => '')
  ok('B7 done 屏「过关了」（review 达顶走 reproduce 分支）', done7.includes('过关了'), 'miss')
  // ⭐ 在题头徽章（self 驱动），done 标题由 doneKind 驱动（review=默写通过，非我顺极了）——spec §6.5 解耦

  // ===== B7b 自解达顶 mastered（self-solve 路径 → doneKind=self-solved → 我顺极了+过关了）=====
  console.log('== B7b 自解达顶（self-solve 路径）==')
  await putState({ status: 'in-progress', srsLevel: 2 }) // attempt 态 + srsLevel=2 → selfSolved 达顶
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  await fillCode(page, CORRECT)
  await runAndWaitPass(page, '直接过了')
  await page.locator('button:has-text("直接过了")').click()
  await page.waitForTimeout(FLUSH)
  const p7b = find((await dbGet()).problems, 88)
  ok('B7b status=mastered', p7b.status === 'mastered', `status=${p7b.status}`)
  ok('B7b self=true', p7b.self === true, `self=${p7b.self}`)
  ok('B7b srsLevel=3', p7b.srsLevel === 3, `srsLevel=${p7b.srsLevel}`)
  ok('B7b nextReviewAt=undefined（selfSolved 达顶清排期）', p7b.nextReviewAt === undefined, `nextReviewAt=${p7b.nextReviewAt}`)
  ok('B7b history phase=attempt/pass', p7b.history.at(-1)?.phase === 'attempt' && p7b.history.at(-1)?.outcome === 'pass', `last=${JSON.stringify(p7b.history.at(-1))}`)
  const done7b = await page.textContent('body').catch(() => '')
  ok('B7b done 屏「我顺极了」', done7b.includes('我顺极了'), 'miss')
  ok('B7b done 屏「过关了」', done7b.includes('过关了'), 'miss')

  await browser.close()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exitCode = 1
}

main().catch((e) => { console.error('VALIDATE-B ERROR:', e); process.exitCode = 1 })
  .finally(() => { if (existsSync(BAK)) { copyFileSync(BAK, DB); try { unlinkSync(BAK) } catch {} } })