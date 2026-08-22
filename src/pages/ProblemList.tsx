import { Fragment, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, ExternalLink, Star, StickyNote } from 'lucide-react'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table'
import { useProblems } from '@/lib/store'
import { STAGE_INFO, STATUS_LABEL, leetcodeUrl, type Problem, type Stage } from '@/lib/types'
import { DIFF_BADGE } from '@/lib/badges'
import { cn } from '@/lib/utils'

const STATUS_BADGE: Record<string, string> = {
  new: 'bg-muted text-muted-foreground',
  'in-progress': 'bg-blue-500/15 text-blue-600 dark:text-blue-400',
  learned: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  mastered: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  skipped: 'bg-muted text-muted-foreground',
}

function ProblemRow({ p }: { p: Problem }) {
  return (
    <TableRow className={cn(p.optional && 'opacity-60')}>
      <TableCell className="font-mono text-xs text-muted-foreground">{p.id}</TableCell>
      <TableCell>
        <Link to={`/problem/${p.id}`} className="font-medium hover:underline">
          {p.title}
        </Link>
        {p.optional && (
          <span className="ml-2 align-middle text-[10px] text-muted-foreground/80">选做</span>
        )}
        {p.note && (
          <StickyNote
            className="ml-2 inline size-3.5 align-middle text-amber-500"
            aria-label="有笔记"
          >
            <title>{p.note}</title>
          </StickyNote>
        )}
      </TableCell>
      <TableCell>
        <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', DIFF_BADGE[p.difficulty])}>
          {p.difficulty}
        </span>
      </TableCell>
      <TableCell className="text-xs">{p.pattern}</TableCell>
      <TableCell className="hidden max-w-52 truncate text-xs text-muted-foreground md:table-cell">
        {p.signal ?? '-'}
      </TableCell>
      <TableCell>
        <span className="inline-flex items-center gap-1">
          <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs', STATUS_BADGE[p.status])}>
            {STATUS_LABEL[p.status]}
          </span>
          {p.self && (
            <Star
              className="size-3.5 text-amber-500"
              fill="currentColor"
              aria-label="自解"
            >
              <title>我顺极了 —— 没看题解自己解出来的</title>
            </Star>
          )}
          {p.lastFail && (
            <span
              className="inline-flex rounded-full bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-600 dark:text-amber-400"
              title="上次没默过"
            >
              易错
            </span>
          )}
        </span>
      </TableCell>
      <TableCell className="text-right">
        <div className="flex items-center justify-end gap-1">
          <Button asChild size="sm" variant={p.status === 'new' ? 'default' : 'outline'}>
            <Link to={`/problem/${p.id}`}>{p.status === 'new' ? '开始' : '继续'}</Link>
          </Button>
          <Button variant="ghost" size="icon" className="size-8" asChild>
            <a href={leetcodeUrl(p)} target="_blank" rel="noreferrer" title="LeetCode 题目页">
              <ExternalLink className="size-3.5" />
            </a>
          </Button>
        </div>
      </TableCell>
    </TableRow>
  )
}

type ProblemGroup = { stage: number; pattern: string; rows: Problem[] }

function ProblemTable({
  groups,
  empty,
  showStage,
}: {
  groups: ProblemGroup[]
  empty: boolean
  showStage: boolean
}) {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-14">题号</TableHead>
            <TableHead>题目</TableHead>
            <TableHead className="w-16">难度</TableHead>
            <TableHead className="w-36">套路</TableHead>
            <TableHead className="hidden md:table-cell">判断信号</TableHead>
            <TableHead className="w-20">状态</TableHead>
            <TableHead className="w-28 text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {groups.map(({ stage, pattern, rows }) => (
            <Fragment key={`${stage}:${pattern}`}>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableCell colSpan={7} className="py-1.5 text-xs font-medium text-muted-foreground">
                  {showStage && `阶段${'一二三四'[stage - 1]} · `}
                  {pattern} · {rows.length} 题
                </TableCell>
              </TableRow>
              {rows.map((p) => (
                <ProblemRow key={p.id} p={p} />
              ))}
            </Fragment>
          ))}
          {empty && (
            <TableRow>
              <TableCell colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                没有匹配的题目
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  )
}

export default function ProblemList() {
  const problems = useProblems()
  const [q, setQ] = useState('')
  const [stage, setStage] = useState<string>('1')

  // 搜索态全局匹配（跨阶段）；浏览态只看当前阶段
  const searching = q.trim() !== ''

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase()
    const match = (p: Problem) =>
      !kw || p.title.toLowerCase().includes(kw) || String(p.id).includes(kw) || p.pattern.includes(kw)
    return searching ? problems.filter(match) : problems.filter((p) => String(p.stage) === stage && match(p))
  }, [problems, q, stage, searching])

  // 各阶段总题数（不受搜索影响）：切 Tab 时解释表格长短差异
  const stageCount = useMemo(() => {
    const counts = new Map<string, number>()
    for (const p of problems) counts.set(String(p.stage), (counts.get(String(p.stage)) ?? 0) + 1)
    return counts
  }, [problems])

  // 分组键带阶段：搜索态跨阶段时先按阶段升序、再按套路主名；浏览态单一阶段，等效于只按套路。组内按题号
  const grouped = useMemo(() => {
    const groups = new Map<string, { stage: number; pattern: string; rows: Problem[] }>()
    for (const p of filtered) {
      const key = `${p.stage}:${p.pattern}`
      const g = groups.get(key)
      if (g) g.rows.push(p)
      else groups.set(key, { stage: p.stage, pattern: p.pattern, rows: [p] })
    }
    return [...groups.values()]
      .sort((a, b) => a.stage - b.stage || a.pattern.localeCompare(b.pattern, 'zh-Hans'))
      .map((g) => ({ ...g, rows: g.rows.sort((x, y) => x.id - y.id) }))
  }, [filtered])

  return (
    <div className="mx-auto max-w-6xl space-y-4 p-4 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">面试经典 150 题</h1>
          <p className="mt-1 text-sm text-muted-foreground">按套路分组刷，别按数量跳着刷</p>
        </div>
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="搜题号 / 标题 / 套路" className="w-64 pl-8" />
        </div>
      </div>

      {searching ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            搜索 “{q.trim()}” · 共 {filtered.length} 题（跨阶段）
          </p>
          <ProblemTable groups={grouped} empty={filtered.length === 0} showStage />
        </div>
      ) : (
        <Tabs value={stage} onValueChange={setStage}>
          <TabsList className="flex-wrap">
            {([1, 2, 3, 4] as Stage[]).map((s) => (
              <TabsTrigger key={s} value={String(s)}>
                阶段{'一二三四'[s - 1]}
              </TabsTrigger>
            ))}
          </TabsList>

          {([1, 2, 3, 4] as Stage[]).map((s) => (
            <TabsContent key={s} value={String(s)} className="space-y-4">
              <p className="text-sm text-muted-foreground">
                {STAGE_INFO[s].title} · {STAGE_INFO[s].theme} · {stageCount.get(String(s)) ?? 0} 题
                {s === 2 && '（含多线程选做题）'}
              </p>
              <ProblemTable groups={grouped} empty={filtered.length === 0} showStage={false} />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
