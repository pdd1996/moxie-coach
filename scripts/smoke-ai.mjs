// S7-F7 AI 教练四件套浏览器冒烟（playwright + 本地 chromium-1228，真实 API）。
// 每节 try/catch 互不影响；保存类断言以 db.json 落库为真值（不依赖 UI 文案时序）。
// 运行：node scripts/smoke-ai.mjs  （需 dev server 在 localhost:5173；db.json 测后自动还原）
import { chromium } from 'playwright'
import { copyFileSync, existsSync, unlinkSync, appendFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const CHROME = join(homedir(), 'AppData/Local/ms-playwright/chromium-1228/chrome-win64/chrome.exe')
const BASE = 'http://localhost:5173'
const DB = 'data/db.json'
const BAK = 'data/db.json.bak-smoke-ai'
const FLUSH = 1500
const AI_WAIT = 150_000 // reasoning 模型单次生成放宽到 2.5 分钟

// 非交互捕获时 node stdout 块缓冲，强制逐行落盘 + stderr 双写，进度才看得见
const OUT = 'scripts/smoke-ai.out'
writeFileSync(OUT, '')
const _log = (...a) => { const s = a.join(' '); appendFileSync(OUT, s + '\n'); process.stderr.write(s + '\n') }
console.log = _log; console.error = _log
const t0 = Date.now()
const tick = () => `${Math.round((Date.now() - t0) / 1000)}s`

let pass = 0, fail = 0
const ok = (n, c, x) => { c ? pass++ : fail++; _log(`  ${c ? '✓' : '✗'} ${n}${x ? ' - ' + x : ''}`) }
const dbGet = async () => (await (await fetch(`${BASE}/api/db`)).json()).problems
const find = (ps, id) => ps.find(p => p.id === id)
const body = async (page) => ((await page.textContent('body').catch(() => '')) || '').replace(/\s+/g, ' ')
async function fillEditor(page, code) {
  await page.locator('.cm-editor').click()
  await page.keyboard.press('Control+A')
  await page.keyboard.insertText(code)
}
async function section(name, fn) {
  _log(`== ${name} (${tick()}) ==`)
  try { await fn() }
  catch (e) { fail++; _log(`  ✗ [section error] ${e.message?.slice(0, 200)}`) }
}

let page
async function main() {
  copyFileSync(DB, BAK)
  const browser = await chromium.launch(existsSync(CHROME) ? { executablePath: CHROME } : {})
  page = await browser.newPage()
  page.setDefaultTimeout(AI_WAIT)
  page.on('console', m => { if (m.type() === 'error') _log('  [console.error]', m.text().slice(0, 160)) })

  await page.goto(`${BASE}/problem/1`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(700)

  // ===== F7.1 分层提示 =====
  await section('F7.1 id=1 分层提示', async () => {
    ok('attempt 态渲染（给个提示按钮）', await page.locator('button:has-text("给个提示")').count() === 1)
    await page.locator('button:has-text("给个提示")').click()
    await page.waitForSelector('text=第 1 层', { timeout: 10_000 })
    await page.waitForSelector('button:has-text("还是卡着，再要一层"):enabled', { timeout: AI_WAIT })
    const box = page.locator('text=AI 教练 · 分层提示').locator('xpath=..')
    const l1 = (await box.textContent()).replace(/\s+/g, ' ')
    ok('第 1 层内容非空', l1.length > 30, `len=${l1.length}`)
    ok('第 1 层不出现代码围栏（不给答案）', !l1.includes('```'), l1.slice(0, 120))
    for (let lv = 2; lv <= 3; lv++) {
      await page.locator('button:has-text("还是卡着，再要一层")').click()
      await page.waitForSelector(`text=第 ${lv} 层`, { timeout: 5_000 })
      if (lv < 3) await page.waitForSelector('button:has-text("还是卡着，再要一层"):enabled', { timeout: AI_WAIT })
    }
    await page.waitForSelector('text=三层用完了', { timeout: AI_WAIT })
    const all = (await box.textContent()).replace(/\s+/g, ' ')
    ok('三层用完提示转看题解', all.includes('三层用完了'))
    ok('三层均无代码围栏', !all.includes('```'))
  })

  // ===== F7.3 题解生成 + 保存落库 =====
  await section('F7.3 id=1 看题解 -> AI 生成 -> 保存', async () => {
    await page.locator('button:has-text("想不出，看题解")').click()
    await page.waitForSelector('button:has-text("保存为本地题解")', { timeout: AI_WAIT })
    const solText = await body(page)
    ok('生成内容为模板结构', ['判断信号', '找入口三步法', '模板代码', '边界三问'].every(k => solText.includes(k)))
    ok('题解含完整代码（此时允许）', solText.includes('```') || /def |var |function /.test(solText))
    await page.locator('button:has-text("保存为本地题解")').click()
    await page.waitForTimeout(FLUSH)
    const p1 = find(await dbGet(), 1)
    ok('solution 落库', !!p1.solution, `len=${p1.solution?.length ?? 0}`)
    ok('AI 生成徽章出现', solText.includes('AI 生成'))
  })

  // ===== F7.2 边界审查（默写通过后）=====
  await section('F7.2 id=1 默写通过 -> 边界审查 -> 导入用例', async () => {
    await page.locator('button:has-text("关掉题解，进入默写")').click()
    await page.waitForSelector('text=默写模式 · 题解已收起', { timeout: 5_000 })
    await fillEditor(page, [
      'class Solution(object):',
      '    def twoSum(self, nums, target):',
      '        seen = {}',
      '        for i, x in enumerate(nums):',
      '            if target - x in seen:',
      '                return [seen[target - x], i]',
      '            seen[x] = i',
      '        return []',
      '',
    ].join('\n'))
    await page.locator('button:has-text("运行用例")').click()
    await page.waitForSelector('button:has-text("默写通过"):enabled', { timeout: 60_000 })
    ok('用例全部通过', true)
    await page.locator('button:has-text("默写通过")').click()
    await page.waitForSelector('text=什么时候用这个套路', { timeout: 5_000 })
    await page.locator('div[role="dialog"] textarea').fill('要配对找数就想起哈希表')
    await page.locator('button:has-text("保存笔记")').click()
    await page.waitForSelector('text=AI 边界审查', { timeout: 5_000 })
    await page.locator('button:has-text("审查我刚才的代码")').click()
    // 「再审一次」按钮只在 review 完成（setReview）后渲染；静态描述里也有"攻击用例"字样，不能拿来判定完成
    await page.waitForSelector('button:has-text("再审一次")', { timeout: AI_WAIT })
    await page.waitForTimeout(500)
    const before = find(await dbGet(), 1).testCases.length
    const importBtn = page.locator('button:has-text("条攻击用例")')
    const failText = await page.locator('text=未能解析出攻击用例').count()
    ok('审查完成', true)
    if (failText > 0) {
      const rt = await body(page)
      _log('  [diag] 模型未给出可解析用例，review 全文末尾:', rt.slice(-600))
    }
    ok('攻击用例可导入', await importBtn.count() === 1)
    if (await importBtn.count() === 1) await importBtn.click()
    await page.waitForTimeout(FLUSH)
    const p1 = find(await dbGet(), 1)
    ok('攻击用例落库（用例表增长）', p1.testCases.length > before, `${before} -> ${p1.testCases.length}`)
    const labels = new Set(p1.testCases.map(t => t.label))
    ok('label 无重复', labels.size === p1.testCases.length)
    ok('导入用例参数个数与入口一致（two-sum=2）', p1.testCases.every(t => t.args.length === 2),
      `arities=${[...new Set(p1.testCases.map(t => t.args.length))].join(',')}`)
  })

  // ===== F7.4 错题提示卡（id=88 到期复习直进默写）=====
  await page.goto(`${BASE}/problem/88`, { waitUntil: 'domcontentloaded' })
  await page.waitForTimeout(700)
  await section('F7.4 id=88 默写失败 -> 下次提示卡', async () => {
    ok('复习入口直进默写', await page.locator('text=默写模式 · 题解已收起').count() === 1)
    await fillEditor(page, [
      'var merge = function(nums1, m, nums2, n) {',
      '  nums1.push(...nums2);',
      '  nums1.sort((a, b) => a - b);',
      '};',
      '',
    ].join('\n'))
    await page.locator('button:has-text("反复写不出，默写失败")').click()
    await page.waitForSelector('text=什么时候用这个套路', { timeout: 5_000 })
    await page.locator('button:has-text("先跳过")').click()
    await page.waitForSelector('text=天后再战', { timeout: 5_000 })
    // pending 文案「正在写『下次提示卡』」不含冒号；卡片本体是「下次提示卡：」
    await page.waitForSelector('text=下次提示卡：', { timeout: AI_WAIT })
    const cardText = await body(page)
    ok('done 失败屏展示提示卡', cardText.includes('下次提示卡：'), cardText.match(/下次提示卡：[^ ]{0,50}/)?.[0])
    await page.waitForTimeout(FLUSH)
    const p88 = find(await dbGet(), 88)
    ok('hintCard 落库（一句话）', !!p88.hintCard && p88.hintCard.length <= 80, `card=${JSON.stringify(p88.hintCard)}`)
  })

  await browser.close()
  await new Promise((r) => setTimeout(r, 2000))
  _log(`\n${pass} passed, ${fail} failed (${tick()})`)
  if (fail) process.exitCode = 1
}

main().catch((e) => { _log('SMOKE ERROR:', e.message); process.exitCode = 1 })
  .finally(async () => {
    if (page) page.context().browser()?.close().catch(() => {})
    const restore = () => { if (existsSync(BAK)) copyFileSync(BAK, DB) }
    restore()
    // 关页触发的 keepalive flush PUT 可能迟到、覆盖还原（实测发生过）；等 3 秒再还原一次兜底
    await new Promise((r) => setTimeout(r, 3000))
    restore()
    try { unlinkSync(BAK) } catch {}
  })
