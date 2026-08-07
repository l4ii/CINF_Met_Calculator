const fs = require('fs')
const path = require('path')
const { spawnSync } = require('child_process')

function buildEnvironment(projectDir) {
  const arch = process.arch === 'ia32' || process.arch === 'arm64' ? process.arch : 'x64'
  const bundled7zaDir = path.join(projectDir, 'node_modules', '7zip-bin', 'win', arch)
  const env = { ...process.env, USE_SYSTEM_7ZA: 'false' }
  const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'PATH'
  env[pathKey] = `${bundled7zaDir}${path.delimiter}${env[pathKey] || ''}`
  if (pathKey !== 'PATH') delete env.PATH
  return env
}

/**
 * 使用 Windows 本机 app-builder 写入图标，再交给 NSIS 打包已经准备好的
 * win-unpacked 目录，避免触发 winCodeSign 的符号链接权限要求。
 */
function patchWinExecutableDirectory(appOutDir, projectDir) {
  const executableName = fs
    .readdirSync(appOutDir)
    .find((name) => name.toLowerCase().endsWith('.exe') && name.toLowerCase() !== 'elevate.exe')
  if (!executableName) {
    throw new Error(`无法在 ${appOutDir} 找到待写入图标的应用 EXE`)
  }

  const appBuilder = path.join(
    projectDir,
    'node_modules',
    'app-builder-bin',
    'win',
    'x64',
    'app-builder.exe'
  )
  const iconPath = path.join(projectDir, 'electron', 'build', 'icon.ico')
  const executablePath = path.join(appOutDir, executableName)
  const rceditArgs = [executablePath, '--set-icon', iconPath]
  let lastResult
  for (let attempt = 0; attempt < 3; attempt += 1) {
    lastResult = spawnSync(appBuilder, ['rcedit', `--args=${JSON.stringify(rceditArgs)}`], {
      stdio: 'inherit',
      windowsHide: true,
      env: buildEnvironment(projectDir),
    })
    if (!lastResult.error && lastResult.status === 0) return
    // electron-builder 刚退出时 Windows 可能仍短暂持有应用 EXE。
    if (attempt < 2) {
      const waitBuffer = new Int32Array(new SharedArrayBuffer(4))
      Atomics.wait(waitBuffer, 0, 0, 500)
    }
  }
  if (lastResult?.error) throw lastResult.error
  if (lastResult?.status !== 0) {
    throw new Error(`app-builder rcedit 写入应用图标失败，退出码: ${lastResult?.status}`)
  }
}

module.exports = { patchWinExecutableDirectory }
