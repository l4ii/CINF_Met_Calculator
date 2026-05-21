import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('./SettingsPage.tsx', import.meta.url), 'utf8')

assert(component.includes('本地助手部署'), 'deploy metadata should use a Chinese label')
assert(component.includes('Electron 版本'), 'Electron metadata should use a Chinese label')
assert(!component.includes('cinfAssistantLocalDeploy:{'), 'raw deploy metadata key should not be shown on the page')
assert(!component.includes('Electron version:'), 'Electron metadata label should not remain hard-coded in English')

console.log('SettingsPage UI checks passed')
