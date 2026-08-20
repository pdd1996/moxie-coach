import path from 'node:path'
import fs from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'

// ===== S0-data-layer：磁盘持久化中间件 =====
// 挂 /api/db 路由，Vite 开发服务期读写 data/db.json；原子写入 + 每日备份。
// 顺序写死（spec D）：GET 时若 db.json 不存在 → 先用 seed 生成并落盘 → 再做备份判定，
// 否则会把空文件 / 旧文件备份成「当天」。
//
// seed 不静态 import：它属于 app 项目（bundler 解析、@ 别名），静态 import 会把它拉进
// node 项目的 nodenext 解析（要求显式扩展名）而冲突。改用 server.ssrLoadModule 在运行期
// 经 Vite 管线加载，tsc 不跨项目检查，@ 别名与 TS 由 Vite 一并处理。

const MAX_BACKUPS = 30
const MAX_BODY = 10 * 1024 * 1024 // 10MB：本地单机全量 db 足够，防手滑/异常大请求
const SEED_URL = '/src/data/seed.ts'

/** PUT 请求体超上限时抛出，便于处理器回 413 */
class BodyTooLarge extends Error {}

function todayStamp(d = new Date()): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}${m}${day}`
}

/**
 * 写临时文件再 rename：同分区 rename 原子，落库瞬间目标文件不会被写成半截。
 * 注意并未 fsync——数据可能还在 OS page cache，断电可能整体写丢（旧内容或空文件，
 * 但不会是半截）。dev server 单机本地库可接受，不追求断电耐久。
 *
 * tmp 名带 pid + 时间戳 + 随机串：两个并发 PUT 不再抢同一个 .tmp
 * （旧实现固定 `${filePath}.tmp`，并发 PUT 会互相覆盖对方的 tmp 再 rename，串数据）。
 * rename 对 Windows 占用类错误（EPERM/EBUSY/EACCES，目标被并发 reader 如 maybeBackup
 * 的 copyFile 短暂占用时抛）做有限退避重试——rename 本身原子，重试只是等占用方释放，
 * 不会写出半截文件。非占用类错误不重试，清理 tmp 后直接抛。
 */
async function writeAtomic(filePath: string, data: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  const tmp = `${filePath}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`
  await fs.writeFile(tmp, data, 'utf8')
  const RETRIES = 5
  let lastErr: unknown
  for (let i = 0; i < RETRIES; i++) {
    try {
      await fs.rename(tmp, filePath)
      return
    } catch (err) {
      lastErr = err
      const code = (err as NodeJS.ErrnoException).code
      if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') {
        await fs.unlink(tmp).catch(() => {})
        throw err
      }
      // 20/40/60/80/100ms 退避，等并发 reader 释放目标句柄
      await new Promise((r) => setTimeout(r, 20 * (i + 1)))
    }
  }
  await fs.unlink(tmp).catch(() => {})
  throw lastErr
}

/**
 * 启动时清理 writeAtomic 残留的孤儿 tmp：唯一 tmp 名后，crash 在 writeFile 与 rename
 * 之间会留下 `db.json.<pid>.<ts>.<rand>.tmp`（旧固定名实现靠下次成功写覆盖同名 tmp 自清，
 * 唯一名失去这自清，故需显式扫）。在 configureServer 阶段调用，此时 server 尚未 listen，
 * 不会有并发请求写新 tmp 被误删。仅扫 db.json 的 tmp，不动 .corrupt-*.json（那是人工留存）。
 */
async function sweepOrphanTmp(dataDir: string, dbBase: string): Promise<void> {
  let files: string[]
  try {
    files = await fs.readdir(dataDir)
  } catch {
    return
  }
  const re = new RegExp(`^${dbBase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}.*\\.tmp$`)
  await Promise.all(
    files
      .filter((f) => re.test(f))
      .map((f) => fs.unlink(path.join(dataDir, f)).catch(() => {})),
  )
}

/** 校验是合法 db 结构（顶层有 problems 数组 + settings 对象，与 S9-F9 导入校验对齐） */
function isValidDb(v: unknown): v is { problems: unknown[]; settings: unknown } {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return Array.isArray(o.problems) && typeof o.settings === 'object' && o.settings !== null
}

/**
 * db.json 不存在则用种子生成并落盘（D：先 seed 再备份）。
 * 存在但损坏（坏 JSON / 缺字段）时：先把坏文件改名留存供人工恢复，再重新 seed——
 * 既不备份到坏文件、也不静默丢用户数据。
 */
async function ensureDb(
  dbPath: string,
  loadSeed: () => Promise<{ seedProblems: unknown[]; seedSettings: unknown }>,
): Promise<void> {
  let raw: string | null = null
  try {
    raw = await fs.readFile(dbPath, 'utf8')
  } catch {
    // 不存在 → 落盘种子（下面的 seed 分支）
  }
  if (raw != null) {
    try {
      if (isValidDb(JSON.parse(raw))) return // 存在且合法，直接用
    } catch {
      // 坏 JSON → 落到下面的「留存坏文件 + 重新 seed」
    }
    const corrupt = `${dbPath}.corrupt-${Date.now()}.json`
    await fs.rename(dbPath, corrupt).catch(() => {})
    console.warn(
      `[moxie-db] db.json 损坏，已留存为 ${path.basename(corrupt)} 并重新生成种子`,
    )
  }
  const { seedProblems, seedSettings } = await loadSeed()
  const db = { problems: seedProblems, settings: seedSettings }
  await writeAtomic(dbPath, `${JSON.stringify(db, null, 2)}\n`)
}

/** 每日首次备份：当天无 db-YYYYMMDD.json 则复制当前 db；超出 30 份删最旧 */
async function maybeBackup(dbPath: string, backupsDir: string): Promise<void> {
  await fs.mkdir(backupsDir, { recursive: true })
  const todayFile = `db-${todayStamp()}.json`
  const before = await fs.readdir(backupsDir)
  if (!before.includes(todayFile)) {
    // 复制当前 db（此时 ensureDb 已保证它存在且非空）
    await fs.copyFile(dbPath, path.join(backupsDir, todayFile))
  }
  const all = (await fs.readdir(backupsDir))
    .filter((f) => /^db-\d{8}\.json$/.test(f))
    .sort() // YYYYMMDD 字典序即时间序
  if (all.length > MAX_BACKUPS) {
    const stale = all.slice(0, all.length - MAX_BACKUPS)
    await Promise.all(stale.map((f) => fs.unlink(path.join(backupsDir, f)).catch(() => {})))
  }
}

/** 读取整个请求体（PUT 全量 db.json），超 MAX_BODY 停止缓存并排空流，抛 BodyTooLarge */
function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    let tooLarge = false
    const onData = (c: Buffer) => {
      size += c.length
      if (size > MAX_BODY) {
        tooLarge = true
        req.off('data', onData)
        // 不 destroy socket（否则 413 发不出去）：摘掉 data 监听后 resume 排空剩余体，
        // 维持连接以便处理器回 413
        req.resume()
        reject(new BodyTooLarge())
        return
      }
      chunks.push(c)
    }
    req.on('data', onData)
    req.on('end', () => {
      if (!tooLarge) resolve(Buffer.concat(chunks).toString('utf8'))
    })
    req.on('error', (err) => {
      if (!tooLarge) reject(err)
    })
  })
}

/**
 * S0-judge：把 vendored Pyodide 作为静态文件服务在 /pyodide/。
 *
 * 为什么不用 public/ 默认静态：Vite dev 禁止把 public 目录里的文件当 ESM 模块 import
 * （public 守卫在 transform 管线里拦截，@vite-ignore / 变量说明符都躲不过运行期那一关）。
 * 这里在 Vite transform 之前直接把 /pyodide/* 以正确 Content-Type 吐回去，请求不落
 * 到 public 守卫；pyodide.worker.ts 里的 `import('/pyodide/pyodide.mjs')` 即可工作。
 * 文件实体仍在 public/pyodide/（构建时 Vite 自动拷到 dist/pyodide/），此处只接管 dev 服务。
 */
const PYODIDE_TYPES: Record<string, string> = {
  '.mjs': 'text/javascript',
  '.js': 'text/javascript',
  '.wasm': 'application/wasm',
  '.zip': 'application/zip',
  '.json': 'application/json',
}

export function pyodideStatic(): Plugin {
  return {
    name: 'moxie-pyodide-static',
    configureServer(server) {
      const pyodideDir = path.resolve(server.config.root, 'public/pyodide')
      server.middlewares.use(async (req, res, next) => {
        const url = req.url ?? ''
        if (!url.startsWith('/pyodide/')) return next()
        const rel = decodeURIComponent(url.slice('/pyodide/'.length).split('?')[0]!)
        // 防路径穿越：只允许简单文件名
        if (rel.includes('..') || path.isAbsolute(rel)) return next()
        const file = path.join(pyodideDir, rel)
        try {
          const data = await fs.readFile(file)
          const ext = path.extname(file)
          res.setHeader('Content-Type', PYODIDE_TYPES[ext] ?? 'application/octet-stream')
          // 本 handler 在全局设头中间件之前接管了 /pyodide/，这里自行带上全套隔离头，
          // 不依赖插件注册顺序（COOP/COEP 文档级生效，CORP 供 worker 内子资源加载）
          res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
          res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
          res.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
          res.end(data)
        } catch {
          next()
        }
      })
    },
  }
}

export function dbApi(): Plugin {
  return {
    name: 'moxie-db',
    configureServer(server) {
      const root = server.config.root
      const dataDir = path.resolve(root, 'data')
      const dbPath = path.join(dataDir, 'db.json')
      const backupsDir = path.join(dataDir, 'backups')

      // 启动即清 writeAtomic 残留的孤儿 tmp（server 尚未 listen，无并发请求）
      void sweepOrphanTmp(dataDir, 'db.json').catch(() => {})

      const loadSeed = () =>
        server.ssrLoadModule(SEED_URL) as Promise<{
          seedProblems: unknown[]
          seedSettings: unknown
        }>

      // 跨源隔离头（供 S0-judge 的 SharedArrayBuffer 用，见 S0-judge）
      server.middlewares.use((_req, res, next) => {
        res.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
        res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp')
        next()
      })

      server.middlewares.use('/api/db', async (req, res) => {
        try {
          if (req.method === 'GET') {
            await ensureDb(dbPath, loadSeed)
            await maybeBackup(dbPath, backupsDir)
            const raw = await fs.readFile(dbPath, 'utf8')
            res.setHeader('Content-Type', 'application/json; charset=utf-8')
            res.end(raw)
            return
          }
          if (req.method === 'PUT') {
            let body: string
            try {
              body = await readBody(req)
            } catch (err) {
              if (err instanceof BodyTooLarge) {
                res.statusCode = 413
                res.end('body too large')
              } else {
                res.statusCode = 400
                res.end('read body failed')
              }
              return
            }
            try {
              JSON.parse(body) // 仅校验是合法 JSON
            } catch {
              res.statusCode = 400
              res.end('bad json')
              return
            }
            await writeAtomic(dbPath, body)
            res.statusCode = 204
            res.end()
            return
          }
          res.statusCode = 405
          res.setHeader('Allow', 'GET, PUT')
          res.end('method not allowed')
        } catch (err) {
          console.error('[moxie-db] error:', err)
          res.statusCode = 500
          res.end('internal error')
        }
      })
    },
  }
}