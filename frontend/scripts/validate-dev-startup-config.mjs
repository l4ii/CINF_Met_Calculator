import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const [packageJson, viteConfig, electronMain] = await Promise.all([
  readFile(new URL('../package.json', import.meta.url), 'utf8'),
  readFile(new URL('../vite.config.ts', import.meta.url), 'utf8'),
  readFile(new URL('../../electron/main.js', import.meta.url), 'utf8'),
])

assert.match(viteConfig, /host:\s*'127\.0\.0\.1'/, 'Vite binds the agreed loopback address')
assert.match(
  packageJson,
  /wait-on http:\/\/127\.0\.0\.1:5173\/src\/utils\/copperBatchExportXlsx\.ts/,
  'Electron waits for the export module, not only the Vite root page'
)
assert.match(
  electronMain,
  /const DEV_FRONTEND_URL = 'http:\/\/127\.0\.0\.1:5173'/,
  'Electron uses the same Vite address'
)
assert.match(
  electronMain,
  /const DEV_EXPORT_MODULE_URL = `\$\{DEV_FRONTEND_URL\}\/src\/utils\/copperBatchExportXlsx\.ts`/,
  'Electron checks the export module URL before creating the window'
)
assert.match(
  electronMain,
  /await ensureDevExportModuleReachable\(\)/,
  'Electron blocks development startup until the export module is reachable'
)

console.log('development startup configuration passed')
