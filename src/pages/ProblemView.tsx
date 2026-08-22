import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft, ArrowRight, BookOpen, CheckCircle2, ChevronDown, ClipboardList, Eye, EyeOff, ExternalLink,
  Lightbulb, Loader2, Maximize2, Minimize2, PenLine, Play, RotateCcw, Save, ShieldAlert, Sparkles, Star, Upload, XCircle,
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
import { chatAI, AiError } from '@/lib/ai'
import {
  buildHintMessages, buildSolutionMessages, buildReviewMessages, buildHintCardMessages,
  extractJsonBlock, toAttackCases,
} from '@/lib/prompts'
import { cn } from '@/lib/utils'

type Phase = 'paste' | 'attempt' | 'solution' | 'reproduce' | 'done'

/** 贴题面板分节标题：编号徽章 + 标题（必填标 *）+ 说明 */
function PasteSection({ index, title, required, desc }: {
  index: number
  title: string
  required?: boolean
  desc?: string
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
        {index}
      </span>
      <span className="text-sm font-medium">
        {title}
        {required && <span className="ml-0.5 text-destructive">*</span>}
      </span>
      {desc && <span className="text-xs text-muted-foreground">{desc}</span>}
    </div>
  )
}

/**
 * 贴题面板折叠分节：整行按钮 + 编号徽章 + 「可选/高级」标记，
 * 右侧状态提示（statusOk 用 emerald）让用户不展开也能看到是否已填，展开后 desc 补充说明。
 */
function CollapseSection({ index, label, badge, status, statusOk, desc, open, onToggle, children }: {
  index: number
  label: string
  badge?: string
  status?: string
  statusOk?: boolean
  desc?: string
  open: boolean
  onToggle: () => void
  children?: ReactNode
}) {
  return (
    <div className="space-y-2">
      <button
        type="button"
        aria-expanded={open}
        className="-mx-2 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-accent"
        onClick={onToggle}
      >
        <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[11px] font-semibold text-muted-foreground">
          {index}
        </span>
        <span className={cn('text-sm font-medium', open ? 'text-foreground' : 'text-muted-foreground')}>
          {label}
        </span>
        {badge && (
          <span className="rounded bg-muted px-1.5 py-px text-[10px] text-muted-foreground">{badge}</span>
        )}
        <span className="ml-auto flex shrink-0 items-center gap-2">
          {status && (
            <span className={cn('text-xs', statusOk
              ? 'text-emerald-600 dark:text-emerald-400'
              : 'text-muted-foreground')}>
              {status}
            </span>
          )}
          <ChevronDown
            className={cn('size-4 shrink-0 text-muted-foreground transition-transform', !open && '-rotate-90')}
          />
        </span>
      </button>
      {open && desc && <p className="px-2 text-xs text-muted-foreground">{desc}</p>}
      {open && children}
    </div>
  )
}

/**
 * F7.1 分层提示面板：解题态主视图与专注模式共用（专注模式里教练也不能缺席）。
 * 逐层堆叠展示，最新层流式打字中显示 spinner，三层用完引导转「看题解」。
 */
function HintPanel({ hints, busy, error, onAsk }: {
  hints: string[]
  busy: boolean
  error: string | null
  onAsk: (level: number) => void
}) {
  return (
    <div className="rounded-xl border border-blue-500/40 bg-blue-500/5 p-3">
      <div className="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Sparkles className="size-3.5 text-blue-500" />
        AI 教练 · 分层提示（不给答案）
      </div>
      <div className="space-y-2">
        {hints.map((h, i) => (
          <div key={i} className="text-sm leading-relaxed">
            <span className="mr-1.5 text-xs font-semibold text-blue-600 dark:text-blue-400">
              第 {i + 1} 层
            </span>
            {h}
            {busy && i === hints.length - 1 && (
              <Loader2 className="ml-1 inline size-3.5 animate-spin text-blue-500" />
            )}
          </div>
        ))}
        {busy && hints.length === 0 && (
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> 教练思考中…
          </p>
        )}
      </div>
      {error && (
        <div className="mt-2 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-600 dark:text-red-400">
          {error}
          <button
            type="button"
            className="ml-2 underline underline-offset-2"
            onClick={() => onAsk(hints.length + 1)}
          >
            重试
          </button>
        </div>
      )}
      {hints.length < 3 ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={busy}
          onClick={() => onAsk(hints.length + 1)}
        >
          <Lightbulb className="size-3.5" /> {hints.length === 0 ? '给个提示' : '还是卡着，再要一层'}
        </Button>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">三层用完了 -- 卡住就停，建议转「看题解」</p>
      )}
    </div>
  )
}

export default function ProblemView() {
  const { id } = useParams()
  const problem = useProblem(Number(id))
  const updateProblem = useUpdateProblem()
  const settings = useSettings()
  // 重置本题 SRS 后跳回题单（重置=管理动作,不就地开刷,见 resetSrs 注释）
  const navigate = useNavigate()
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
  // 默认语言：优先上次用的，其次用户设置 defaultLang，最后兜底 python
  // （types 注释：defaultLang = 新题/无 lastLang 时的默认语言；原先硬编码 python 会无视设置）
  const [lang, setLang] = useState<Lang>(problem?.lastLang ?? settings.defaultLang ?? 'python')
  // 按语言分存草稿：编辑器始终显示当前语言的内容（用户草稿优先，没写过则该语言骨架），
  // 切语言互不覆盖--修「切到 JavaScript 仍显示 Python 代码」bug
  const [codeByLang, setCodeByLang] = useState<Record<Lang, string>>(() => ({
    python: problem?.skeleton?.python ?? '',
    javascript: problem?.skeleton?.javascript ?? '',
  }))
  const code = codeByLang[lang]
  const setCode = (v: string) => setCodeByLang((prev) => ({ ...prev, [lang]: v }))
  const [running, setRunning] = useState(false)
  const [results, setResults] = useState<Record<string, CaseResult> | null>(null)
  const [hintOpen, setHintOpen] = useState(false)
  // ===== S7-F7 AI 教练四件套 =====
  // 无 key 时四件套入口全部隐藏，主流程不受影响（PRD 验收）
  const aiReady = settings.ai.apiKey.trim() !== ''
  // F7.1 分层提示：逐层按需请求，hints 累积已给过的层（堆叠展示，最新层流式打字）
  const [hints, setHints] = useState<string[]>([])
  const [hintBusy, setHintBusy] = useState(false)
  const [hintError, setHintError] = useState<string | null>(null)
  // F7.3 题解生成：genSolution 是未保存的生成内容（保存后走 problem.solution）
  const [genSolution, setGenSolution] = useState('')
  const [genBusy, setGenBusy] = useState(false)
  const [genError, setGenError] = useState<string | null>(null)
  const [genSaved, setGenSaved] = useState(false)
  // F7.2 边界审查（默写通过后的 done 屏触发）
  const [review, setReview] = useState<{ text: string; cases: TestCase[] } | null>(null)
  const [reviewBusy, setReviewBusy] = useState(false)
  const [reviewError, setReviewError] = useState<string | null>(null)
  const [reviewImported, setReviewImported] = useState(false)
  // F7.4 提示卡：后台生成，结果直接写 problem.hintCard，这里只记生成中状态
  const [hintCardPending, setHintCardPending] = useState(false)
  // 组件卸载取消进行中的流（F7.4 不挂这里 -- 它要跨页面完成落库）
  const aiAbortRef = useRef<AbortController | null>(null)
  useEffect(() => () => aiAbortRef.current?.abort(), [])
  const newAiAbort = () => {
    aiAbortRef.current?.abort()
    const ac = new AbortController()
    aiAbortRef.current = ac
    return ac
  }
  const [peekCount, setPeekCount] = useState(0)
  const [peekOpen, setPeekOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [note, setNote] = useState(problem?.note ?? '')
  const [noteOutcome, setNoteOutcome] = useState<'pass' | 'fail'>('pass')
  // 重置本题 SRS 确认弹窗（S6-F6）
  const [resetOpen, setResetOpen] = useState(false)
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
  // 题面必填校验：空题面点「贴好了」标红聚焦，输入即清除
  const [pasteError, setPasteError] = useState(false)
  const statementRef = useRef<HTMLTextAreaElement>(null)
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

  // 计时状态提升到 hook（S3-F3）：主视图与专注模式共享，避免双实例不同步；
  // elapsedSec/pausedSec 用于写 history。resetKey=phase：切阶段重置。
  // 时长来自 settings.timeLimitMin（spec「可配置」）：db.json 改了即生效；旧 db 缺字段时兜底 25。
  // hook 必须在 !problem 早退之前无条件调用（题号无效时计时器空转无害）
  const diffKey = (problem?.difficulty ?? 'medium').toLowerCase() as 'easy' | 'medium' | 'hard'
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

  if (!problem) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        题目不存在，<Link to="/problems" className="underline">返回题单</Link>
      </div>
    )
  }

  // 切语言：显示目标语言的草稿（codeByLang[l]，没写过即该语言骨架），两语言互不覆盖
  const switchLang = (l: Lang) => {
    setLang(l)
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
    settledRef.current = false // 新一轮默写，结算守卫复位
    // 两种语言草稿都重置为骨架：默写从签名开始，另一语言的 attempt 草稿不得借切语言泄露
    setCodeByLang({
      python: problem.skeleton?.python ?? '',
      javascript: problem.skeleton?.javascript ?? '',
    })
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

  // 默写通过（重构 spec §5.2）：通过一律 learned（达顶 mastered），自解荣誉由 self 徽章独立承载
  const onReproducePass = () => {
    if (!allPass || settledRef.current) return
    settledRef.current = true
    setZen(false) // 从专注模式结算：退出 zen，让笔记弹窗落在普通层而非叠在全屏编辑器上
    const sched = passSchedule(problem.srsLevel, settings.intervalsDays, todayStr())
    recordReproduce('pass')
    updateProblem(problem.id, {
      status: sched.mastered ? 'mastered' : 'learned',
      lastFail: false, // 通过即清挂科标记
      srsLevel: sched.srsLevel,
      // 达顶时 sched.nextReviewAt 为 undefined -> 显式清掉旧排期（mastered 不进队列，留着是脏数据）；
      // 非达顶排下次复习。与 onReproduceFail 的直赋写法一致（重构 spec §5.2）
      nextReviewAt: sched.nextReviewAt,
      lastLang: lang,
      // F7.4：上次失败留的提示卡已起完作用（这次过了），清掉避免下次复习提前泄题
      hintCard: undefined,
    })
    openNote('pass')
  }

  // 默写失败（重构 spec §5.3）：learned + lastFail=true + srsLevel 重置 0 + 排 intervalsDays[0] 天
  const onReproduceFail = () => {
    if (settledRef.current) return
    settledRef.current = true
    const sched = failSchedule(settings.intervalsDays, todayStr())
    recordReproduce('fail')
    updateProblem(problem.id, {
      status: 'learned',
      lastFail: true,
      srsLevel: sched.srsLevel,
      nextReviewAt: sched.nextReviewAt,
      lastLang: lang,
    })
    // F7.4：写了代码才值得复盘（纯空白失败没有卡点可言）；后台生成不挂 aiAbortRef
    if (aiReady && code.trim() && code.trim() !== (problem.skeleton?.[lang] ?? '').trim()) {
      void generateHintCard()
    }
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

  // 自解通过（重构 spec §5.1）：status=learned（达顶 mastered）+ self 徽章置位；调 S6 排期
  const selfSolved = () => {
    if (!allPass) return
    const sched = passSchedule(problem.srsLevel, settings.intervalsDays, todayStr())
    recordAttempt('pass')
    updateProblem(problem.id, {
      status: sched.mastered ? 'mastered' : 'learned',
      self: true,
      lastFail: false,
      srsLevel: sched.srsLevel,
      nextReviewAt: sched.nextReviewAt, // 达顶清旧排期、非达顶排下次复习（与 onReproducePass/Fail 一致，spec §5.1）
      lastLang: lang,
    })
    setDoneKind('self-solved')
    setPhase('done')
  }

  // ===== S7-F7 AI 教练动作 =====
  const aiErrMsg = (err: unknown, fallback: string) => (err instanceof AiError ? err.message : fallback)

  // F7.1 请求第 level 层提示（流式打字）。先占位空层，失败撤掉，成功用全文回填
  const askHint = async (level: number) => {
    setHintError(null)
    setHintBusy(true)
    setHints((prev) => [...prev, ''])
    const ac = newAiAbort()
    try {
      let acc = ''
      const text = await chatAI(buildHintMessages(problem, lang, code, level, hints), {
        temperature: 0.7,
        // reasoning 模型的思考 token 也计入 max_tokens，限额要给足否则正文被挤空
        maxTokens: 3000,
        signal: ac.signal,
        onDelta: (d) => {
          acc += d
          setHints((prev) => prev.map((h, i) => (i === level - 1 ? acc : h)))
        },
      })
      setHints((prev) => prev.map((h, i) => (i === level - 1 ? text.trim() || acc : h)))
    } catch (err) {
      setHints((prev) => prev.slice(0, level - 1)) // 撤掉占位层
      if (!(err instanceof AiError && err.code === 'ABORT')) {
        setHintError(aiErrMsg(err, 'AI 请求失败，请稍后重试'))
      }
    } finally {
      setHintBusy(false)
    }
  }

  // F7.3 流式生成题解
  const generateSolution = async () => {
    setGenError(null)
    setGenBusy(true)
    setGenSolution('')
    const ac = newAiAbort()
    try {
      let acc = ''
      const text = await chatAI(buildSolutionMessages(problem), {
        temperature: 0.3,
        maxTokens: 8000,
        signal: ac.signal,
        onDelta: (d) => {
          acc += d
          setGenSolution(acc)
        },
      })
      setGenSolution(text || acc)
    } catch (err) {
      if (!(err instanceof AiError && err.code === 'ABORT')) {
        setGenSolution('') // 生成被中断时报错但不留半截内容（否则半截题解仍可被保存）
        setGenError(aiErrMsg(err, 'AI 生成题解失败，请稍后重试'))
      }
    } finally {
      setGenBusy(false)
    }
  }

  const saveGenSolution = () => {
    if (!genSolution.trim()) return
    updateProblem(problem.id, { solution: genSolution })
    setGenSaved(true)
  }

  // F7.2 边界审查（非流式：末尾的用例 JSON 要等全文才能解析）
  const runReview = async () => {
    setReviewError(null)
    setReviewBusy(true)
    setReview(null)
    setReviewImported(false)
    const ac = newAiAbort()
    try {
      const text = await chatAI(buildReviewMessages(problem, code, lang), {
        temperature: 0.2,
        maxTokens: 6000,
        signal: ac.signal,
      })
      // 参数个数从现有用例推断（EntrySpec 不存参数数），个数不符的用例判题时直接跑炸，过滤掉
      const arity = problem.testCases[0]?.args.length
      setReview({ text, cases: toAttackCases(extractJsonBlock(text), arity) })
    } catch (err) {
      if (!(err instanceof AiError && err.code === 'ABORT')) {
        setReviewError(aiErrMsg(err, 'AI 审查失败，请稍后重试'))
      }
    } finally {
      setReviewBusy(false)
    }
  }

  // F7.2 导入攻击用例：按「入参+期望」去重；label 保证唯一（判题结果按 label 索引）
  const importAttackCases = () => {
    if (!review || review.cases.length === 0) return
    const keys = new Set(problem.testCases.map((tc) => `${tc.args.join('\u0000')}=>${tc.expected}`))
    const labels = new Set(problem.testCases.map((tc) => tc.label))
    const fresh: TestCase[] = []
    for (const c of review.cases) {
      const key = `${c.args.join('\u0000')}=>${c.expected}`
      if (keys.has(key)) continue
      keys.add(key)
      let label = c.label
      for (let i = 2; labels.has(label); i++) label = `${c.label}${i}`
      labels.add(label)
      fresh.push({ ...c, label })
    }
    if (fresh.length) updateProblem(problem.id, { testCases: [...problem.testCases, ...fresh] })
    setReviewImported(true)
  }

  // F7.4 后台生成「下次提示卡」：用户可能马上离开本题，不随组件卸载取消，
  // updateProblem 是 store 层函数式更新，跨页面也能落库
  const generateHintCard = async () => {
    setHintCardPending(true)
    try {
      const text = await chatAI(buildHintCardMessages(problem, code, lang), {
        temperature: 0.5,
        maxTokens: 2000,
      })
      const card = text.trim().replace(/^["'「『]+|["'」』]+$/g, '').trim()
      if (card) updateProblem(problem.id, { hintCard: card })
    } catch {
      // 后台任务：失败静默，done 屏只是不显示新卡
    } finally {
      setHintCardPending(false)
    }
  }

  // 看题解：本地无题解 → V1.0 兜底提示，停在 attempt；有则记一次历史后进 solution 态。
  // outcome：已超时才来看题解 → 'timeout'（卡到点放弃）；未超时主动看 → 'fail'。
  // 超时不锁界面、用户可能继续写后自解，那条路径走 selfSolved 记 'pass'，不在此处。
  const seeSolution = () => {
    if (!problem.solution) {
      // F7.3：本地无题解 -> 配置了 AI 则进题解态现场生成（仍记一次 attempt 放弃）
      if (aiReady) {
        setNotice(null)
        setTimeUpMsg(null)
        recordAttempt(timer.overtime ? 'timeout' : 'fail')
        setGenSolution('')
        setGenError(null)
        setGenSaved(false)
        setPhase('solution')
        void generateSolution()
      } else {
        setNotice('暂无题解，请手动粘贴（设置页配置 API Key 后，AI 可现场生成）')
      }
      return
    }
    setNotice(null)
    setTimeUpMsg(null)
    recordAttempt(timer.overtime ? 'timeout' : 'fail')
    setPhase('solution')
  }

  // 只看题解不刷（Hard 等）：status=skipped，不进默写、不排期
  // 显式清 nextReviewAt：从 learned 等带排期的状态转入 skipped 时，残留的复习日期必须抹掉
  const skipProblem = () => {
    updateProblem(problem.id, { status: 'skipped', lastLang: lang, nextReviewAt: undefined })
    setDoneKind('skipped')
    setPhase('done')
  }

  // 重置本题 SRS（重构 spec §6.8 + S6-F6）：打回未开始重学。
  // 题面/模板/题解/用例/笔记/历史/lastLang 保留（重学≠抹除历史）；
  // SRS 排期、自解徽章、挂科标清空。srsLevel 清 undefined 而非 0——passSchedule 里
  // (level ?? -1)+1：undefined → 首通过得 0 排 +3 天；0 → 得 1 排 +7 天，会跳过首复习。
  // 重置后跳回题单而非就地进 attempt：落地刷题流会被「attempt 置 in-progress」effect
  // 立刻翻成进行中，'未开始' 就白打了；回列表让 status=new 真正落库，用户自己点开重学。
  const resetSrs = () => {
    updateProblem(problem.id, {
      status: 'new',
      srsLevel: undefined,
      nextReviewAt: undefined,
      self: undefined,
      lastFail: undefined,
      hintCard: undefined, // F7.4：重学从零开始，旧失败周期的提示卡一并作废
    })
    setResetOpen(false)
    navigate('/problems')
  }

  // 贴题保存（S2-F2）：对已粘贴的每种语言 skeleton 分别解析 entry，按语言分存；
  // 连同题面/模板/题解/用例一次性落库，然后进尝试阶段。
  const savePaste = () => {
    if (!problem) return
    // 题面是唯一必填项：空则标红聚焦，不落库
    if (!pasteStatement.trim()) {
      setPasteError(true)
      statementRef.current?.focus()
      return
    }
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
    if (firstPaste) setCodeByLang({ python: pasteSkeletonPy, javascript: pasteSkeletonJs })
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
  // 重置重学：默写态(reproduce)也放开（R8）。reset 不回贴题面板、不露题解，与 editProblem 解耦
  // —— editProblem 仍在 reproduce 隐藏（它会回贴题面板泄露题解），reset 单独放开。
  // 解痛点：到期复习题要重置时，原先 reproduce 态无按钮，用户得先「默写失败」混进 done 屏才能重置，
  // 那次假失败会写进 history、置 lastFail，再被 reset 清掉 —— 为了够到重置被迫污染历史。
  // reproduce 态本身 status 非 new（能进 reproduce 必是复习/首次默写），status!=='new' 恒成立，留着兜底。
  const canReset = (canEdit || phase === 'reproduce') && problem.status !== 'new'
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
          {canReset && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setResetOpen(true)}
              title="清空 SRS 排期与自解徽章，打回未开始重学"
            >
              <RotateCcw className="size-3.5" /> 重置重学
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
        <div className="mx-auto max-w-2xl space-y-5 rounded-xl border bg-card p-5 md:p-6">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <ClipboardList className="size-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold">首次打开，先贴题</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                把 LeetCode 题目描述（含示例）整段粘进来，用例会自动识别；再贴代码模板就能开始。
              </p>
            </div>
          </div>

          {/* ① 题面（唯一必填）-- 用例自动从「输入：/输出：」示例解析 */}
          <div className="space-y-2">
            <PasteSection index={1} title="题面" required desc="整段复制 LeetCode 描述，含示例" />
            <Textarea
              ref={statementRef}
              value={pasteStatement}
              onChange={(e) => {
                setPasteStatement(e.target.value)
                if (pasteError) setPasteError(false)
              }}
              placeholder={'粘贴 LeetCode 题目描述 + 示例…\n用例会从「输入：…/输出：…」自动识别，无需手填。'}
              rows={8}
              aria-invalid={pasteError}
            />
            {pasteError && (
              <p className="text-xs text-destructive">题面是必填的：把 LeetCode 描述（含示例）整段粘进来</p>
            )}
            {pasteCases.length > 0 ? (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-emerald-600 dark:text-emerald-400">
                    <CheckCircle2 className="mr-1 inline size-3.5" />
                    已从示例识别 {pasteCases.length} 条用例
                  </span>
                  <Button variant="ghost" size="sm" onClick={fillCasesFromStatement} title="重新从题面示例解析">
                    重新解析
                  </Button>
                </div>
                <ul className="mt-1.5 space-y-0.5 font-mono text-muted-foreground">
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
          <div className="space-y-2">
            <PasteSection
              index={2}
              title={`代码模板（${primaryLang === 'python' ? 'Python' : 'JavaScript'}）`}
              desc="从 LeetCode 代码区整段复制"
            />
            <Textarea
              value={primarySkeleton}
              onChange={(e) => setPrimarySkeleton(e.target.value)}
              placeholder={primaryLang === 'python' ? 'def majorityElement(nums):…' : 'var majorityElement = function(nums) {'}
              rows={5}
              className="font-mono text-xs"
            />
            <button
              type="button"
              aria-expanded={showOtherLang}
              className="-mx-1.5 flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              onClick={() => setShowOtherLang((v) => !v)}
            >
              <ChevronDown className={cn('size-3.5 shrink-0 transition-transform', !showOtherLang && '-rotate-90')} />
              也填 {otherLang === 'python' ? 'Python' : 'JavaScript'} 模板
              {otherSkeleton.trim() ? (
                <span className="text-emerald-600 dark:text-emerald-400">（已填写）</span>
              ) : (
                <span>（可选）</span>
              )}
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
          <CollapseSection
            index={3}
            label="题解"
            badge="可选"
            status={pasteSolution.trim() ? '已填写' : '可稍后补'}
            statusOk={!!pasteSolution.trim()}
            open={showSolution}
            onToggle={() => setShowSolution((v) => !v)}
          >
            <Textarea
              value={pasteSolution}
              onChange={(e) => setPasteSolution(e.target.value)}
              placeholder="粘贴官方/社区题解…"
              rows={4}
            />
          </CollapseSection>

          {/* ④ 手动调整用例（折叠--技术细节藏这里，正常无需打开） */}
          <CollapseSection
            index={4}
            label="手动调整用例"
            badge="高级"
            status={pasteCases.length > 0 ? `已识别 ${pasteCases.length} 条` : undefined}
            statusOk={pasteCases.length > 0}
            desc="改参数/期望；原地修改型题在此选「入参N」"
            open={showManualCases}
            onToggle={() => setShowManualCases((v) => !v)}
          >
            <div className="rounded-lg border p-2">
              <TestCaseEditor testCases={pasteCases} onChange={setPasteCases} />
            </div>
          </CollapseSection>

          <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
            <Button asChild variant="ghost" size="sm" className="self-start">
              <label className="cursor-pointer">
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
            </Button>
            <Button onClick={savePaste} className="w-full sm:w-auto">
              贴好了，开始刷题 <ArrowRight className="size-4" />
            </Button>
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
                {problem.hintCard && (
                  <div className="mb-3 rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
                    <span className="font-medium">教练提示卡：</span>
                    <span className="text-muted-foreground">{problem.hintCard}</span>
                  </div>
                )}
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
                  {problem.self && (
                    <span title="我顺极了 —— 没看题解自己解出来的" className="inline-flex items-center text-amber-500">
                      <Star className="size-3.5" fill="currentColor" />
                    </span>
                  )}
                  {problem.lastFail && (
                    <Badge variant="outline" className="text-amber-600 dark:text-amber-400" title="上次没默过">易错</Badge>
                  )}
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
              {!problem.skeleton?.[lang]?.trim() && !code.trim() && (
                <p className="border-b bg-muted/30 px-3 py-1 text-xs text-muted-foreground">
                  未粘贴{lang === 'python' ? 'Python' : 'JavaScript'}模板，编辑器为空
                </p>
              )}
              {/* key={lang}：切语言重建编辑器，直接以新语言的 value 初始化文档，
                  绕开 react-codemirror 跨值同步的时序问题（显示层偶发不刷新）。
                  高度随视口收缩（clamp）：矮屏上把纵向预算让给底下的决策按钮，避免掉出折叠线。
                  30vh 档按 720p 笔记本两行按钮刚好全露校准；大屏仍到 300px 上限 */}
              <CodeEditor key={lang} value={code} onChange={setCode} lang={lang} height="clamp(180px, 30vh, 300px)" />
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
                {/* 同编辑器：矮屏收缩，保底 7rem 保证用例还看得见几行 */}
                <div className="max-h-[clamp(7rem,22vh,14rem)] overflow-y-auto">
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
                {aiReady && hintOpen && (
                  <HintPanel hints={hints} busy={hintBusy} error={hintError} onAsk={(lv) => void askHint(lv)} />
                )}
                <div className="flex flex-wrap gap-2">
                  {aiReady && (
                    !hintOpen ? (
                      <Button variant="outline" onClick={() => { setHintOpen(true); if (hints.length === 0) void askHint(1) }}>
                        <Lightbulb className="size-4" /> 给个提示（不给答案）
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" onClick={() => setHintOpen(false)}>
                        收起提示
                      </Button>
                    )
                  )}
                  <Button
                    variant="destructive"
                    onClick={seeSolution}
                    className={cn(timer.overtime && 'ring-2 ring-amber-400 animate-pulse')}
                  >
                    <BookOpen className="size-4" /> 想不出，看题解
                  </Button>
                  <Button variant="outline" onClick={selfSolved} disabled={!allPass} title={allPass ? '' : '需先跑通全部用例'}>
                    <CheckCircle2 className="size-4" /> 没看题解，直接过了
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

      {/* ===== 看题解态（本地无题解且配了 AI 时现场生成，F7.3）===== */}
      {phase === 'solution' && (
        <div className="mx-auto max-w-3xl rounded-xl border bg-card p-5">
          <div className="mb-3 flex items-center gap-2">
            <BookOpen className="size-4 text-blue-500" />
            <span className="text-sm font-bold">题解 · {problem.pattern}</span>
            {!problem.solution && genSolution.trim() && <Badge variant="secondary">AI 生成</Badge>}
          </div>
          {problem.solution ? (
            <div className="max-h-[560px] overflow-y-auto pr-2">{md(problem.solution)}</div>
          ) : (
            <div className="space-y-3">
              {genBusy && !genSolution && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> AI 教练正在生成题解…
                </p>
              )}
              {genSolution && <div className="max-h-[560px] overflow-y-auto pr-2">{md(genSolution)}</div>}
              {genError && (
                <div className="rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                  {genError}
                  <Button variant="outline" size="sm" className="ml-2" onClick={() => void generateSolution()}>
                    重试
                  </Button>
                  {/* 生成失败时给个明确出口（进默写的按钮此时禁用），不必被迫「只看题解不刷」 */}
                  <Button asChild variant="ghost" size="sm" className="ml-1">
                    <Link to="/problems">返回题单</Link>
                  </Button>
                </div>
              )}
              {genSolution && !genBusy && (
                <div className="flex flex-wrap items-center gap-2">
                  {genSaved ? (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">已保存为本地题解 ✓</span>
                  ) : (
                    <Button size="sm" onClick={saveGenSolution}>
                      <Save className="size-3.5" /> 保存为本地题解
                    </Button>
                  )}
                  <Button variant="ghost" size="sm" onClick={() => void generateSolution()}>
                    重新生成
                  </Button>
                </div>
              )}
            </div>
          )}
          <Separator className="my-4" />
          <Button
            onClick={enterReproduce}
            className="w-full"
            size="lg"
            disabled={!problem.solution && (genBusy || !genSolution.trim())}
            title={!problem.solution && !genSolution.trim() && !genBusy ? '题解还没生成：先重试生成，或返回题单' : ''}
          >
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

      {/* ===== 完成态（默写通过后可做 F7.2 边界审查）===== */}
      {phase === 'done' && (
        <div className="mx-auto max-w-md space-y-4">
          <div className="rounded-xl border bg-card p-8 text-center">
          {doneKind === 'self-solved' ? (
            <>
              <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
              <h2 className="text-xl font-bold">我顺极了！</h2>
              <p className="text-sm text-muted-foreground">没看题解就拿下</p>
              {problem.status === 'mastered' && (
                <p className="text-sm text-muted-foreground">
                  间隔走完，<strong className="text-foreground">过关了</strong> —— 不再排期复习
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
                  间隔走完，<strong className="text-foreground">过关了</strong> —— 不再排期复习
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
              {aiReady && hintCardPending && (
                <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                  <Loader2 className="size-3 animate-spin" /> AI 教练正在写「下次提示卡」…
                </p>
              )}
              {problem.hintCard && !hintCardPending && (
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3 text-sm">
                  <span className="font-medium">下次提示卡：</span>
                  {problem.hintCard}
                </div>
              )}
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

          {/* F7.2 边界审查：默写通过后（PRD），只挑毛病不给修复代码，攻击用例可一键导入 */}
          {doneKind === 'reproduce' && noteOutcome === 'pass' && aiReady && (
            <div className="rounded-xl border bg-card p-5 text-left">
              <div className="mb-1 flex items-center gap-2">
                <ShieldAlert className="size-4 text-blue-500" />
                <span className="text-sm font-bold">AI 边界审查</span>
              </div>
              <p className="mb-3 text-xs text-muted-foreground">
                按「边界三问」挑毛病（不给修复代码，修改靠自己），并生成 3 个攻击用例
              </p>
              {!review && !reviewBusy && !reviewError && (
                <Button variant="outline" size="sm" onClick={() => void runReview()}>
                  <ShieldAlert className="size-3.5" /> 审查我刚才的代码
                </Button>
              )}
              {reviewBusy && (
                <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> 教练审查中…
                </p>
              )}
              {reviewError && (
                <div className="rounded-lg bg-red-500/10 px-2.5 py-1.5 text-xs text-red-600 dark:text-red-400">
                  {reviewError}
                  <button
                    type="button"
                    className="ml-2 underline underline-offset-2"
                    onClick={() => void runReview()}
                  >
                    重试
                  </button>
                </div>
              )}
              {review && (
                <>
                  <div className="max-h-64 overflow-y-auto pr-1 text-sm">{md(review.text)}</div>
                  {review.cases.length > 0 && (
                    <div className="mt-3 rounded-lg border p-2.5">
                      <p className="text-xs font-medium">攻击用例（{review.cases.length} 条）</p>
                      <ul className="mt-1 space-y-0.5 font-mono text-[11px] text-muted-foreground">
                        {review.cases.map((c) => (
                          <li key={c.label} className="truncate">
                            {c.label}：{c.args.join(', ')} -&gt; {c.expected}
                            {c.outArg != null && <span className="ml-1">（结果取入参 {c.outArg}）</span>}
                          </li>
                        ))}
                      </ul>
                      {!reviewImported ? (
                        <Button size="sm" className="mt-2" onClick={importAttackCases}>
                          导入 {review.cases.length} 条攻击用例
                        </Button>
                      ) : (
                        <p className="mt-2 text-xs text-emerald-600 dark:text-emerald-400">
                          已加入用例表 -- 下次刷这题时生效
                        </p>
                      )}
                    </div>
                  )}
                  {review.cases.length === 0 && (
                    <p className="mt-2 text-xs text-muted-foreground">未能解析出攻击用例，可重试或手动补用例</p>
                  )}
                  <Button variant="ghost" size="sm" className="mt-2" onClick={() => void runReview()}>
                    再审一次
                  </Button>
                </>
              )}
            </div>
          )}
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
            <CodeEditor key={lang} value={code} onChange={setCode} lang={lang} height="100%" />
          </div>
          {/* 提示面板：专注模式里教练也不能缺席，卡住不用退出去要提示 */}
          {phase === 'attempt' && aiReady && hintOpen && (
            <div className="mt-3 max-h-[30vh] shrink-0 overflow-y-auto">
              <HintPanel hints={hints} busy={hintBusy} error={hintError} onAsk={(lv) => void askHint(lv)} />
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Timer
              remainSec={timer.remainSec}
              paused={timer.paused}
              overtime={timer.overtime}
              label={timerLabel}
              onTogglePause={timer.togglePause}
              onReset={resetTimer}
            />
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
              <Button size="sm" variant="outline" onClick={runCases} disabled={!canRun || running}>
                <Play className="size-3.5" /> 运行用例
              </Button>
              {phase === 'attempt' ? (
                <>
                  {aiReady && (hintOpen ? (
                    <Button size="sm" variant="ghost" onClick={() => setHintOpen(false)}>
                      收起提示
                    </Button>
                  ) : (
                    <Button size="sm" variant="outline" onClick={() => { setHintOpen(true); if (hints.length === 0) void askHint(1) }}>
                      <Lightbulb className="size-3.5" /> 给个提示
                    </Button>
                  ))}
                  <Button size="sm" variant="destructive" className={cn(timer.overtime && 'ring-2 ring-amber-400 animate-pulse')} onClick={() => { setZen(false); seeSolution() }}>
                    看题解
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => { setZen(false); selfSolved() }} disabled={!allPass} title={allPass ? '' : '需先跑通全部用例'}>
                    <CheckCircle2 className="size-3.5" /> 没看题解，直接过了
                  </Button>
                </>
              ) : (
                <>
                  <Button size="sm" onClick={() => { setZen(false); onReproducePass() }} disabled={!allPass} title={allPass ? '' : '需先跑通全部用例'}>
                    默写通过
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => { setZen(false); onReproduceFail() }}>
                    默写失败
                  </Button>
                </>
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
          {md(problem.solution ?? genSolution)}
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

      {/* 重置本题 SRS 确认弹窗（S6-F6）：打回未开始重学，题面/笔记/历史保留 */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>重置本题，从头重学？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            会清空 SRS 排期、自解徽章 ⭐、易错标，把题打回<strong>未开始</strong>。
            题面 / 模板 / 题解 / 用例 / 笔记 / 历史记录都保留 —— 重学不是抹除过去。
            重置后会回到题单，你随时可以点开重新开始。
          </p>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setResetOpen(false)}>取消</Button>
            <Button variant="destructive" onClick={resetSrs}>重置</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
