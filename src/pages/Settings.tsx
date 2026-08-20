import { useRef, useState } from 'react'
import { Download, Upload, Trash2, TriangleAlert } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Separator } from '@/components/ui/separator'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import { useExportDb, useImportDb, useClearDb } from '@/lib/store'

type Status = { kind: 'ok' | 'err'; msg: string } | null

export default function Settings() {
  const [aiEnabled, setAiEnabled] = useState(true)
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('deepseek-chat')

  const exportDb = useExportDb()
  const importDb = useImportDb()
  const clearDb = useClearDb()
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<Status>(null)
  const [clearOpen, setClearOpen] = useState(false)
  const [clearText, setClearText] = useState('')

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

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 md:p-8">
      <div>
        <h1 className="text-2xl font-bold">设置</h1>
        <p className="mt-1 text-sm text-muted-foreground">原型演示：设置暂不持久化</p>
      </div>

      {/* AI 教练 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            AI 教练
            <Badge variant={aiEnabled ? 'default' : 'secondary'}>{aiEnabled ? '已启用' : '未启用'}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm font-medium">启用 AI 功能</div>
              <div className="text-xs text-muted-foreground">不启用时，软件是纯纪律工具，功能完整</div>
            </div>
            <Switch checked={aiEnabled} onCheckedChange={setAiEnabled} />
          </div>
          {aiEnabled && (
            <>
              <Separator />
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="baseUrl">接口地址（OpenAI 兼容）</Label>
                  <Input id="baseUrl" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="model">模型名</Label>
                  <Input id="model" value={model} onChange={(e) => setModel(e.target.value)} />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label htmlFor="apiKey">API Key</Label>
                  <Input
                    id="apiKey"
                    type="password"
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="sk-…（仅保存在本机 db.json，不上传任何地方）"
                  />
                </div>
              </div>
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/5 p-2.5 text-xs text-muted-foreground">
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber-500" />
                key 以明文存在本机 data/db.json 中（单机自用可接受），请勿把该文件连同 key 提交到公开仓库
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* 刷题时长 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">刷题时长（分钟）</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            {[
              { k: 'easy', label: 'Easy' },
              { k: 'medium', label: 'Medium' },
              { k: 'hard', label: 'Hard' },
            ].map(({ k, label }) => (
              <div key={k} className="space-y-1.5">
                <Label htmlFor={k}>{label}</Label>
                <Input id={k} type="number" defaultValue={k === 'easy' ? 15 : 25} min={5} max={120} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            卡住就停，别死磕 -- Easy 全做、Medium 选做、Hard 只看题解
          </p>
        </CardContent>
      </Card>

      {/* SRS 间隔 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">复习间隔（天）</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-4 items-end gap-4">
            {[3, 7, 14].map((d, i) => (
              <div key={i} className="space-y-1.5">
                <Label>第 {i + 1} 次复习</Label>
                <Input type="number" defaultValue={d} min={1} max={365} />
              </div>
            ))}
            <div className="pb-2 text-sm text-muted-foreground">之后 → 掌握 ✓</div>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">3 天后还记得，才变成长期记忆（艾宾浩斯）</p>
        </CardContent>
      </Card>

      {/* 数据管理 */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">数据管理</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-xs text-muted-foreground">
            数据保存在 <code className="rounded bg-muted px-1 py-0.5 font-mono">data/db.json</code>，每日自动备份（保留 30 份）
          </p>
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
            <Button
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => { setClearText(''); setClearOpen(true) }}
            >
              <Trash2 className="size-4" /> 清空全部数据
            </Button>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={onImportFile}
          />
          {status && (
            <p className={`text-xs ${status.kind === 'ok' ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive'}`}>
              {status.msg}
            </p>
          )}
          <p className="text-xs text-muted-foreground">
            导入会覆盖当前数据，请先导出备份；清空仅删题目进度，保留设置（API key 等）
          </p>
        </CardContent>
      </Card>

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
