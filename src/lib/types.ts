// 数据模型类型定义（与 PRD 第 6 节 db.json 模型对应，类型即文档）

export type Difficulty = 'Easy' | 'Medium' | 'Hard'

/** 四阶段路线（来自《刷题技巧.md》） */
export type Stage = 1 | 2 | 3 | 4

export type ProblemStatus =
  | 'new' // 未做过
  | 'in-progress' // 进行中
  | 'self-solved' // 自解通过（没看题解）
  | 'learned' // 看题解后默写通过
  | 'pending-review' // 默写失败 / 待复习（v1.2 改名：原 learning，消除与 learned 的一字母混淆）
  | 'reviewing' // 复习中
  | 'mastered' // 掌握（SRS 走完）
  | 'skipped' // 只看题解不刷（Hard 等）

export interface ProblemMeta {
  id: number // 题号
  title: string // 中文标题
  slug: string // LeetCode URL slug
  difficulty: Difficulty
  stage: Stage
  pattern: string // 套路
  signal?: string // 判断信号：什么时候用这个套路
  optional?: boolean // 选做（如多线程）
}

export interface TestCase {
  label: string
  args: string[] // 每个参数的 JSON 字面量（字符串形式）
  expected: string // 期望输出的 JSON 字面量
  outArg?: number // 原地修改型函数（如 88 merge 返回 None、结果在入参里）：结果在第几个入参，缺省则比返回值
}

/** 判题入口：F2 贴题时从 skeleton 解析存入。自由函数或 class Solution 方法 */
export interface EntrySpec {
  name: string // 入口名（如 merge）
  callType: 'function' | 'method' // function=自由函数，method=class Solution 方法
}

/** 按语言分存的判题入口 */
export type Entry = { python?: EntrySpec; javascript?: EntrySpec }

/**
 * 用户状态：db.json.problems 每条只存这些字段（+ id 作键）。
 * 元数据（title/slug/difficulty/stage/pattern/signal/optional）来自 problems.json，
 * 运行期由 store 合并进 Problem。未触碰的题不在 db 里，合并时补默认值。
 * F2 贴题时写入 statement/skeleton/solution/testCases/entry（见 S2-F2）。
 */
export interface ProblemUserState {
  id: number
  status: ProblemStatus
  history: AttemptHistory[]
  note?: string
  hintCard?: string
  srsLevel?: number
  nextReviewAt?: string
  lastCode?: { python?: string; javascript?: string }
  lastLang?: Lang
  // F2 用户内容（贴题写入）
  statement?: string
  skeleton?: { python?: string; javascript?: string }
  solution?: string
  testCases?: TestCase[]
  entry?: Entry
}

export interface AttemptHistory {
  ts: string
  phase: 'attempt' | 'reproduce' | 'review'
  outcome: 'pass' | 'fail' | 'timeout'
  elapsedMin: number
  pausedMin: number
  peekCount: number
  lang: 'python' | 'javascript'
}

/**
 * 完整题：元数据（problems.json）+ 用户状态（db.json）运行期合并。
 * `testCases` 在合并层补默认 `[]`，故此处 required（ProblemUserState 里是可选）。
 */
export type Problem = ProblemMeta & Omit<ProblemUserState, 'testCases'> & {
  testCases: TestCase[]
}

export type Lang = 'python' | 'javascript'

export interface AISettings {
  baseUrl: string
  apiKey: string
  model: string
}

export interface Settings {
  ai: AISettings
  intervalsDays: number[] // SRS 间隔序列，如 [3, 7, 14]
  timeLimitMin: { easy: number; medium: number; hard: number }
  defaultLang: Lang // 新题/无 lastLang 时的默认语言
}

export const STATUS_LABEL: Record<ProblemStatus, string> = {
  new: '未做',
  'in-progress': '进行中',
  'self-solved': '自解',
  learned: '已默写',
  'pending-review': '待复习',
  reviewing: '复习中',
  mastered: '已掌握',
  skipped: '已跳过',
}

export const STAGE_INFO: Record<Stage, { title: string; theme: string }> = {
  1: { title: '阶段一 · 线性结构打底', theme: '数组/字符串/双指针/滑窗/哈希' },
  2: { title: '阶段二 · 链表栈树', theme: '链表/栈/队列/二叉树/BST' },
  3: { title: '阶段三 · 二分图堆', theme: '二分查找/矩阵/图/堆' },
  4: { title: '阶段四 · DP贪心回溯', theme: '动态规划/贪心/回溯' },
}

export const leetcodeUrl = (p: { slug: string }) =>
  `https://leetcode.cn/problems/${p.slug}/description/`
