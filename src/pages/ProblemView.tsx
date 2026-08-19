import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft, BookOpen, CheckCircle2, Eye, EyeOff, ExternalLink,
  Lightbulb, Maximize2, Minimize2, PenLine, Play, Sparkles, Upload, XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Timer } from '@/components/Timer'
import { CodeEditor } from '@/components/CodeEditor'
import { TestCaseEditor } from '@/components/TestCaseEditor'
import { useProblem, useProblems, useUpdateProblem, useSettings } from '@/lib/store'
import { STATUS_LABEL, leetcodeUrl, type AttemptHistory, type Lang, type TestCase } from '@/lib/types'
import { parseEntry } from '@/lib/entry'
import { parseMdFile, parseExamples } from '@/lib/import'
import { failSchedule, passSchedule, REVIEWABLE_STATUSES, todayStr } from '@/lib/srs'
import { useAttemptTimer } from '@/lib/useAttemptTimer'
import { runCases as runJudgeCases, type CaseResult } from '@/lib/judge/runner'
import { cn } from '@/lib/utils'

type Phase = 'paste' | 'attempt' | 'solution' | 'reproduce' | 'done'

// 原型演示：AI 分层提示的假数据（对应「找入口三步法」）
const DEMO_HINTS = [
  '别想代码，先手算：合并 [1,2,3] 和 [2,5,6]，像小学生排座位一样做一遍。你刚才重复的动作是什么？',
  '观察你的动作：两只手各指一个数组，每次比较两边的数、放下较小的、那边的手往后移一格。这就是双指针。',
  '陷阱来了：从前往后填会覆盖 nums1 还没用的数据。问自己：nums1 里哪些格子绝对不会被碰？-- 尾巴那 n 个 0。反过来，从后往前填。',
]

export default function ProblemView() {
  const { id } = useParams()
  const problem = useProblem(Number(id))
  const updateProblem = useUpdateProblem()
  const settings = useSettings()
  // 题库合法题号集合：批量导入时先校验再计数/落库（store 会忽略不存在的题，但计数不能虚高）
  const allProblems = useProblems()
  const validIds = useMemo(() => new Set(allProblems.map((p) => p.id)), [allProblems])

  // 到期复习直进默写（S4-F4）：已贴题 + nextReviewAt<=今天 + 状态可复习 → 直接 reproduce，
  // 不重看题解。首次默写则从 solution 态进（enterReproduce），history phase='reproduce'；
  // 复习默写 history phase='review'（A3 区分、F8 据此统计）。
  const isReviewEntry =
    !!problem?.statement &&
    !!problem?.nextReviewAt &&
    problem.nextReviewAt <= todayStr() &&
    REVIEWABLE_STATUSES.has(problem.status)
  const [phase, setPhase] = useState<Phase>(() =>
    isReviewEntry ? 'reproduce' : (problem?.statement ? 'attempt' : 'paste'),
  )
  // 本次默写记进 history 的 phase：复习入口='review'，其余='reproduce'（首次默写）
  const [reproducePhaseTag, setReproducePhaseTag] = useState<'reproduce' | 'review'>(() =>
    isReviewEntry ? 'review' : 'reproduce',
  )
  // 本次默写是否已结算：笔记弹窗为必经步，任何途径回到 reproduce 都不得二次结算
  const settledRef = useRef(false)
  // 进入时是否为自解复习（mount 快照）：复习中 effect 对 self-solved 不覆盖（见下），
  // 故暂停/恢复后 status 仍是 self-solved，快照始终为真 → 通过保持 self-solved；
  // 一旦失败 status 被改成 pending-review，下次进入快照为假 → 通过变 learned（失败即降级，不再恢复）。
  const [entryWasSelfSolved, setEntryWasSelfSolved] = useState(() =>
    isReviewEntry && problem?.status === 'self-solved',
  )
  // 默认语言：优先上次用的，其次用户设置 defaultLang，最后兜底 python
  // （types 注释：defaultLang = 新题/无 lastLang 时的默认语言；原先硬编码 python 会无视设置）
  const [lang, setLang] = useState<Lang>(problem?.lastLang ?? settings.defaultLang ?? 'python')
  const [code, setCode] = useState(problem?.skeleton?.[lang] ?? '')
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<Record<string, CaseResult> | null>(null)
  const [hintLevel, setHintLevel] = useState(0)
  const [hintOpen, setHintOpen] = useState(false)
  const [peekCount, setPeekCount] = useState(0)
  const [peekOpen, setPeekOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState(problem?.note ?? '')
  const [noteOutcome, setNoteOutcome] = useState<'pass' | 'fail'>('pass')
  const [zen, setZen] = useState(false)
  const [zenStatementOpen, setZenStatementOpen] = useState(false)
  const [timeUpMsg, setTimeUpMsg] = useState<string | null>(null)

  // 贴题面板暂存（S2-F2）：本地 state，点「贴好了」一次性 updateProblem（含 entry）
  const [pasteStatement, setPasteStatement] = useState(problem?.statement ?? '')
  const [pasteSkeletonPy, setPasteSkeletonPy] = useState(problem?.skeleton?.python ?? '')
  const [pasteSkeletonJs, setPasteSkeletonJs] = useState(problem?.skeleton?.javascript ?? '')
  const [pasteSolution, setPasteSolution] = useState(problem?.solution ?? '')
  const [pasteCases, setPasteCases] = useState<TestCase[]>(problem?.testCases ?? [])
  const [importMsg, setImportMsg] = useState<string | null>(null)
  // attempt 阶段状态（S3-F3）
  const [notice, setNotice] = useState<string | null>(null) // 无题解兜底等内联提示
  const [doneKind, setDoneKind] = useState<'reproduce' | 'self-solved' | 'skipped'>('reproduce') // 完成态分支
  // 贴题面板折叠区：另一种语言模板 / 题解 / 手动调整用例（技术细节默认藏起来）
  const [showOtherLang, setShowOtherLang] = useState(false)
  const [showSolution, setShowSolution] = useState(false)
  const [showManualCases, setShowManualCases] = useState(false)

  // 题面变化时自动从「输入：/输出：」示例解析用例（仅当前无用例时，避免覆盖手动编辑）。
  // 比 AI 提取更准——正则不会瞎编具体数值；AI 补全属 V1.1（F7），不在此做。
  useEffect(() => {
    if (pasteCases.length > 0) return
    const t = window.setTimeout(() => {
      const c = parseExamples(pasteStatement)
      if (c.length) setPasteCases(c)
    }, 400)
    return () => window.clearTimeout(t)
  }, [pasteStatement, pasteCases.length])

  // 专注模式下 Esc 退出
  useEffect(() => {
    if (!zen) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setZen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [zen])

  // 进入 attempt 置 in-progress（S3-F3）：仅从 new 进入时置，不覆盖已自解/已掌握/复习中等状态
  useEffect(() => {
    if (problem && phase === 'attempt' && problem.status === 'new') {
      updateProblem(problem.id, { status: 'in-progress' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  // 复习入口进默写置 reviewing（S4-F4）：到期复习直进 reproduce 时置，标识「正在复习这题」。
  // 关键：self-solved 不覆盖——否则持久化后暂停/恢复会丢失自解标记，结算降级成 learned。
  // 自解题复习时保持 self-solved（badge 显示自解，仍在复习队列里），通过结算再判定升/降级。
  // 失败由 onReproduceFail 改成 pending-review，故「失败即降级」靠 status 离开 self-solved 实现。
  useEffect(() => {
    if (
      problem &&
      phase === 'reproduce' &&
      isReviewEntry &&
      problem.status !== 'reviewing' &&
      problem.status !== 'self-solved'
    ) {
      updateProblem(problem.id, { status: 'reviewing' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase])

  if (!problem) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        题目不存在，<Link to="/problems" className="underline">返回题单</Link>
      </div>
    )
  }

  // 切语言：仅默写模式清空为骨架签名；尝试阶段保留用户已写代码，不覆盖（v1.2 修订）
  const switchLang = (l: Lang) => {
    setLang(l)
    setCode((prev) => (phase === 'reproduce' ? problem.skeleton?.[l] ?? '' : prev))
    setResults(null)
    updateProblem(problem.id, { lastLang: l })
  }

  // 当前语言的判题入口；无 entry（未贴题 / 多线程）则禁用运行
  const entry = problem.entry?.[lang]
  const canRun = !!entry && problem.testCases.length > 0

  // 真判题（S0-judge）：Python 走 Pyodide、JS 走 Web Worker，主线程宽松比对。
  const runCases = async () => {
    if (!entry) return
    setRunning(true)
    setResults(null)
    try {
      const res = await runJudgeCases({
        lang,
        code,
        entry,
        testCases: problem.testCases,
        onProgress: (_i, r) =>
          setResults((prev) => ({ ...prev, [r.label]: r })),
      })
      setResults(Object.fromEntries(res.map((r) => [r.label, r])))
    } catch (err) {
      // 执行器加载/启动失败：整批标记错误，UI 仍可用
      console.error('[judge] runCases 失败：', err)
      setResults(
        Object.fromEntries(
          problem.testCases.map((tc) => [
            tc.label,
            {
              label: tc.label,
              status: 'error' as const,
              pass: false,
              actual: `判题器错误：${(err as Error)?.message ?? err}`,
              expected: tc.expected,
              elapsedMs: 0,
            } satisfies CaseResult,
          ]),
        ),
      )
    } finally {
      setRunning(false)
    }
  }

  const allPass =
    results && problem.testCases.every((tc) => results[tc.label]?.pass)

  // done 屏失败分支用：距下次复习的天数（从 nextReviewAt 推算，与 intervalsDays 解耦，
  // 改设置后展示仍与实际排期一致）。失败当下 = intervalsDays[0]，跨天看 done 也准确。
  const reviewInDays = problem.nextReviewAt
    ? Math.max(1, Math.round(
        (new Date(problem.nextReviewAt + 'T00:00:00').getTime() - new Date(todayStr() + 'T00:00:00').getTime()) / 86_400_000,
      ))
    : null

  const enterReproduce = () => {
    setPhase('reproduce')
    setReproducePhaseTag('reproduce') // 从 solution 态进 = 首次默写
    setEntryWasSelfSolved(false) // 本轮看过题解，通过算 learned 而非保持 self-solved
    settledRef.current = false // 新一轮默写，结算守卫复位
    setCode(problem.skeleton?.[lang] ?? '')
    setResults(null)
    setPeekCount(0)
    setTimeUpMsg(null)
  }

  const openNote = (outcome: 'pass' | 'fail') => {
    setNoteOutcome(outcome)
    setNoteOpen(true)
  }

  // 保存一句话笔记（S5）：非空才写库（trim 后），转 done。结算已在通过/失败时完成。
  const saveNote = () => {
    const trimmed = note.trim()
    if (trimmed) updateProblem(problem.id, { note: trimmed })
    setNoteOpen(false)
    setDoneKind('reproduce')
    setPhase('done')
  }

  // 跳过笔记（S5-F5）：不写库（保留已有 note 不擦除），直接转 done
  const skipNote = () => {
    setNoteOpen(false)
    setDoneKind('reproduce')
    setPhase('done')
  }

  // ===== S4-F4 默写结算 =====
  // 记一次默写历史：phase 用 reproducePhaseTag（首次=reproduce / 复习=review），带本次偷看次数
  const recordReproduce = (outcome: 'pass' | 'fail') => {
    const entry: AttemptHistory = {
      ts: new Date().toISOString(),
      phase: reproducePhaseTag,
      outcome,
      elapsedMin: Math.round((timer.elapsedSec / 60) * 10) / 10,
      pausedMin: Math.round((timer.pausedSec / 60) * 10) / 10,
      peekCount,
      lang,
    }
    updateProblem(problem.id, { history: [...problem.history, entry] })
  }

  // 默写通过（S4-F4）：首次→learned，自解复习通过→保持 self-solved，达上限→mastered；调 S6 排期
  const onReproducePass = () => {
    if (!allPass || settledRef.current) return
    settledRef.current = true
    setZen(false) // 从专注模式结算：退出 zen，让笔记弹窗落在普通层而非叠在全屏编辑器上
    const sched = passSchedule(problem.srsLevel, settings.intervalsDays, todayStr())
    recordReproduce('pass')
    const status = sched.mastered
      ? 'mastered'
      : entryWasSelfSolved ? 'self-solved' : 'learned'
    updateProblem(problem.id, {
      status,
      srsLevel: sched.srsLevel,
      ...(sched.nextReviewAt ? { nextReviewAt: sched.nextReviewAt } : {}),
      lastLang: lang,
    })
    openNote('pass')
  }

  // 默写失败（S4-F4）：pending-review + srsLevel 重置 0 + 排 intervalsDays[0] 天（默认 3）
  const onReproduceFail = () => {
    if (settledRef.current) return
    settledRef.current = true
    const sched = failSchedule(settings.intervalsDays, todayStr())
    recordReproduce('fail')
    updateProblem(problem.id, {
      status: 'pending-review',
      srsLevel: sched.srsLevel,
      nextReviewAt: sched.nextReviewAt,
      lastLang: lang,
    })
    openNote('fail')
  }

  // ===== S3-F3 attempt 持久化 =====
  // 记录一次 attempt 历史（离开 attempt 阶段时调用）：含暂停时长，peekCount 恒 0（偷看属默写阶段）
  const recordAttempt = (outcome: 'pass' | 'fail' | 'timeout') => {
    const entry: AttemptHistory = {
      ts: new Date().toISOString(),
      phase: 'attempt',
      outcome,
      elapsedMin: Math.round((timer.elapsedSec / 60) * 10) / 10,
      pausedMin: Math.round((timer.pausedSec / 60) * 10) / 10,
      peekCount: 0,
      lang,
    }
    updateProblem(problem.id, { history: [...problem.history, entry] })
  }

  // 自解通过：status=self-solved，调 S6 排期；达间隔上限 → mastered（与 onReproducePass 一致）
  const selfSolved = () => {
    if (!allPass) return
    const sched = passSchedule(problem.srsLevel, settings.intervalsDays, todayStr())
    recordAttempt('pass')
    updateProblem(problem.id, {
      status: sched.mastered ? 'mastered' : 'self-solved',
      srsLevel: sched.srsLevel,
      ...(sched.nextReviewAt ? { nextReviewAt: sched.nextReviewAt } : {}),
      lastLang: lang,
    })
    setDoneKind('self-solved')
    setPhase('done')
  }

  // 看题解：本地无题解 → V1.0 兜底提示，停在 attempt；有则记一次历史后进 solution 态。
  // outcome：已超时才来看题解 → 'timeout'（卡到点放弃）；未超时主动看 → 'fail'。
  // 超时不锁界面、用户可能继续写后自解，那条路径走 selfSolved 记 'pass'，不在此处。
  const seeSolution = () => {
    if (!problem.solution) {
      setNotice('暂无题解，请手动粘贴（V1.1 起 AI 可生成）')
      return
    }
    setNotice(null)
    setTimeUpMsg(null)
    recordAttempt(timer.overtime ? 'timeout' : 'fail')
    setPhase('solution')
  }

  // 只看题解不刷（Hard 等）：status=skipped，不进默写、不排期
  // 显式清 nextReviewAt：从 pending-review 等带排期的状态转入 skipped 时，残留的复习日期必须抹掉
  const skipProblem = () => {
    updateProblem(problem.id, { status: 'skipped', lastLang: lang, nextReviewAt: undefined })
    setDoneKind('skipped')
    setPhase('done')
  }

  // 贴题保存（S2-F2）：对已粘贴的每种语言 skeleton 分别解析 entry，按语言分存；
  // 连同题面/模板/题解/用例一次性落库，然后进尝试阶段。
  const savePaste = () => {
    if (!problem) return
    // 首次贴题（此前无题面）才把编辑器预载为模板签名；从刷题阶段回来补用例则保留用户已写代码
    const firstPaste = !problem.statement
    const skeleton = { python: pasteSkeletonPy, javascript: pasteSkeletonJs }
    const entry = {
      ...(pasteSkeletonPy.trim() ? { python: parseEntry(pasteSkeletonPy, 'python') } : {}),
      ...(pasteSkeletonJs.trim() ? { javascript: parseEntry(pasteSkeletonJs, 'javascript') } : {}),
    }
    updateProblem(problem.id, {
      statement: pasteStatement,
      skeleton,
      solution: pasteSolution || undefined,
      // 兜底：自动解析若未及时触发（用户贴完立刻点贴好了），保存前再解析一次
      testCases: pasteCases.length ? pasteCases : parseExamples(pasteStatement),
      entry,
    })
    if (firstPaste) setCode(lang === 'python' ? pasteSkeletonPy : pasteSkeletonJs)
    setPhase('attempt')
  }

  // 逃生口（S2-F2 死锁修复）：刷题阶段题头「编辑题目」回到贴题面板，回填当前题字段，
  // 便于补用例 / 改题面。默写阶段不开放（避免借机看题解）。
  const editProblem = () => {
    if (!problem) return
    setPasteStatement(problem.statement ?? '')
    setPasteSkeletonPy(problem.skeleton?.python ?? '')
    setPasteSkeletonJs(problem.skeleton?.javascript ?? '')
    setPasteSolution(problem.solution ?? '')
    setPasteCases(problem.testCases ?? [])
    setImportMsg(null)
    setPhase('paste')
  }

  // 从题面文本解析示例用例，填入用例表（覆盖现有草稿）。
  const fillCasesFromStatement = () => {
    const cases = parseExamples(pasteStatement)
    if (!cases.length) {
      setImportMsg('未从题面解析到示例用例（需「输入：…/输出：…」格式），可手动添加')
      return
    }
    // 已有用例时二次确认，避免草稿静默覆盖手填内容
    if (
      pasteCases.length &&
      !window.confirm(`将用 ${cases.length} 条解析草稿覆盖现有 ${pasteCases.length} 条用例，继续？`)
    ) {
      return
    }
    setPasteCases(cases)
    setImportMsg(`从题面解析出 ${cases.length} 条用例草稿`)
  }

  // 批量导入：多选 .md 笔记，按文件名题号匹配题库并直接落库。
  // 当前题若被命中，同步回填面板字段供进一步微调。
  const onBatchImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    let imported = 0
    let skipped = 0
    let hitCurrent = false
    for (const file of Array.from(files)) {
      let text: string
      try {
        text = await file.text()
      } catch (err) {
        console.error('[import] 读取失败：', file.name, err)
        skipped++
        continue
      }
      const parsed = parseMdFile(file.name, text, settings.defaultLang)
      if (!parsed) { skipped++; continue }
      // 题库里无此题号 → 跳过（不落库也不计数）
      if (!validIds.has(parsed.id)) { skipped++; continue }
      const entry = {
        ...(parsed.skeleton.python?.trim() ? { python: parseEntry(parsed.skeleton.python, 'python') } : {}),
        ...(parsed.skeleton.javascript?.trim() ? { javascript: parseEntry(parsed.skeleton.javascript, 'javascript') } : {}),
      }
      updateProblem(parsed.id, {
        statement: parsed.statement,
        skeleton: parsed.skeleton,
        testCases: parsed.testCases,
        entry,
      })
      imported++
      if (problem && parsed.id === problem.id) {
        hitCurrent = true
        setPasteStatement(parsed.statement)
        setPasteSkeletonPy(parsed.skeleton.python ?? '')
        setPasteSkeletonJs(parsed.skeleton.javascript ?? '')
        setPasteCases(parsed.testCases)
      }
    }
    setImportMsg(`导入 ${imported} 题${skipped ? `，跳过 ${skipped} 个未匹配` : ''}${hitCurrent ? '（含当前题，已回填）' : ''}`)
  }

  // 计时状态提升到 hook（S3-F3）：主视图与专注模式共享，避免双实例不同步；
  // elapsedSec/pausedSec 用于写 history。resetKey=phase：切阶段重置。
  // 时长来自 settings.timeLimitMin（spec「可配置」）：db.json 改了即生效；旧 db 缺字段时兜底 25
  const diffKey = problem.difficulty.toLowerCase() as 'easy' | 'medium' | 'hard'
  const limitMin = settings.timeLimitMin?.[diffKey] ?? 25
  const timer = useAttemptTimer(limitMin, phase, () =>
    setTimeUpMsg(
      phase === 'reproduce'
        ? '默写时间到 -- 尽力就好，写不出就记一次失败，3 天后再战'
        : '时间到 -- 卡住就停，不死磕是纪律，看看题解？',
    ),
  )
  // 重置计时同时清超时文案（避免重置后旧「时间到」残留、firedRef 复位后重复触发）
  const resetTimer = () => { timer.reset(); setTimeUpMsg(null) }
  const timerLabel = phase === 'reproduce' ? '默写限时' : '尝试限时'

  const md = (text: string) => (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        h2: ({ children }) => <h2 className="mb-2 mt-5 text-base font-bold first:mt-0">{children}</h2>,
        h3: ({ children }) => <h3 className="mb-1 mt-4 text-sm font-bold">{children}</h3>,
        p: ({ children }) => <p className="mb-2 text-sm leading-relaxed">{children}</p>,
        li: ({ children }) => <li className="mb-1 text-sm leading-relaxed">{children}</li>,
        pre: ({ children }) => (
          <pre className="my-2 overflow-x-auto rounded-lg bg-muted p-3 text-xs leading-relaxed">{children}</pre>
        ),
        code: ({ children, className }) => (
          <code className={cn('font-mono text-xs', className?.includes('language-') ? '' : 'rounded bg-muted px-1 py-0.5')}>
            {children}
          </code>
        ),
        strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
      }}
    >
      {text}
    </ReactMarkdown>
  )

  const inFlow = phase === 'attempt' || phase === 'reproduce'
  // 可回贴题面板编辑的阶段：默写(reproduce)不开放，避免借机看题解
  const canEdit = phase === 'attempt' || phase === 'solution' || phase === 'done'
  // 模板默认只显示用户默认语言，另一种折叠（多数人只用一种）
  const primaryLang = settings.defaultLang
  const otherLang: Lang = primaryLang === 'python' ? 'javascript' : 'python'
  const primarySkeleton = primaryLang === 'python' ? pasteSkeletonPy : pasteSkeletonJs
  const setPrimarySkeleton = primaryLang === 'python' ? setPasteSkeletonPy : setPasteSkeletonJs
  const otherSkeleton = otherLang === 'python' ? pasteSkeletonPy : pasteSkeletonJs
  const setOtherSkeleton = otherLang === 'python' ? setPasteSkeletonPy : setPasteSkeletonJs

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      {/* 顶栏：只留必需品 -- 返回 / 标题 / 编辑题目 / 安静的时钟 */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/problems"><ArrowLeft className="size-4" /></Link>
        </Button>
        <h1 className="truncate text-lg font-bold">
          <span className="font-mono text-muted-foreground">#{problem.id}</span> {problem.title}
        </h1>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {canEdit && (
            <Button variant="ghost" size="sm" onClick={editProblem} title="回到贴题面板编辑题面/模板/用例">
              <PenLine className="size-3.5" /> 编辑题目
            </Button>
          )}
          {inFlow && (
            <Timer
              remainSec={timer.remainSec}
              paused={timer.paused}
              overtime={timer.overtime}
              label={timerLabel}
              onTogglePause={timer.togglePause}
              onReset={resetTimer}
            />
          )}
        </div>
      </div>

      {/* 时间到的轻提醒：不弹窗、不拦截，只是温柔地说一句 */}
      {timeUpMsg && inFlow && (
        <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          {timeUpMsg}
        </div>
      )}

      {/* ===== 贴题面板（S2-F2）===== */}
      {phase === 'paste' && (
        <div className="mx-auto max-w-2xl space-y-4 rounded-xl border bg-card p-6">
          <div>
            <h2 className="text-lg font-bold">首次打开，先贴题 📋</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              把 LeetCode 题目描述（含示例）整段粘进来，用例会自动识别；再贴代码模板就能开始。
            </p>
          </div>

          {/* ① 题面（唯一必填）—— 用例自动从「输入：/输出：」示例解析 */}
          <div className="space-y-1.5">
            <div className="text-sm font-medium">① 题面（整段复制 LeetCode 描述，含示例）</div>
            <Textarea
              value={pasteStatement}
              onChange={(e) => setPasteStatement(e.target.value)}
              placeholder={'粘贴 LeetCode 题目描述 + 示例…\n用例会从「输入：…/输出：…」自动识别，无需手填。'}
              rows={8}
            />
            {pasteCases.length > 0 ? (
              <div className="rounded-lg bg-muted/40 p-2 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="mr-1 inline size-3.5" />
                    已从示例识别 {pasteCases.length} 条用例
                  </span>
                  <Button variant="ghost" size="sm" onClick={fillCasesFromStatement} title="重新从题面示例解析">
                    重新解析
                  </Button>
                </div>
                <ul className="mt-1 space-y-0.5 font-mono text-muted-foreground">
                  {pasteCases.map((tc) => (
                    <li key={tc.label} className="truncate">
                      {tc.label}：输入 {tc.args.join(', ')} → 期望 {tc.expected}
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              pasteStatement.trim() && (
                <p className="text-xs text-muted-foreground">
                  未识别到「输入：…/输出：…」示例，可点下面「手动调整用例」补，或直接贴好开始。
                </p>
              )
            )}
          </div>

          {/* ② 代码模板（默认只显示用户默认语言，另一种折叠） */}
          <div className="space-y-1.5">
            <div className="text-sm font-medium">
              ② 代码模板（{primaryLang === 'python' ? 'Python' : 'JavaScript'}）
            </div>
            <Textarea
              value={primarySkeleton}
              onChange={(e) => setPrimarySkeleton(e.target.value)}
              placeholder={primaryLang === 'python' ? 'def majorityElement(nums):…' : 'var majorityElement = function(nums) {'}
              rows={5}
              className="font-mono text-xs"
            />
            <button
              type="button"
              className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setShowOtherLang((v) => !v)}
            >
              {showOtherLang ? '▾' : '▸'} 也填 {otherLang === 'python' ? 'Python' : 'JavaScript'} 模板（可选）
            </button>
            {showOtherLang && (
              <Textarea
                value={otherSkeleton}
                onChange={(e) => setOtherSkeleton(e.target.value)}
                placeholder={otherLang === 'python' ? 'def majorityElement(nums):…' : 'var majorityElement = function(nums) {'}
                rows={5}
                className="font-mono text-xs"
              />
            )}
          </div>

          {/* ③ 题解（折叠，可稍后补） */}
          <div className="space-y-1.5">
            <button
              type="button"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setShowSolution((v) => !v)}
            >
              {showSolution ? '▾' : '▸'} ③ 题解（可稍后补）
            </button>
            {showSolution && (
              <Textarea
                value={pasteSolution}
                onChange={(e) => setPasteSolution(e.target.value)}
                placeholder="粘贴官方/社区题解…"
                rows={4}
              />
            )}
          </div>

          {/* ④ 手动调整用例（折叠——技术细节藏这里，正常无需打开） */}
          <div className="space-y-1.5">
            <button
              type="button"
              className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() => setShowManualCases((v) => !v)}
            >
              {showManualCases ? '▾' : '▸'} 手动调整用例（高级：改参数/期望；原地修改型题在此选「入参N」）
            </button>
            {showManualCases && (
              <div className="rounded-lg border p-2">
                <TestCaseEditor testCases={pasteCases} onChange={setPasteCases} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground">
              <Upload className="size-3.5" /> 批量导入笔记（.md）
              <input
                type="file"
                multiple
                accept=".md,text/markdown"
                className="hidden"
                onChange={(e) => {
                  void onBatchImport(e.target.files)
                  e.target.value = '' // 重置，允许重选同一批文件
                }}
              />
            </label>
            <Button onClick={savePaste}>贴好了，开始刷题</Button>
          </div>
          {importMsg && <p className="text-xs text-muted-foreground">{importMsg}</p>}
        </div>
      )}

      {/* ===== 刷题三态 ===== */}
      {inFlow && (
        <div className="grid gap-4 lg:grid-cols-2">
          {/* 左：题面 / 题解 */}
          <div className="rounded-xl border bg-card p-5">
            {phase === 'reproduce' ? (
              <>
                <div className="mb-3 flex items-center gap-2">
                  <EyeOff className="size-4 text-amber-500" />
                  <span className="text-sm font-bold">默写模式 · 题解已收起</span>
                </div>
                {problem.note && (
                  <div className="mb-3 rounded-lg border border-dashed bg-amber-500/5 p-3 text-sm">
                    <span className="font-medium">你的笔记：</span>
                    <span className="text-muted-foreground">{problem.note}</span>
                  </div>
                )}
                <div className="max-h-[520px] overflow-y-auto pr-2">{md(problem.statement ?? '')}</div>
                <Button
                  variant="outline"
                  className="mt-4 w-full"
                  onClick={() => {
                    setPeekCount((c) => c + 1)
                    setPeekOpen(true)
                  }}
                >
                  <Eye className="size-4" /> 我承认忘了，偷看一眼题解
                  {peekCount > 0 && <Badge variant="destructive" className="ml-1">已偷看 {peekCount} 次</Badge>}
                </Button>
                <p className="mt-2 text-center text-xs text-muted-foreground">
                  允许偷看，但会如实记录 -- 工具不撒谎
                </p>
              </>
            ) : (
              <>
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <BookOpen className="size-4" />
                  <span className="text-sm font-bold">题目 · {problem.difficulty}</span>
                  <Badge variant="outline">{problem.pattern}</Badge>
                  <Badge variant="secondary">{STATUS_LABEL[problem.status]}</Badge>
                  <a
                    href={leetcodeUrl(problem)}
                    target="_blank"
                    rel="noreferrer"
                    title="LeetCode 题目页"
                    className="ml-auto flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  >
                    LeetCode <ExternalLink className="size-3" />
                  </a>
                </div>
                <div className="max-h-[600px] overflow-y-auto pr-2">{md(problem.statement ?? '')}</div>
              </>
            )}
          </div>

          {/* 右：编辑器 + 用例 + 操作 */}
          <div className="space-y-4">
            <div className="overflow-hidden rounded-xl border">
              <div className="flex items-center justify-between border-b bg-muted/50 px-3 py-1.5">
                <div className="flex gap-1">
                  {(['python', 'javascript'] as Lang[]).map((l) => (
                    <button
                      key={l}
                      onClick={() => switchLang(l)}
                      className={cn(
                        'rounded px-2.5 py-1 text-xs font-medium',
                        lang === l ? 'bg-background shadow-sm' : 'text-muted-foreground',
                      )}
                    >
                      {l === 'python' ? 'Python' : 'JavaScript'}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  {phase === 'reproduce' && (
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">默写中 · 只留了签名</span>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7"
                    title="专注模式（全屏编辑器，Esc 退出）"
                    onClick={() => setZen(true)}
                  >
                    <Maximize2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              <CodeEditor value={code} onChange={setCode} lang={lang} height="300px" />
            </div>

            {/* 用例表 */}
            {problem.testCases.length > 0 && (
              <div className="rounded-xl border">
                <div className="flex items-center justify-between border-b px-3 py-2">
                  <span className="text-sm font-bold">测试用例（{problem.testCases.length}）</span>
                  <Button
                    size="sm"
                    onClick={runCases}
                    disabled={!canRun || running}
                    title={!entry ? '该语言未识别判题入口（未贴题 / 多线程题）' : ''}
                  >
                    <Play className="size-3.5" /> {running ? '运行中…' : '运行用例'}
                  </Button>
                </div>
                <div className="max-h-56 overflow-y-auto">
                  {problem.testCases.map((tc) => {
                    const r = results?.[tc.label]
                    return (
                      <div key={tc.label} className="border-b px-3 py-2 text-xs last:border-b-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-medium">{tc.label}</span>
                          {r ? (
                            r.status === 'pass' ? (
                              <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                <CheckCircle2 className="size-3.5" /> 通过 · {Math.round(r.elapsedMs)}ms
                              </span>
                            ) : r.status === 'timeout' ? (
                              <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                                <XCircle className="size-3.5" /> 超时
                              </span>
                            ) : (
                              <span className="flex items-center gap-1 text-red-600 dark:text-red-400">
                                <XCircle className="size-3.5" /> {r.status === 'error' ? '错误' : '失败'}
                              </span>
                            )
                          ) : (
                            <span className="text-muted-foreground">未运行</span>
                          )}
                        </div>
                        <div className="mt-1 font-mono text-muted-foreground">
                          输入 {tc.args.join(', ')}
                          <br />
                          期望 {tc.expected}
                          {r && (
                            <>
                              <br />
                              <span
                                className={cn(
                                  r.status === 'pass'
                                    ? 'text-emerald-600 dark:text-emerald-400'
                                    : r.status === 'timeout'
                                      ? 'text-amber-600 dark:text-amber-400'
                                      : 'text-red-600 dark:text-red-400',
                                )}
                              >
                                {r.status === 'pass' ? '实际' : r.status === 'timeout' ? '结果' : r.status === 'error' ? '错误' : '实际'} {r.actual}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
                <p className="px-3 py-1.5 text-[11px] text-muted-foreground">
                  真判题：Python 走本地 Pyodide、JS 走 Web Worker，单条 5s 超时
                </p>
              </div>
            )}

            {/* 阶段操作区 */}
            {phase === 'attempt' && (
              <div className="space-y-3">
                {notice && (
                  <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                    {notice}
                  </div>
                )}
                {hintOpen && (
                  <div className="rounded-xl border border-blue-500/40 bg-blue-500/5 p-3">
                    <div className="mb-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Sparkles className="size-3.5 text-blue-500" />
                      AI 教练 · 第 {Math.min(hintLevel, 3)} 层提示（原型演示，P1 功能）
                    </div>
                    <p className="text-sm leading-relaxed">
                      {DEMO_HINTS[Math.min(hintLevel, 3) - 1]}
                    </p>
                    {hintLevel < 3 ? (
                      <Button variant="outline" size="sm" className="mt-2" onClick={() => setHintLevel((l) => l + 1)}>
                        还是卡着，再要一层
                      </Button>
                    ) : (
                      <p className="mt-2 text-xs text-muted-foreground">三层用完了 -- 卡住就停，建议转「看题解」</p>
                    )}
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {!hintOpen ? (
                    <Button variant="outline" onClick={() => { setHintOpen(true); setHintLevel(1) }}>
                      <Lightbulb className="size-4" /> 给个提示（不给答案）
                    </Button>
                  ) : (
                    <Button variant="ghost" size="sm" onClick={() => { setHintOpen(false); setHintLevel(0) }}>
                      收起提示
                    </Button>
                  )}
                  <Button
                    variant="destructive"
                    onClick={seeSolution}
                    className={cn(timer.overtime && 'ring-2 ring-amber-400 animate-pulse')}
                  >
                    <BookOpen className="size-4" /> 想不出，看题解
                  </Button>
                  <Button variant="outline" onClick={selfSolved} disabled={!allPass} title={allPass ? '' : '需先跑通全部用例'}>
                    <CheckCircle2 className="size-4" /> 自解通过
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Easy 卡 15 分钟 / Medium 卡 25 分钟就来看题解 -- 不死磕是纪律，不是认输
                </p>
              </div>
            )}

            {phase === 'reproduce' && (
              <div className="space-y-3">
                {problem.testCases.length === 0 && (
                  <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
                    此题没有测试用例 ——「默写通过」需用例验证。可先「失败」一次，到完成页补用例后重判，避免空转。
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  <Button onClick={onReproducePass} disabled={!allPass} title={allPass ? '' : '需先跑通全部用例'}>
                    <CheckCircle2 className="size-4" /> 默写通过
                  </Button>
                  <Button variant="destructive" onClick={onReproduceFail}>
                    <XCircle className="size-4" /> 反复写不出，默写失败
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  失败不丢人 -- 3 天后它会再出现在复习队列里
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ===== 看题解态 ===== */}
      {phase === 'solution' && (
        <div className="mx-auto max-w-3xl rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <BookOpen className="size-4 text-blue-500" />
            <span className="text-sm font-bold">题解 · {problem.pattern}</span>
          </div>
          <div className="max-h-[560px] overflow-y-auto pr-2">{md(problem.solution ?? '')}</div>
          <Separator className="my-4" />
          <Button onClick={enterReproduce} className="w-full" size="lg">
            <PenLine className="size-4" /> 关掉题解，进入默写
          </Button>
          <p className="mt-2 text-center text-xs text-muted-foreground">
            能默写出来，才算会 -- 现在代码会被清空、只留函数签名
          </p>
          <div className="mt-3 text-center">
            <Button variant="ghost" size="sm" onClick={skipProblem}>
              只看题解不刷（跳过，不进默写）
            </Button>
            <p className="mt-1 text-xs text-muted-foreground">
              Hard 太难、时间不够 -- 跳过不丢人，也不排期复习
            </p>
          </div>
        </div>
      )}

      {/* ===== 完成态 ===== */}
      {phase === 'done' && (
        <div className="mx-auto max-w-md space-y-4 rounded-xl border bg-card p-8 text-center">
          {doneKind === 'self-solved' ? (
            <>
              <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
              <h2 className="text-xl font-bold">自解通过，没看题解就拿下</h2>
              {problem.status === 'mastered' ? (
                <p className="text-sm text-muted-foreground">
                  间隔走完，已 <strong className="text-foreground">掌握</strong> —— 不再排期复习
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  已排期 <strong className="text-foreground">{problem.nextReviewAt ?? '3 天后'}</strong> 复习
                </p>
              )}
              <Button asChild variant="outline" className="mx-auto">
                <a href={leetcodeUrl(problem)} target="_blank" rel="noreferrer">
                  去 LeetCode 提交 <ExternalLink className="size-3.5" />
                </a>
              </Button>
            </>
          ) : doneKind === 'skipped' ? (
            <>
              <BookOpen className="mx-auto size-14 text-muted-foreground" />
              <h2 className="text-xl font-bold">已跳过，只看题解不刷</h2>
              <p className="text-sm text-muted-foreground">
                没关系 -- 这题不排期复习，想刷时随时回题单再来
              </p>
            </>
          ) : noteOutcome === 'pass' ? (
            <>
              <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
              <h2 className="text-xl font-bold">默写通过，这题才算真的会了</h2>
              {problem.status === 'mastered' ? (
                <p className="text-sm text-muted-foreground">
                  间隔走完，已 <strong className="text-foreground">掌握</strong> —— 不再排期复习
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">
                  已排期 <strong className="text-foreground">{problem.nextReviewAt}</strong> 复习，下次直接默写
                </p>
              )}
            </>
          ) : (
            <>
              <XCircle className="mx-auto size-14 text-amber-500" />
              <h2 className="text-xl font-bold">记下了，{reviewInDays ?? 3} 天后再战</h2>
              <p className="text-sm text-muted-foreground">
                默写失败很正常 -- 它会在 {reviewInDays ?? 3} 天后回到复习队列
              </p>
            </>
          )}
          {note.trim() && (
            <div className="rounded-lg border-dashed border bg-muted/40 p-3 text-sm">
              <span className="font-medium">一句话笔记：</span>{note.trim()}
            </div>
          )}
          <div className="flex justify-center gap-2">
            <Button asChild variant="outline"><Link to="/problems">返回题单</Link></Button>
            <Button asChild><Link to="/">去仪表盘</Link></Button>
          </div>
        </div>
      )}

      {/* ===== 专注模式：全世界只剩你和代码 ===== */}
      {zen && inFlow && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background p-4 md:p-6">
          <div className="mb-3 flex items-center gap-2">
            <span className="truncate text-sm text-muted-foreground">
              #{problem.id} {problem.title} · 专注模式
            </span>
            <div className="ml-auto flex shrink-0 items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => setZenStatementOpen(true)}>看题目</Button>
              <Button variant="outline" size="sm" onClick={() => setZen(false)}>
                <Minimize2 className="size-3.5" /> 退出（Esc）
              </Button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden rounded-xl border">
            <CodeEditor value={code} onChange={setCode} lang={lang} height="100%" />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Timer
              remainSec={timer.remainSec}
              paused={timer.paused}
              overtime={timer.overtime}
              label={timerLabel}
              onTogglePause={timer.togglePause}
              onReset={resetTimer}
            />
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={runCases} disabled={!canRun || running}>
                <Play className="size-3.5" /> 运行用例
              </Button>
              {phase === 'attempt' ? (
                <Button size="sm" variant="destructive" className={cn(timer.overtime && 'ring-2 ring-amber-400 animate-pulse')} onClick={() => { setZen(false); seeSolution() }}>
                  看题解
                </Button>
              ) : (
                <Button size="sm" onClick={() => { setZen(false); onReproducePass() }} disabled={!allPass}>
                  默写通过
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 专注模式里看题目 */}
      <Dialog open={zenStatementOpen} onOpenChange={setZenStatementOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>题目 · {problem.difficulty}</DialogTitle>
          </DialogHeader>
          {md(problem.statement ?? '')}
          <DialogFooter>
            <Button onClick={() => setZenStatementOpen(false)}>继续写代码</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 偷看题解弹窗 */}
      <Dialog open={peekOpen} onOpenChange={setPeekOpen}>
        <DialogContent className="max-h-[80vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="size-4 text-amber-500" /> 偷看题解（第 {peekCount} 次，已记录）
            </DialogTitle>
          </DialogHeader>
          {md(problem.solution ?? '')}
          <DialogFooter>
            <Button onClick={() => setPeekOpen(false)}>好了，继续默写</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 一句话笔记弹窗（S5）：结算后的必经步——只能经「保存/先跳过」退出，
          屏蔽 X/遮罩/Esc，防止回到 reproduce 后二次结算 */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent
          className="max-w-lg"
          showCloseButton={false}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <DialogHeader>
            <DialogTitle>什么时候用这个套路？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            一句话就行 -- 这是「判断信号」训练：下次看到什么特征，就该想起 {problem.pattern}
          </p>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            placeholder={`例：看到「${problem.signal ?? '…'}」就用 ${problem.pattern}`}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={skipNote}>先跳过</Button>
            <Button onClick={saveNote}>保存笔记</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
