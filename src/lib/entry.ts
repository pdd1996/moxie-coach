// 判题入口解析（S2-F2 / PRD 第 8 节 D1）。
// entry 不在 problems.json 静态预填，而是 F2 贴题时从用户粘贴的 skeleton 解析存入 problem 记录，
// 形如 { name, callType }，按语言分存。判题器据此把 testCases.args 顺序传入并比对返回值（或 outArg）。
//
// 两种形态：
// - class Solution → callType:'method'（LeetCode Python 默认模板：先 Solution() 实例化再调方法）
// - 自由函数 → callType:'function'（def / function / var=func / 箭头）
// 解析失败（无函数定义 / 多线程题）返回 undefined → 该语言下禁用「运行用例」。

import type { EntrySpec, Lang } from '@/lib/types'

/** 从 skeleton 解析判题入口；按语言独立，空串 / 无定义 → undefined */
export function parseEntry(skeleton: string, lang: Lang): EntrySpec | undefined {
  if (!skeleton.trim()) return undefined
  return lang === 'python' ? parsePython(skeleton) : parseJs(skeleton)
}

function parsePython(code: string): EntrySpec | undefined {
  // class Solution: 取其下第一个 def 作为入口方法
  if (/^\s*class\s+Solution\b/m.test(code)) {
    const m = code.match(/class\s+Solution\b[\s\S]*?\bdef\s+(\w+)\s*\(/)
    return m ? { name: m[1], callType: 'method' } : undefined
  }
  const m = code.match(/\bdef\s+(\w+)\s*\(/)
  return m ? { name: m[1], callType: 'function' } : undefined
}

function parseJs(code: string): EntrySpec | undefined {
  if (/^\s*class\s+Solution\b/m.test(code)) {
    // class Solution { methodName(args) { ... } }：取第一个方法名
    const m = code.match(/class\s+Solution\b[\s\S]*?\b(\w+)\s*\([^)]*\)\s*\{/)
    return m ? { name: m[1], callType: 'method' } : undefined
  }
  // 自由函数优先级：function 声明 → var/const/let = function → 箭头赋值
  const patterns: RegExp[] = [
    /\bfunction\s+(\w+)\s*\(/,
    /\b(?:var|const|let)\s+(\w+)\s*=\s*function/,
    /\b(?:var|const|let)\s+(\w+)\s*=\s*\(/,
  ]
  for (const re of patterns) {
    const m = code.match(re)
    if (m) return { name: m[1], callType: 'function' }
  }
  return undefined
}