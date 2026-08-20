import { useMemo } from 'react'
import { Flame, BookOpenCheck, PenLine, Lightbulb } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Heatmap } from '@/components/Heatmap'
import { useProblems } from '@/lib/store'
import { STAGE_INFO } from '@/lib/types'
import { stageProgress, patternStats, heatmapData, todayStr, streakDays, totalSolved, reproducePassRate, selfSolvedRate } from '@/lib/srs'

export default function ProgressPage() {
  const problems = useProblems()
  const today = todayStr()

  const { stages, patterns, heatmap, kpis } = useMemo(() => {
    return {
      stages: stageProgress(problems),
      patterns: patternStats(problems),
      heatmap: heatmapData(problems, today),
      kpis: {
        streak: streakDays(problems, today),
        solved: totalSolved(problems),
        reproduceRate: reproducePassRate(problems),
        selfRate: selfSolvedRate(problems),
      },
    }
  }, [problems, today])

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">进度回顾</h1>
        <p className="mt-1 text-sm text-muted-foreground">周月回顾用 · 平时把时间留给默写</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { icon: Flame, label: '连续打卡', value: `${kpis.streak} 天`, cls: 'text-orange-500' },
          { icon: BookOpenCheck, label: '累计完成', value: `${kpis.solved} 题`, cls: 'text-emerald-600' },
          { icon: PenLine, label: '默写通过率', value: `${Math.round(kpis.reproduceRate * 100)}%`, cls: 'text-blue-500' },
          { icon: Lightbulb, label: '独立解出率', value: `${Math.round(kpis.selfRate * 100)}%`, cls: 'text-amber-500' },
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

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
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

        <Card>
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
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">打卡热力图（近 17 周）</CardTitle>
        </CardHeader>
        <CardContent>
          <Heatmap data={heatmap} />
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
  )
}