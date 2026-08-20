import { useRef, useState } from 'react'
import {
  Brain, Clock3, Globe2, Database,
  Download, Upload, Trash2, TriangleAlert, Lock,
} from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { SectionCard } from '@/components/SectionCard'
import { Stepper } from '@/components/Stepper'
import { useExportDb, useImportDb, useClearDb, useSettings, useUpdateSettings } from '@/lib/store'
import { seedSettings } from '@/data/seed'
import type { Lang } from '@/lib/types'

type Status = { kind: 'ok' | 'err'; msg: string } | null

/** 难度档位（用于刷题时长三列） */
const LEVELS = [
  { k: 'easy', label: 'Easy' },
  { k: 'medium', label: 'Medium' },
  { k: 'hard', label: 'Hard' },
] as const

export default function Settings() {
  const settings = useSettings()
  const updateSettings = useUpdateSettings()

  const exportDb = useExportDb()
  const importDb = useImportDb()
  const clearDb = useClearDb()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearText, setClearText] = useState('')

  // ai.apiKey 是 password 输入，空字符串与「未设置」不可区分，用本地态承载展示，
  // 失焦时写回 store；其余 ai 字段直接受控于 settings
  const [apiKey, setApiKey] = useState(settings.ai.apiKey)
  const [aiEnabled, setAiEnabled] = useState(settings.ai.apiKey !== '' || settings.ai.baseUrl !== '')

  const run = async (fn: () => Promise<void>, okMsg: string) => {
    setBusy(true)
    setStatus(null)
    try {
      await fn()
      setStatus({ kind: 'ok', msg: okMsg })
    } catch (e) {
      setStatus({ kind: 'err', msg: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  const onImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // 清空 value 以便能重复选同一文件
    e.target.value = ''
    void run(() => importDb(file), '已导入，题单已更新')
  }

  // —— AI 教练 ——
  const ai = settings.ai
  const patchAi = (patch: Partial<typeof ai>) => updateSettings({ ai: { ...ai, ...patch } })

  // —— 刷题时长 ——
  const patchTimeLimit = (k: 'easy' | 'medium' | 'hard', v: number) =>
    updateSettings({ timeLimitMin: { ...settings.timeLimitMin, [k]: v } })

  // —— 复习间隔(三等分:改任意一个,三者同步成同一个值)——
  const patchInterval = (_i: number, v: number) => {
    updateSettings({ intervalsDays: settings.intervalsDays.map(() => v) })
  }

  // —— 恢复默认（按卡片局部恢复，不动 AI key） ——
  const resetRhythm = () => {
    updateSettings({
      newPerDay: seedSettings.newPerDay,
      reviewPerDay: seedSettings.reviewPerDay,
      timeLimitMin: { ...seedSettings.timeLimitMin },
      intervalsDays: [...seedSettings.intervalsDays],
    })
  }
  const resetLang = () => updateSettings({ defaultLang: seedSettings.defaultLang })

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">改动自动保存到本机 data/db.json</p>
      </div>

      {/* ── AI 教练 ──────────────────────────────────────────────── */}
      <SectionCard
        icon={<Brain />}
        title="AI 教练"
        description="不启用时，软件是纯纪律工具，功能完整。"
        badge={
          <Badge variant={aiEnabled ? 'default' : 'secondary'} className="text-[10px]">
            {aiEnabled ? '已启用' : '未启用'}
          </Badge>
        }
      >
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">启用 AI 功能</div>
          <Switch
            checked={aiEnabled}
            onCheckedChange={(v) => {
              setAiEnabled(v)
              // 关闭即清 key，避免空开；开启不自动填，留给用户输入
              if (!v) {
                setApiKey('')
                patchAi({ apiKey: '' })
              }
            }}
          />
        </div>
        {aiEnabled && (
          <>
            <Separator />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="baseUrl">接口地址（OpenAI 兼容）</Label>
                <Input
                  id="baseUrl"
                  value={ai.baseUrl}
                  onChange={(e) => patchAi({ baseUrl: e.target.value })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="model">模型名</Label>
                <Input
                  id="model"
                  value={ai.model}
                  onChange={(e) => patchAi({ model: e.target.value })}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="apiKey" className="flex items-center gap-1.5">
                  <Lock className="size-3" /> API Key
                </Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  onBlur={() => patchAi({ apiKey })}
                  placeholder="sk-…（仅保存在本机 db.json，不上传任何地方）"
                />
              </div>
            </div>
            <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-2.5 text-xs text-foreground/80">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
              key 以明文存在本机 data/db.json 中（单机自用可接受），请勿把该文件连同 key 提交到公开仓库
            </div>
          </>
        )}
      </SectionCard>

      {/* ── 刷题节奏（合并：每日新题 / 每日复习 / 刷题时长 / 复习间隔）── */}
      <SectionCard
        icon={<Clock3 />}
        title="刷题节奏"
        description="复习优先，新题按节奏来；改完实时影响仪表盘推荐数量。"
        onReset={resetRhythm}
      >
        <div className="flex justify-start gap-16">
          <div className="space-y-3 flex-1 min-w-0 sm:max-w-44">
            <Label>每天新练</Label>
            <Stepper
              ariaLabel="每天新练题数"
              value={settings.newPerDay}
              onChange={(v) => updateSettings({ newPerDay: v })}
              min={1}
              max={20}
              unit="道"
            />
            <p className="text-xs text-muted-foreground">仪表盘「建议新题」一次列几道</p>
          </div>
          <div className="space-y-3 flex-1 min-w-0 sm:max-w-44">
            <Label>每天复习</Label>
            <Stepper
              ariaLabel="每天复习上限"
              value={settings.reviewPerDay}
              onChange={(v) => updateSettings({ reviewPerDay: v })}
              min={1}
              max={50}
              unit="道"
            />
            <p className="text-xs text-muted-foreground">逾期最久优先，超出的明天自然还在</p>
          </div>
        </div>

        <Separator />

        <div className="space-y-5">
          <Label>刷题时长（分钟）</Label>
          <div className="flex justify-evenly gap-4">
            {LEVELS.map(({ k, label }) => (
              <div key={k} className="space-y-1.5 flex-1 min-w-0 sm:max-w-44">
                <div className="text-xs text-muted-foreground">{label}</div>
                <Stepper
                  ariaLabel={`${label} 时长`}
                  value={settings.timeLimitMin[k]}
                  onChange={(v) => patchTimeLimit(k, v)}
                  min={1}
                  max={240}
                />
              </div>
            ))}
          </div>
        </div>

        <Separator />

        <div className="space-y-5">
          <Label>复习间隔（天）</Label>
          <div className="flex justify-evenly gap-4">
            {settings.intervalsDays.map((d, i) => (
              <div key={i} className="space-y-1.5 flex-1 min-w-0 sm:max-w-44">
                <div className="text-xs text-muted-foreground">第 {i + 1} 次复习</div>
                <Stepper
                  ariaLabel={`第 ${i + 1} 次复习间隔`}
                  value={d}
                  onChange={(v) => patchInterval(i, v)}
                  min={1}
                  max={365}
                />
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            三等分间隔（任一调整三者同步）。走完所有间隔 → 标记为「过关了」。过了间隔还记得，才进入长期记忆（艾宾浩斯）。
          </p>
        </div>
      </SectionCard>

      {/* ── 默认语言 ──────────────────────────────────────────────── */}
      <SectionCard
        icon={<Globe2 />}
        title="默认语言"
        description="新题 / 没有上次记录时用的语言。"
        onReset={resetLang}
      >
        <Select
          value={settings.defaultLang}
          onValueChange={(v) => updateSettings({ defaultLang: v as Lang })}
        >
          <SelectTrigger id="defaultLang" className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="python">Python</SelectItem>
            <SelectItem value="javascript">JavaScript</SelectItem>
          </SelectContent>
        </Select>
      </SectionCard>

      {/* ── 数据管理 ──────────────────────────────────────────────── */}
      <SectionCard
        icon={<Database />}
        title="数据管理"
        description={
          <>
            保存在 <code className="rounded bg-muted px-1 py-0.5 font-mono text-xs">data/db.json</code>，每日自动备份（保留 30 份）。
          </>
        }
      >
        {/* 安全区 */}
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => run(exportDb, '已导出 db.json')}
          >
            <Download className="size-4" /> 导出备份
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
          >
            <Upload className="size-4" /> 导入备份
          </Button>
        </div>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          hidden
          onChange={onImportFile}
        />
        <p className="text-xs text-muted-foreground">
          导入会覆盖当前数据，请先导出备份。
        </p>

        {/* 危险区 */}
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3">
          <div className="flex items-start gap-2">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            <div className="flex-1 space-y-2">
              <div>
                <div className="text-sm font-medium text-destructive">危险区</div>
                <div className="text-xs text-muted-foreground">
                  清空会删除所有题目的进度、历史、笔记、SRS 排期（设置与 API key 保留）。
                </div>
              </div>
              <Button
                variant="destructive"
                size="sm"
                disabled={busy}
                onClick={() => { setClearText(''); setClearOpen(true) }}
              >
                <Trash2 className="size-4" /> 清空全部数据
              </Button>
            </div>
          </div>
        </div>

        {status && (
          <p className={`text-xs ${status.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
            {status.msg}
          </p>
        )}
      </SectionCard>

      {/* 清空全部数据二次确认 */}
      <Dialog open={clearOpen} onOpenChange={setClearOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>清空全部数据？</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            会清空所有题目的进度、历史、笔记、SRS 排期（设置与 API key 保留）。
            建议先<strong>导出备份</strong>，导入可完整还原。
          </p>
          <div className="space-y-1.5">
            <Label htmlFor="clearConfirm">输入「确认」以继续</Label>
            <Input
              id="clearConfirm"
              value={clearText}
              onChange={(e) => setClearText(e.target.value)}
              placeholder="确认"
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setClearOpen(false)}>取消</Button>
            <Button
              variant="destructive"
              disabled={clearText !== '确认' || busy}
              onClick={() => {
                void run(async () => {
                  await clearDb()
                  setClearOpen(false)
                }, '已清空全部题目，设置保留')
              }}
            >
              清空
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
