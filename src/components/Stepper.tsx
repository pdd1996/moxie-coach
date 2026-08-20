import * as React from 'react'
import { Minus, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * 紧凑型数字输入：± 按钮 + 数字框 + 可选单位后缀。
 * 受控使用：value/onChange；越界时由 clamp 兜底（受控值仍会回写）。
 * 单位后缀只是展示，不影响 value。
 */
export interface StepperProps {
  value: number
  onChange: (v: number) => void
  min?: number
  max?: number
  unit?: string // 后缀文字，如 "道"/"分钟"/"天"
  disabled?: boolean
  ariaLabel?: string
  className?: string
}

const clamp = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n))

const NON_DIGITS = /\D/g

export function Stepper({
  value,
  onChange,
  min = 1,
  max = 999,
  unit,
  disabled,
  ariaLabel,
  className,
}: StepperProps) {
  const dec = () => onChange(clamp(value - 1, min, max))
  const inc = () => onChange(clamp(value + 1, min, max))

  // 键盘 ←/→ 微调；Home/End 跳边界
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') {
      e.preventDefault()
      dec()
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
      e.preventDefault()
      inc()
    } else if (e.key === 'Home') {
      e.preventDefault()
      onChange(min)
    } else if (e.key === 'End') {
      e.preventDefault()
      onChange(max)
    }
  }

  const btnCls =
    'inline-flex h-8 w-7 shrink-0 items-center justify-center rounded-md border border-transparent text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50'

  return (
    <div
      className={cn(
        'flex h-8 w-full items-center rounded-lg border border-input bg-transparent focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40',
        disabled && 'opacity-50',
        className,
      )}
    >
      <button
        type="button"
        onClick={dec}
        disabled={disabled || value <= min}
        aria-label="减少"
        className={btnCls}
      >
        <Minus className="size-3.5" />
      </button>
      <input
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={ariaLabel ?? '数值'}
        disabled={disabled}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value.replace(NON_DIGITS, ''))
          if (Number.isFinite(n)) onChange(clamp(n, min, max))
          else if (e.target.value === '') onChange(min)
        }}
        onKeyDown={onKey}
        className="h-full min-w-0 flex-1 border-x border-input bg-transparent text-center text-sm tabular-nums outline-none"
      />
      <button
        type="button"
        onClick={inc}
        disabled={disabled || value >= max}
        aria-label="增加"
        className={btnCls}
      >
        <Plus className="size-3.5" />
      </button>
      {unit && (
        <span className="shrink-0 px-2 text-xs text-muted-foreground">{unit}</span>
      )}
    </div>
  )
}
