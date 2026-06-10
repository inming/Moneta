#!/usr/bin/env node
/**
 * 构建 moneta-mcp sidecar 并按 Tauri externalBin 约定命名
 * （binaries/moneta-mcp-<target-triple>[.exe]）。
 * Tauri 打包时会自动把对应 triple 的二进制收进 bundle，与主程序同目录。
 *
 * 目标 triple 默认取 rustc host；CI 交叉编译时通过 MONETA_SIDECAR_TARGET 指定。
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, copyFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const srcTauri = join(__dirname, '..', 'src-tauri')

const isRelease = !process.argv.includes('--debug')
const profileArgs = isRelease ? ['--release'] : []
const profileDir = isRelease ? 'release' : 'debug'

// 目标 triple：优先环境变量（CI 交叉编译），否则取 rustc host
let triple = process.env.MONETA_SIDECAR_TARGET
if (!triple) {
  const rustcInfo = execFileSync('rustc', ['-vV'], { encoding: 'utf-8' })
  triple = rustcInfo.match(/host:\s*(\S+)/)?.[1]
}
if (!triple) {
  console.error('无法确定 target triple（设置 MONETA_SIDECAR_TARGET 或确保 rustc 可用）')
  process.exit(1)
}

const targetArgs = process.env.MONETA_SIDECAR_TARGET ? ['--target', triple] : []
const targetDir = process.env.MONETA_SIDECAR_TARGET
  ? join(srcTauri, 'target', triple, profileDir)
  : join(srcTauri, 'target', profileDir)

console.log(`[build-sidecar] cargo build -p moneta-mcp (${profileDir}, ${triple}) ...`)
execFileSync('cargo', ['build', '-p', 'moneta-mcp', ...profileArgs, ...targetArgs], {
  cwd: srcTauri,
  stdio: 'inherit'
})

const ext = triple.includes('windows') ? '.exe' : ''
const built = join(targetDir, `moneta-mcp${ext}`)
const outDir = join(srcTauri, 'binaries')
mkdirSync(outDir, { recursive: true })
const dest = join(outDir, `moneta-mcp-${triple}${ext}`)
copyFileSync(built, dest)
console.log(`[build-sidecar] -> ${dest}`)
