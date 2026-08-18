import { useEffect, useRef, useState } from 'react'
import { ChevronDown, Pause, Play, RotateCcw, TimerIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface TimerProps {
  minutes: number
  /** 重新开始计时的钥匙（比如 phase 变化时换新值） */
  resetKey: string | number
  label: string
  onTimeout?: () => void
}

/**
 * 安静计时器：默认只显示剩余分钟（一分钟一跳，不打扰专注），
 * 点击展开秒级倒计时与暂停/重置控件。超时只用琥珀色示意，不制造紧迫感。
 */
export function Timer({ minutes, resetKey, label, onTimeout }: TimerProps) {
  const [remainSec, setRemainSec] = useState(minutes * 60)
  const [paused, setPaused] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const firedRef = useRef(false)

  useEffect(() => {
    setRemainSec(minutes * 60)
    setPaused(false)
    setExpanded(false)
    firedRef.current = false
  }, [resetKey, minutes])

  useEffect(() => {
    if (paused) return
    const t = setInterval(() => setRemainSec((s) => s - 1), 1000)
    return () => clearInterval(t)
  }, [paused, resetKey])

  const overtime = remainSec < 0
  useEffect(() => {
    if (overtime && !firedRef.current) {
      firedRef.current = true
      onTimeout?.()
    }
  }, [overtime, onTimeout])

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
      <Button variant="ghost" size="icon" className="size-6" title="暂停/继续" onClick={() => setPaused((p) => !p)}>
        {paused ? <Play className="size-3" /> : <Pause className="size-3" />}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="size-6"
        title="重新计时"
        onClick={() => {
          setRemainSec(minutes * 60)
          setPaused(false)
        }}
      >
        <RotateCcw className="size-3" />
      </Button>
      <Button variant="ghost" size="icon" className="size-6" title="收起计时详情" onClick={() => setExpanded(false)}>
        <ChevronDown className="size-3" />
      </Button>
    </div>
  )
}
