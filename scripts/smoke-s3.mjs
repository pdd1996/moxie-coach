// S3-F3 浏览器冒烟（playwright + 本地 chromium-1228）。非交互式验证：
//   A. id=169（有题面无题解，in-progress）：进 attempt → Timer 受控渲染 → 点「看题解」触发 V1.0 兜底 notice（不写库）
//   B. id=88（有题面有题解，pending-review）：进 attempt → 看题解进 solution →「只看题解不刷」→ done(skipped)
//      → 校验 status=skipped / lastLang 落库 / 不排期 / 离开 attempt 记 history(fail)
//   C. id=2（new 无题面）：贴题流程 → savePaste 进 attempt → 校验 new→in-progress 落库
// 运行：node scripts/smoke-s3.mjs  （需 dev server 在 localhost:5173）
import { chromium } from 'playwright'
import { readFileSync, copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CHROME = join(homedir(), 'AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe')
const BASE = 'http://localhost:5173'
const DB = 'data/db.json'
const BAK = 'data/db.json.bak-smoke'
const FLUSH = 1500 // store debounce 1s + 余量

let pass = 0, fail = 0
const ok = (n, c, x) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${x ? ' — ' + x : ''}`) }
const dbGet = async () => (await (await fetch(`${BASE}/api/db`)).json()).problems
const find = (ps, id) => ps.find(p => p.id === id)

async function main() {
  copyFileSync(DB, BAK)
  const browser = await chromium.launch({ executablePath: CHROME })
  const page = await browser.newPage()
  page.on('console', m => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 160)) })

  // ===== A. id=169 无题解兜底 =====
  console.log('== A: id=169 看题解兜底 ==')
  await page.goto(`${BASE}/problem/169`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(700)
  console.log('  [body]', (await page.textContent('body').catch(() => '')).slice(0, 200).replace(/\s+/g, ' '))
  const aTimer = await page.textContent('button:has-text("剩")').catch(() => null)
  ok('attempt Timer 受控渲染（剩 X 分）', /剩\s+\d+\s+分/.test(aTimer ?? ''), `got=${aTimer}`)
  const seeBtn = page.locator('button:has-text("想不出，看题解")')
  ok('看题解按钮存在', await seeBtn.count() === 1)
  await page.screenshot({ path: 'scripts/smoke-A.png' }).catch(() => {})
  if (await seeBtn.count()) await seeBtn.click()
  await page.waitForTimeout(300)
  const notice = await page.textContent('body').catch(() => '')
  ok('V1.0 兜底 notice 出现', notice.includes('暂无题解'), `notice=${notice.match(/暂无题解[^\n]*/)?.[0]}`)
  const p169 = find(await dbGet(), 169)
  ok('兜底不写 status（仍 in-progress）', p169.status === 'in-progress', `status=${p169.status}`)
  ok('兜底不写 history', (p169.history || []).length === 0, `len=${(p169.history||[]).length}`)

  // ===== B. id=88 跳过流程 =====
  console.log('== B: id=88 进 attempt → 看题解 → 跳过 ==')
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(700)
  const bTimer = await page.textContent('button:has-text("剩")').catch(() => null)
  ok('id=88 attempt Timer 渲染', /剩\s+\d+\s+分/.test(bTimer ?? ''), `got=${bTimer}`)
  await page.locator('button:has-text("想不出，看题解")').click()
  await page.waitForTimeout(400)
  const skipBtn = page.locator('button:has-text("只看题解不刷")')
  ok('进 solution 态、跳过按钮存在', await skipBtn.count() === 1)
  await page.waitForTimeout(FLUSH)
  const p88a = find(await dbGet(), 88)
  ok('离开 attempt 记 history(fail)', (p88a.history || []).some(h => h.phase === 'attempt' && h.outcome === 'fail'),
    `last=${JSON.stringify((p88a.history||[]).slice(-1)[0])}`)
  await skipBtn.click()
  await page.waitForTimeout(FLUSH)
  const doneText = await page.textContent('body').catch(() => '')
  ok('done(skipped) 文案', doneText.includes('已跳过'), 'miss')
  const p88b = find(await dbGet(), 88)
  ok('status=skipped 落库', p88b.status === 'skipped', `status=${p88b.status}`)
  ok('skipped 不排期（无 nextReviewAt）', p88b.nextReviewAt === undefined, `nextReviewAt=${p88b.nextReviewAt}`)
  ok('lastLang 落库', p88b.lastLang === 'javascript', `lastLang=${p88b.lastLang}`)

  // ===== C. id=2 贴题流程 → new→in-progress =====
  console.log('== C: id=2 贴题 → attempt → in-progress ==')
  await page.goto(`${BASE}/problem/2`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(500)
  ok('贴题面板出现', await page.locator('text=首次打开，先贴题').count() === 1)
  // ① 题面（含「输入：/输出：」示例，用例自动识别）
  const stmt = '合并两个有序数组。\n输入：nums1 = [1,2,3,0,0,0], m = 3, nums2 = [2,5,6], n = 3\n输出：[1,2,2,3,5,6]'
  await page.locator('textarea').nth(0).fill(stmt)
  // ② Python 模板
  await page.locator('textarea').nth(1).fill('class Solution:\n    def merge(self, nums1, m, nums2, n):\n        pass\n')
  // ③ 题解（先展开折叠区）
  await page.locator('button:has-text("③ 题解")').click()
  await page.waitForTimeout(200)
  await page.locator('textarea').nth(2).fill('从后往前双指针填充。')
  await page.locator('button:has-text("贴好了，开始刷题")').click()
  await page.waitForTimeout(FLUSH)
  const cTimer = await page.textContent('button:has-text("剩")').catch(() => null)
  ok('贴好后进 attempt、Timer 渲染', /剩\s+\d+\s+分/.test(cTimer ?? ''), `got=${cTimer}`)
  const p2 = find(await dbGet(), 2)
  ok('new→in-progress 落库', p2.status === 'in-progress', `status=${p2.status}`)
  ok('贴题落库 statement', !!p2.statement, `stmt=${!!p2.statement}`)
  ok('贴题落库 solution', !!p2.solution, `sol=${!!p2.solution}`)

  await browser.close()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exitCode = 1
}

main().catch((e) => { console.error('SMOKE ERROR:', e); process.exitCode = 1 })
  .finally(() => { if (existsSync(BAK)) { copyFileSync(BAK, DB); try { unlinkSync(BAK) } catch {} } })