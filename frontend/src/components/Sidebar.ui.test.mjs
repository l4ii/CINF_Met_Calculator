import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const sidebar = await readFile(new URL('./Sidebar.tsx', import.meta.url), 'utf8')
const types = await readFile(new URL('../types.ts', import.meta.url), 'utf8')

assert(!sidebar.includes('COPPER_SHEETS'), 'copper sidebar should not import the process sheet list')
assert(!sidebar.includes('if (isCopper(selectedMethod)) return COPPER_SHEETS'), 'copper sidebar should not expose process-stage child links')
assert(sidebar.includes("onSheetSelect('raw_material')"), 'clicking a copper method should open the case workspace directly')
assert(!sidebar.includes("name: '案例'"), 'copper methods should not require an extra case submenu click')
assert(types.includes('富氧侧吹法') && types.includes('闪速炼铜法'), 'copper smelting should list side-blown and flash methods')
assert(!sidebar.includes("smeltMethodId: copperMethod?.id ?? 'copper'"), 'copper should no longer use a single flat method id')
assert(sidebar.includes('h-full min-h-0'), 'sidebar root should fill the available app height without clipping lower navigation')
assert(sidebar.includes('sidebar-scroll flex-1 min-h-0 overflow-y-auto'), 'sidebar middle area should be the scrollable region while lower actions stay visible')

console.log('Sidebar UI checks passed')
