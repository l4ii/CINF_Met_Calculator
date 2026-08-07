/**
 * 打包 Win 安装包（主线）：
 * 1) 打包前最后一次强制释放 release/win-unpacked，避免 app.asar 被占用
 * 2) 调用 electron-builder --win
 */
require('./electron-mirrors')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { spawnSync } = require('child_process')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..')

function buildEnvironment(options = {}) {
  const arch = process.arch === 'ia32' || process.arch === 'arm64' ? process.arch : 'x64'
  const bundled7zaDir = path.join(root, 'node_modules', '7zip-bin', 'win', arch)
  const env = {
    ...process.env,
    ...options,
    USE_SYSTEM_7ZA: 'false',
  }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH'
  const currentPath = env[pathKey] || ''
  env[pathKey] = `${bundled7zaDir}${path.delimiter}${currentPath}`
  if (pathKey !== 'PATH') delete env.PATH
  return env
}

function run(cmd, opts = {}) {
  console.log('>', cmd)
  // electron-builder ships a compatible 7za binary; keep builds independent of the machine PATH.
  const env = buildEnvironment(opts.env || {})
  execSync(cmd, { cwd: root, stdio: 'inherit', windowsHide: true, ...opts, env })
}

function sleepMs(ms) {
  const end = Date.now() + ms
  while (Date.now() < end) {}
}

function killProcessesUnderDir(absDir) {
  if (process.platform !== 'win32' || !fs.existsSync(absDir)) return
  const ps1 = [
    'param([Parameter(Mandatory=$true)][string]$Root)',
    '$root = [System.IO.Path]::GetFullPath($Root).TrimEnd([char]92)',
    'foreach ($proc in Get-CimInstance Win32_Process) {',
    '  if (-not $proc.ExecutablePath) { continue }',
    '  try { $ex = [System.IO.Path]::GetFullPath($proc.ExecutablePath) } catch { continue }',
    '  if ($ex.StartsWith($root + [char]92, [StringComparison]::OrdinalIgnoreCase)) {',
    '    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue',
    '  }',
    '}',
  ].join('\n')
  const tmp = path.join(os.tmpdir(), `metcal-kill-${process.pid}-${Date.now()}.ps1`)
  fs.writeFileSync(tmp, ps1, 'utf8')
  try {
    spawnSync(
      'powershell.exe',
      ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', tmp, '-Root', absDir],
      { stdio: 'ignore', windowsHide: true }
    )
  } finally {
    try {
      fs.unlinkSync(tmp)
    } catch (_) {}
  }
}

function forceRemoveWinUnpackedOnly(relativeReleaseDir) {
  const unpacked = path.join(root, relativeReleaseDir, 'win-unpacked')
  if (!fs.existsSync(unpacked)) return

  killProcessesUnderDir(unpacked)
  sleepMs(300)

  try {
    execSync('taskkill /f /im electron.exe 2>nul', { stdio: 'ignore', windowsHide: true })
  } catch (_) {}

  for (let i = 0; i < 3; i += 1) {
    try {
      execSync(`rd /s /q "${unpacked}"`, { stdio: 'ignore', windowsHide: true })
      return
    } catch (_) {
      killProcessesUnderDir(unpacked)
      sleepMs(500)
    }
  }
}

if (process.platform === 'win32') {
  console.log('[build-win] 释放 win-unpacked …')
  forceRemoveWinUnpackedOnly('release')
  forceRemoveWinUnpackedOnly('release-ai')
}

const builderConfig = process.env.CINF_ELECTRON_BUILDER_CONFIG
let builderCmd = 'npx electron-builder --win'
if (builderConfig) {
  const cfgPath = path.join(root, builderConfig)
  builderCmd += ` --config "${cfgPath}"`
}

function buildWindowsOutput(outputDir) {
  const outputArg = ` --config.directories.output="${outputDir}"`
  const unpackedDir = path.join(root, outputDir, 'win-unpacked')
  run(`${builderCmd}${outputArg} --dir`)
  run(`${builderCmd}${outputArg} --prepackaged "${unpackedDir}"`)
}

try {
  buildWindowsOutput('release')
} catch (e) {
  const fallbackOutput = `release-fallback-${Date.now()}`
  console.warn(`[build-win] 默认输出目录打包失败，自动切换到 ${fallbackOutput} 重试...`)
  if (process.platform === 'win32') {
    forceRemoveWinUnpackedOnly(fallbackOutput)
  }
  buildWindowsOutput(fallbackOutput)
}
