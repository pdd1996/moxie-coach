import { cn } from '@/lib/utils'

/** 打卡热力图：固定小格、按周分列，GitHub 风格 */
export function Heatmap({ data }: { data: number[] }) {
  const weeks: number[][] = []
  for (let i = 0; i < data.length; i += 7) weeks.push(data.slice(i, i + 7))

  const level = (v: number) => {
    if (v <= 0) return 'bg-muted'
    if (v === 1) return 'bg-emerald-200 dark:bg-emerald-900'
    if (v === 2) return 'bg-emerald-400 dark:bg-emerald-700'
    if (v === 3) return 'bg-emerald-500 dark:bg-emerald-600'
    return 'bg-emerald-600 dark:bg-emerald-400'
  }

  return (
    <div className="flex w-fit max-w-full gap-1 overflow-x-auto pb-1">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-1">
          {week.map((v, di) => (
            <div
              key={di}
              title={`${v} 题`}
              className={cn('size-3 rounded-[3px]', level(v))}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
