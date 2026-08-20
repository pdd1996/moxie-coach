import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import type { Problem, ProblemMeta, ProblemUserState, Settings } from '@/lib/types'
import { migrateUserState } from '@/lib/srs'
import { seedSettings } from '@/data/seed'
import problemsMetaJson from '@/data/problems.json'

// ===== 数据访问层（S0-data-layer + S1-F1 运行期合并）=====
// 元数据（title/slug/difficulty/stage/pattern/signal/optional）来自 problems.json（只读种子）；
// 用户状态（status/history/note/srsLevel/nextReviewAt/… + F2 贴题内容）来自 db.json.problems。
// store 按 id 合并成完整 Problem 暴露给页面；updateProblem 只写用户状态，元数据永不落盘
// （否则 problems.json 改了，db 里的 stale meta 会盖回去）。
// 背后 fetch /api/db：首次拉全量到内存，updateProblem/updateSettings 改内存 + debounce 1s
// 后整体 PUT。签名与 S0-scaffold 保持一致，页面只依赖这一层。
// 单用户单标签页，不做差分/并发（PRD 第 7 节 scope out）。

const PROBLEMS_META = problemsMetaJson as unknown as ProblemMeta[]
const META_BY_ID: Record<string, ProblemMeta> = {}
for (const m of PROBLEMS_META) META_BY_ID[String(m.id)] = m

/** ProblemMeta 的字段名集合——updateProblem 落盘前剥离，防止 stale meta 写进 db */
const META_KEYS = new Set<keyof ProblemMeta>([
  'id', 'title', 'slug', 'difficulty', 'stage', 'pattern', 'signal', 'optional',
])

/** 从 patch/记录里剔除元数据字段，只留用户状态（保留 id 作键） */
function stripMeta(obj: object): Partial<ProblemUserState> {
  const out: Record<string, unknown> = {}
  const src = obj as Record<string, unknown>
  for (const k in obj) if (!META_KEYS.has(k as keyof ProblemMeta)) out[k] = src[k]
  return out as Partial<ProblemUserState>
}

/**
 * 元数据 + 用户状态 → 完整 Problem；未触碰的题补默认（new / 空 history / 空 testCases）。
 * 读路径同样过 stripMeta：db 里若残留旧形状记录（含 title/stage/pattern 等 meta 字段，
 * 如旧版 db.json 升级 / S9 导入旧导出），stale meta 不能盖回 problems.json 的新值。
 */
function mergeProblem(meta: ProblemMeta, user: ProblemUserState | undefined): Problem {
  return {
    ...meta,
    ...stripMeta(user ?? {}),
    status: user?.status ?? 'new',
    history: user?.history ?? [],
    testCases: user?.testCases ?? [],
  }
}

interface Db {
  problems: ProblemUserState[]
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
  // 内部以 id 为键的 Record 维护用户状态，便于 O(1) 定位与就地更新
  const [userById, setUserById] = useState<Record<string, ProblemUserState>>({})
  const [settings, setSettings] = useState<Settings>(seedSettings)
  const [ready, setReady] = useState(false)

  // 最新值镜像，供 debounce/flush 回调里取到当前状态（避免闭包陈旧）
  const userByIdRef = useRef(userById)
  userByIdRef.current = userById
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
      problems: Object.values(userByIdRef.current),
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
        // 状态模型迁移（重构 spec §7）：旧 db 残留 self-solved/pending-review/reviewing
        // 三个已退役状态，加载时迁移成 learned/mastered + self/lastFail。幂等。
        const intervals = db.settings?.intervalsDays ?? seedSettings.intervalsDays
        const map: Record<string, ProblemUserState> = {}
        let migrated = false
        for (const p of db.problems ?? []) {
          const st = p.status as string
          if (st === 'self-solved' || st === 'pending-review' || st === 'reviewing') migrated = true
          map[String(p.id)] = migrateUserState(p, intervals)
        }
        setUserById(map)
        setSettings(db.settings ?? seedSettings)
        setReady(true)
        // 若发生过迁移，顺手存一次让 db.json 落成新形状（§7.2）；1s debounce 后 ref 已是迁移值
        if (migrated) scheduleSave()
      })
      .catch((err) => {
        // 拉取失败也放行，避免白屏；后续写入会再次尝试
        console.error('[store] 加载 /api/db 失败：', err)
        if (!cancelled) setReady(true)
      })
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // 合并后的完整题单（元数据 ∪ 用户状态）；用户状态变化时重算
  const problems = useMemo(
    () => PROBLEMS_META.map((m) => mergeProblem(m, userById[String(m.id)])),
    [userById],
  )

  // 从已 memo 的 problems 派生 id→Problem 索引，让 getProblem 返回稳定引用
  // （userById 不变时同 id 返回同一对象，避免消费者把 [problem] 放进 effect/memo deps
  // 时每次渲染都重跑——旧 store 直接返回 byId 引用本就是稳定的，这里保持该语义）
  const problemsById = useMemo(() => {
    const m: Record<string, Problem> = {}
    for (const p of problems) m[String(p.id)] = p
    return m
  }, [problems])

  const getProblem = useCallback(
    (id: number) => problemsById[String(id)],
    [problemsById],
  )

  const updateProblem = useCallback((id: number, patch: Partial<Problem>) => {
    setUserById((prev) => {
      const key = String(id)
      if (!META_BY_ID[key]) return prev // 元数据里不存在则忽略，避免凭空造题
      const cur: ProblemUserState = prev[key] ?? { id, status: 'new', history: [] }
      return { ...prev, [key]: { ...cur, ...stripMeta(patch), id } }
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