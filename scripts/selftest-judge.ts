import { looseEqual } from '../src/lib/judge/compare.ts'

let pass = 0, fail = 0
function check(name: string, got: boolean, want: boolean) {
  const ok = got === want
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  got=${got} want=${want}`)
  ok ? pass++ : fail++
}

// 88 原地合并：正确结果
check('88 正确结果', looseEqual([1,2,2,3,5,6], JSON.parse('[1,2,2,3,5,6]')), true)
// 88 错误顺序 → 必须判失败（原始值数组顺序敏感，spec 字面「排序后比」会误判通过）
check('88 错误顺序判失败', looseEqual([1,2,3,5,6,2], JSON.parse('[1,2,2,3,5,6]')), false)
// 88 缺元素
check('88 缺元素判失败', looseEqual([1,2,3,5,6], JSON.parse('[1,2,2,3,5,6]')), false)
// 标量
check('标量相等', looseEqual(3, 3), true)
check('标量不等', looseEqual(3, 5), false)
// 对象键序无关
check('对象键序无关', looseEqual({a:1,b:2}, JSON.parse('{"b":2,"a":1}')), true)
// 集合型：外层顺序无关（元素是数组）—— permutations/subsets 类
check('集合型外层无关', looseEqual([[3,2,1],[1,2,3]], JSON.parse('[[1,2,3],[3,2,1]]')), true)
// 集合型内层顺序仍敏感
check('集合型内层敏感', looseEqual([[1,3,2]], JSON.parse('[[1,2,3]]')), false)
// 对象数组外层无关
check('对象数组外层无关', looseEqual([{x:1},{x:2}], JSON.parse('[{"x":2},{"x":1}]')), true)
// null / undefined 等价（Pyodide 把 Python None 转成 undefined，expected null 来自 JSON）
check('null===null', looseEqual(null, null), true)
check('undefined===null', looseEqual(undefined, null), true)
check('undefined===undefined', looseEqual(undefined, undefined), true)
// 字符串
check('字符串相等', looseEqual('abc','abc'), true)
// 数组元素对象时外层无关、内层键无关
check('三元组集合', looseEqual([[-1,0,1],[0,0,0]], JSON.parse('[[0,0,0],[-1,0,1]]')), true)

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)