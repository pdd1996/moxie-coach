// 宽松比对（S0-judge）：标量直接比；数组/对象递归规范化后深比。
//
// 「忽略元素顺序」按集合型结果处理：仅当数组的元素本身是数组/对象时，
// 该层顺序无关（外层忽略、内层保留）——对应 permutations/subsets/threeSum 这类
// 「返回一组结果、任意顺序都算对」的题。
//
// 而原始值数组（如 88 的 [1,2,2,3,5,6]）顺序敏感：错误顺序必须判失败。
// 否则 88 这类有序结果题会被「排序后相等」误判通过——这正是 spec「排序后深比」
// 字面照做会踩的坑，故这里收紧为「集合型才忽略顺序」。
//
// 用法：runner 把 expected 字符串 JSON.parse 成值后与 actual 值一同传入。

export function looseEqual(actual: unknown, expected: unknown): boolean {
  // Pyodide 把 Python None 转成 JS undefined（已实测），JSON.parse("null") 是 null：
  // 两者视作相等，避免「返回 None/undefined 的题 vs expected null」误判失败
  if (actual == null && expected == null) return true
  return deepEq(normalize(actual), normalize(expected))
}

/** 把值规范化成「可按顺序深比」的形式：集合型数组排序、对象键排序 */
function normalize(v: unknown): unknown {
  if (Array.isArray(v)) {
    const items = v.map(normalize)
    // 元素全是数组/对象 → 集合型，外层忽略顺序（按 canonical 串排序）
    if (items.length > 0 && items.every((x) => Array.isArray(x) || isPlainObject(x))) {
      return items.map(canonical).sort()
    }
    return items
  }
  if (isPlainObject(v)) {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(v).sort()) out[k] = normalize((v as Record<string, unknown>)[k])
    return out
  }
  return v
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null) return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}

/** 规范化后的值的稳定字符串形式，用于集合型数组排序 */
function canonical(v: unknown): string {
  return JSON.stringify(v)
}

function deepEq(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a !== typeof b) return false
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return false
    return a.every((x, i) => deepEq(x, b[i]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const ka = Object.keys(a)
    const kb = Object.keys(b)
    if (ka.length !== kb.length) return false
    return ka.every((k) => deepEq(a[k], b[k]))
  }
  return a === b
}