// 用例表编辑器（S2-F2）。原型仅展示用例，这里补「增/删/改」：
// 每条用例可改标签、参数（多个 JSON 字面量，可增删）、期望输出、以及结果取自哪个入参
// （outArg：原地修改型函数如 88 merge 返回 None、结果在 nums1 → 选「入参1」）。
// args / expected 统一存 JSON 字面量字符串，与判题器 S0-judge 对齐。

import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { TestCase } from '@/lib/types'

interface Props {
  testCases: TestCase[]
  onChange: (tcs: TestCase[]) => void
}

export function TestCaseEditor({ testCases, onChange }: Props) {
  const update = (i: number, patch: Partial<TestCase>) =>
    onChange(testCases.map((tc, j) => (j === i ? { ...tc, ...patch } : tc)))
  const remove = (i: number) => onChange(testCases.filter((_, j) => j !== i))
  const add = () =>
    onChange([...testCases, { label: `用例${testCases.length + 1}`, args: [''], expected: '' }])

  const setArg = (i: number, ai: number, val: string) => {
    const args = [...testCases[i].args]
    args[ai] = val
    update(i, { args })
  }

  return (
    <div className="space-y-2">
      {testCases.map((tc, i) => (
        <div key={i} className="space-y-2 rounded-lg border p-2">
          <div className="flex items-center gap-2">
            <Input
              value={tc.label}
              onChange={(e) => update(i, { label: e.target.value })}
              className="h-7 w-28"
              placeholder="标签"
            />
            <span className="text-xs text-muted-foreground shrink-0">结果取自</span>
            <OutArgSelect tc={tc} onChange={(v) => update(i, { outArg: v })} />
            <Button
              variant="ghost"
              size="icon"
              className="ml-auto size-7 shrink-0"
              onClick={() => remove(i)}
              title="删除用例"
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground shrink-0">args</span>
            {tc.args.map((a, ai) => (
              <div key={ai} className="flex items-center gap-1">
                <Input
                  value={a}
                  onChange={(e) => setArg(i, ai, e.target.value)}
                  className="h-7 w-28 font-mono text-xs"
                  placeholder="JSON 字面量"
                />
                <button
                  type="button"
                  onClick={() => update(i, { args: tc.args.filter((_, j) => j !== ai) })}
                  className="px-0.5 text-muted-foreground transition-colors hover:text-foreground"
                  title="删除参数"
                >
                  ×
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => update(i, { args: [...tc.args, ''] })}
              className="flex items-center text-muted-foreground transition-colors hover:text-foreground"
              title="加参数"
            >
              <Plus className="size-3.5" />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-10 shrink-0 text-xs text-muted-foreground">期望</span>
            <Input
              value={tc.expected}
              onChange={(e) => update(i, { expected: e.target.value })}
              className="h-7 font-mono text-xs"
              placeholder="JSON 字面量"
            />
          </div>
        </div>
      ))}
      <Button variant="outline" size="sm" onClick={add}>
        <Plus className="size-3.5" /> 添加用例
      </Button>
    </div>
  )
}

/** outArg 选择：返回值（undefined）或 第 N 个入参（原地修改型） */
function OutArgSelect({ tc, onChange }: { tc: TestCase; onChange: (v: number | undefined) => void }) {
  const value = tc.outArg == null ? 'ret' : String(tc.outArg)
  // 选项数：至少覆盖现有参数数与已选 outArg
  const n = Math.max(tc.args.length, tc.outArg != null ? tc.outArg + 1 : 0)
  return (
    <Select value={value} onValueChange={(v) => onChange(v === 'ret' ? undefined : Number(v))}>
      <SelectTrigger size="sm" className="h-7 w-28">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="ret">返回值</SelectItem>
        {Array.from({ length: n }, (_, k) => (
          <SelectItem key={k} value={String(k)}>
            入参{k + 1}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}