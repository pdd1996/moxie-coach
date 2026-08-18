import type { Problem, Settings } from '@/lib/types'

// ===== 开发期种子数据 =====
// 说明：题面/题解默认只有 88 题是完整的（来自用户真实笔记），
// 其余题目仅元数据 + 状态，用于展示题单/仪表盘的各种状态效果。
// S0-scaffold 阶段 store 直接吃这份种子；S0-data-layer 接入后由 db.json 覆盖。

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

export const seedProblems: Problem[] = [
  // ===== 阶段一：线性结构 =====
  {
    id: 88, title: '合并两个有序数组', slug: 'merge-sorted-array', difficulty: 'Easy',
    stage: 1, pattern: '双指针（相向从后）', signal: '有序数组合并、原地操作、尾部有空位',
    status: 'pending-review', statement: STATEMENT_88,
    skeleton: { python: SKELETON_PY, javascript: SKELETON_JS },
    solution: SOLUTION_88,
    entry: {
      python: { name: 'merge', callType: 'function' },
      javascript: { name: 'merge', callType: 'function' },
    },
    testCases: [
      { label: '示例1', args: ['[1,2,3,0,0,0]', '3', '[2,5,6]', '3'], expected: '[1,2,2,3,5,6]' },
      { label: '示例2', args: ['[1]', '1', '[]', '0'], expected: '[1]' },
      { label: '示例3', args: ['[0]', '0', '[1]', '1'], expected: '[1]' },
      { label: '攻击：nums1先耗尽', args: ['[4,5,6,0,0,0]', '3', '[1,2,3]', '3'], expected: '[1,2,3,4,5,6]' },
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
  { id: 27, title: '移除元素', slug: 'remove-element', difficulty: 'Easy', stage: 1, pattern: '双指针（快慢）', signal: '原地去重/删除', status: 'learned', testCases: [], history: [], nextReviewAt: '2026-08-20', srsLevel: 1, note: '快指针找值、慢指针收留' },
  { id: 26, title: '删除有序数组中的重复项', slug: 'remove-duplicates-from-sorted-array', difficulty: 'Easy', stage: 1, pattern: '双指针（快慢）', signal: '有序原地去重', status: 'mastered', testCases: [], history: [], srsLevel: 3 },
  { id: 1, title: '两数之和', slug: 'two-sum', difficulty: 'Easy', stage: 1, pattern: '哈希表', signal: '查重、两数配对', status: 'self-solved', testCases: [], history: [], srsLevel: 0, nextReviewAt: '2026-08-21', lastLang: 'python' },
  { id: 242, title: '有效的字母异位词', slug: 'valid-anagram', difficulty: 'Easy', stage: 1, pattern: '哈希表', signal: '计数比较', status: 'learned', testCases: [], history: [], nextReviewAt: '2026-08-21', srsLevel: 1, note: '26 个字母计数数组就够，不用真哈希' },
  { id: 125, title: '验证回文串', slug: 'valid-palindrome', difficulty: 'Easy', stage: 1, pattern: '双指针（相向）', signal: '两端向中间', status: 'learned', testCases: [], history: [], nextReviewAt: '2026-08-22', srsLevel: 1 },
  { id: 169, title: '多数元素', slug: 'majority-element', difficulty: 'Easy', stage: 1, pattern: '哈希表', signal: '计数找众数', status: 'new', testCases: [], history: [] },
  { id: 3, title: '无重复字符的最长子串', slug: 'longest-substring-without-repeating-characters', difficulty: 'Medium', stage: 1, pattern: '滑动窗口', signal: '连续子串 + 最长', status: 'new', testCases: [], history: [] },
  { id: 643, title: '子数组最大平均数 I', slug: 'maximum-average-subarray-i', difficulty: 'Easy', stage: 1, pattern: '滑动窗口', signal: '定长连续子数组', status: 'new', testCases: [], history: [] },
  { id: 424, title: '替换后的最长重复字符', slug: 'longest-repeating-character-replacement', difficulty: 'Medium', stage: 1, pattern: '滑动窗口', signal: '可变窗口 + 计数', status: 'new', testCases: [], history: [] },
  { id: 383, title: '赎金信', slug: 'ransom-note', difficulty: 'Easy', stage: 1, pattern: '哈希表', signal: '字符计数包含关系', status: 'new', testCases: [], history: [] },
  { id: 228, title: '汇总区间', slug: 'summary-ranges', difficulty: 'Easy', stage: 1, pattern: '区间', signal: '连续段归纳', status: 'new', testCases: [], history: [] },
  { id: 56, title: '合并区间', slug: 'merge-intervals', difficulty: 'Medium', stage: 1, pattern: '区间', signal: '区间重叠合并', status: 'new', testCases: [], history: [] },

  // ===== 阶段二：链表 + 栈 + 树 =====
  { id: 206, title: '反转链表', slug: 'reverse-linked-list', difficulty: 'Easy', stage: 2, pattern: '链表（指针翻转）', signal: 'prev/cur 双指针走链', status: 'learned', testCases: [], history: [], nextReviewAt: '2026-08-19', srsLevel: 1, note: 'prev=None 起，cur.next 先存后改' },
  { id: 141, title: '环形链表', slug: 'linked-list-cycle', difficulty: 'Easy', stage: 2, pattern: '链表（快慢指针）', signal: '判环', status: 'learned', testCases: [], history: [], nextReviewAt: '2026-08-19', srsLevel: 1 },
  { id: 21, title: '合并两个有序链表', slug: 'merge-two-sorted-lists', difficulty: 'Easy', stage: 2, pattern: '链表（dummy）', signal: '新链表头用虚拟节点', status: 'mastered', testCases: [], history: [], srsLevel: 3, note: 'dummy 免特判头节点' },
  { id: 2, title: '两数相加', slug: 'add-two-numbers', difficulty: 'Medium', stage: 2, pattern: '链表（dummy）', signal: '链表逐位运算 + 进位', status: 'new', testCases: [], history: [] },
  { id: 19, title: '删除链表的倒数第 N 个结点', slug: 'remove-nth-node-from-end-of-list', difficulty: 'Medium', stage: 2, pattern: '链表（快慢指针）', signal: '倒数第 K', status: 'new', testCases: [], history: [] },
  { id: 155, title: '最小栈', slug: 'min-stack', difficulty: 'Medium', stage: 2, pattern: '栈', signal: '辅助栈存历史最值', status: 'new', testCases: [], history: [] },
  { id: 232, title: '用栈实现队列', slug: 'implement-queue-using-stacks', difficulty: 'Easy', stage: 2, pattern: '栈', signal: '双栈倒腾', status: 'new', testCases: [], history: [] },
  { id: 104, title: '二叉树的最大深度', slug: 'maximum-depth-of-binary-tree', difficulty: 'Easy', stage: 2, pattern: '二叉树（递归）', signal: '递归三件套：当前层/往下传/往上传', status: 'learned', testCases: [], history: [], nextReviewAt: today, srsLevel: 0 },
  { id: 98, title: '验证二叉搜索树', slug: 'validate-binary-search-tree', difficulty: 'Medium', stage: 2, pattern: '二叉树（中序）', signal: 'BST 中序有序', status: 'pending-review', testCases: [], history: [], nextReviewAt: today, srsLevel: 0 },
  { id: 102, title: '二叉树的层序遍历', slug: 'binary-tree-level-order-traversal', difficulty: 'Medium', stage: 2, pattern: '二叉树（BFS）', signal: '层序 + 队列', status: 'new', testCases: [], history: [] },
  { id: 236, title: '二叉树的最近公共祖先', slug: 'lowest-common-ancestor-of-a-binary-tree', difficulty: 'Medium', stage: 2, pattern: '二叉树（递归）', signal: '左右子树分别找', status: 'new', testCases: [], history: [] },

  // ===== 阶段三：二分 + 图 + 堆 =====
  { id: 704, title: '二分查找', slug: 'binary-search', difficulty: 'Easy', stage: 3, pattern: '二分（模板）', signal: '有序 + 查找', status: 'self-solved', testCases: [], history: [], srsLevel: 0, nextReviewAt: '2026-08-20', lastLang: 'python' },
  { id: 74, title: '搜索二维矩阵', slug: 'search-a-2d-matrix', difficulty: 'Medium', stage: 3, pattern: '二分（模板）', signal: '二维展开当一维', status: 'new', testCases: [], history: [] },
  { id: 33, title: '搜索旋转排序数组', slug: 'search-in-rotated-sorted-array', difficulty: 'Medium', stage: 3, pattern: '二分（判断哪段有序）', signal: '旋转数组', status: 'new', testCases: [], history: [] },
  { id: 200, title: '岛屿数量', slug: 'number-of-islands', difficulty: 'Medium', stage: 3, pattern: '图（BFS/DFS）', signal: '连通块计数', status: 'pending-review', testCases: [], history: [], nextReviewAt: yesterday, srsLevel: 0, note: '访问过的格子要标记，否则死循环' },
  { id: 207, title: '课程表', slug: 'course-schedule', difficulty: 'Medium', stage: 3, pattern: '图（拓扑排序）', signal: '依赖关系判环', status: 'new', testCases: [], history: [] },
  { id: 347, title: '前 K 个高频元素', slug: 'top-k-frequent-elements', difficulty: 'Medium', stage: 3, pattern: '堆', signal: 'Top K', status: 'new', testCases: [], history: [] },
  { id: 215, title: '数组中的第K个最大元素', slug: 'kth-largest-element-in-an-array', difficulty: 'Medium', stage: 3, pattern: '堆', signal: '第 K 大/小', status: 'new', testCases: [], history: [] },

  // ===== 阶段四：DP + 贪心 + 回溯 =====
  { id: 70, title: '爬楼梯', slug: 'climbing-stairs', difficulty: 'Easy', stage: 4, pattern: '一维DP', signal: '方案数可拆分', status: 'learned', testCases: [], history: [], nextReviewAt: '2026-08-20', srsLevel: 1, note: '斐波那契，滚动两变量就够' },
  { id: 121, title: '买卖股票的最佳时机', slug: 'best-time-to-buy-and-sell-stock', difficulty: 'Easy', stage: 4, pattern: '一维DP', signal: '维护历史最值', status: 'mastered', testCases: [], history: [], srsLevel: 3 },
  { id: 122, title: '买卖股票的最佳时机 II', slug: 'best-time-to-buy-and-sell-stock-ii', difficulty: 'Medium', stage: 4, pattern: '贪心', signal: '所有上坡都吃', status: 'new', testCases: [], history: [] },
  { id: 55, title: '跳跃游戏', slug: 'jump-game', difficulty: 'Medium', stage: 4, pattern: '贪心', signal: '维护可达最远', status: 'new', testCases: [], history: [] },
  { id: 300, title: '最长递增子序列', slug: 'longest-increasing-subsequence', difficulty: 'Medium', stage: 4, pattern: '一维DP', signal: '以 i 结尾的最值', status: 'new', testCases: [], history: [] },
  { id: 322, title: '零钱兑换', slug: 'coin-change', difficulty: 'Medium', stage: 4, pattern: '完全背包DP', signal: '无限选取凑目标', status: 'new', testCases: [], history: [] },
  { id: 78, title: '子集', slug: 'subsets', difficulty: 'Medium', stage: 4, pattern: '回溯', signal: '所有子集：选/不选', status: 'pending-review', testCases: [], history: [], nextReviewAt: today, srsLevel: 0 },
  { id: 46, title: '全排列', slug: 'permutations', difficulty: 'Medium', stage: 4, pattern: '回溯', signal: '选择->递归->撤销', status: 'learned', testCases: [], history: [], nextReviewAt: '2026-08-21', srsLevel: 1 },
  { id: 22, title: '括号生成', slug: 'generate-parentheses', difficulty: 'Medium', stage: 4, pattern: '回溯', signal: '约束下生成所有方案', status: 'new', testCases: [], history: [] },

  // ===== 选做：多线程 =====
  { id: 1114, title: '按序打印', slug: 'print-in-order', difficulty: 'Easy', stage: 2, pattern: '多线程', signal: '—', status: 'new', optional: true, testCases: [], history: [] },
]

/** 默认设置（对应 PRD 第 6 节 settings） */
export const seedSettings: Settings = {
  ai: { baseUrl: 'https://api.deepseek.com', apiKey: '', model: 'deepseek-chat' },
  intervalsDays: [3, 7, 14],
  timeLimitMin: { easy: 15, medium: 25, hard: 25 },
  defaultLang: 'python',
}

/** 打卡热力图假数据：最近 17 周（119 天），值 0-4 表示当天做题数（F8 统计 V1.1 再真实化） */
export const seedHeatmap: number[] = Array.from({ length: 119 }, (_, i) => {
  // 用固定伪随机让原型每次刷新长得一样
  const v = (i * 2654435761) % 97
  if (i > 119 - 9) return v % 3 // 最近一周多刷一点
  return v < 62 ? 0 : (v % 4)
})

export const seedStats = {
  streakDays: 6,
  totalSolved: 17,
  reproducePassRate: 0.71,
  selfSolvedRate: 0.29,
}