import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, Flame, BookOpenCheck, PenLine, Lightbulb, StickyNote } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { Separator } from '@/components/ui/separator'
import { Heatmap } from '@/components/Heatmap'
import { useProblems } from '@/lib/store'
import { seedHeatmap, seedStats } from '@/data/seed'
import { STAGE_INFO } from '@/lib/types'
import { reviewQueue, suggestedNew, stageProgress, patternStats, overdueDays, todayStr } from '@/lib/srs'

export default function Dashboard() {
  const problems = useProblems()
  const today = todayStr()

  const { queue, suggested, stages, patterns } = useMemo(() => {
    return {
      queue: reviewQueue(problems, today),
      suggested: suggestedNew(problems),
      stages: stageProgress(problems),
      patterns: patternStats(problems),
    }
  }, [problems, today])

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      {/* 顶部统计 */}
      <div>
        <h1 className="text-2xl font-bold">下午好，今天也要默写 ✍️</h1>
        <p className="mt-1 text-sm text-muted-foreground">2026年8月18日 · 转行第 3 周 · 阶段一进行中</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { icon: Flame, label: '连续打卡', value: `${seedStats.streakDays} 天`, cls: 'text-orange-500' },
          { icon: BookOpenCheck, label: '累计完成', value: `${seedStats.totalSolved} 题`, cls: 'text-emerald-600' },
          { icon: PenLine, label: '默写通过率', value: `${Math.round(seedStats.reproducePassRate * 100)}%`, cls: 'text-blue-500' },
          { icon: Lightbulb, label: '自解比例', value: `${Math.round(seedStats.selfSolvedRate * 100)}%`, cls: 'text-amber-500' },
        ].map(({ icon: Icon, label, value, cls }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3">
              <Icon className={`size-8 ${cls}`} />
              <div>
                <div className="text-xl font-bold leading-tight">{value}</div>
                <div className="text-xs text-muted-foreground">{label}</div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* 今日复习 + 建议新题 */}
        <Card className="lg:col-span-3">
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
                    <Badge variant="outline" className="hidden shrink-0 sm:inline-flex">{p.pattern}</Badge>
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
                    <Badge variant="secondary">默写重做</Badge>
                    <ArrowRight className="size-4 text-muted-foreground" />
                  </div>
                </Link>
              )
            })}
            <Separator className="my-3" />
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

        {/* 阶段进度 */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">阶段进度</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {stages.map(({ stage, done, total }) => (
              <div key={stage}>
                <div className="mb-1 flex items-baseline justify-between">
                  <span className="text-sm font-medium">{STAGE_INFO[stage].title.split(' · ')[0]}</span>
                  <span className="text-xs text-muted-foreground">{done}/{total}</span>
                </div>
                <Progress value={(done / total) * 100} />
                <div className="mt-1 text-xs text-muted-foreground">{STAGE_INFO[stage].theme}</div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-5">
        {/* 套路掌握 */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">套路掌握</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {patterns.slice(0, 6).map(({ name, done, total }) => (
              <div key={name} className="flex items-center gap-3">
                <span className="w-20 shrink-0 text-sm">{name}</span>
                <Progress value={(done / total) * 100} className="h-2" />
                <span className="w-10 shrink-0 text-right text-xs text-muted-foreground">{done}/{total}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        {/* 热力图 */}
        <Card className="lg:col-span-3">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">打卡热力图（近 17 周）</CardTitle>
          </CardHeader>
          <CardContent>
            <Heatmap data={seedHeatmap} />
            <div className="mt-2 flex items-center justify-end gap-1 text-xs text-muted-foreground">
              少
              {['bg-muted', 'bg-emerald-200 dark:bg-emerald-900', 'bg-emerald-400 dark:bg-emerald-700', 'bg-emerald-500 dark:bg-emerald-600', 'bg-emerald-600 dark:bg-emerald-400'].map((c) => (
                <span key={c} className={`size-3 rounded-[3px] ${c}`} />
              ))}
              多
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
