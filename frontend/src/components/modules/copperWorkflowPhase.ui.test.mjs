import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('./CopperWorkflow.tsx', import.meta.url), 'utf8')
const phaseTable = await readFile(new URL('./CopperBatchPhaseTables.tsx', import.meta.url), 'utf8')

assert(component.includes('materialPhaseRows'), 'assist panel should persist phase rows')
assert(component.includes('appendDraftPhaseRow'), 'assist panel should append inline draft rows')
assert(!component.includes('handlePhaseRowDragStart'), 'assist panel should not support drag reorder')
assert(!component.includes('phaseRowDropPosition'), 'assist panel should not show drag insert markers')
assert(component.includes('findDuplicateMaterialPhase'), 'assist panel should reject duplicate phases')
assert(component.includes('removeMaterialPhaseRow'), 'assist panel should allow deleting any row')
assert(component.includes('placeholder="请输入物相"'), 'phase name input should use unified placeholder')
assert(component.includes('calculatePhaseUnknownsPreview'), 'calculation should run on button click')
assert(component.includes('phaseBatchResults'), 'calculation should store batch results for all materials')
assert(component.includes('phaseSheetTabs') && component.includes('selectPhaseSheet'), 'calculation should show excel-style multi-material sheet tabs')
assert(component.includes('COPPER_PHASE_TABLE_ELEMENT_KEYS'), 'pivot table should use element columns from display order')
assert(component.includes('物相 w%'), 'phase percent column should be second after phase name')
assert(!component.includes('清除选择'), 'clear selection button should be removed')
assert(component.includes('计算物相成分'), 'calculate button should use standard label')
assert(component.includes('buildBlendPhaseColumn') && component.includes('delete nextOverrides.blend'), 'refill should leave mixed phase column to live raw-material weighting')
assert(component.includes('+ 添加物相') && !phaseTable.includes('添加物相'), 'add button stays in assist table footer')
assert(!component.includes('分子式如 cus'), 'should not show cus example placeholder')
assert(!component.includes('各原料物相成分结果'), 'old lower material phase reference table should be removed')

console.log('copperWorkflowPhase UI checks passed')
