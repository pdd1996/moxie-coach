#!/usr/bin/env node
// S0-judge D2：本地打包 Pyodide（不走 CDN，离线可用）。
// 用 `npm pack pyodide` 拉官方 npm tarball（含 pyodide.js/.mjs、.asm.wasm/.mjs、
// python_stdlib.zip、pyodide-lock.json），解压到 public/pyodide/ 并裁掉无关文件。
// public/pyodide/ 已在 .gitignore（约 14MB，不入库），换机/clone 后跑一次本脚本即可。
//
// 用法：node scripts/setup-pyodide.mjs

import { execFileSync } from 'node:child_process'
import { rmSync, readdirSync, statSync, mkdirSync, renameSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { mkdtempSync } from 'node:fs'

const KEEP = new Set([
  'pyodide.js',
  'pyodide.mjs',
  'pyodide.asm.wasm',
  'pyodide.asm.mjs',
  'python_stdlib.zip',
  'pyodide-lock.json',
])

const dest = resolve('public/pyodide')

function run(cmd, args, opts = {}) {
  execFileSync(cmd, args, { stdio: 'inherit', shell: process.platform === 'win32', ...opts })
}

function main() {
  const work = mkdtempSync(join(tmpdir(), 'pyodide-'))
  process.chdir(work)
  console.log('[setup-pyodide] 下载 npm tarball（约 6MB）…')
  run('npm', ['pack', 'pyodide'], { cwd: work })
  const tgz = readdirSync(work).find((f) => /^pyodide-.*\.tgz$/.test(f))
  if (!tgz) throw new Error('npm pack 未生成 tarball')
  const pkgDir = join(work, 'pkg')
  mkdirSync(pkgDir, { recursive: true })
  // tar 在 Windows git-bash 与 *nix 均自带
  run('tar', ['xzf', join(work, tgz), '-C', pkgDir, '--strip-components=1'])

  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })

  let total = 0
  for (const f of readdirSync(pkgDir)) {
    if (!KEEP.has(f)) continue
    const from = join(pkgDir, f)
    renameSync(from, join(dest, f))
    total += statSync(join(dest, f)).size
  }
  console.log(`[setup-pyodide] 完成：${KEEP.size} 个文件写入 ${dest}（约 ${(total / 1024 / 1024).toFixed(1)}MB）`)
}

main()