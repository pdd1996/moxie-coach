// 切语言草稿回归：按语言分存草稿（codeByLang）+ key={lang} 重建编辑器。
//   场景1：Python 输入草稿 -> 切 JS（空+提示）-> 切回（草稿保留）-> 编辑题目往返（草稿保留）
//   场景2：双语言各留草稿 -> 看题解 -> 进入默写 -> 两语言草稿均重置为骨架（不泄露）
// 前置：#1 已贴题；场景2 需 #1 有题解（无则跳过）。脚本自动备份/恢复 db.json。
// 运行：node scripts/smoke-langdraft.mjs  （需 dev server 在 localhost:5173）
import { chromium } from 'playwright'
import { readFileSync, copyFileSync, existsSync, unlinkSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CHROME = join(homedir(), 'AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe')
const BASE = 'http://localhost:5173'
const DB = 'data/db.json'
const BAK = 'data/db.json.bak-langdraft'

let pass = 0, fail = 0
const ok = (n, c, x) => { c ? pass++ : fail++; console.log(`  ${c ? '✓' : '✗'} ${n}${x ? ' - ' + x : ''}`) }

async function main() {
  copyFileSync(DB, BAK)
  const browser = await chromium.launch({ executablePath: CHROME })
  const page = await browser.newPage()
  page.on('console', m => { if (m.type() === 'error') console.log('  [console.error]', m.text().slice(0, 160)) })

  // ===== 场景1：切语言草稿保留 + 编辑题目往返 =====
  console.log('== 场景1：#1 切语言草稿保留 + 编辑题目往返 ==')
  await page.goto(`${BASE}/problem/1`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(800)
  // 挂载语言取决于 db 的 lastLang（跨轮漂移），先锁定 Python 起点
  await page.locator('button:has-text("Python")').click()
  await page.waitForTimeout(300)

  const editor = page.locator('.cm-content')
  await editor.click()
  await editor.press('Control+End')
  await editor.press('Enter')
  await editor.type('# draftKeep')
  await page.waitForTimeout(400)
  ok('草稿已输入', (await editor.textContent()).includes('# draftKeep'))

  await page.locator('button:has-text("JavaScript")').click()
  await page.waitForTimeout(1200)
  const jsText = await editor.textContent()
  ok('切 JS 后无 Python 残留', !jsText.includes('class Solution'), `js=${JSON.stringify(jsText.slice(0, 40))}`)
  ok('JS 空模板提示出现', (await page.textContent('body')).includes('未粘贴JavaScript模板'))

  await page.locator('button:has-text("Python")').click()
  await page.waitForTimeout(500)
  ok('切回 Python 草稿保留', (await editor.textContent()).includes('# draftKeep'))

  await page.locator('button:has-text("编辑题目")').click()
  await page.waitForTimeout(500)
  await page.locator('button:has-text("贴好了，开始刷题")').click()
  await page.waitForTimeout(800)
  ok('编辑题目往返后草稿保留', (await editor.textContent()).includes('# draftKeep'))
  ok('往返后仍在 attempt（Timer 可见）', !!(await page.locator('button:has-text("剩")').count()))

  // ===== 场景2：进入默写时双语言草稿重置 =====
  console.log('== 场景2：进入默写双语言草稿重置 ==')
  // 双语言各留一份草稿
  await editor.click()
  await editor.press('Control+End')
  await editor.press('Enter')
  await editor.type('# pyLeak')
  await page.waitForTimeout(400)
  await page.locator('button:has-text("JavaScript")').click()
  await page.waitForTimeout(600)
  await editor.click()
  await editor.type('// jsLeak')
  await page.waitForTimeout(400)
  // 回 Python 再进默写（断言以 Python 编辑器为基准）
  await page.locator('button:has-text("Python")').click()
  await page.waitForTimeout(500)

  // 看题解 -> 进入默写
  await page.locator('button:has-text("想不出，看题解")').click()
  await page.waitForTimeout(800)
  const reproBtn = page.locator('button:has-text("关掉题解，进入默写")')
  if (!(await reproBtn.count())) {
    console.log('  （跳过：#1 无题解，进不了默写。前置缺失不影响场景1 结论）')
  } else {
    await reproBtn.click()
    await page.waitForTimeout(800)
    const pyAfterRepro = await editor.textContent()
    ok('默写中 Python 编辑器=骨架（无 attempt 草稿）',
      pyAfterRepro.includes('class Solution') && !pyAfterRepro.includes('# pyLeak'),
      `editor=${JSON.stringify(pyAfterRepro.slice(0, 60))}`)
    ok('默写模式标识出现', (await page.textContent('body')).includes('默写中'))

    await page.locator('button:has-text("JavaScript")').click()
    await page.waitForTimeout(600)
    const jsAfterRepro = await editor.textContent()
    ok('默写中切 JS 无另一语言草稿泄露', !jsAfterRepro.includes('// jsLeak') && !jsAfterRepro.includes('class Solution'),
      `js=${JSON.stringify(jsAfterRepro.slice(0, 40))}`)

    await page.locator('button:has-text("Python")').click()
    await page.waitForTimeout(500)
    ok('切回 Python 仍是骨架', (await editor.textContent()).includes('class Solution'))
  }

  await browser.close()
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exitCode = 1
}

main().catch(e => { console.error('SMOKE ERROR:', e); process.exitCode = 1 })
  .finally(() => { if (existsSync(BAK)) { copyFileSync(BAK, DB); try { unlinkSync(BAK) } catch {} } })
