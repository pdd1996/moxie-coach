import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, Flame, Lightbulb, Star, StickyNote } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useProblems, useSettings } from '@/lib/store'
import { reviewQueue, suggestedNewList, overdueDays, todayStr, streakDays } from '@/lib/srs'
import { greeting, dateLabel, careerWeek, stageLabel } from '@/lib/greeting'
import { cn } from '@/lib/utils'

export default function Dashboard() {
  const problems = useProblems()
  const settings = useSettings()
  const today = todayStr()

  const { queue, suggested, streak, overdueCount } = useMemo(() => {
    const queue = reviewQueue(problems, today)
    return {
      queue,
      suggested: suggestedNewList(problems, settings.newPerDay),
      streak: streakDays(problems, today),
      overdueCount: queue.filter((p) => overdueDays(p, today) > 0).length,
    }
  }, [problems, today, settings.newPerDay])

  // 复习软上限：队列按逾期最久优先（reviewQueue 已排好），只显示前 N 道；
  // 超出的今天先不练，但仍在 SRS 排期里，明天自然还在（不动 nextReviewAt）。
  const visibleQueue = queue.slice(0, settings.reviewPerDay)
  const hiddenCount = queue.length - visibleQueue.length

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      {/* 问候 + 单一焦点数 */}
      <div className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold">{greeting()}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dateLabel()} · 转行第 {careerWeek(today)} 周 · {stageLabel(problems)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-lg border bg-card px-3 py-2">
          <Flame className="size-5 text-orange-500" />
          <div className="leading-tight">
            <div className="text-lg font-bold tabular-nums">{streak}</div>
            <div className="text-[10px] text-muted-foreground">连续打卡</div>
          </div>
        </div>
      </div>

      {/* 今日任务:唯一焦点 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            今日任务
            <Badge variant="secondary" className="tabular-nums">
              {hiddenCount > 0 ? `${visibleQueue.length} / ${queue.length}` : queue.length} 道复习
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* 逾期总览：一句话说清今天为什么要做这几道 */}
          {queue.length > 0 && (
            <div
              className={cn(
                'flex items-center gap-2 rounded-lg px-3 py-2 text-xs',
                overdueCount > 0
                  ? 'bg-red-500/10 text-red-600 dark:text-red-400'
                  : 'bg-muted text-muted-foreground',
              )}
            >
              <Clock className={cn('size-3.5 shrink-0', overdueCount > 0 && 'text-red-500')} />
              {overdueCount > 0
                ? `${overdueCount} 道已逾期 —— 先把逾期最久的捞回来`
                : `都在排期里，${queue.length} 道按序复习`}
            </div>
          )}

          {visibleQueue.map((p) => {
            const days = overdueDays(p, today)
            return (
              <Link
                key={p.id}
                to={`/problem/${p.id}`}
                className="group flex items-center gap-3 rounded-lg border px-3 py-2.5 transition-colors hover:bg-accent"
              >
                <span className="w-11 shrink-0 font-mono text-sm text-muted-foreground">#{p.id}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-base font-semibold">{p.title}</span>
                    {p.self && (
                      <Star
                        className="size-3.5 shrink-0 text-amber-500"
                        fill="currentColor"
                        aria-label="自解"
                      >
                        <title>我顺极了 —— 没看题解自己解出来的</title>
                      </Star>
                    )}
                    {p.note && (
                      <StickyNote
                        className="size-3.5 shrink-0 text-amber-500"
                        aria-label="有笔记"
                      >
                        <title>{p.note}</title>
                      </StickyNote>
                    )}
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                    <span>{p.pattern}</span>
                    {days > 0 && (
                      <span className="inline-flex items-center rounded-full bg-red-500/10 px-1.5 py-0.5 font-medium text-red-600 dark:text-red-400">
                        逾期 {days} 天
                      </span>
                    )}
                    {p.lastFail && (
                      <span
                        className="inline-flex items-center rounded-full bg-amber-500/15 px-1.5 py-0.5 font-medium text-amber-600 dark:text-amber-400"
                        title="上次没默过"
                      >
                        易错
                      </span>
                    )}
                  </div>
                </div>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
              </Link>
            )
          })}
          {hiddenCount > 0 && (
            <div className="rounded-lg border border-dashed px-3 py-2.5 text-center text-xs text-muted-foreground">
              还有 {hiddenCount} 道到期，今天先放一放 —— 明天还在，逾期最久的已排在上面
            </div>
          )}
          {queue.length === 0 && (
            <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              今天没有到期的复习 🎉 去做一道新题保持手感吧
            </div>
          )}
          {suggested.length > 0 && <Separator className="my-3" />}
          {suggested.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                <Lightbulb className="size-3.5 text-emerald-600" />
                建议新题 · 今天开 {suggested.length} 道
              </div>
              {suggested.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-emerald-400 bg-emerald-500/5 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-11 shrink-0 font-mono text-sm text-muted-foreground">#{p.id}</span>
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold">{p.title}</div>
                      <div className="mt-1 truncate text-xs text-muted-foreground">
                        {p.signal ? `信号：${p.signal} · ${p.pattern}` : p.pattern}
                      </div>
                    </div>
                  </div>
                  <Button asChild size="sm" variant="outline" className="shrink-0">
                    <Link to={`/problem/${p.id}`}>开始</Link>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <p className="text-center text-xs text-muted-foreground">
        想看整体进度?{' '}
        <Link to="/progress" className="underline underline-offset-2 hover:text-foreground">
          打开进度回顾
        </Link>
      </p>
    </div>
  )
}
