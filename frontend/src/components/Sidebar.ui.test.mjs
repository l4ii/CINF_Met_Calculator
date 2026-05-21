import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sidebar = await readFile(new URL('./Sidebar.tsx', import.meta.url), 'utf8')
const copperBranch = sidebar.slice(
  sidebar.indexOf("if (smeltType.id === 'cu')"),
  sidebar.indexOf('return (', sidebar.indexOf("if (smeltType.id === 'cu')") + 1)
)

assert(!sidebar.includes('COPPER_SHEETS'), 'copper sidebar should not import the process sheet list')
assert(!sidebar.includes('if (isCopper(selectedMethod)) return COPPER_SHEETS'), 'copper sidebar should not expose process-stage child links')
assert(!copperBranch.includes('visibleSheets().map'), 'active copper sidebar item should remain a single workspace entry')
assert(!copperBranch.includes('onSheetSelect(sheet.id)'), 'copper sidebar should not navigate directly to smelting/converting/refining/equipment')

console.log('Sidebar UI checks passed')
