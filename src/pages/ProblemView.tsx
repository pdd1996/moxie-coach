import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  ArrowLeft, BookOpen, CheckCircle2, Eye, EyeOff, ExternalLink,
  Lightbulb, Maximize2, Minimize2, PenLine, Play, Sparkles, XCircle,
} from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import { Separator } from '@/components/ui/separator'
import { Timer } from '@/components/Timer'
import { CodeEditor } from '@/components/CodeEditor'
import { useProblem } from '@/lib/store'
import { STATUS_LABEL, leetcodeUrl, type Lang } from '@/lib/types'
import { runCases as runJudgeCases, type CaseResult } from '@/lib/judge/runner'
import { cn } from '@/lib/utils'

type Phase = 'paste' | 'attempt' | 'solution' | 'reproduce' | 'done'

const TIME_LIMIT: Record<string, number> = { Easy: 15, Medium: 25, Hard: 25 }

// 原型演示：AI 分层提示的假数据（对应「找入口三步法」）
const DEMO_HINTS = [
  '别想代码，先手算：合并 [1,2,3] 和 [2,5,6]，像小学生排座位一样做一遍。你刚才重复的动作是什么？',
  '观察你的动作：两只手各指一个数组，每次比较两边的数、放下较小的、那边的手往后移一格。这就是双指针。',
  '陷阱来了：从前往后填会覆盖 nums1 还没用的数据。问自己：nums1 里哪些格子绝对不会被碰？-- 尾巴那 n 个 0。反过来，从后往前填。',
]

export default function ProblemView() {
  const { id } = useParams()
  const problem = useProblem(Number(id))

  const [phase, setPhase] = useState<Phase>(() => (problem?.statement ? 'attempt' : 'paste'))
  const [lang, setLang] = useState<Lang>(problem?.lastLang ?? 'python')
  const [code, setCode] = useState(problem?.skeleton?.[problem?.lastLang ?? 'python'] ?? '')
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

  // 专注模式下 Esc 退出
  useEffect(() => {
    if (!zen) return
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') setZen(false) }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [zen])

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

  const enterReproduce = () => {
    setPhase('reproduce')
    setCode(problem.skeleton?.[lang] ?? '')
    setResults(null)
    setPeekCount(0)
    setTimeUpMsg(null)
  }

  const openNote = (outcome: 'pass' | 'fail') => {
    setNoteOutcome(outcome)
    setNoteOpen(true)
  }

  const saveNote = () => {
    setNoteOpen(false)
    setPhase('done')
  }

  const timerProps = {
    minutes: TIME_LIMIT[problem.difficulty],
    resetKey: phase,
    label: phase === 'reproduce' ? '默写限时' : '尝试限时',
    onTimeout: () =>
      setTimeUpMsg(
        phase === 'reproduce'
          ? '默写时间到 -- 尽力就好，写不出就记一次失败，3 天后再战'
          : '时间到 -- 卡住就停，不死磕是纪律，看看题解？',
      ),
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

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 md:p-6">
      {/* 顶栏：只留必需品 -- 返回 / 标题 / 安静的时钟 */}
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="icon">
          <Link to="/problems"><ArrowLeft className="size-4" /></Link>
        </Button>
        <h1 className="truncate text-lg font-bold">
          <span className="font-mono text-muted-foreground">#{problem.id}</span> {problem.title}
        </h1>
        {inFlow && <div className="ml-auto shrink-0"><Timer {...timerProps} /></div>}
      </div>

      {/* 时间到的轻提醒：不弹窗、不拦截，只是温柔地说一句 */}
      {timeUpMsg && inFlow && (
        <div className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm text-amber-700 dark:text-amber-400">
          {timeUpMsg}
        </div>
      )}

      {/* ===== 贴题面板 ===== */}
      {phase === 'paste' && (
        <div className="mx-auto max-w-2xl space-y-4 rounded-xl border bg-card p-6">
          <div>
            <h2 className="text-lg font-bold">首次打开，先贴题 📋</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              从 LeetCode 把题面复制过来（或从现有笔记批量导入），贴一次永久本地缓存。
            </p>
          </div>
          {[
            { label: '① 题面（markdown）', ph: '粘贴 LeetCode 题目描述 + 示例…', rows: 8 },
            { label: '② 初始代码模板（可选）', ph: '粘贴编辑器里的函数签名，默写模式会保留它…', rows: 4 },
            { label: '③ 题解（可稍后补）', ph: '粘贴官方/社区题解…', rows: 4 },
          ].map((f) => (
            <div key={f.label} className="space-y-1.5">
              <div className="text-sm font-medium">{f.label}</div>
              <Textarea placeholder={f.ph} rows={f.rows} />
            </div>
          ))}
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">原型演示：贴题流程示意，暂不保存</p>
            <Button onClick={() => setPhase('attempt')}>贴好了，开始刷题</Button>
          </div>
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
                  <Button variant="destructive" onClick={() => { setPhase('solution'); setTimeUpMsg(null) }}>
                    <BookOpen className="size-4" /> 想不出，看题解
                  </Button>
                  <Button variant="outline" disabled={!allPass} title={allPass ? '' : '需先跑通全部用例'}>
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
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => openNote('pass')} disabled={!allPass} title={allPass ? '' : '需先跑通全部用例'}>
                    <CheckCircle2 className="size-4" /> 默写通过
                  </Button>
                  <Button variant="destructive" onClick={() => openNote('fail')}>
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
        </div>
      )}

      {/* ===== 完成态 ===== */}
      {phase === 'done' && (
        <div className="mx-auto max-w-md space-y-4 rounded-xl border bg-card p-8 text-center">
          {noteOutcome === 'pass' ? (
            <>
              <CheckCircle2 className="mx-auto size-14 text-emerald-500" />
              <h2 className="text-xl font-bold">默写通过，这题才算真的会了</h2>
              <p className="text-sm text-muted-foreground">
                已排期 <strong className="text-foreground">3 天后（2026-08-21）</strong> 复习，下次直接默写
              </p>
            </>
          ) : (
            <>
              <XCircle className="mx-auto size-14 text-amber-500" />
              <h2 className="text-xl font-bold">记下了，3 天后再战</h2>
              <p className="text-sm text-muted-foreground">
                默写失败很正常 -- 它会在 3 天后回到复习队列
              </p>
            </>
          )}
          {note && (
            <div className="rounded-lg border-dashed border bg-muted/40 p-3 text-sm">
              <span className="font-medium">一句话笔记：</span>{note}
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
            <Timer {...timerProps} />
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={runCases} disabled={!canRun || running}>
                <Play className="size-3.5" /> 运行用例
              </Button>
              {phase === 'attempt' ? (
                <Button size="sm" variant="destructive" onClick={() => { setZen(false); setPhase('solution') }}>
                  看题解
                </Button>
              ) : (
                <Button size="sm" onClick={() => { setZen(false); openNote('pass') }} disabled={!allPass}>
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

      {/* 一句话笔记弹窗 */}
      <Dialog open={noteOpen} onOpenChange={setNoteOpen}>
        <DialogContent className="max-w-lg">
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
            <Button variant="ghost" onClick={() => setNoteOpen(false)}>先跳过</Button>
            <Button onClick={saveNote}>保存笔记</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
