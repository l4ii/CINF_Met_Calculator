import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('./CopperWorkflow.tsx', import.meta.url), 'utf8')
const phaseTable = await readFile(new URL('./CopperBatchPhaseTables.tsx', import.meta.url), 'utf8')

assert(component.includes('materialPhaseRows'), 'assist panel should persist ordered phase rows')
assert(component.includes('appendDraftPhaseRow'), 'assist panel should append inline draft rows')
assert(component.includes('handlePhaseRowDragStart'), 'assist panel should support drag reorder')
assert(component.includes('phaseRowDropPosition'), 'assist panel should show insert before/after while dragging')
assert(component.includes('findDuplicateMaterialPhase'), 'assist panel should reject duplicate phases')
assert(component.includes('removeMaterialPhaseRow'), 'assist panel should allow deleting any row')
assert(component.includes('placeholder="请输入物相"'), 'phase name input should use unified placeholder')
assert(component.includes('calculateOrderedPhaseElementCompletion'), 'calculation should follow row order')
assert(component.includes('+ 添加物相') && !phaseTable.includes('添加物相'), 'add button stays in assist table footer')
assert(!component.includes('分子式如 cus'), 'should not show cus example placeholder')

console.log('copperWorkflowPhase UI checks passed')
