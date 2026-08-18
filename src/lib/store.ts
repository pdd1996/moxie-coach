import {
  createContext, useCallback, useContext, useMemo, useState, type ReactNode,
} from 'react'
import type { Problem, Settings } from '@/lib/types'
import { seedProblems, seedSettings } from '@/data/seed'

// ===== 数据访问层（S0-scaffold）=====
// 当前背后是内存种子数据；S0-data-layer 接入后，背后换成 fetch /api/db + 本地缓存 + debounce 保存。
// 签名保持不变，页面只依赖这一层，不直接 import 种子。

interface StoreValue {
  problems: Problem[]
  settings: Settings
  /** 按 id 取题（O(n)，题量小可接受） */
  getProblem: (id: number) => Problem | undefined
  /** 局部 patch 更新某题，浅合并避免整对象覆盖竞态 */
  updateProblem: (id: number, patch: Partial<Problem>) => void
  /** 局部 patch 更新设置（ai / intervalsDays / timeLimitMin / defaultLang 等） */
  updateSettings: (patch: Partial<Settings>) => void
}

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  // 内部以 id 为键的 Record 维护，便于 O(1) 定位与就地更新
  const [byId, setById] = useState<Record<string, Problem>>(() => {
    const map: Record<string, Problem> = {}
    for (const p of seedProblems) map[String(p.id)] = p
    return map
  })
  const [settings, setSettings] = useState<Settings>(seedSettings)

  const problems = useMemo(() => Object.values(byId), [byId])

  const getProblem = useCallback(
    (id: number) => byId[String(id)],
    [byId],
  )

  const updateProblem = useCallback((id: number, patch: Partial<Problem>) => {
    setById((prev) => {
      const key = String(id)
      const cur = prev[key]
      if (!cur) return prev // 不存在则忽略，避免凭空造题
      return { ...prev, [key]: { ...cur, ...patch } }
    })
  }, [])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
  }, [])

  const value: StoreValue = { problems, settings, getProblem, updateProblem, updateSettings }
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

function useStore(): StoreValue {
  const v = useContext(StoreContext)
  if (!v) throw new Error('useStore 必须在 <StoreProvider> 内使用')
  return v
}

/** 全量题单（订阅更新） */
export function useProblems(): Problem[] {
  return useStore().problems
}

/** 单题（订阅更新），id 变化时自动切换 */
export function useProblem(id: number): Problem | undefined {
  return useStore().getProblem(id)
}

/** 设置（订阅更新） */
export function useSettings(): Settings {
  return useStore().settings
}

/** 暴露更新方法，供页面命令式调用 */
export function useStoreActions() {
  const { updateProblem, updateSettings } = useStore()
  return { updateProblem, updateSettings }
}