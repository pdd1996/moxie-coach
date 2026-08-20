import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode,
} from 'react'
import type { Problem, ProblemMeta, ProblemUserState, Settings } from '@/lib/types'
import { seedSettings } from '@/data/seed'
import { stripMeta, hydrateProblem } from '@/lib/dbHydrate'
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
  /** S9 导出 db.json 为文件下载 */
  exportDb: () => Promise<void>
  /** S9 导入整库文件（校验失败/PUT 失败抛错，不覆盖） */
  importDb: (file: File) => Promise<void>
  /** S9 清空全部题目、保留设置 */
  clearDb: () => Promise<void>
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
  // 当前在飞的 PUT（resolve 后清空）。S9 导入/清空前要 await 它，确保没有
  // 旧内存的 debounce PUT 落在导入 PUT 之后把新数据盖回去（数据丢失）。
  const inflightRef = useRef<Promise<boolean> | null>(null)
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
    const p = fetch('/api/db', {
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
    // 记录在飞 PUT 供 flushAndWait/导入/清空 await；settled 后若仍是自己则清空
    inflightRef.current = p
    void p.then(() => {
      if (inflightRef.current === p) inflightRef.current = null
    })
    return p
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

  // 用一份 db 替换内存状态（迁移 + 重算 dirty/version）。mount 首次加载与
  // S9 导入/清空共用：导入/清空后必须用新数据 hydrate 内存，否则紧随的 debounce
  // PUT / pagehide flush 会把旧内存写回磁盘，盖掉刚写入的新数据（数据丢失）。
  // 落库前过 stripMeta：导入旧版导出文件时，残留的 title/slug/… meta 字段不能写回
  // 内存（否则下次 persist 会把 stale meta 原样写回 db，毁掉 stripMeta 的写盘设计）。
  // 注意 stripMeta 连 id 一起剥（id ∈ META_KEYS），必须像 updateProblem 那样显式补回 id——
  // 否则条目无 id，persist 写 Object.values 后 db.json 全库丢 id，重载塌缩成单个 "undefined"。
  const hydrate = useCallback((db: Db) => {
    // intervals 为空数组时 top=0 会把 self-solved 误判 mastered（srs.ts 文档明说的坑），
    // ?? 不兜底空数组，故显式判 length
    const rawIntervals = db.settings?.intervalsDays
    const intervals = Array.isArray(rawIntervals) && rawIntervals.length > 0
      ? rawIntervals
      : seedSettings.intervalsDays
    const map: Record<string, ProblemUserState> = {}
    for (const p of db.problems ?? []) {
      if (typeof p !== 'object' || p === null) continue // 防御：畸形条目跳过，不写内存
      map[String(p.id)] = hydrateProblem(p, intervals)
    }
    setUserById(map)
    setSettings(db.settings ?? seedSettings)
    // 清掉任何待写与在飞对旧内存的引用；版本号 +1 让遗留 persist 回调的 version 比对失败
    dirty.current = false
    if (saveTimer.current != null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    version.current += 1
  }, [])

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
        let migrated = false
        for (const p of db.problems ?? []) {
          const st = p.status as string
          if (st === 'self-solved' || st === 'pending-review' || st === 'reviewing') migrated = true
        }
        hydrate(db)
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

  // S9-F9 数据管理：导出/导入/清空前的串行化闸——确保磁盘==内存且无后续 PUT 抢写。
  // 取消待触发的 debounce，若有脏改动立刻 PUT 并等完成，否则等已在飞的 PUT 落盘。
  const flushAndWait = useCallback(async () => {
    if (saveTimer.current != null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (dirty.current) {
      dirty.current = false
      await persist({ keepalive: false })
    } else if (inflightRef.current) {
      await inflightRef.current
    }
  }, [persist])

  // 导出：确保最新态落盘后拉全量 db.json，触发文件下载（带日期时间戳文件名）
  const exportDb = useCallback(async () => {
    await flushAndWait()
    const res = await fetch('/api/db')
    if (!res.ok) throw new Error(`导出失败（HTTP ${res.status}）`)
    const text = await res.text()
    const d = new Date()
    const p2 = (n: number) => String(n).padStart(2, '0')
    const stamp = `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
    const blob = new Blob([text], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `moxie-db-${stamp}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }, [flushAndWait])

  // 导入：读文件 → JSON.parse → 校验顶层有 problems(数组)+settings(对象) → PUT → hydrate。
  // 校验失败或 PUT 失败抛错，调用方报错，不覆盖现有数据。
  const importDb = useCallback(async (file: File) => {
    await flushAndWait()
    const text = await file.text()
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new Error('文件不是合法 JSON，无法导入')
    }
    const obj = parsed as Record<string, unknown>
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !Array.isArray(obj.problems) ||
      typeof obj.settings !== 'object' ||
      obj.settings === null
    ) {
      throw new Error('文件结构不符：缺少 problems 或 settings（应为整库导出文件）')
    }
    // 条目级校验：顶层 problems 是数组但含 null/非对象条目时（如 problems:[null]），
    // PUT 后再 hydrate 会在 migrateUserState 处 throw，磁盘已被覆盖、内存未更新——
    // 「校验失败不覆盖」承诺会破。故 PUT 前拦掉，让坏文件根本不落盘。
    if (obj.problems.some((p) => typeof p !== 'object' || p === null)) {
      throw new Error('文件结构不符：problems 含非法条目（应为对象数组）')
    }
    const body = JSON.stringify(parsed)
    const res = await fetch('/api/db', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body,
    })
    if (!res.ok) throw new Error(`导入失败（HTTP ${res.status}）`)
    hydrate(parsed as Db)
  }, [flushAndWait, hydrate])

  // 清空：只清题目、保留当前设置（API key/间隔/默认语言不动）。
  // spec 原文「清成初始种子」会顺手删 API key，偏离以符合「从头重刷」的真实意图；
  // 导出→清空→导入仍完整还原（导入用整库覆盖）。
  const clearDb = useCallback(async () => {
    await flushAndWait()
    const db: Db = { problems: [], settings: settingsRef.current }
    const res = await fetch('/api/db', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(db),
    })
    if (!res.ok) throw new Error(`清空失败（HTTP ${res.status}）`)
    hydrate(db)
  }, [flushAndWait, hydrate])

  // 未就绪时挂载页面会看到空数据（如 ProblemView 的 not-found 闪现），
  // 用一个最小加载态把整棵子树挡住，确保消费者只在数据到位后渲染。
  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center text-sm text-muted-foreground">加载中…</div>
  }

  const value: StoreValue = {
    problems,
    settings,
    getProblem,
    updateProblem,
    updateSettings,
    exportDb,
    importDb,
    clearDb,
  }
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

/** S9 导出 db.json 为文件下载 */
export function useExportDb() {
  return useStore().exportDb
}

/** S9 导入整库文件（命令式，校验/写入失败抛错） */
export function useImportDb() {
  return useStore().importDb
}

/** S9 清空全部题目、保留设置（命令式，写入失败抛错） */
export function useClearDb() {
  return useStore().clearDb
}