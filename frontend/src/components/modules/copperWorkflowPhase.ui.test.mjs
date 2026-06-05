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
assert(component.includes('placeholder="物相"'), 'phase name input should use compact placeholder')
assert(component.includes('calculatePhaseUnknownsPreview'), 'calculation should run on button click')
assert(component.includes('phaseBatchResults'), 'calculation should store batch results for all materials')
assert(component.includes('phaseSheetTabs') && component.includes('selectPhaseSheet'), 'calculation should show excel-style multi-material sheet tabs')
assert(component.includes('phaseTableColumnKeys') && component.includes('getPhaseTableColumnKeys'), 'pivot table should use element columns from display order')
assert(component.includes('>w%</td>'), 'transposed phase assist should use w% as the first data row label')
assert(!component.includes('清除选择'), 'clear selection button should be removed')
assert(component.includes('计算物相成分'), 'calculate button should use standard label')
assert(component.includes('buildFurnaceBlendPhaseColumn') && component.includes('delete nextOverrides.blend'), 'refill should leave mixed phase column to live raw-material weighting')
assert(
  component.includes('appendDraftPhaseRow(selectedPhaseMaterial.id)') &&
    component.includes('title="添加物相"') &&
    !component.includes('+ 添加物相'),
  'add phase should be an inline + column header, not a toolbar button'
)
assert(
  component.includes('phaseAssistContainerRef') &&
    component.includes('phaseAssistViewportWidth') &&
    component.includes('sticky left-0 px-1 py-1 text-center text-sm font-semibold'),
  'phase assist table should have a sticky centered caption row'
)
assert(component.includes('>操作</td>') && component.includes('phaseDeleteBtn'), 'delete actions should live in the bottom ops row')
assert(phaseTable.includes('物相组成表（w%）') && phaseTable.includes('onRemoveSolvent'), 'phase batch table should mirror element table title and solvent delete')
assert(
  phaseTable.includes('viewportWidth') && phaseTable.includes('ResizeObserver') && phaseTable.includes('sticky left-0'),
  'phase batch table title should stay centered in the scroll viewport'
)
assert(phaseTable.includes('stickyNameDividerClass'), 'phase batch table should show a divider after the name column')
assert(!component.includes('分子式如 cus'), 'should not show cus example placeholder')
assert(!component.includes('各原料物相成分结果'), 'old lower material phase reference table should be removed')

console.log('copperWorkflowPhase UI checks passed')
