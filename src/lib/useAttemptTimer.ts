// 尝试/默写计时 hook（S3-F3）。把计时状态从 Timer 组件提升到这里，
// 主视图与专注模式共享同一份（避免双实例各自计时/暂停不同步），
// 并向 ProblemView 上报 elapsedSec / pausedSec 用于写 history。
//
// 单一 1s interval + ref 读 paused：mount 一次，resetKey 变化只重置状态不重建定时器。
// 超时回调 onTimeout 仅触发一次（firedRef），到点后 elapsed 继续累计（含超时耗时）。

import { useEffect, useRef, useState } from 'react'

export function useAttemptTimer(minutes: number, resetKey: string, onTimeout?: () => void) {
  const [remainSec, setRemainSec] = useState(minutes * 60)
  const [pausedSec, setPausedSec] = useState(0)
  const [paused, setPaused] = useState(false)
  const firedRef = useRef(false)
  const pausedRef = useRef(false)
  pausedRef.current = paused
  const onTimeoutRef = useRef(onTimeout)
  onTimeoutRef.current = onTimeout

  // resetKey / minutes 变化 → 重置（新阶段或难度变化）
  useEffect(() => {
    setRemainSec(minutes * 60)
    setPausedSec(0)
    setPaused(false)
    firedRef.current = false
  }, [resetKey, minutes])

  // 单一 tick：未暂停倒计、暂停则累计暂停秒数
  useEffect(() => {
    const t = window.setInterval(() => {
      if (pausedRef.current) setPausedSec((s) => s + 1)
      else setRemainSec((s) => s - 1)
    }, 1000)
    return () => window.clearInterval(t)
  }, [])

  const overtime = remainSec < 0
  useEffect(() => {
    if (overtime && !firedRef.current) {
      firedRef.current = true
      onTimeoutRef.current?.()
    }
  }, [overtime])

  const elapsedSec = Math.max(0, minutes * 60 - remainSec)

  return {
    remainSec,
    paused,
    pausedSec,
    overtime,
    elapsedSec,
    togglePause: () => setPaused((p) => !p),
    reset: () => {
      setRemainSec(minutes * 60)
      setPausedSec(0)
      setPaused(false)
      firedRef.current = false
    },
  }
}