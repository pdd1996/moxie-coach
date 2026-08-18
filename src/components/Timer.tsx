import { useState } from 'react'
import { ChevronDown, Pause, Play, RotateCcw, TimerIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// 受控计时器（S3-F3）：计时状态由父级 useAttemptTimer 持有，主视图与专注模式共享同一份，
// 避免双实例各自计时/暂停不同步；本组件只负责展示 + 暂停/重置按钮。

interface TimerProps {
  /** 剩余秒数（可为负 = 超时） */
  remainSec: number
  paused: boolean
  overtime: boolean
  label: string
  onTogglePause: () => void
  onReset: () => void
}

/**
 * 安静计时器：默认只显示剩余分钟（一分钟一跳，不打扰专注），
 * 点击展开秒级倒计时与暂停/重置控件。超时只用琥珀色示意，不制造紧迫感。
 */
export function Timer({ remainSec, paused, overtime, label, onTogglePause, onReset }: TimerProps) {
  const [expanded, setExpanded] = useState(false)

  const displaySec = overtime ? -remainSec : remainSec
  const mm = String(Math.floor(displaySec / 60)).padStart(2, '0')
  const ss = String(displaySec % 60).padStart(2, '0')
  const minsLeft = Math.ceil(displaySec / 60)

  // 收起态：分钟 + 小图标，安静地待在角落
  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        title={`${label} · 点击展开计时详情`}
        className={cn(
          'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm tabular-nums transition-colors',
          overtime
            ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
            : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
        )}
      >
        <TimerIcon className="size-3.5" />
        {overtime ? `超时 ${minsLeft} 分` : `剩 ${minsLeft} 分`}
      </button>
    )
  }

  return (
    <div
      className={cn(
        'flex items-center gap-1 rounded-full border px-2 py-1 font-mono text-sm tabular-nums',
        overtime
          ? 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400'
          : 'border-border bg-muted/50',
      )}
    >
      <span className="px-1 font-sans text-xs text-muted-foreground">{label}</span>
      <span className="font-semibold">
        {overtime ? '+' : ''}
        {mm}:{ss}
      </span>
      <Button variant="ghost" size="icon" className="size-6" title="暂停/继续" onClick={onTogglePause}>
        {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
      </Button>
      <Button variant="ghost" size="icon" className="size-6" title="重新计时" onClick={onReset}>
        <RotateCcw className="size-3" />
      </Button>
      <Button variant="ghost" size="icon" className="size-6" title="收起计时详情" onClick={() => setExpanded(false)}>
        <ChevronDown className="size-3" />
      </Button>
    </div>
  )
}