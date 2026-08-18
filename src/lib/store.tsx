import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import type { Problem, Settings } from '@/lib/types'
import { seedSettings } from '@/data/seed'

// ===== 数据访问层（S0-data-layer）=====
// 背后换成 fetch /api/db：首次拉全量到内存，updateProblem/updateSettings 改内存 + debounce 1s
// 后整体 PUT。签名与 S0-scaffold 保持一致，页面只依赖这一层。
// 单用户单标签页，不做差分/并发（PRD 第 7 节 scope out）。

interface Db {
  problems: Problem[]
  settings: Settings
}

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

const DEBOUNCE_MS = 1000

const StoreContext = createContext<StoreValue | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  // 内部以 id 为键的 Record 维护，便于 O(1) 定位与就地更新
  const [byId, setById] = useState<Record<string, Problem>>({})
  const [settings, setSettings] = useState<Settings>(seedSettings)
  const [ready, setReady] = useState(false)

  // 最新值镜像，供 debounce/flush 回调里取到当前状态（避免闭包陈旧）
  const byIdRef = useRef(byId)
  byIdRef.current = byId
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const saveTimer = useRef<number | null>(null)
  const dirty = useRef(false)
  // 编辑版本号：PUT 成功后仅当「飞行期间无新编辑」才清 dirty，
  // 否则「编辑 → PUT 飞行中 → 又编辑 → PUT 成功清 dirty → 关页」会丢后一次编辑
  const version = useRef(0)

  // 全量 PUT。keepalive 仅用于卸载期 flush（spec）：keepalive 有 64KB body 上限，
  // 全量 db 超过后会静默失败——常规 debounce 保存必须不带 keepalive 才不受此限。
  // 返回是否成功（2xx），失败时记日志并由调用方决定是否保留 dirty。
  const persist = useCallback(({ keepalive }: { keepalive: boolean }) => {
    const body = JSON.stringify({
      problems: Object.values(byIdRef.current),
      settings: settingsRef.current,
    } satisfies Db)
    return fetch('/api/db', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive,
    }).then(
      (r) => r.ok,
      (err) => {
        console.error('[store] PUT /api/db 失败：', err)
        return false
      },
    )
  }, [])

  // debounce 1s 后落盘；连续编辑只 PUT 一次
  const scheduleSave = useCallback(() => {
    dirty.current = true
    version.current += 1
    if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      const savingVersion = version.current
      // PUT 失败保留 dirty，让 pagehide flush 再试一次；成功且期间无新编辑才清
      void persist({ keepalive: false }).then((ok) => {
        if (ok && version.current === savingVersion) dirty.current = false
      })
    }, DEBOUNCE_MS)
  }, [persist])

  // 首次挂载拉全量到内存
  useEffect(() => {
    let cancelled = false
    fetch('/api/db')
      .then((r) => {
        if (!r.ok) throw new Error(`GET /api/db -> ${r.status}`)
        return r.json() as Promise<Db>
      })
      .then((db) => {
        if (cancelled) return
        const map: Record<string, Problem> = {}
        for (const p of db.problems ?? []) map[String(p.id)] = p
        setById(map)
        setSettings(db.settings ?? seedSettings)
        setReady(true)
      })
      .catch((err) => {
        // 拉取失败也放行，避免白屏；后续写入会再次尝试
        console.error('[store] 加载 /api/db 失败：', err)
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 防抖丢数据窗口（C）：1s 内刷新/关页会丢最后一次编辑。
  // 监听 pagehide / visibilitychange:hidden，有未保存改动立即 flush。
  useEffect(() => {
    const flush = () => {
      if (!dirty.current) return
      if (saveTimer.current != null) window.clearTimeout(saveTimer.current)
      dirty.current = false
      // 卸载期 best-effort：keepalive 保证请求能发完，但受 64KB body 上限（spec 接受）；
      // 常规保存已不带 keepalive，故大库的稳态落盘不受此限
      void persist({ keepalive: true })
    }
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') flush()
    }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [persist])

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
    scheduleSave()
  }, [scheduleSave])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }))
    scheduleSave()
  }, [scheduleSave])

  // 未就绪时挂载页面会看到空数据（如 ProblemView 的 not-found 闪现），
  // 用一个最小加载态把整棵子树挡住，确保消费者只在数据到位后渲染。
  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">加载中…</div>
  }

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

/** 局部 patch 更新某题（命令式，对齐 spec 的 updateProblem(id, patch)） */
export function useUpdateProblem() {
  return useStore().updateProblem
}

/** 局部 patch 更新设置（命令式，对齐 spec 的 updateSettings(patch)） */
export function useUpdateSettings() {
  return useStore().updateSettings
}