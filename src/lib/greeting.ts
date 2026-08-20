// 首页问候 + 转行周数 + 当前阶段：纯展示辅助，无副作用。
import type { Problem, Stage } from '@/lib/types'
import { STAGE_INFO } from '@/lib/types'
import { stageProgress } from '@/lib/srs'

/** 转行起点（绝对日期）。改这一处即可整体偏移「第 N 周」口径。 */
export const CAREER_START = '2026-08-04'

/** 按当前小时出问候语 */
export function greeting(d = new Date()): string {
  const h = d.getHours()
  if (h < 6) return '夜深了，还在练 ✍️'
  if (h < 11) return '早上好，今天也要默写 ✍️'
  if (h < 14) return '中午好，抽空默一道 ✍️'
  if (h < 18) return '下午好，今天也要默写 ✍️'
  return '晚上好，再默一道 ✍️'
}

/** 本地日期中文串：2026年8月18日 · 周二 */
const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
export function dateLabel(d = new Date()): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日 · 周${WEEKDAYS[d.getDay()]}`
}

/** 转行第 N 周（从 CAREER_START 起算，向上取整到完整周） */
export function careerWeek(today: string, start = CAREER_START): number {
  const da = new Date(today + 'T00:00:00')
  const db = new Date(start + 'T00:00:00')
  const days = Math.max(0, Math.round((da.getTime() - db.getTime()) / 86_400_000))
  return Math.floor(days / 7) + 1
}

/** 当前进行中的阶段：第一个未完成的阶段；全完成则取最后一阶段 */
export function currentStage(problems: Problem[]): Stage {
  const stages = stageProgress(problems)
  const ongoing = stages.find((s) => s.done < s.total)
  return ongoing?.stage ?? 4
}

/** 「阶段一进行中」这类文案 */
export function stageLabel(problems: Problem[]): string {
  const s = currentStage(problems)
  return `${STAGE_INFO[s].title.split(' · ')[0]}进行中`
}