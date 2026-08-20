import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Flame, Lightbulb, Star, StickyNote } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { useProblems } from '@/lib/store'
import { reviewQueue, suggestedNew, overdueDays, todayStr, streakDays } from '@/lib/srs'
import { greeting, dateLabel, careerWeek, stageLabel } from '@/lib/greeting'

export default function Dashboard() {
  const problems = useProblems()
  const today = todayStr()

  const { queue, suggested, streak } = useMemo(() => {
    return {
      queue: reviewQueue(problems, today),
      suggested: suggestedNew(problems),
      streak: streakDays(problems, today),
    }
  }, [problems, today])

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      {/* 问候 + 单一焦点数 */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">{greeting()}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {dateLabel()} · 转行第 {careerWeek(today)} 周 · {stageLabel(problems)}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 rounded-lg border px-3 py-2">
          <Flame className="size-5 text-orange-500" />
          <div className="leading-tight">
            <div className="text-lg font-bold">{streak}</div>
            <div className="text-[10px] text-muted-foreground">连续打卡</div>
          </div>
        </div>
      </div>

      {/* 今日任务:唯一焦点 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            今日任务
            <Badge variant="secondary">{queue.length} 道复习</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {queue.map((p) => {
            const days = overdueDays(p, today)
            return (
              <Link
                key={p.id}
                to={`/problem/${p.id}`}
                className="flex items-center justify-between rounded-lg border px-3 py-2.5 transition-colors hover:bg-accent"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="font-mono text-sm text-muted-foreground">#{p.id}</span>
                  <span className="truncate text-sm font-medium">{p.title}</span>
                  <Badge variant="outline" className="shrink-0">{p.pattern}</Badge>
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
                <div className="flex shrink-0 items-center gap-2">
                  {days > 0 && <Badge variant="destructive">逾期 {days} 天</Badge>}
                  {p.lastFail && (
                    <Badge variant="outline" className="shrink-0 text-amber-600 dark:text-amber-400" title="上次没默过">
                      易错
                    </Badge>
                  )}
                  <ArrowRight className="size-4 text-muted-foreground" />
                </div>
              </Link>
            )
          })}
          {queue.length === 0 && (
            <div className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
              今天没有到期的复习 🎉 去做一道新题保持手感吧
            </div>
          )}
          {suggested && <Separator className="my-3" />}
          {suggested && (
            <div className="flex items-center justify-between rounded-lg border border-dashed border-emerald-400 bg-emerald-500/5 px-3 py-2.5">
              <div className="flex min-w-0 items-center gap-3">
                <Lightbulb className="size-4 shrink-0 text-emerald-600" />
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    建议新题：#{suggested.id} {suggested.title}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    信号：{suggested.signal} · {suggested.pattern}
                  </div>
                </div>
              </div>
              <Button asChild size="sm" variant="outline" className="shrink-0">
                <Link to={`/problem/${suggested.id}`}>开始</Link>
              </Button>
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