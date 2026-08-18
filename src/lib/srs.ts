// S1-F1 仪表盘聚合纯函数（复习队列 / 建议新题 / 进度）。
// 口径来自 PRD F1 + spec S1-F1 实现要点；S6-F6 会定 SRS 排期规则，
// 但「nextReviewAt <= today 即待复习」这一条在本 spec 先用，S6 落地时再校准。

import type { Problem, Stage } from '@/lib/types'

/** 本地日期 YYYY-MM-DD（非 UTC，避免把今晚 23:00 的题算到明天） */
export function todayStr(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** 两个 YYYY-MM-DD 之间的天数差（a - b，可为负） */
function diffDays(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00')
  const db = new Date(b + 'T00:00:00')
  return Math.round((da.getTime() - db.getTime()) / 86_400_000)
}

/** 已「掌握/通过」的状态——阶段进度、套路进度里算 done */
const DONE_STATUSES = new Set(['self-solved', 'learned', 'reviewing', 'mastered'])
const isDone = (p: Problem) => DONE_STATUSES.has(p.status)

/** 待复习的状态（spec：learned / pending-review / self-solved / reviewing） */
const REVIEWABLE_STATUSES = new Set(['learned', 'pending-review', 'self-solved', 'reviewing'])

/**
 * 今日复习队列：nextReviewAt <= today 且状态可复习；按逾期天数降序
 * （逾期不惩罚 = 仅排序，不额外加权）。未排期的（nextReviewAt 缺失）不入队。
 */
export function reviewQueue(problems: Problem[], today = todayStr()): Problem[] {
  return problems
    .filter((p) => p.nextReviewAt != null && p.nextReviewAt <= today && REVIEWABLE_STATUSES.has(p.status))
    .sort((a, b) => diffDays(today, b.nextReviewAt!) - diffDays(today, a.nextReviewAt!))
}

/** 一道题的逾期天数（>0 逾期、0 今日到期、<0 未到期）；无 nextReviewAt 返回 0 */
export function overdueDays(p: Problem, today = todayStr()): number {
  if (!p.nextReviewAt) return 0
  return Math.max(0, diffDays(today, p.nextReviewAt))
}

/**
 * 建议新题：阶段 1→4 扫，第一个仍含 `new && !optional` 的阶段 → 取该阶段第一道 new。
 * 「阶段一未做完前不跨阶段」= 不跳到下一阶段去建议，直到本阶段没有 new。
 */
export function suggestedNew(problems: Problem[]): Problem | undefined {
  for (const s of [1, 2, 3, 4] as Stage[]) {
    const first = problems.find((p) => p.stage === s && !p.optional && p.status === 'new')
    if (first) return first
  }
  return undefined
}

/** 各阶段进度（done / total，不含 optional） */
export function stageProgress(problems: Problem[]): { stage: Stage; done: number; total: number }[] {
  return ([1, 2, 3, 4] as Stage[]).map((s) => {
    const all = problems.filter((p) => p.stage === s && !p.optional)
    return { stage: s, done: all.filter(isDone).length, total: all.length }
  })
}

/** 各套路进度：按 pattern 主名（去掉括号注释）聚合，仅保留 >=2 题的，按 done 降序 */
export function patternStats(problems: Problem[]): { name: string; done: number; total: number }[] {
  return Object.entries(
    problems
      .filter((p) => !p.optional)
      .reduce<Record<string, { done: number; total: number }>>((acc, p) => {
        const key = p.pattern.split('（')[0]!
        acc[key] ??= { done: 0, total: 0 }
        acc[key].total++
        if (isDone(p)) acc[key].done++
        return acc
      }, {}),
  )
    .filter(([, v]) => v.total >= 2)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.done - a.done)
}