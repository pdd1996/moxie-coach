import type { ProblemUserState, Settings } from '@/lib/types'

// ===== 开发期种子数据（用户状态）=====
// 说明：本文件只种「用户状态」（status/history/note/srsLevel/nextReviewAt/…），
// 题目元数据（title/slug/difficulty/stage/pattern/signal）来自 src/data/problems.json，
// 由 store 在运行期按 id 合并成完整 Problem（见 S1-F1）。
// 题面/题解默认只有 88 题是完整的（来自用户真实笔记），其余仅状态用于展示效果。
// S0-data-layer：db.json 不存在时由本种子生成；之后由 db.json 覆盖。

const today = '2026-08-18'
const yesterday = '2026-08-17'

const STATEMENT_88 = `给你两个按 **非递减顺序** 排列的整数数组 \`nums1\` 和 \`nums2\`，另有两个整数 \`m\` 和 \`n\`，分别表示 \`nums1\` 和 \`nums2\` 中的元素数目。

请你**合并** \`nums2\` 到 \`nums1\` 中，使合并后的数组同样按非递减顺序排列。

注意：最终，合并后数组不应由函数返回，而是存储在数组 \`nums1\` 中。为了应对这种情况，\`nums1\` 的初始长度为 \`m + n\`，其中前 \`m\` 个元素表示应合并的元素，后 \`n\` 个元素为 0，应忽略。

**示例 1：**

- 输入：nums1 = [1,2,3,0,0,0], m = 3, nums2 = [2,5,6], n = 3
- 输出：[1,2,2,3,5,6]

**示例 2：**

- 输入：nums1 = [1], m = 1, nums2 = [], n = 0
- 输出：[1]

**示例 3：**

- 输入：nums1 = [0], m = 0, nums2 = [1], n = 1
- 输出：[1]

**提示：**

- nums1.length == m + n
- 0 <= m, n <= 200`

const SOLUTION_88 = `## 套路：双指针（从后往前填）

**判断信号**：两个有序序列合并 + 目标数组尾部有"绝对不会被碰"的空位 -> 从后往前填，每个位置只写一次，永远不会覆盖还没用的数据。

## 思路（找入口三步法）

1. **先手算一个例子**：合并 [1,2,3] 和 [2,5,6]，像排座位一样每次取两边较小的放下
2. **观察动作**：左手一个指针指 nums1、右手一个指 nums2，每次比较放小的，那边指针往后移；这就是双指针
3. **破陷阱**：从前往后填会覆盖 nums1 还没用的数据；尾巴那 n 个 0 是绝对安全的空位 -> 反过来从后往前填

## 模板代码

\`\`\`python
def merge(nums1, m, nums2, n):
    p, p1, p2 = m + n - 1, m - 1, n - 1
    while p2 >= 0:                      # nums2 还有就继续
        if p1 >= 0 and nums1[p1] > nums2[p2]:
            nums1[p] = nums1[p1]
            p1 -= 1
        else:
            nums1[p] = nums2[p2]
            p2 -= 1
        p -= 1
\`\`\`

## 边界三问（写完必做）

1. **越界？** p1 减到 -1 时靠 \`p1 >= 0\` 挡住；p2 到 -1 正是循环停止信号。注意循环条件是 \`p2 >= 0\` 而不是两个都判断（nums1 剩下的本来就在位）
2. **空？** m=0：p1=-1 全走 else 搬 nums2；n=0：循环不进，直接对
3. **极端？** [4,5,6]+[1,2,3]（nums1 先耗尽）、[7,8,9]+[1,2,3]、[2,2]+[2,2]（相等走哪条分支）`

const SKELETON_PY = `def merge(nums1, m, nums2, n):
    # 从这里开始默写
    pass
`

const SKELETON_JS = `var merge = function(nums1, m, nums2, n) {
  // 从这里开始默写
};
`

export const seedProblems: ProblemUserState[] = [
  // ===== 阶段一：线性结构 =====
  {
    id: 88,
    status: 'learned', lastFail: true, statement: STATEMENT_88,
    skeleton: { python: SKELETON_PY, javascript: SKELETON_JS },
    solution: SOLUTION_88,
    entry: {
      python: { name: 'merge', callType: 'function' },
      javascript: { name: 'merge', callType: 'function' },
    },
    testCases: [
      { label: '示例1', args: ['[1,2,3,0,0,0]', '3', '[2,5,6]', '3'], expected: '[1,2,2,3,5,6]', outArg: 0 },
      { label: '示例2', args: ['[1]', '1', '[]', '0'], expected: '[1]', outArg: 0 },
      { label: '示例3', args: ['[0]', '0', '[1]', '1'], expected: '[1]', outArg: 0 },
      { label: '攻击：nums1先耗尽', args: ['[4,5,6,0,0,0]', '3', '[1,2,3]', '3'], expected: '[1,2,3,4,5,6]', outArg: 0 },
    ],
    note: '什么时候用：两个有序序列往一个数组里原地合并且尾部有空位，从后往前填',
    srsLevel: 0,
    nextReviewAt: today,
    lastLang: 'javascript',
    lastCode: { python: '', javascript: '' },
    history: [
      { ts: '2026-08-15T21:10:00', phase: 'attempt', outcome: 'timeout', elapsedMin: 15, pausedMin: 0, peekCount: 0, lang: 'javascript' },
      { ts: '2026-08-15T21:40:00', phase: 'reproduce', outcome: 'fail', elapsedMin: 22, pausedMin: 3, peekCount: 2, lang: 'javascript' },
    ],
  },
  { id: 27, status: 'learned', testCases: [], history: [], nextReviewAt: '2026-08-20', srsLevel: 1, note: '快指针找值、慢指针收留' },
  { id: 26, status: 'mastered', testCases: [], history: [], srsLevel: 3 },
  { id: 1, status: 'learned', self: true, testCases: [], history: [], srsLevel: 0, nextReviewAt: '2026-08-21', lastLang: 'python' },
  { id: 242, status: 'learned', testCases: [], history: [], nextReviewAt: '2026-08-21', srsLevel: 1, note: '26 个字母计数数组就够，不用真哈希' },
  { id: 125, status: 'learned', testCases: [], history: [], nextReviewAt: '2026-08-22', srsLevel: 1 },
  { id: 169, status: 'new', testCases: [], history: [] },
  { id: 3, status: 'new', testCases: [], history: [] },
  { id: 383, status: 'new', testCases: [], history: [] },
  { id: 228, status: 'new', testCases: [], history: [] },
  { id: 56, status: 'new', testCases: [], history: [] },

  // ===== 阶段二：链表 + 栈 + 树 =====
  { id: 206, status: 'learned', testCases: [], history: [], nextReviewAt: '2026-08-19', srsLevel: 1, note: 'prev=None 起，cur.next 先存后改' },
  { id: 141, status: 'learned', testCases: [], history: [], nextReviewAt: '2026-08-19', srsLevel: 1 },
  { id: 21, status: 'mastered', testCases: [], history: [], srsLevel: 3, note: 'dummy 免特判头节点' },
  { id: 2, status: 'new', testCases: [], history: [] },
  { id: 19, status: 'new', testCases: [], history: [] },
  { id: 155, status: 'new', testCases: [], history: [] },
  { id: 104, status: 'learned', testCases: [], history: [], nextReviewAt: today, srsLevel: 0 },
  { id: 98, status: 'learned', lastFail: true, testCases: [], history: [], nextReviewAt: today, srsLevel: 0 },
  { id: 102, status: 'new', testCases: [], history: [] },
  { id: 236, status: 'new', testCases: [], history: [] },

  // ===== 阶段三：二分 + 图 + 堆 =====
  { id: 704, status: 'learned', self: true, testCases: [], history: [], srsLevel: 0, nextReviewAt: '2026-08-20', lastLang: 'python' },
  { id: 74, status: 'new', testCases: [], history: [] },
  { id: 33, status: 'new', testCases: [], history: [] },
  { id: 200, status: 'learned', lastFail: true, testCases: [], history: [], nextReviewAt: yesterday, srsLevel: 0, note: '访问过的格子要标记，否则死循环' },
  { id: 207, status: 'new', testCases: [], history: [] },
  { id: 347, status: 'new', testCases: [], history: [] },
  { id: 215, status: 'new', testCases: [], history: [] },

  // ===== 阶段四：DP + 贪心 + 回溯 =====
  { id: 70, status: 'learned', testCases: [], history: [], nextReviewAt: '2026-08-20', srsLevel: 1, note: '斐波那契，滚动两变量就够' },
  { id: 121, status: 'mastered', testCases: [], history: [], srsLevel: 3 },
  { id: 122, status: 'new', testCases: [], history: [] },
  { id: 55, status: 'new', testCases: [], history: [] },
  { id: 300, status: 'new', testCases: [], history: [] },
  { id: 322, status: 'new', testCases: [], history: [] },
  { id: 78, status: 'learned', lastFail: true, testCases: [], history: [], nextReviewAt: today, srsLevel: 0 },
  { id: 46, status: 'learned', testCases: [], history: [], nextReviewAt: '2026-08-21', srsLevel: 1 },
  { id: 22, status: 'new', testCases: [], history: [] },

  // ===== 选做：多线程 =====
  { id: 1114, status: 'new', testCases: [], history: [] },
]

/** 默认设置（对应 PRD 第 6 节 settings） */
export const seedSettings: Settings = {
  ai: { baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' },
  intervalsDays: [3, 7, 14],
  timeLimitMin: { easy: 15, medium: 25, hard: 25 },
  defaultLang: 'python',
}

/** 顶部统计卡假数据（连续打卡/累计完成/通过率/独立解出率）。热力图已改由 srs.heatmapData 从真实 history 聚合 */
export const seedStats = {
  streakDays: 6,
  totalSolved: 17,
  reproducePassRate: 0.71,
  selfSolvedRate: 0.29,
}