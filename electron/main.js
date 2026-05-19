const { app, BrowserWindow, dialog, ipcMain, nativeImage } = require('electron')
const path = require('path')
const http = require('http')
const { spawn, execSync } = require('child_process')
const fs = require('fs')
const os = require('os')
const { autoUpdater } = require('electron-updater')
const license = require('./license')

/**
 * 打包后固定 userData，避免 productName 变化导致 offline-license.dat 路径漂移、反复要求激活。
 */
function prepareStableUserDataPath() {
  if (!app.isPackaged) return
  const appData = app.getPath('appData')
  const stableDir = path.join(appData, 'CINF_MetBatch')
  const licenseFile = license.LICENSE_BASENAME

  const legacyDirs = new Set()
  try {
    legacyDirs.add(app.getPath('userData'))
  } catch (_) {
    /* ignore */
  }
  for (const folderName of ['met_calculator', '长沙院冶金智能配料软件']) {
    legacyDirs.add(path.join(appData, folderName))
  }

  const destLicense = path.join(stableDir, licenseFile)
  if (!fs.existsSync(destLicense)) {
    for (const dir of legacyDirs) {
      if (!dir) continue
      if (path.resolve(dir) === path.resolve(stableDir)) continue
      const src = path.join(dir, licenseFile)
      if (fs.existsSync(src)) {
        try {
          fs.mkdirSync(stableDir, { recursive: true })
          fs.copyFileSync(src, destLicense)
        } catch (e) {
          console.error('离线许可迁移失败:', e)
        }
        break
      }
    }
  }

  try {
    app.setPath('userData', stableDir)
  } catch (e) {
    console.error('setPath userData 失败:', e)
  }
}

prepareStableUserDataPath()

/** 与 frontend/src/constants/appCopy.ts 中 APP_NAME_ZH / APP_TAGLINE_ZH 保持同步 */
const APP_DISPLAY_NAME = '长沙院冶金智能配料软件'
const APP_SPLASH_TAGLINE = '基于能量守恒与质量守恒定律的专业冶金配料计算工具。'

// 仅根据是否打包判断：打包后的 exe 始终为生产模式
const isDev = !app.isPackaged

function parseEnvBool(raw) {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase()
  if (!v) return null
  if (['1', 'true', 'yes', 'on'].includes(v)) return true
  if (['0', 'false', 'no', 'off'].includes(v)) return false
  return null
}

/** 是否与 electron-builder extraMetadata.cinfAssistantLocalDeploy / 环境变量一致 */
function resolveLocalAiDeploymentEnabled() {
  try {
    const pkgPath = path.join(__dirname, '..', 'package.json')
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
      if (typeof pkg.cinfAssistantLocalDeploy === 'boolean') {
        return pkg.cinfAssistantLocalDeploy
      }
    }
  } catch (_) {
    /* ignore */
  }
  const envPreferred =
    parseEnvBool(process.env.CINF_ASSISTANT_LOCAL_DEPLOYMENT) ??
    parseEnvBool(process.env.CINF_PACK_LOCAL_AI)
  if (envPreferred !== null) return envPreferred
  return true
}

const LOCAL_AI_DEPLOYMENT_ENABLED = resolveLocalAiDeploymentEnabled()

function getResourcePath(...paths) {
  if (isDev) {
    return path.join(__dirname, '..', ...paths)
  }
  return path.join(process.resourcesPath, ...paths)
}

function isWindows7KernelOrOlder() {
  if (process.platform !== 'win32') return false
  const parts = (os.release() || '').split('.')
  const major = parseInt(parts[0], 10) || 0
  const minor = parseInt(parts[1], 10) || 0
  if (major < 6) return true
  if (major === 6 && minor <= 1) return true
  return false
}

// 减轻 Windows 下缓存目录权限导致的 ERROR: Unable to move the cache / Gpu Cache Creation failed
if (process.platform === 'win32') {
  app.commandLine.appendSwitch('disable-gpu-shader-disk-cache')
  app.commandLine.appendSwitch('disable-application-cache')
  const cacheDir = path.join(app.getPath('userData'), 'Cache')
  try {
    if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true })
    app.commandLine.appendSwitch('disk-cache-dir', cacheDir)
  } catch (e) {
    // 忽略，使用默认缓存路径
  }
}

let mainWindow
let backendProcess
let splashWindow
/** 主窗显示与闪屏关闭仅处理一次（app:ready 或 90s 兜底） */
let appReadyHandled = false
let appReadyFallbackTimer = null

function showMainAndCloseSplash() {
  if (appReadyHandled) return
  appReadyHandled = true
  if (appReadyFallbackTimer) {
    try {
      clearTimeout(appReadyFallbackTimer)
    } catch (_) {}
    appReadyFallbackTimer = null
  }
  if (splashWindow && !splashWindow.isDestroyed()) {
    splashWindow.close()
    splashWindow = null
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.show()
    if (process.platform === 'darwin') {
      app.dock.show()
    }
  }
}

function createSplashWindow() {
  try {
    splashWindow = new BrowserWindow({
      width: 520,
      height: 320,
      resizable: false,
      movable: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      frame: false,
      backgroundColor: '#FFFFFF',
      show: false,
      alwaysOnTop: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
    })

    const splashPath = path.join(__dirname, 'splash.html')
    const splashIconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
    const splashIconCandidates = isDev
      ? [path.join(__dirname, 'build', splashIconName)]
      : [getResourcePath('build', splashIconName), path.join(process.resourcesPath, 'app.asar.unpacked', 'build', splashIconName)]
    let splashIconPath = ''
    for (const p of splashIconCandidates) {
      if (p && fs.existsSync(p)) {
        splashIconPath = p
        break
      }
    }
    let splashIconPngDataUrl = ''
    if (splashIconPath) {
      try {
        const img = nativeImage.createFromPath(splashIconPath)
        const png = img && !img.isEmpty() ? img.toPNG() : null
        if (png && png.length) splashIconPngDataUrl = `data:image/png;base64,${png.toString('base64')}`
      } catch (_) {}
    }

    if (fs.existsSync(splashPath)) {
      splashWindow.loadFile(splashPath, {
        query: {
          iconPng: splashIconPngDataUrl,
          name: APP_DISPLAY_NAME,
          tagline: APP_SPLASH_TAGLINE,
        },
      })
    } else {
      const fallbackSplashHtml = encodeURIComponent(
        '<!doctype html><html><body style="margin:0;font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,Noto Sans SC,Microsoft YaHei,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;color:#475569;">正在启动，请稍候...</body></html>'
      )
      splashWindow.loadURL(`data:text/html;charset=utf-8,${fallbackSplashHtml}`)
    }

    splashWindow.once('ready-to-show', () => {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.show()
    })

    splashWindow.on('closed', () => {
      splashWindow = null
    })
  } catch (e) {
    splashWindow = null
  }
}

// 查找打包的 Python 后端可执行文件或系统 Python
function findBackendExecutable() {
  // 优先查找打包的后端可执行文件（生产环境）
  if (!isDev) {
    const possibleExePaths = [
      getResourcePath('backend', 'dist', 'backend', 'backend.exe'),
      getResourcePath('backend', 'dist', 'backend.exe'),
      getResourcePath('backend', 'backend.exe'),
    ]
    for (const exePath of possibleExePaths) {
      if (fs.existsSync(exePath)) {
        console.log('找到打包的后端可执行文件:', exePath)
        return exePath
      }
    }
    console.log('未找到打包的后端可执行文件，将尝试使用系统Python')
  }

  // 先尝试当前进程 PATH 中的 python（开发环境或终端里装的通常能拿到）
  const pythonCommands = ['python3', 'python']
  for (const cmd of pythonCommands) {
    try {
      const result = execSync(`${cmd} --version`, { encoding: 'utf-8' })
      if (result) {
        console.log('使用系统Python:', cmd)
        return cmd
      }
    } catch (e) {
      // 继续尝试下一个
    }
  }

  // Windows：写死的常见安装路径 + 从用户环境 PATH 里找（解决从快捷方式启动时 PATH 不全的问题）
  if (process.platform === 'win32') {
    const u = os.userInfo().username
    const localAppData = process.env.LOCALAPPDATA || `C:\\Users\\${u}\\AppData\\Local`
    const programFiles = process.env['ProgramFiles'] || 'C:\\Program Files'
    const programFilesX86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const commonPaths = [
      'C:\\Python313\\python.exe', 'C:\\Python312\\python.exe', 'C:\\Python311\\python.exe',
      'C:\\Python310\\python.exe', 'C:\\Python39\\python.exe', 'C:\\Python38\\python.exe',
      `${programFiles}\\Python313\\python.exe`, `${programFiles}\\Python312\\python.exe`,
      `${programFiles}\\Python311\\python.exe`, `${programFiles}\\Python310\\python.exe`,
      `${localAppData}\\Programs\\Python\\Python313\\python.exe`,
      `${localAppData}\\Programs\\Python\\Python312\\python.exe`,
      `${localAppData}\\Programs\\Python\\Python311\\python.exe`,
      `${localAppData}\\Programs\\Python\\Python310\\python.exe`,
      `C:\\Users\\${u}\\AppData\\Local\\Programs\\Python\\Python311\\python.exe`,
      `C:\\Users\\${u}\\AppData\\Local\\Programs\\Python\\Python312\\python.exe`,
      `C:\\Users\\${u}\\AppData\\Local\\Programs\\Python\\Python310\\python.exe`,
    ]
    for (const pythonPath of commonPaths) {
      if (fs.existsSync(pythonPath)) {
        console.log('找到Python:', pythonPath)
        return pythonPath
      }
    }
    // 打包且从快捷方式启动时，process.env.PATH 常不包含用户 PATH，从注册表读用户 Path 再在目录里找 python.exe
    if (!isDev) {
      try {
        const pathStr = execSync(
          'powershell -NoProfile -Command "[Environment]::GetEnvironmentVariable(\'Path\',\'User\')"',
          { encoding: 'utf-8', windowsHide: true, timeout: 5000 }
        )
        const dirs = (pathStr || '').trim().split(';').filter(Boolean)
        for (const dir of dirs) {
          const exe = path.join(dir.trim(), 'python.exe')
          if (fs.existsSync(exe)) {
            console.log('从用户 PATH 找到 Python:', exe)
            return exe
          }
        }
      } catch (e) {
        console.warn('读取用户 PATH 查找 Python 时出错:', e.message)
      }
    }
  }

  return null
}

function isManagedBackendPid(pid) {
  if (process.platform !== 'win32') return false
  try {
    const out = execSync(`wmic process where processid=${pid} get CommandLine,ExecutablePath /format:list`, {
      encoding: 'utf-8',
      windowsHide: true,
      timeout: 5000,
    })
    const text = String(out || '').toLowerCase().replace(/\//g, '\\')
    const resourceRoot = (!isDev ? process.resourcesPath : path.join(__dirname, '..')).toLowerCase().replace(/\//g, '\\')
    const backendRoot = getResourcePath('backend').toLowerCase().replace(/\//g, '\\')
    const isBackendCmd =
      text.includes('backend.exe') || text.includes('backend\\app.py') || text.includes('backend\\\\app.py')
    return isBackendCmd && (text.includes(resourceRoot) || text.includes(backendRoot))
  } catch (e) {
    console.warn('[后端] 无法确认 5000 端口进程归属:', e.message)
    return false
  }
}

/** Windows：仅结束本应用旧后端占用的 5000 端口 */
function killProcessOnPort5000() {
  if (process.platform !== 'win32') return []
  const unmanagedPids = []
  try {
    const out = execSync('netstat -ano', { encoding: 'utf-8', windowsHide: true })
    const lines = out.split(/\r?\n/)
    const pids = new Set()
    for (const line of lines) {
      if (!line.includes(':5000') || !line.includes('LISTENING')) continue
      const parts = line.trim().split(/\s+/)
      const pid = parts[parts.length - 1]
      if (pid && /^\d+$/.test(pid) && pid !== '0') pids.add(pid)
    }
    for (const pid of pids) {
      if (!isManagedBackendPid(pid)) {
        unmanagedPids.push(pid)
        console.warn('[后端] 5000 端口被非本应用进程占用，未结束 PID:', pid)
        continue
      }
      try {
        execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore', windowsHide: true })
        console.log('[后端] 已结束占用 5000 端口的进程 PID:', pid)
      } catch (_) {
        /* 可能已退出 */
      }
    }
  } catch (e) {
    console.warn('[后端] 检查/结束 5000 端口进程时出错:', e.message)
  }
  return unmanagedPids
}

function looksLikeBackendListenLog(chunk) {
  const s = String(chunk)
  return s.includes('Running on') || s.includes('127.0.0.1:5000')
}

function waitForBackendHttpReady(maxMs, intervalMs) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now()
    const tryOnce = () => {
      if (Date.now() - t0 > maxMs) {
        reject(
          new Error(
            `后端在 ${Math.round(maxMs / 1000)} 秒内未就绪（127.0.0.1:5000）。请检查 Python 依赖或防火墙；较慢磁盘可多等片刻后重启。`
          )
        )
        return
      }
      const req = http.get('http://127.0.0.1:5000/api/health', { timeout: 3000 }, (res) => {
        res.resume()
        if (res.statusCode === 200) resolve()
        else setTimeout(tryOnce, intervalMs)
      })
      req.on('error', () => setTimeout(tryOnce, intervalMs))
      req.on('timeout', () => {
        try {
          req.destroy()
        } catch (_) {}
        setTimeout(tryOnce, intervalMs)
      })
    }
    tryOnce()
  })
}

function startBackend() {
  return new Promise((resolve, reject) => {
    const unmanagedPids = killProcessOnPort5000()
    if (unmanagedPids.length > 0) {
      reject(new Error(`5000 端口已被占用（PID: ${unmanagedPids.join(', ')}）。请关闭占用进程后重试。`))
      return
    }
    const delayBeforeSpawn = process.platform === 'win32' ? 800 : 400
    const pollMaxMs = isDev ? 20000 : isWindows7KernelOrOlder() ? 120000 : 60000
    const pollIntervalMs = isWindows7KernelOrOlder() ? 600 : 400

    function doSpawn() {
      const backendCmd = findBackendExecutable()
      if (!backendCmd) {
        reject(
          new Error(
            '未找到 Python 或打包的后端 backend.exe。\n\n建议：在项目目录运行 npm run build:python 后打包安装；开发模式请先 pip install -r requirements.txt 再启动。'
          )
        )
        return
      }

      const appRoot = getResourcePath()
      const backendDir = getResourcePath('backend')
      let backendProcessArgs = []
      const isBackendExe = backendCmd.replace(/\\/g, '/').endsWith('backend.exe')
      if (isBackendExe) {
        console.log('启动后端:', backendCmd)
        backendProcessArgs = []
      } else {
        const backendPath = getResourcePath('backend', 'app.py')
        if (!fs.existsSync(backendPath)) {
          reject(new Error(`后端文件不存在: ${backendPath}`))
          return
        }
        console.log(`使用 Python 启动: ${backendCmd} ${backendPath}`)
        backendProcessArgs = [backendPath]
      }

      const spawnCwd = backendProcessArgs.length === 0 ? backendDir : appRoot

      const backendEnv = {
        ...process.env,
        CINF_RESOURCE_ROOT: backendDir,
        CINF_ASSISTANT_LOCAL_DEPLOYMENT: LOCAL_AI_DEPLOYMENT_ENABLED ? '1' : '0',
      }
      console.log('[后端] 本地 AI 开关:', LOCAL_AI_DEPLOYMENT_ENABLED ? 'ON' : 'OFF')
      if (!isDev) {
        if (!backendEnv.CINF_LLAMACPP_NATIVE_PROBE) backendEnv.CINF_LLAMACPP_NATIVE_PROBE = '0'
        if (!backendEnv.CINF_LLAMACPP_N_THREADS) backendEnv.CINF_LLAMACPP_N_THREADS = '1'
        if (!backendEnv.CINF_LLAMACPP_N_THREADS_BATCH) backendEnv.CINF_LLAMACPP_N_THREADS_BATCH = '1'
      }
      try {
        const ggufDefault = path.join(backendDir, 'models', 'assistant.gguf')
        if (fs.existsSync(ggufDefault)) {
          backendEnv.CINF_LLAMACPP_GGUF = ggufDefault
        }
      } catch (_) {
        /* ignore */
      }

      let settled = false
      function settleOk(tag) {
        if (settled) return
        settled = true
        console.log('[后端] 就绪', tag ? `(${tag})` : '')
        resolve()
      }
      function settleFail(err) {
        if (settled) return
        settled = true
        reject(err)
      }

      backendProcess = spawn(backendCmd, backendProcessArgs, {
        cwd: spawnCwd,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        env: backendEnv,
      })

      let backendOutput = ''
      let backendError = ''

      backendProcess.stdout.on('data', (data) => {
        const output = data.toString()
        backendOutput += output
        console.log(`[后端] ${output}`)
        if (looksLikeBackendListenLog(output)) settleOk('stdout')
      })

      backendProcess.stderr.on('data', (data) => {
        const error = data.toString()
        backendError += error
        console.error(`[后端 stderr] ${error}`)
        if (looksLikeBackendListenLog(error)) settleOk('stderr')
      })

      backendProcess.on('error', (err) => settleFail(err))

      backendProcess.on('exit', (code) => {
        if (code !== 0 && code !== null && !settled) {
          settleFail(
            new Error(`后端退出（代码 ${code}）：${(backendError || backendOutput || '').slice(0, 500)}`)
          )
        }
      })

      waitForBackendHttpReady(pollMaxMs, pollIntervalMs)
        .then(() => settleOk('http'))
        .catch((e) => {
          if (!settled) settleFail(e)
        })
    }

    setTimeout(doSpawn, delayBeforeSpawn)
  })
}

// 创建主窗口
function createWindow() {
  if (appReadyFallbackTimer) {
    try {
      clearTimeout(appReadyFallbackTimer)
    } catch (_) {}
    appReadyFallbackTimer = null
  }
  appReadyHandled = false

  const windowOptions = {
    width: 1600,
    height: 1080,
    minWidth: 1200,
    minHeight: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false, // 先不显示，等加载完成后再显示
  }
  
  // 设置窗口图标：需在 electron/build 下放置 icon.ico（Windows）或 icon.png（macOS）
  const iconName = process.platform === 'win32' ? 'icon.ico' : 'icon.png'
  const candidates = isDev
    ? [path.join(__dirname, 'build', iconName)]
    : [getResourcePath('build', iconName), path.join(process.resourcesPath, 'app.asar.unpacked', 'build', iconName)]
  let iconPath = null
  for (const p of candidates) {
    if (p && fs.existsSync(p)) {
      iconPath = p
      break
    }
  }
  if (iconPath) {
    windowOptions.icon = iconPath
  }
  
  mainWindow = new BrowserWindow(windowOptions)

  // 开发环境加载本地服务器，生产环境加载打包后的文件（不自动打开 DevTools）
  if (isDev) {
    mainWindow.loadURL('http://localhost:5173')
    // 需要调试时可在控制台或菜单中手动打开 DevTools
  } else {
    // 生产环境：前端在 extraResources 的 frontend-dist（resources/frontend-dist），安装即覆盖，避免旧版缓存
    const indexPath = path.join(process.resourcesPath, 'frontend-dist', 'index.html')
    if (!fs.existsSync(indexPath)) {
      dialog.showErrorBox('启动失败', `未找到前端页面：\n${indexPath}\n\n请重新安装或使用 start.bat 启动。`)
      app.quit()
      return
    }
    // 清空会话缓存，避免 userData 里旧缓存导致一直看到旧页面
    mainWindow.webContents.session.clearCache().then(() => {
      const buildIdPath = path.join(process.resourcesPath, 'frontend-dist', 'build.json')
      let buildId = ''
      try {
        if (fs.existsSync(buildIdPath)) {
          buildId = JSON.parse(fs.readFileSync(buildIdPath, 'utf8')).buildId || ''
        }
      } catch (_) {}
      const loadOpts = buildId ? { query: { v: buildId } } : {}
      mainWindow.loadFile(indexPath, loadOpts)
    })
  }

  // 不立即显示主窗：等待渲染进程 app:ready；90s 兜底避免卡死
  mainWindow.once('ready-to-show', () => {
    appReadyFallbackTimer = setTimeout(showMainAndCloseSplash, 90000)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // 处理窗口错误
  mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
    console.error('页面加载失败:', errorCode, errorDescription)
    if (!isDev) {
      dialog.showErrorBox(
        '页面加载失败',
        `无法加载应用页面。\n\n错误代码: ${errorCode}\n错误描述: ${errorDescription}`
      )
    }
  })
}

// 配置自动更新（仅在生产环境）
if (!isDev) {
  // 注意：更新服务器 URL 需要在 electron-builder.yml 或 package.json 的 publish 配置中设置
  // 如果使用 GitHub Releases，需要设置环境变量 GH_TOKEN
  // 如果使用通用服务器，确保 URL 正确配置
  autoUpdater.autoDownload = false // 不自动下载，等待用户确认
  autoUpdater.autoInstallOnAppQuit = true // 应用退出时自动安装更新
  if (isWindows7KernelOrOlder()) {
    autoUpdater.channel = 'win7'
  }

  const gh = process.env.GH_TOKEN || process.env.GITHUB_TOKEN
  if (gh) {
    const t = String(gh).trim()
    const auth = /^(?:token|Bearer)\s/i.test(t) ? t : `token ${t}`
    autoUpdater.addAuthHeader(auth)
  }

  // 更新检查事件（仅在生产环境）
  autoUpdater.on('checking-for-update', () => {
    console.log('正在检查更新...')
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-checking')
    }
  })

  autoUpdater.on('update-available', (info) => {
    console.log('发现新版本:', info.version)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-available', {
        version: info.version,
        releaseDate: info.releaseDate,
        releaseNotes: info.releaseNotes || '新版本可用'
      })
    }
  })

  autoUpdater.on('update-not-available', (info) => {
    console.log('当前已是最新版本:', info.version)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-not-available', {
        version: info.version
      })
    }
  })

  autoUpdater.on('error', (err) => {
    console.error('更新检查错误:', err)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-error', {
        message: err.message || '更新检查失败'
      })
    }
  })

  autoUpdater.on('download-progress', (progressObj) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-download-progress', {
        percent: Math.round(progressObj.percent),
        transferred: progressObj.transferred,
        total: progressObj.total
      })
    }
  })

  autoUpdater.on('update-downloaded', (info) => {
    console.log('更新下载完成:', info.version)
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-downloaded', {
        version: info.version
      })
    }
  })
}

// IPC 处理程序
ipcMain.handle('check-for-updates', async () => {
  if (isDev) {
    return { error: '开发模式下无法检查更新' }
  }
  try {
    await autoUpdater.checkForUpdates()
    return { success: true }
  } catch (error) {
    return { error: (error && error.message) || String(error) }
  }
})

ipcMain.handle('download-update', async () => {
  if (isDev) {
    return { error: '开发模式下无法下载更新' }
  }
  try {
    await autoUpdater.downloadUpdate()
    return { success: true }
  } catch (error) {
    return { error: (error && error.message) || String(error) }
  }
})

ipcMain.handle('install-update', async () => {
  if (isDev) {
    return { error: '开发模式下无法安装更新' }
  }
  autoUpdater.quitAndInstall(false, true)
  return { success: true }
})

ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

ipcMain.handle('get-deploy-info', () => ({
  assistantLocalDeploy: LOCAL_AI_DEPLOYMENT_ENABLED,
  version: app.getVersion(),
  packaged: app.isPackaged,
}))

ipcMain.on('app:ready', () => {
  showMainAndCloseSplash()
})

ipcMain.handle('license:get-status', () => {
  return license.getLicenseStatus(isDev)
})

ipcMain.handle('license:activate', async (_e, token) => {
  return license.activateWithToken(isDev, token)
})

// 应用准备就绪
app.whenReady().then(async () => {
  try {
    license.setElectronApp(app)
    createSplashWindow()
    // 启动后端服务器
    await startBackend()

    // 创建窗口（主窗 show 由 app:ready 或 90s 超时触发）
    createWindow()
    
    // 应用启动后延迟检查更新（避免影响启动速度）；静默检查，具体结果由设置页展示
    if (!isDev) {
      setTimeout(() => {
        autoUpdater.checkForUpdates().catch((err) => {
          console.error('自动检查更新失败:', err)
        })
      }, 5000)
    }
  } catch (error) {
    console.error('启动失败:', error)
    const msg = error && error.message
    const suggestPython = msg && !msg.includes('5000') && !msg.includes('端口')
    dialog.showErrorBox(
      '启动失败',
      `应用启动失败：${msg || error}\n\n${suggestPython ? '请检查 Python 环境是否正确配置；若使用 start.bat 能正常打开，可优先用 start.bat 启动。' : '可尝试用 start.bat 启动（先关闭本窗口），或检查 5000 端口是否被占用。'}`
    )
    app.quit()
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

// 彻底结束后端进程（含子进程），避免关闭软件后进程残留
function killBackendAndQuit() {
  if (!backendProcess) return
  const pid = backendProcess.pid
  if (pid == null) {
    backendProcess = null
    return
  }
  try {
    if (process.platform === 'win32') {
      // Windows: 用 taskkill /T /F 结束该进程及其子进程树，避免 Python/Flask 子进程残留导致 Electron 不退出
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore', windowsHide: true })
    } else {
      backendProcess.kill('SIGKILL')
    }
  } catch (e) {
    try { backendProcess.kill('SIGKILL') } catch (_) {}
  }
  backendProcess = null
}

// 所有窗口关闭时
app.on('window-all-closed', () => {
  killBackendAndQuit()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

// 应用退出前
app.on('before-quit', () => {
  killBackendAndQuit()
})

// 处理未捕获的异常
process.on('uncaughtException', (error) => {
  console.error('未捕获的异常:', error)
  if (mainWindow && !mainWindow.isDestroyed()) {
    dialog.showErrorBox('应用错误', `发生未预期的错误：${error.message}`)
  }
})
