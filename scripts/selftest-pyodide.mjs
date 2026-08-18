// 用 Node 加载 vendored Pyodide（浏览器构建，Node 24 可跑），复刻 pyodide.worker
// 的调用路径验证 88：fresh globals + toPy 入参 + outArg 读回原地修改。
import { loadPyodide } from '../public/pyodide/pyodide.mjs'

const py = await loadPyodide({ indexURL: 'public/pyodide/' })
console.log('[pyodide] loaded, python', py.runPython('import sys; sys.version.split()[0]'))

// 88 的解法
const code = `def merge(nums1, m, nums2, n):
    p, p1, p2 = m + n - 1, m - 1, n - 1
    while p2 >= 0:
        if p1 >= 0 and nums1[p1] > nums2[p2]:
            nums1[p] = nums1[p1]; p1 -= 1
        else:
            nums1[p] = nums2[p2]; p2 -= 1
        p -= 1
`

const entry = { name: 'merge', callType: 'function' }

function runOne(argStrings, outArg) {
  const g = py.toPy({})
  py.runPython(code, { globals: g })
  const fn = g.get(entry.name)
  const pyArgs = argStrings.map((s) => py.toPy(JSON.parse(s)))
  let actual
  if (outArg != null) {
    fn(...pyArgs)
    actual = pyArgs[outArg].toJs()
  } else {
    actual = fn(...pyArgs)
    actual = actual?.toJs ? actual.toJs() : actual
  }
  fn.destroy?.()
  g.destroy?.()
  pyArgs.forEach((p) => p.destroy?.())
  return actual
}

const cases = [
  { args: ['[1,2,3,0,0,0]', '3', '[2,5,6]', '3'], expected: [1,2,2,3,5,6], outArg: 0 },
  { args: ['[1]', '1', '[]', '0'], expected: [1], outArg: 0 },
  { args: ['[0]', '0', '[1]', '1'], expected: [1], outArg: 0 },
  { args: ['[4,5,6,0,0,0]', '3', '[1,2,3]', '3'], expected: [1,2,3,4,5,6], outArg: 0 },
]
let pass = 0, fail = 0
for (const c of cases) {
  const got = runOne(c.args, c.outArg)
  const ok = JSON.stringify(got) === JSON.stringify(c.expected)
  console.log(`${ok ? 'PASS' : 'FAIL'}  got=${JSON.stringify(got)} want=${JSON.stringify(c.expected)}`)
  ok ? pass++ : fail++
}

// method 形态冒烟：class Solution
const methodCode = `class Solution:
    def twoSum(self, nums, target):
        seen = {}
        for i, v in enumerate(nums):
            if target - v in seen:
                return [seen[target - v], i]
            seen[v] = i
        return []`
{
  const g = py.toPy({})
  py.runPython(methodCode, { globals: g })
  const Sol = g.get('Solution')
  const inst = Sol()
  const fn = inst.twoSum
  const ret = fn(py.toPy([2,7,11,15]), 9)  // 返回值型（无 outArg）
  const got = ret?.toJs ? ret.toJs() : ret
  console.log(`method ${JSON.stringify(got) === '[0,1]' ? 'PASS' : 'FAIL'}  got=${JSON.stringify(got)} want=[0,1]`)
  JSON.stringify(got) === '[0,1]' ? pass++ : fail++
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)