import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const preload = await readFile(new URL('./preload.js', import.meta.url), 'utf8')
const main = await readFile(new URL('./main.js', import.meta.url), 'utf8')

assert(preload.includes('saveCopperCaseToDesktop'), 'preload should expose a desktop save API for copper case files')
assert(main.includes("ipcMain.handle('copper-case:save-desktop'"), 'main process should handle desktop save requests')
assert(main.includes("app.getPath('desktop')"), 'desktop save should target the user Desktop folder')
assert(main.includes('.metcal-copper-case.json'), 'desktop save should write the portable copper case file extension')

console.log('Copper case desktop-save checks passed')
