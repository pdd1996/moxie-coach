// SRS 排期纯函数自测（S6 规则，S3/S4 调用前先验证）。
// 运行：npx tsx scripts/selftest-srs.mts
import { addDays, passSchedule, failSchedule, todayStr } from '../src/lib/srs.ts'

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`) }
  else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`) }
}
function eq<T>(name: string, got: T, want: T) {
  const c = JSON.stringify(got) === JSON.stringify(want)
  ok(name, c, `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
}

const T = '2026-08-18'
const IV = [3, 7, 14]

console.log('== addDays ==')
eq('addDays +3', addDays(T, 3), '2026-08-21')
eq('addDays +7', addDays(T, 7), '2026-08-25')
eq('addDays +14', addDays(T, 14), '2026-09-01')
eq('addDays 跨月', addDays('2026-01-30', 3), '2026-02-02')
eq('addDays +0', addDays(T, 0), T)

console.log('== passSchedule（intervals [3,7,14]） ==')
// 首通过（自解/默写通过，new）：srsLevel 0，排 +3
eq('首通过', passSchedule(undefined, IV, T), { srsLevel: 0, nextReviewAt: '2026-08-21', mastered: false })
// 复习通过 1：level 0→1，排 +7
eq('复习通过1', passSchedule(0, IV, T), { srsLevel: 1, nextReviewAt: '2026-08-25', mastered: false })
// 复习通过 2：level 1→2，排 +14
eq('复习通过2', passSchedule(1, IV, T), { srsLevel: 2, nextReviewAt: '2026-09-01', mastered: false })
// 复习通过 3：level 2→3 = N → mastered，不再排期
eq('复习通过3→mastered', passSchedule(2, IV, T), { srsLevel: 3, mastered: true })
ok('mastered 无 nextReviewAt', passSchedule(2, IV, T).nextReviewAt === undefined)

console.log('== passSchedule 序列对齐 PRD「3→7→14→掌握」 ==')
let level: number | undefined
const seq: string[] = []
for (let i = 0; i < 4; i++) {
  const r = passSchedule(level, IV, T)
  level = r.srsLevel
  seq.push(r.mastered ? '掌握' : r.nextReviewAt!.slice(5))
}
eq('序列', seq.join('→'), '08-21→08-25→09-01→掌握')

console.log('== passSchedule 已 mastered 再通过仍 mastered ==')
eq('mastered 再通过', passSchedule(3, IV, T), { srsLevel: 4, mastered: true })

console.log('== passSchedule 不同 intervals ==')
eq('单间隔 [3] 首通过', passSchedule(undefined, [3], T), { srsLevel: 0, nextReviewAt: '2026-08-21', mastered: false })
eq('单间隔 [3] 复习→mastered', passSchedule(0, [3], T), { srsLevel: 1, mastered: true })

console.log('== failSchedule ==')
eq('失败重置 +3', failSchedule(IV, T), { srsLevel: 0, nextReviewAt: '2026-08-21' })
eq('失败从高等级重置', failSchedule(IV, T), { srsLevel: 0, nextReviewAt: '2026-08-21' })

console.log('== todayStr 本地日 ==')
const tn = todayStr(new Date('2026-08-18T23:30:00'))
ok('今晚 23:30 仍算今天', tn === '2026-08-18', `got=${tn}`)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)