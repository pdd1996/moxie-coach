// 判题引擎共享类型（S0-judge）。runner 与各语言执行器交换的数据形状。
import type { EntrySpec, TestCase, Lang } from '@/lib/types'

/** 单条用例执行后、比对前的原始结果（由 worker 产出） */
export interface RawCaseResult {
  ok: boolean // 执行是否成功（不含比对）
  timeout?: boolean // 5s 超时
  actual?: unknown // 实际输出值（成功时；比对在主线程统一做）
  elapsedMs?: number
  error?: string // 语法/运行时错误信息
}

/** 比对后面向 UI 的单条用例结果 */
export type CaseStatus = 'pass' | 'fail' | 'timeout' | 'error'

export interface CaseResult {
  label: string
  status: CaseStatus
  pass: boolean
  actual: string // 实际输出的 JSON 串（失败时也可能是错误信息）
  expected: string
  elapsedMs: number
}

export const TIMEOUT_MS = 5000

/** runCases 的入参 */
export interface RunOptions {
  lang: Lang
  code: string
  entry: EntrySpec // 由调用方从 problem.entry[lang] 取出；空则禁止运行
  testCases: TestCase[]
  /** 每条用例完成时回调，便于 UI 流式刷新 */
  onProgress?: (index: number, result: CaseResult) => void
}