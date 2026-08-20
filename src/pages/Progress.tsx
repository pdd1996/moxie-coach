import { useMemo, useState } from 'react'
import { Flame, BookOpenCheck, PenLine, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { Heatmap } from '@/components/Heatmap'
import { useProblems } from '@/lib/store'
import { STAGE_INFO } from '@/lib/types'
import { stageProgress, patternStats, heatmapData, todayStr, streakDays, totalSolved, reproducePassRate, selfSolvedRate } from '@/lib/srs'
import { cn } from '@/lib/utils'

type Tone = 'orange' | 'emerald' | 'blue' | 'amber'

const TONE_CLS: Record<Tone, { icon: string; chip: string; bar: string }> = {
  orange:  { icon: 'text-orange-500',  chip: 'bg-orange-500/10',  bar: '[&>div]:bg-orange-500'  },
  emerald: { icon: 'text-emerald-600', chip: 'bg-emerald-500/10', bar: '[&>div]:bg-emerald-500' },
  blue:    { icon: 'text-blue-500',    chip: 'bg-blue-500/10',    bar: '[&>div]:bg-blue-500'    },
  amber:   { icon: 'text-amber-500',   chip: 'bg-amber-500/10',   bar: '[&>div]:bg-amber-500'   },
}

const HEATMAP_RANGES = [
  { key: '1m', label: '近 1 月', days: 30 },
  { key: '3m', label: '近 3 月', days: 90 },
] as const
type HeatmapRange = (typeof HEATMAP_RANGES)[number]['key']

export default function ProgressPage() {
  const problems = useProblems()
  const today = todayStr()
  const [range, setRange] = useState<HeatmapRange>('3m')
  const rangeDays = HEATMAP_RANGES.find((r) => r.key === range)!.days
  const rangeLabel = HEATMAP_RANGES.find((r) => r.key === range)!.label

  const { stages, patterns, heatmap, kpis, heatmapTotal } = useMemo(() => {
    const stages = stageProgress(problems)
    const patterns = patternStats(problems)
    const heatmap = heatmapData(problems, today, rangeDays)
    return {
      stages,
      patterns,
      heatmap,
      heatmapTotal: heatmap.reduce((a, b) => a + b, 0),
      kpis: {
        streak: streakDays(problems, today),
        solved: totalSolved(problems),
        reproduceRate: reproducePassRate(problems),
        selfRate: selfSolvedRate(problems),
      },
    }
  }, [problems, today, rangeDays])

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">进度回顾</h1>
        <p className="mt-1 text-sm text-muted-foreground">周月回顾用 · 平时把时间留给默写</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {([
          { icon: Flame,         label: '连续打卡',   value: `${kpis.streak}`,                          unit: '天', tone: 'orange'  as Tone },
          { icon: BookOpenCheck, label: '累计完成',   value: `${kpis.solved}`,                          unit: '题', tone: 'emerald' as Tone },
          { icon: PenLine,       label: '默写通过率', value: `${Math.round(kpis.reproduceRate * 100)}`, unit: '%',  tone: 'blue'    as Tone },
          { icon: Lightbulb,     label: '独立解出率', value: `${Math.round(kpis.selfRate * 100)}`,      unit: '%',  tone: 'amber'   as Tone },
        ] as const).map(({ icon: Icon, label, value, unit, tone }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-4 p-4 md:p-5">
              <span className={cn(
                'inline-flex size-11 shrink-0 items-center justify-center rounded-xl',
                TONE_CLS[tone].chip,
              )}>
                <Icon className={cn('size-5', TONE_CLS[tone].icon)} />
              </span>
              <div className="min-w-0">
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold leading-none tabular-nums">{value}</span>
                  <span className="text-sm text-muted-foreground">{unit}</span>
                </div>
                <div className="mt-1 truncate text-xs text-muted-foreground">{label}</div>
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
          <CardContent className="space-y-5">
            {stages.map(({ stage, done, total }) => {
              const pct = total === 0 ? 0 : (done / total) * 100
              return (
                <div key={stage}>
                  <div className="mb-1.5 flex items-baseline justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{STAGE_INFO[stage].title.split(' · ')[0]}</div>
                    </div>
                    <div className="flex shrink-0 items-baseline gap-2 tabular-nums">
                      <span className="text-sm font-semibold text-foreground">{done}</span>
                      <span className="text-xs text-muted-foreground">/ {total}</span>
                      <span className="text-xs text-muted-foreground">· {Math.round(pct)}%</span>
                    </div>
                  </div>
                  <Progress value={pct} className="h-2 [&>div]:bg-foreground/80" />
                  <div className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="inline-block size-1 rounded-full bg-muted-foreground/40" />
                    <span className="truncate">{STAGE_INFO[stage].theme}</span>
                  </div>
                </div>
              )
            })}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">套路掌握</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3.5">
            {patterns.slice(0, 6).map(({ name, done, total }) => {
              const pct = total === 0 ? 0 : (done / total) * 100
              return (
                <div key={name} className="flex items-center gap-3">
                  <span className="w-24 shrink-0 truncate text-sm" title={name}>{name}</span>
                  <Progress value={pct} className="h-2 [&>div]:bg-foreground/80" />
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    <span className="font-medium text-foreground">{done}</span>
                    <span className="mx-0.5">/</span>
                    {total}
                  </span>
                </div>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <CardTitle className="text-base">打卡热力图（{rangeLabel}）</CardTitle>
            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-lg bg-muted p-0.5" data-slot="button-group">
                {HEATMAP_RANGES.map((r) => (
                  <Button
                    key={r.key}
                    size="xs"
                    variant="ghost"
                    aria-pressed={range === r.key}
                    onClick={() => setRange(r.key)}
                    className="aria-pressed:bg-background aria-pressed:shadow-sm"
                  >
                    {r.label}
                  </Button>
                ))}
              </div>
              <span className="text-xs text-muted-foreground tabular-nums">
                共 {heatmapTotal} 题 · 峰值 {Math.max(0, ...heatmap)}/天
              </span>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Heatmap data={heatmap} />
          <div className="mt-3 flex items-center justify-end gap-2 text-xs text-muted-foreground">
            <span>少</span>
            {[
              'bg-muted',
              'bg-emerald-200 dark:bg-emerald-900',
              'bg-emerald-400 dark:bg-emerald-700',
              'bg-emerald-500 dark:bg-emerald-600',
              'bg-emerald-600 dark:bg-emerald-400',
            ].map((c) => (
              <span key={c} className={`size-3 rounded-[3px] ${c}`} />
            ))}
            <span>多</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
