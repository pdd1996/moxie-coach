// 纯函数：db 用户状态的加载/导入清洗。刻意不依赖 React / problems.json，
// 使其可被 node 测试直接 import（scripts/verify-s9-hydrate.mjs），覆盖 store
// hydrate→persist 的客户端变换——协议层测试（打 /api/db）测不到这层。
import type { ProblemMeta, ProblemUserState } from '@/lib/types'
import { migrateUserState } from './srs.ts'

/** ProblemMeta 的字段名集合——落盘前剥离，防止 stale meta 写进 db */
export const META_KEYS = new Set<keyof ProblemMeta>([
  'id', 'title', 'slug', 'difficulty', 'stage', 'pattern', 'signal', 'optional',
])

/**
 * 剔除元数据字段，只留用户状态。
 * 注意：id 也在 META_KEYS 内、会被剥掉。调用方须显式补回 id——
 * updateProblem 用 `{ ...stripMeta(patch), id }`，hydrateProblem 同款。
 * 若漏补，条目无 id，persist 写 Object.values 后 db.json 全库丢 id，重载塌缩成单个 "undefined"。
 */
export function stripMeta(obj: object): Partial<ProblemUserState> {
  const out: Record<string, unknown> = {}
  const src = obj as Record<string, unknown>
  for (const k in obj) if (!META_KEYS.has(k as keyof ProblemMeta)) out[k] = src[k]
  return out as Partial<ProblemUserState>
}

/**
 * 加载/导入时清洗单条用户状态：剥 stale meta（title/slug/stage/…）但保留 id，再跑状态迁移。
 * @param intervalsDays 必须非空（top=0 会使 self-solved 误判 mastered，见 srs.ts 文档）
 */
export function hydrateProblem(p: ProblemUserState, intervalsDays: number[]): ProblemUserState {
  return migrateUserState({ ...stripMeta(p), id: p.id } as ProblemUserState, intervalsDays)
}