// 判题统一入口（S0-judge）：按当前语言分发到 JS / Python 执行器，
// 拿到原始执行结果后在主线程统一做宽松比对（compare.ts），产出面向 UI 的 CaseResult。
//
// 无 entry 的题（未贴题 / 多线程）由调用方禁止「运行用例」，不进这里。

import { runJsCase } from './javascript'
import { runPythonCase } from './python'
import { looseEqual } from './compare'
import { TIMEOUT_MS, type CaseResult, type RawCaseResult, type RunOptions } from './shared'
import type { TestCase } from '@/lib/types'

export type { CaseResult } from './shared'

export async function runCases(opts: RunOptions): Promise<CaseResult[]> {
  const results: CaseResult[] = []
  for (let i = 0; i < opts.testCases.length; i++) {
    const tc = opts.testCases[i]
    const raw: RawCaseResult =
      opts.lang === 'python'
        ? await runPythonCase({ code: opts.code, entry: opts.entry, argStrings: tc.args, outArg: tc.outArg })
        : await runJsCase({ code: opts.code, entry: opts.entry, argStrings: tc.args, outArg: tc.outArg })
    const res = finalize(tc, raw)
    results.push(res)
    opts.onProgress?.(i, res)
  }
  return results
}

function finalize(tc: TestCase, raw: RawCaseResult): CaseResult {
  if (!raw.ok) {
    if (raw.timeout) {
      return {
        label: tc.label,
        status: 'timeout',
        pass: false,
        actual: '超时（> 5s，疑似死循环）',
        expected: tc.expected,
        elapsedMs: TIMEOUT_MS,
      }
    }
    return {
      label: tc.label,
      status: 'error',
      pass: false,
      actual: `运行错误：${raw.error ?? '未知'}`,
      expected: tc.expected,
      elapsedMs: raw.elapsedMs ?? 0,
    }
  }
  let expectedVal: unknown
  try {
    expectedVal = JSON.parse(tc.expected)
  } catch {
    expectedVal = tc.expected // 期望本身不是合法 JSON：退化为串比
  }
  const pass = looseEqual(raw.actual, expectedVal)
  return {
    label: tc.label,
    status: pass ? 'pass' : 'fail',
    pass,
    actual: stringify(raw.actual),
    expected: tc.expected,
    elapsedMs: raw.elapsedMs ?? 0,
  }
}

function stringify(v: unknown): string {
  if (v === undefined) return 'undefined'
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}