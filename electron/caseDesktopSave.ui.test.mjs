import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const preload = await readFile(new URL('./preload.js', import.meta.url), 'utf8')
const main = await readFile(new URL('./main.js', import.meta.url), 'utf8')

assert(preload.includes('saveCopperCaseToDesktop'), 'preload should expose a copper case export API')
assert(main.includes("ipcMain.handle('copper-case:save-desktop'"), 'main process should handle copper case export requests')
assert(main.includes('dialog.showSaveDialog'), 'copper case export should open a native save dialog for the user to choose location')
assert(main.includes("ipcMain.handle('show-save-dialog-export'"), 'main process should implement the generic export save dialog IPC')
assert(main.includes('.metcal-copper-case.json'), 'copper case export should write the portable copper case file extension')

console.log('Copper case desktop-save checks passed')
