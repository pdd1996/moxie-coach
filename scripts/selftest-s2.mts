// S2-F2 自测：entry 解析 + md 导入解析（贴题模式/批量导入/示例正则）。
// 运行：npx tsx scripts/selftest-s2.mts
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseEntry } from '../src/lib/entry.ts'
import { parseMdFile, parseExamples, parseIdFromFilename } from '../src/lib/import.ts'

let pass = 0
let fail = 0
function ok(name: string, cond: boolean, extra?: string) {
  if (cond) {
    pass++
    console.log(`  ✓ ${name}${extra ? ' — ' + extra : ''}`)
  } else {
    fail++
    console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`)
  }
}
function eq<T>(name: string, got: T, want: T) {
  const c = JSON.stringify(got) === JSON.stringify(want)
  ok(name, c, `got=${JSON.stringify(got)} want=${JSON.stringify(want)}`)
}

console.log('== parseEntry ==')
eq('py def', parseEntry('def merge(nums1, m, nums2, n):\n    pass', 'python'), { name: 'merge', callType: 'function' })
eq('py class Solution', parseEntry('class Solution:\n    def twoSum(self, nums, target):\n        pass', 'python'), { name: 'twoSum', callType: 'method' })
ok('py empty -> undefined', parseEntry('   ', 'python') === undefined)
ok('py no def -> undefined', parseEntry('print("hi")', 'python') === undefined)
eq('js function', parseEntry('function merge(a, b) { return a }', 'javascript'), { name: 'merge', callType: 'function' })
eq('js var=function', parseEntry('var merge = function(nums1, m, nums2, n) {\n};', 'javascript'), { name: 'merge', callType: 'function' })
eq('js const arrow', parseEntry('const twoSum = (nums, target) => {\n  return []\n}', 'javascript'), { name: 'twoSum', callType: 'function' })
eq('js class Solution', parseEntry('class Solution {\n  twoSum(nums, target) {\n    return []\n  }\n}', 'javascript'), { name: 'twoSum', callType: 'method' })
ok('js no def -> undefined', parseEntry('let x = 1', 'javascript') === undefined)

console.log('== parseIdFromFilename ==')
ok('88.', parseIdFromFilename('88. 合并两个有序数组.md') === 88)
ok('leading number', parseIdFromFilename('123abc.md') === 123)
ok('no number -> undefined', parseIdFromFilename('abc.md') === undefined)
ok('path with dir', parseIdFromFilename('foo/bar/206. 反转链表.md') === 206)

console.log('== parseExamples（中文 输入/输出） ==')
const ex1 = `示例 1：

输入：nums1 = [1,2,3,0,0,0], m = 3, nums2 = [2,5,6], n = 3
输出：[1,2,2,3,5,6]
解释：合并结果是 [1,2,2,3,5,6]。
示例 2：

输入：nums1 = [1], m = 1, nums2 = [], n = 0
输出：[1]
示例 3：

输入：nums1 = [0], m = 0, nums2 = [1], n = 1
输出：[1]
`
const tc1 = parseExamples(ex1)
ok('解析出 3 条', tc1.length === 3, `len=${tc1.length}`)
eq('示例1 args', tc1[0].args, ['[1,2,3,0,0,0]', '3', '[2,5,6]', '3'])
eq('示例1 expected', tc1[0].expected, '[1,2,2,3,5,6]')
eq('示例1 label', tc1[0].label, '示例1')
eq('示例2 args', tc1[1].args, ['[1]', '1', '[]', '0'])
eq('示例3 expected', tc1[2].expected, '[1]')

console.log('== parseExamples（英文 Input/Output + 字符串值） ==')
const ex2 = `Example 1:
Input: s = "hello", k = 2
Output: "leh"
Example 2:
Input: nums = [1,2,3]
Output: 3
`
const tc2 = parseExamples(ex2)
ok('英文解析 2 条', tc2.length === 2, `len=${tc2.length}`)
eq('英文 args 剥前缀', tc2[0].args, ['"hello"', '2'])
eq('英文 expected 字符串', tc2[0].expected, '"leh"')
eq('无前缀数组 args', tc2[1].args, ['[1,2,3]'])
eq('标量 expected', tc2[1].expected, '3')

console.log('== 嵌套数组顶层逗号切分 ==')
const ex3 = `输入：edges = [[1,2],[2,3]], n = 3
输出：2
`
const tc3 = parseExamples(ex3)
eq('嵌套不被错切', tc3[0].args, ['[[1,2],[2,3]]', '3'])

console.log('== parseMdFile：合成 fenced md（python 块 + 示例） ==')
const fenced = `# 88. 合并两个有序数组

给你两个有序数组 nums1 和 nums2。

示例 1：

输入：nums1 = [1,2,3,0,0,0], m = 3, nums2 = [2,5,6], n = 3
输出：[1,2,2,3,5,6]
示例 2：

输入：nums1 = [1], m = 1, nums2 = [], n = 0
输出：[1]
示例 3：

输入：nums1 = [0], m = 0, nums2 = [1], n = 1
输出：[1]

\`\`\`python
def merge(nums1, m, nums2, n):
    pass
\`\`\`

\`\`\`javascript
var merge = function(nums1, m, nums2, n) {
};
\`\`\`
`
const p1 = parseMdFile('88. 合并两个有序数组.md', fenced, 'python')!
ok('id=88', p1.id === 88)
ok('skeleton.python 有值', !!p1.skeleton.python && p1.skeleton.python.includes('def merge'))
ok('skeleton.javascript 有值', !!p1.skeleton.javascript && p1.skeleton.javascript.includes('var merge'))
ok('statement 剥掉代码块', !p1.statement.includes('def merge') && p1.statement.includes('合并两个有序数组'))
ok('3 个用例', p1.testCases.length === 3, `len=${p1.testCases.length}`)
eq('entry python', parseEntry(p1.skeleton.python!, 'python'), { name: 'merge', callType: 'function' })
eq('entry javascript', parseEntry(p1.skeleton.javascript!, 'javascript'), { name: 'merge', callType: 'function' })

console.log('== parseMdFile：无 fenced 块的裸函数体兜底（真实 88.md） ==')
const real88 = readFileSync(resolve('../面试经典150题/88. 合并两个有序数组.md'), 'utf8')
const p2 = parseMdFile('88. 合并两个有序数组.md', real88, 'python')!
ok('real id=88', p2.id === 88)
ok('real 3 个用例', p2.testCases.length === 3, `len=${p2.testCases.length}`)
eq('real 示例1 args', p2.testCases[0].args, ['[1,2,3,0,0,0]', '3', '[2,5,6]', '3'])
eq('real 示例1 expected', p2.testCases[0].expected, '[1,2,2,3,5,6]')
ok('real 裸代码进 skeleton.javascript', !!p2.skeleton.javascript && p2.skeleton.javascript.includes('merge'))
ok('real statement 不含代码', !p2.statement.includes('var merge'))
eq('real entry js', parseEntry(p2.skeleton.javascript!, 'javascript'), { name: 'merge', callType: 'function' })

console.log('== parseMdFile：裸代码 class Solution 语言区分 ==')
const jsClass = `# 1. 两数之和

class Solution {
  twoSum(nums, target) {
    return []
  }
}
`
const pJsClass = parseMdFile('1. 两数之和.md', jsClass, 'python')!
ok('JS class Solution 进 javascript 而非 python', !!pJsClass.skeleton.javascript && pJsClass.skeleton.python === undefined)
eq('JS class Solution entry', parseEntry(pJsClass.skeleton.javascript!, 'javascript'), { name: 'twoSum', callType: 'method' })
const pyClass = `# 1. 两数之和

class Solution:
    def twoSum(self, nums, target):
        return []
`
const pPyClass = parseMdFile('1. 两数之和.md', pyClass, 'python')!
ok('Python class Solution 进 python', !!pPyClass.skeleton.python && pPyClass.skeleton.javascript === undefined)
eq('Python class Solution entry', parseEntry(pPyClass.skeleton.python!, 'python'), { name: 'twoSum', callType: 'method' })

// Python 2 写法 `class Solution(object):` 也要识别为 python（非 JS）
const pyClassObj = `# 1. 两数之和

class Solution(object):
    def twoSum(self, nums, target):
        return []
`
const pPyObj = parseMdFile('1. 两数之和.md', pyClassObj, 'python')!
ok('Python class Solution(object) 进 python', !!pPyObj.skeleton.python && pPyObj.skeleton.javascript === undefined)
eq('Python class Solution(object) entry', parseEntry(pPyObj.skeleton.python!, 'python'), { name: 'twoSum', callType: 'method' })

console.log('== parseMdFile：无语言标注块按 defaultLang 存入 ==')
const unlabeled = `# 1. 两数之和

\`\`\`
def twoSum(nums, target):
    pass
\`\`\`
`
const p3 = parseMdFile('1. 两数之和.md', unlabeled, 'python')!
ok('无标注块进 python（defaultLang）', !!p3.skeleton.python && p3.skeleton.python.includes('def twoSum'))
ok('无标注块不进 javascript', p3.skeleton.javascript === undefined)

console.log('== parseMdFile：文件名无题号 -> null ==')
ok('无题号返回 null', parseMdFile('abc.md', '# x', 'python') === null)

console.log(`\n${pass} passed, ${fail} failed`)
if (fail) process.exit(1)