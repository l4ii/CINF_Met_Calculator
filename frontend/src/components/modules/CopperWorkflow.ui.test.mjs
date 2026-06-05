import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('./CopperWorkflow.tsx', import.meta.url), 'utf8')
const elementTable = await readFile(new URL('./CopperBatchElementTable.tsx', import.meta.url), 'utf8')
const workflowCalc = await readFile(new URL('../../utils/copperWorkflowCalc.ts', import.meta.url), 'utf8')
const splash = await readFile(new URL('../../../../electron/splash.html', import.meta.url), 'utf8')

assert(
  elementTable.includes('>t/h</th>') &&
    !elementTable.includes('投料量 t/h') &&
    elementTable.includes('>类型</th>') &&
    elementTable.includes('>占比%</th>'),
  'transposed element table should use material rows with element columns'
)
assert(elementTable.includes('CopperMaterialSelect'), 'raw material name picker should use custom centered dropdown')
assert(
  elementTable.includes('justify-end') && elementTable.includes('删除原料'),
  'delete raw material action should align to the right above total column'
)
assert(
  component.includes('COPPER_PLACEHOLDER_ELEMENT_KEYS') && component.includes('phaseTableRowKeys'),
  'empty batch tables should use placeholder element/phase columns'
)
assert(
  component.includes('phaseRowKeys={phaseTableRowKeys}'),
  'phase batch table should receive dynamic phase row keys'
)
assert(!elementTable.includes('border-r-blue'), 'name column should not use a heavy divider before feed column')
assert(!elementTable.includes('writing-mode:vertical-rl'), 'transposed element table should not use the old vertical 组分 column')
assert(
  elementTable.includes('renderMaterialWaterRow') &&
    elementTable.includes('colSpan={middleSpan}') &&
    elementTable.includes('rowSpan={2}') &&
    elementTable.includes('step="0.0001"') &&
    elementTable.includes('含量：') &&
    component.includes('updateMaterialMoisture') &&
    component.includes('moistureInputClass'),
  'element table moisture should use dedicated water rows with 含量 input and amber/green border states'
)
assert(!elementTable.includes('>H₂O%</th>'), 'element table should not keep a vertical H₂O% column')
assert(component.includes('exportPhaseComposition') && component.includes('导出 Excel'), 'phase assistant should export the current pivot table to Excel')
assert(component.includes('saveCopperBatchExcelWorkbook') && component.includes('getElectronExportWorkbookSaver'), 'Excel export should prefer native save dialog when available')
assert(component.includes('phaseMaterialId'), 'case snapshot should persist the active phase material tab')
assert(component.includes('setTimeout(() => setWorkflowMessage(null)'), 'workflow toast should auto-dismiss after a few seconds')
assert(component.includes('buildFurnaceBlendPhaseColumn'), 'phase blend column should include all furnace feed columns')
assert(!component.includes('合计(干基)') && !component.includes('湿基含量') && !component.includes('buildWetBasisContentAnalysis'), 'phase assist should use single wet-basis total row')
assert(component.includes('元素转换') && component.includes('phaseElementView') && component.includes('role="switch"'), 'phase assist should expose iOS-style element conversion switch')
assert(
  component.includes('+ 添加原料') && component.includes('onClick={addMaterial}') && component.includes('BatchAddSolventControl'),
  'calculation table toolbar should add raw materials and solvents beside export'
)
assert(!elementTable.includes('onAddMaterial'), 'element table should not keep footer add-material handlers')
assert(component.includes('导出Excel'), 'calculation table should expose an Excel export action')
assert(component.includes('APP_NAME_ZH'), 'Excel export filename should use the software Chinese name')
assert(component.includes('buildCopperBatchExportFilename'), 'Excel export should build the requested software_stage_date filename')
assert(component.includes('saveCopperBatchExcelWorkbook'), 'Excel export should trigger a workbook save from the calculation table')
assert(component.includes('BatchTableViewTabs') && component.includes('元素总表') && component.includes('物相总表'), 'calculation table should expose element/phase workbook tabs')
assert(component.includes('CopperBatchPhaseTables') && component.includes('tableWidth={phaseTableWidth}') && component.includes('rawColumnWidths={phaseTableRawColumnWidths}'), 'phase view should be one horizontal table aligned with the element table layout')
assert(component.includes('buildCopperBatchWorkbookHtml') && component.includes('buildPhaseExportTable'), 'Excel export should include element and phase sheets')
assert(component.includes('batchTableView') && component.includes('phaseRatioOverrides') && component.includes('productPhaseManual'), 'case snapshot should persist phase view state')
assert(component.includes('WorkflowMessageToast') && component.includes('role="alert"'), 'workflow prompts should jump out as a visible toast')
assert(!component.includes('{workflowMessage &&'), 'workflow prompts should not occupy space above the calculation table')
assert(!component.includes('新增配入列'), 'calculation table should not keep the old add-column wording')
assert(!component.includes("}%</td>"), 'element row labels should not append % after the header already says 含量（%）')
assert(component.includes('原料库'), 'top section should be positioned as material library')
const materialLibraryToolbar = component.slice(component.indexOf('>原料库</h3>'), component.indexOf('{importFeedback &&'))
assert(
  materialLibraryToolbar.includes('导入') && materialLibraryToolbar.includes('<input'),
  'material library should preserve import with a shortened label and nested file input'
)
assert(!component.includes('从Excel导入'), 'material library import action should not restore 从Excel导入')
assert(!component.includes('新增原料列'), 'material-library area should not expose 新增原料列')
assert(component.includes('singleLibraryRows') && component.includes('submitLibraryMaterialDialog'), 'material library should support adding one or more materials directly on the page')
assert(
  materialLibraryToolbar.indexOf('>添加<') < materialLibraryToolbar.indexOf('导入') &&
    materialLibraryToolbar.indexOf('导入') < materialLibraryToolbar.indexOf("showLibrary ? '折叠' : '展开'"),
  'material library buttons should be ordered 添加、导入、展开 from left to right'
)
assert(!component.includes('单个添加'), 'material library add button should be renamed 添加')
assert(
  component.includes('showSingleLibraryAddDialog')
    && component.includes('libraryMaterialDialogMode')
    && component.includes('libraryDialogMessage')
    && component.includes('function AddLibraryMaterialDialog'),
  'material add form should open in a dialog'
)
assert(
  component.includes('role="dialog"') && component.includes('添加原料') && component.includes('修改原料'),
  'material library dialog should support add and edit titles'
)
assert(component.includes('role="status"'), 'material library dialog should surface validation text inside the modal')
assert(component.includes('原料名称') && component.includes('min-w-[1040px] table-fixed text-sm'), 'material add dialog should use a compact horizontal table matching the material library')
assert(component.includes('addSingleLibraryRow') && component.includes('removeSingleLibraryRow'), 'material add dialog should let users add and delete rows')
assert(component.includes('增行') && component.includes('删除'), 'material add dialog should expose row add/delete controls')
assert((component.match(/>增行</g) ?? []).length === 1, 'material add dialog should only duplicate 增行 in the footer toolbar')
assert(component.includes('单行合计') && component.includes('singleLibraryRowTotal'), 'material add dialog should calculate composition totals per row')
assert(component.includes('不能超过 100'), 'single material add validation should block row totals above 100 percent')
assert(
  component.includes('请输入原料名称后再添加到原料库。') || component.includes('请输入原料名称后再保存。'),
  'material library dialog validation should remind users to fill the material name'
)
assert(component.includes('openLibraryMaterialEditDialog'), 'material library rows should expose an edit affordance backed by dialog state')
assert(component.includes('保存修改'), 'material library edit dialog should use a distinct save action label')
assert(elementTable.includes('onRemoveMaterial') && elementTable.includes('删'), 'transposed table should expose per-row delete for raw materials')
assert(component.includes('批量导入'), 'material-library description should explain batch import/maintenance')
assert(component.includes('title="修改原料库条目"'), 'material library rows should expose a modify action beside delete')
assert(component.includes('原料库移除'), 'material library rows should expose a delete action')
assert(component.includes('libraryActionButtonClass'), 'material library row actions should use a lightweight outlined button style')
assert(!component.includes('bg-blue-600 text-white hover:bg-blue-700'), 'material library edit action should no longer use a heavy filled blue button')
assert(!component.includes('bg-red-600 text-white hover:bg-red-700'), 'material library delete action should no longer use a heavy filled red button')
assert(component.includes('text-center">操作</th>'), 'material library action header should be centered')
assert(component.includes('py-1.5 text-center'), 'material library delete actions should be centered')
assert(component.includes('text-sm') && component.includes('min-w-[1020px]'), 'material library table should use page-consistent text sizing and compact layout')
assert(
  component.includes('batchElementTableWidth(elementTableKeys.length, elementTableNameColWidth)') &&
    component.includes('elementTableNameColWidth') &&
    component.includes('batchPhaseTableWidth(phaseTableRowKeys.length, batchTableNameColWidth)'),
  'batch tables should use fixed computed widths matched to their column layouts'
)
assert(
  elementTable.includes('CopperBatchTableColGroup') &&
    elementTable.includes('batchElementTableColWidths') &&
    elementTable.includes('viewportWidth'),
  'element batch table should lock column widths with colgroup and fit to container width'
)
assert(
  component.includes('computePhaseAssistTableLayout') && component.includes('text-sm'),
  'phase assist table should use fitted column widths and text-sm typography'
)
assert(
  component.includes('batchTableNameColWidthFromLabels') &&
    component.includes('elementTableNameColWidth') &&
    component.includes('displayRawMaterialName(material.name)'),
  'phase table name width follows row labels; element table reserves library option widths'
)
assert(
  elementTable.includes('table-fixed text-sm" style={{ width: resolvedTableWidth'),
  'transposed element table should use computed width from colgroup sum'
)
assert(component.includes('formatTableNumber') && component.includes('CopperBatchElementTable'), 'calculation table should format numbers via shared element table component')
assert(elementTable.includes('>产出</td>') && elementTable.includes('混料'), 'transposed table should render blend and product rows')
assert(!elementTable.includes('rowSpan={COPPER_ELEMENT_KEYS.length + 4}'), 'transposed table should not use the old vertical row-span layout')
assert(component.includes('function productOutputCellClass'), 'product output area should have its own pending/resolved frame styling')
assert(component.includes("productCalculated ? 'resolved' : 'pending'"), 'product output frame should turn green after product calculation is refilled')
assert(
  elementTable.includes('onDoubleClick={onOpenIterationAssist}') && component.includes('PRODUCT_CALCULATION_BASIS'),
  'product output cells should double-click into the iterative input area'
)
assert(!component.includes('title="点击跳转到产出计算"'), 'vertical product label should not remain the primary click target')
assert(elementTable.includes('sticky left-[56px]'), 'transposed table name column should stick after the narrowed type column')
assert(
  elementTable.includes('viewportWidth') && elementTable.includes('ResizeObserver') && elementTable.includes('sticky left-0'),
  'element table title should stay centered in the scroll viewport'
)
assert(!elementTable.includes('stickyNameDividerClass'), 'element table should not show a heavy divider after the name column')
assert(
  elementTable.includes('batchTableDataColWidth') && elementTable.includes('elementColWidths'),
  'element columns should use content-based widths'
)
assert(
  elementTable.includes('元素含量表（w%）') &&
    elementTable.includes('删除原料') &&
    elementTable.includes('操作：'),
  'element table should expose a title row and delete action on water rows'
)
assert(
  component.includes('batchTableNameColWidth') && component.includes('nameColWidth={batchTableNameColWidth}'),
  'batch tables should use dynamic name column width from selected materials'
)
assert(component.includes('rawColumnWidth') && component.includes('phaseTableRawColumnWidths'), 'phase table should still use compact column widths from raw materials')
assert(!component.includes('w-full min-w-[1040px] table-fixed text-xs'), 'calculation table should not stretch full-width with the old small font')
assert(component.includes('sectionTitle(darkMode)} mb-0`}>配料总表'), 'calculation table title should use section-title sizing')
assert(component.includes("const base = 'border-t px-1 py-1 align-middle text-center'"), 'calculation table cells should center displayed parameters')
assert(component.includes('text-center font-mono text-sm'), 'calculation table numeric inputs should be centered')
assert(component.includes('function materialSelectClass'), 'raw-material select should use a dedicated class instead of cramped numeric input sizing')
assert(
  component.includes('h-9 w-full whitespace-nowrap') &&
    component.includes('px-2') &&
    component.includes('leading-normal'),
  'raw-material select trigger should have enough height and compact horizontal padding'
)
assert(
  elementTable.includes('materialSelectClass(') &&
    elementTable.includes("material.name.trim() ? 'resolved' : 'pending'"),
  'unselected raw-material names should show the same pending red frame as other required inputs'
)
assert(!component.includes('h-7 w-full truncate px-1 py-0 text-center text-sm'), 'raw-material select should not use the old cramped h-7 style')
assert(!component.includes('className="px-1 py-2 text-center font-semibold">原料</th>'), 'raw material placeholder header cells should be removed')
assert(!component.includes('>固定</td>'), 'solvent fixed placeholder cells should be removed from the calculation table')
assert(!component.includes('>自动</td>'), 'mix automatic placeholder cell should be removed from the calculation table')
assert(elementTable.includes('可直接手动输入原料投料量'), 'raw material feed amount should be an explicit manual input')
assert(component.includes('rawWeightDrafts') && elementTable.includes('rawWeightDrafts'), 'raw feed amount inputs should keep empty draft values before user entry')
assert(elementTable.includes("value={rawWeightDrafts[material.id] ?? ''}"), 'default and added raw feed amount cells should render empty before input')
assert(elementTable.includes('rawWeightStatus(material.id)'), 'raw feed amount cells should use red/green validity highlighting')
assert(elementTable.includes('步骤1：输入投料量'), 'raw feed tooltip should show sequence step 1')
assert(elementTable.includes('待计算物相成分'), 'raw O/C/Other inputs should be marked as pending phase solving')
assert(elementTable.includes('熔剂投料量：单击可手动输入；双击进入迭代输入。'), 'solvent feed result cells should support click-to-edit and double-click iteration entry')
assert(component.includes('border-emerald') && component.includes('bg-emerald'), 'refilled calculation inputs should support a green resolved state')
assert(
  component.includes("from './CopperBatchElementTable'") && component.includes('type SolveInputStatus'),
  'calculation input highlighting should share SolveInputStatus with the element batch table'
)
assert(component.includes('manualPhaseCells'), 'phase O/C/Other cells should also resolve green when manually typed')
assert(component.includes('manualSolventWeights'), 'solvent feed cells should resolve green after coupled iteration writes results')
assert(component.includes('manualFuelWeightValid'), 'fuel coal cell should resolve green after coupled iteration writes results')
assert(elementTable.includes('步骤2：物相成分') && elementTable.includes('可直接手动输入'), 'phase tooltip should show sequence step 2 and allow manual input')
assert(component.includes('phaseCompletedMaterials'), 'phase completion should be tracked per raw material instead of marking all materials at once')
assert(component.includes('phasePreviewUnknowns'), 'phase assistant should keep phase preview state for case persistence after refill')
assert(component.includes('calculatePhaseUnknownsPreview'), 'phase assistant should calculate merged table results on demand')
assert(component.includes('计算物相成分') && component.includes('回填物相到配料总表'), 'phase assistant should separate calculate and distinct phase backfill label')
assert(!component.includes('清除选择'), 'phase assistant should not expose clear-selection action')
assert(component.includes('phaseSheetTabs') && component.includes('selectPhaseSheet'), 'phase assistant should show excel-style material tabs when entering phase assist')
assert(component.includes('未计算') && component.includes('phaseAssistTabMaterialIds'), 'phase assistant should show pending tab status before calculate')
assert(component.includes('无法进入物相成分') && component.includes('填写大于 0 的投料量'), 'double-clicking phase cells without feed rate should tell users how to proceed')
assert(component.includes('formatPhaseCell'), 'phase assistant should hide solver cells until calculate is clicked')
assert(
  component.includes('PhaseAssistPercentCell') && component.includes('massThToWeightPercent'),
  'phase assistant should default to weight percent and show mass flow on hover'
)
assert(component.includes('activePhasePreview'), 'phase assistant should only show solver preview after calculate is clicked')
assert(component.includes('buildPhasePreviewUnknowns'), 'phase assistant should restore preview data from saved batch results when reopening')
assert(elementTable.includes('熔剂投料量：单击可手动输入；双击进入迭代输入。'), 'solvent amount cells should allow editing and double-click navigation')
assert(component.includes('PRODUCT_CALCULATION_BASIS'), 'product output cells should still explain the static coefficient calculation')
assert(elementTable.includes('燃料煤投料量：单击可手动输入；双击进入迭代输入。'), 'fuel amount cell should allow editing and double-click navigation')
assert(component.includes('calculationTableRef'), 'calculation table needs a ref so assistant calculations can return after refill')
assert(component.includes('scrollToCalculationTable()'), 'assistant refill actions should jump back to the calculation table')
assert(elementTable.includes('onClick={(event) => event.stopPropagation()}'), 'manual calculation inputs should not jump away on ordinary click')
assert(component.includes('openIterationAssist') && component.includes('iterationAssistRef'), 'solvent, product, and heat result cells should open the iteration input section')
assert(elementTable.includes('onOpenElementAssist') && component.includes('openElementAssist'), 'double-clicking raw O/C/Other cells should still open element completion')
assert(component.includes('混料关键参数'), 'blend indicators should sit directly below the calculation table')
assert(component.indexOf('混料关键参数') < component.indexOf('ref={elementAssistRef}'), 'blend indicators should remain in the calculation-table card before assistant sections')
assert(component.includes('function BlendMetric'), 'blend indicators should use a dedicated lightweight metric style')
assert(component.includes('<BlendMetric darkMode={darkMode} label='), 'blend indicators should render through the lightweight blend metric component')
assert(!component.includes('compact={true}'), 'blend indicators should not keep result-card compact Metric styling')
assert(component.includes('mt-0.5 font-mono text-base'), 'blend metric values should be only one step larger than table body text')
assert(component.includes('gap-2 md:grid-cols-3 xl:grid-cols-6'), 'blend indicator grid should stay visually compact')
assert(elementTable.includes('名称') && elementTable.includes('nameColStyle(nameColWidth)'), 'transposed table header should include 名称 column with dynamic width')
assert(elementTable.includes('熔剂{index + 1}'), 'transposed table should number solvent rows')
assert(elementTable.includes('石灰石'), 'transposed table should show limestone solvent name')
assert(elementTable.includes('productTableColumns.map'), 'transposed table should render one row per product output')
assert(elementTable.includes('富氧空气'), 'transposed table should include oxygen-enriched air row')
assert(!component.includes('>物相</td>'), 'old bottom phase row should be removed from the calculation table')
assert(!component.includes('O/C/Other</button>'), 'old phase-row O/C/Other buttons should be removed')
assert(component.includes('>物相成分</h3>'), 'first assistant section should be named professionally')
assert(component.includes('迭代计算'), 'second assistant section should be the coupled iteration entry')
assert(component.includes('开始迭代计算'), 'workflow should expose a one-click iterative calculation entry after phase completion')
assert(component.includes('runIterativeCalculation'), 'workflow should run coupled solvent-product-heat iteration from the UI')
assert(component.includes('迭代轨迹'), 'iterative calculation should show trace rows so users can review convergence')
assert(component.includes('出炉渣型'), 'iterative calculation entry should ask for the tapped/final slag type target')
assert(component.includes('联动预览已开启') && component.includes('首次迭代后生成联动预览'), 'iteration entry should show linked preview status')
assert(component.includes('iterationAutoLinked') && component.includes('iterationInputSignature'), 'workflow should auto-refresh linked results after the first iteration')
assert(component.includes('IterationSubstepCard') && component.includes('title="熔剂渣型求解"') && component.includes('title="产物分配计算"') && component.includes('title="热平衡配煤"'), 'iteration input should distinguish detailed substeps from the overall calculation')
assert(component.includes('IterationFlowStrip') && component.includes('联动求解流程'), 'iteration input should show the coupled solve flow strip')
assert(component.includes('长沙有色冶金设计研究院有限公司'), 'product allocation step should cite CINF design institute experience')
assert(component.includes('processStageCopy.solventStep') && component.includes('processStageCopy.oxygenStep'), 'iteration substeps should use stage-specific step copy')
assert(component.includes('温度设置') && component.includes('热支出与燃料参数'), 'heat balance inputs should be grouped by temperature and heat/fuel parameters')
assert(component.includes('迭代结果复核') && component.includes('按步骤 ①–④ 顺序展开核对'), 'iteration results should be grouped under a review section with step order guidance')
assert(component.includes('① 熔剂投料量'), 'solvent detail view should align with step ①')
const solventAssistSection = component.slice(component.indexOf('① 熔剂投料量'), component.indexOf('② 产物分配'))
assert(solventAssistSection.includes('熔剂投料量预览') && !solventAssistSection.includes('回填熔剂投料量'), 'solvent result panel should be a read-only detail view without its own refill action')
assert(solventAssistSection.includes('<table className="w-full table-fixed text-sm">'), 'solvent assist result display should use a compact table instead of mismatched metric cards')
assert(component.includes('solventPreviewSolution') && !component.includes('applySolventIterationResult'), 'solvent panel should display iterative preview while refill stays in the main iteration action')
assert(!component.includes('计算熔剂投料量'), 'solvent panel should no longer expose single-step solvent calculation')
assert(component.includes('② 产物分配'), 'product detail view should align with step ②')
assert(component.includes('④ 富氧空气') && component.includes('title="富氧空气参数设置"'), 'oxygen-enriched air should have its own iteration setting and result panels')
assert(!component.includes('>计算并回填熔剂<'), 'solvent section should no longer calculate and refill in one action')
assert(!component.includes('>计算并回填产出<'), 'product section should no longer calculate and refill in one action')
const productAssistSection = component.slice(component.indexOf('② 产物分配'), component.indexOf('③ 热平衡与燃料煤'))
assert(
  productAssistSection.includes('resultProductPhaseReviewBlocks') &&
    productAssistSection.includes('质量 t/h') &&
    productAssistSection.includes('productOutputCellClass(darkMode, productPreviewReady'),
  'product result panel should show unified phase table with mass and w%'
)
assert(!productAssistSection.includes('PRODUCT_CALCULATION_BASIS'), 'product result panel should not show calculation basis callout')
assert(!productAssistSection.includes('COPPER_ELEMENT_KEYS.map((element) =>'), 'product result panel should not use element rows')
assert(!productAssistSection.includes('button className={btnPrimary') && !component.includes('计算产出'), 'product detail panel should be read-only with no standalone calculate/refill action')
assert(workflowCalc.includes("'N(氮)'") && component.includes('COPPER_ELEMENT_KEYS.map((element) =>'), 'product and feed element displays should include nitrogen through the shared element list')
assert(component.includes('混料总质量 × 元素含量 × 静态分配系数 × 化合物折算系数') || component.includes('静态分配系数'), 'product result panel should explain static coefficient calculation')
assert(!component.includes('calculateProductsPreview') && !component.includes('refillProductsToTable'), 'product panel should not use standalone calculate/refill handlers')
assert(!component.includes('canProceed'), 'process pages should not duplicate next-step navigation with a separate enter-stage banner')
assert(component.includes('stagePageTopRef') && component.includes('stageEnterHighlight'), 'stage navigation should scroll to the page top with a visible highlight cue')
assert(component.includes('scrollIntoView({ behavior: \'smooth\', block: \'start\' })'), 'stage navigation should smoothly scroll the next page into view')
assert(component.includes('③ 热平衡与燃料煤'), 'heat detail view should align with step ③')
assert(component.includes('heatPreviewReady') && !component.includes('calculateHeatBalancePreview'), 'heat panel should display iterative heat result without a standalone preview handler')
assert(!component.includes('计算热平衡') && !component.includes('回填热平衡与燃料煤'), 'heat detail panel should be read-only with no standalone calculate/refill action')
assert(component.includes('applyIterationResultToSummaryTable') && component.includes('回填到配料总表'), 'iteration input area should provide the single refill action for all coupled results')
assert(component.includes('燃料煤'), 'calculation table should include a fuel coal column after heat balance is introduced')
assert(!component.includes("'待联动'"), 'product output cells should stay blank before iteration')
assert(component.includes('IteratingOverlay') && component.includes('迭代计算中，请稍候') && component.includes('window.setTimeout(resolve, 1000)'), 'first iterative calculation should show a perceptible one-second progress animation')
assert(component.includes('核对产物分配结果'), 'product result panel should use a general step-level hint')
assert(
  productAssistSection.includes('min-w-[960px]') &&
    !productAssistSection.includes('grid-cols-1 gap-4'),
  'product result panel should use one unified table instead of split cards'
)
assert(!productAssistSection.includes('PRODUCT_DISPLAY_ELEMENTS'), 'product result panel should not use a separate short element list')
assert(productAssistSection.includes('resultProductPhaseReviewBlocks'), 'product result panel should derive phase composition for review')
assert(
  productAssistSection.includes('assistAlertPanelClassName') && productAssistSection.includes('联动迭代结果'),
  'product result panel should show an iteration result summary beside the merged flow'
)
const heatAssistSection = component.slice(
  component.indexOf('③ 热平衡与燃料煤'),
  component.indexOf('④ 富氧空气', component.indexOf('③ 热平衡与燃料煤'))
)
assert(
  heatAssistSection.includes('联动迭代结果') && heatAssistSection.includes('assistAlertPanelClassName'),
  'heat result panel should show deficit, recommended coal, and iteration result guidance'
)
assert(
  heatAssistSection.includes('关键计算过程') && heatAssistSection.includes('热收入') && heatAssistSection.includes('热支出') && heatAssistSection.includes('燃料煤求解'),
  'heat result panel should show the key calculation path, not only final numbers'
)
assert(
  component.includes("useState(false)") && component.includes('showProductAssist') && component.includes('showHeatAssist'),
  'iteration result panels should default collapsed'
)
assert(
  component.includes('setShowSolventAssist(false)') && component.includes('setShowProductAssist(false)') && component.includes('setShowHeatAssist(false)'),
  'iterative calculation should leave result panels collapsed until the user expands one'
)
assert(!heatAssistSection.includes('LabeledInput'), 'heat result panel should be read-only after iterative calculation')
assert(!productAssistSection.includes('button className={btnPrimary'), 'product detail panel should not keep a lower standalone action button')
assert(component.includes('calculateCopperProducts') && component.includes('calculateCopperHeatBalance'), 'copper workflow should use the product and heat-balance calculation utilities')
assert(component.includes('phaseCompleted') && component.includes('productCalculated'), 'workflow should validate sequential calculation prerequisites')
assert(component.includes('请先逐一完成所有原料的物相成分') && component.includes('请先补全出炉渣型'), 'workflow should tell users which iteration input is missing')
assert(component.includes('showElementAssist') && component.includes('showSolventAssist'), 'assistant sections should be collapsible')
assert(component.includes('computeMaterialPhaseResult'), 'phase assistant should derive phase contents from known elements via stoichiometry')
assert(component.includes('phaseTableColumnKeys') && component.includes('getPhaseTableColumnKeys'), 'phase assistant pivot should use compound/element column keys')
assert(component.includes('w%'), 'phase percent column should sit immediately after phase name')
assert(component.includes('>合计<') || component.includes('合计</'), 'phase assistant pivot should include wet-basis totals row')
assert(!component.includes('phaseWaterRowClass'), 'H2O phase row should use the same styling as other rows')
assert(
  component.includes('打开方式：在配料总表填写投料量 (t/h)，双击 O / C / Other 进入本区。') &&
    !component.includes('打开方式：在配料总表填写投料量后，双击某原料的 O / C / Other 进入本区。') &&
    !component.includes('当前原料：') &&
    component.includes('计算原理：以质量守恒为基础') &&
    component.includes('化学计量比') &&
    component.includes('合计含水 100%'),
  'phase assistant should explain how to open once and the basic calculation principle without duplicating material name'
)
assert(!component.includes('活度修正系数'), 'phase assistant should not show activity correction inputs')
assert(!component.includes('O贡献'), 'phase assistant should use element columns instead of O/C/S contribution columns')
assert(
  component.includes('ensureMaterialPhaseRows') && component.includes('Other 为默认闭合物相，不能删除。'),
  'phase assistant should backfill default phase rows and protect the default Other closure row'
)
assert(!component.includes('物相反推 O / C / Other'), 'old phase reverse wording should be removed')
assert(!component.includes('物相折算'), 'phase-assistant wording should no longer emphasize conversion')
assert(!component.includes('体积分数') && !component.includes("label: 'v%'"), 'phase summary table and export should no longer include volume fraction rows')
assert(elementTable.includes('混料') || component.includes('混料'), 'blend result row should be named 混料')
assert(!component.includes('入炉计'), 'right-most result column should no longer be named 入炉计')
assert(component.includes('function StageSheetTabs'), 'copper workflow should use Excel-like sheet tabs for stage switching')
assert(!component.includes('{index + 1}. {stage.name}'), 'stage header should not show the old numbered stage button group')
assert(component.includes('操作流程：选择/添加原料 → 输入投料量 → 物相成分 → 输入出炉渣型与热平衡设置 → 开始迭代计算 → 复核配料总表 → 进入下一工序'), 'stage header should explain the iterative workflow instead of showing stage buttons')
assert(component.includes('COPPER_CASES_STORAGE_KEY'), 'copper workflow should persist case records in localStorage')
assert(component.includes('项目工作区'), 'copper method entry should enter a formal project workspace instead of a process-choice panel')
assert(component.includes('案例名称') && component.includes('newCaseName'), 'case creation should let users name the case themselves')
assert(component.includes('suggestCopperCaseName(smeltMethodName)'), 'new case name should be prefilled from the selected smelting method')
assert(component.includes('铜冶炼计算'), 'default case name should include the copper smelting calculation label')
assert(component.includes('新建案例') && component.includes('历史案例'), 'case workspace should let users create and review previous cases')
assert(component.includes('METCAL_COPPER_CASE_FILE_TYPE') && component.includes('.metcal-copper-case.json'), 'cases should export as a documented JSON case file')
assert(component.includes('导入案例') && component.includes('importCopperCaseFile'), 'case workspace should import exported case files')
assert(component.includes('handleCaseDrop') && component.includes('onDrop={handleCaseDrop}'), 'case workspace should allow opening case JSON files by drag and drop')
assert(component.includes('将案例文件拖入此处即可导入'), 'case workspace should show a visible drag-and-drop import target')
assert(component.includes('caseDropActive'), 'case workspace should highlight the drop zone while dragging files over it')
assert(component.includes('删除案例') && component.includes('deleteCopperCase'), 'case workspace should allow deleting previous cases')
assert(!component.includes('function CaseFooterActions'), 'bottom case footer with return/next should be removed')
assert(!component.includes('>返回工作区<'), 'duplicate bottom return-to-workspace button should be removed')
const caseWorkspaceSection = component.slice(component.indexOf("if (activeSheet === 'raw_material')"), component.indexOf("if (activeSheet === 'cu_equipment')"))
assert(!caseWorkspaceSection.includes('案例管理'), 'case workspace create area should be one row without the separate case-management explainer panel')
assert(!caseWorkspaceSection.includes('当前案例数'), 'case workspace should not show the current case count badge')
assert(!caseWorkspaceSection.includes('保存当前案例'), 'case workspace history area should not expose a save-current-case action')
assert(!caseWorkspaceSection.includes('当前页面'), 'case history should not show a low-value current-page column')
assert(caseWorkspaceSection.includes('上次修改时间') && !caseWorkspaceSection.includes('保存时间'), 'case history should label updatedAt as last modified time')
assert(caseWorkspaceSection.includes('onClick={() => openCopperCase(record)}') && caseWorkspaceSection.includes('hover:text-blue'), 'clicking the case name should open the case with hover affordance')
assert(!caseWorkspaceSection.includes('打开案例'), 'case history action area should not keep a separate open button')
assert(caseWorkspaceSection.includes('导出案例') && component.includes('exportCopperCaseWithSaveDialog'), 'case history should allow exporting a portable case file via a save dialog')
assert(caseWorkspaceSection.includes('whitespace-nowrap'), 'history actions should keep short action labels on one line')
assert(component.includes('CopperBatchElementTable'), 'element summary table should use transposed row layout component')
assert(component.includes('keydown') && component.includes("event.key.toLowerCase() === 's'"), 'Ctrl+S should save the active case')
assert(component.includes('confirmSaveBeforeCaseNavigation') && component.includes('是否保存当前页面的内容'), 'stage switching should support save confirmation when needed')
assert(component.includes('hasCopperCaseGeneratedData') && component.includes('isCopperCaseContentDirty'), 'stage switching should prompt when generated data or unsaved edits need attention')
assert(component.includes('function SaveBeforeNavigationDialog'), 'save-before-navigation prompt should be a branded in-app dialog')
assert(component.includes('src="./icon.png"') && component.includes('APP_NAME_ZH'), 'save prompt should show the software icon and name')
const saveDialogSection = component.slice(component.indexOf('function SaveBeforeNavigationDialog'), component.indexOf('function StageHeader'))
assert(saveDialogSection.includes('不保存') && saveDialogSection.includes('保存') && saveDialogSection.includes('grid-cols-2'), 'save prompt should offer equal-width save and skip actions')
assert(!saveDialogSection.includes('取消切换') && !saveDialogSection.includes('保存并切换') && !saveDialogSection.includes('不保存继续'), 'save prompt should not keep the old three-button layout')
assert(!component.includes('window.confirm'), 'save prompt should not use the browser/native confirm dialog')
const stageHeaderSection = component.slice(component.indexOf('function StageHeader'), component.indexOf('function LabeledInput'))
assert(!stageHeaderSection.includes('保存当前案例') && !stageHeaderSection.includes('当前案例：'), 'stage header should not keep top save/current-case controls')
assert(component.includes('function IteratingOverlay') && component.includes('steps?:'), 'iterating overlay should support step progress')
assert(!component.includes('phaseCalcStep') && !component.includes('解析物相方程'), 'phase calculation should use the shared simple calculating overlay')
assert(component.includes('batchTableHighlight') && component.includes('batch-table-view-enter'), 'batch table view should animate and pulse after phase refill')
assert(component.includes('shadow-md') && component.includes('BatchTableViewTabs'), 'batch table tabs should use prominent active styling')
assert(component.includes('setShowElementAssist(true)') && component.includes('m.weight > 0 && m.name.trim()'), 'phase assist should auto-expand when feed rate and material are set')
assert(!component.includes('添加新原料列'), 'batch table should not keep the external add-column button')
assert(component.includes('addSolvent') && component.includes('removeSolvent'), 'batch table should support adding and removing solvent rows')
assert(component.includes('回填物相到配料总表'), 'phase area should use distinct backfill label')
assert(component.includes('回填熔剂、产物到配料总表'), 'iteration area should use distinct backfill label')
assert(!component.includes('铜冶炼计算流程'), 'old process-choice title should be removed from the copper entry page')
assert(!component.includes('点击熔炼进入原料、熔剂和目标渣型计算'), 'old click-smelting workflow copy should be removed')
assert(!component.includes('返回铜冶炼流程'), 'return wording should not point back to the old flow page')
assert(!component.includes('该阶段会承接上一阶段的物料结果继续计算'), 'converting and refining should reuse the full smelting worksheet instead of a placeholder page')
assert(component.includes('isCopperProcessSheet'), 'shared copper process sheets should use one full worksheet implementation')
assert(component.includes('规模（万吨/a）') && component.includes('10万吨') && component.includes('20万吨'), 'equipment selection should start from a target production scale')
assert(component.includes('设备选型总表'), 'equipment selection should show a summary sizing table')
assert(component.includes('calculateCopperEquipmentSizing'), 'equipment selection should use a dedicated sizing calculation utility')
assert(component.includes('调整系数'), 'equipment selection table should expose adjustment factors for later tuning')
assert(
  component.includes('closeCopperRatios') &&
    component.includes('fillOther: false') &&
    component.includes('normalizeCopperRatios({') &&
    component.includes('...result.unknowns'),
  'batch table should store assays without Other while phase backfill closes ratios'
)
assert(
  component.includes('buildPhaseAssistDisplaySlots') &&
    component.includes('BATCH_PHASE_ASSIST_MIN_DISPLAY_COLUMNS') &&
    component.includes('canDeletePhaseAssistRow'),
  'phase assist table should pad empty columns and protect Other/H2O rows'
)
assert(
  component.includes('aria-label="删除物相"') && component.includes('×') && component.includes("row.kind !== 'other'"),
  'phase assist delete action should use an icon button and skip Other/H2O rows'
)

assert(!splash.includes('class="features"'), 'splash should not use feature-card blocks')
assert(
  splash.includes('面向有色冶炼配料计算、渣型控制和物料平衡的专业工程工具'),
  'splash subtitle should explain the product in one or two direct sentences'
)

console.log('CopperWorkflow UI checks passed')
