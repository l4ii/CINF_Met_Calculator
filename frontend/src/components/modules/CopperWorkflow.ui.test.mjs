import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const component = await readFile(new URL('./CopperWorkflow.tsx', import.meta.url), 'utf8')
const workflowCalc = await readFile(new URL('../../utils/copperWorkflowCalc.ts', import.meta.url), 'utf8')
const splash = await readFile(new URL('../../../../electron/splash.html', import.meta.url), 'utf8')

assert(component.includes('含量（%）'), 'copper table first column should be named 含量（%）')
assert(component.includes('writing-mode:vertical-rl'), '含量（%） should be displayed as a vertical left-side column')
assert(component.includes('添加新原料'), 'calculation table add button should clearly add a new raw material')
assert(component.includes('导出Excel'), 'calculation table should expose an Excel export action')
assert(component.includes('APP_NAME_ZH'), 'Excel export filename should use the software Chinese name')
assert(component.includes('buildCopperBatchExportFilename'), 'Excel export should build the requested software_stage_date filename')
assert(component.includes('downloadCopperBatchExcel'), 'Excel export should trigger a workbook download from the calculation table')
const workflowMessageIndex = component.indexOf('{workflowMessage &&')
assert(
  component.indexOf('原料库') < workflowMessageIndex && workflowMessageIndex < component.indexOf('ref={calculationTableRef}'),
  'workflow prompts should sit between the material library and the calculation table'
)
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
assert(component.includes('增行') && component.includes('删除行'), 'material add dialog should expose row add/delete controls')
assert((component.match(/>增行</g) ?? []).length === 1, 'material add dialog should only duplicate 增行 in the footer toolbar')
assert(component.includes('单行合计') && component.includes('singleLibraryRowTotal'), 'material add dialog should calculate composition totals per row')
assert(component.includes('不能超过 100'), 'single material add validation should block row totals above 100 percent')
assert(
  component.includes('请输入原料名称后再添加到原料库。') || component.includes('请输入原料名称后再保存。'),
  'material library dialog validation should remind users to fill the material name'
)
assert(component.includes('openLibraryMaterialEditDialog'), 'material library rows should expose an edit affordance backed by dialog state')
assert(component.includes('保存修改'), 'material library edit dialog should use a distinct save action label')
assert(component.includes('删除列'), 'delete-column action should use a clear 删除列 label')
assert(component.includes('批量导入'), 'material-library description should explain batch import/maintenance')
assert(component.includes('title="修改原料库条目"'), 'material library rows should expose a modify action beside delete')
assert(component.includes('原料库移除'), 'material library rows should expose a delete action')
assert(component.includes('libraryActionButtonClass'), 'material library row actions should use a lightweight outlined button style')
assert(!component.includes('bg-blue-600 text-white hover:bg-blue-700'), 'material library edit action should no longer use a heavy filled blue button')
assert(!component.includes('bg-red-600 text-white hover:bg-red-700'), 'material library delete action should no longer use a heavy filled red button')
assert(component.includes('text-center">操作</th>'), 'material library action header should be centered')
assert(component.includes('py-1.5 text-center'), 'material library delete actions should be centered')
assert(component.includes('text-sm') && component.includes('min-w-[1020px]'), 'material library table should use page-consistent text sizing and compact layout')
assert(component.includes('const calculationTableWidth = Math.max(720'), 'calculation table should use a fixed computed width instead of stretching full screen')
assert(component.includes('<table className="table-fixed text-sm" style={{ width: calculationTableWidth }}>'), 'calculation table should use the same readable text size as the material library')
assert(component.includes('rowSpan={COPPER_ELEMENT_KEYS.length + 2}'), '含量（%） should span feed, element, and total rows after removing the placeholder material row')
assert(component.includes('rowSpan={COPPER_ELEMENT_KEYS.length + 2}') && component.includes('>产物<'), 'product output should use a vertical product group beside the blend result')
assert(component.includes('function productOutputCellClass'), 'product output area should have its own pending/resolved frame styling')
assert(component.includes("productCalculated ? 'resolved' : 'pending'"), 'product output frame should turn green after product calculation is refilled')
assert(component.includes('title="联动迭代结果：产出由静态系数 × 混料总质量计算；点击进入迭代输入。"'), 'click target should move from the vertical product label to the iterative output table area')
assert(!component.includes('title="点击跳转到产出计算"'), 'vertical product label should not remain the primary click target')
assert(component.includes('left-[34px]'), 'sticky project column should align after the fixed vertical unit column')
assert(component.includes('className="w-32"'), 'each raw-material calculation column should have a fixed width')
assert(!component.includes('w-full min-w-[1040px] table-fixed text-xs'), 'calculation table should not stretch full-width with the old small font')
assert(component.includes('sectionTitle(darkMode)} mb-0`}>配料总表'), 'calculation table title should use section-title sizing')
assert(component.includes("const base = 'border-t px-1 py-1 align-middle text-center'"), 'calculation table cells should center displayed parameters')
assert(component.includes('text-center font-mono text-sm'), 'calculation table numeric inputs should be centered')
assert(component.includes('function materialSelectClass'), 'raw-material select should use a dedicated class instead of cramped numeric input sizing')
assert(component.includes('h-9 w-full appearance-none') && component.includes('leading-normal'), 'raw-material select should have enough height and normal line-height for centered text')
assert(!component.includes('h-7 w-full truncate px-1 py-0 text-center text-sm'), 'raw-material select should not use the old cramped h-7 style')
assert(!component.includes('className="px-1 py-2 text-center font-semibold">原料</th>'), 'raw material placeholder header cells should be removed')
assert(!component.includes('>固定</td>'), 'solvent fixed placeholder cells should be removed from the calculation table')
assert(!component.includes('>自动</td>'), 'mix automatic placeholder cell should be removed from the calculation table')
assert(component.includes('可直接手动输入原料投料量'), 'raw material feed amount should be an explicit manual input')
assert(component.includes('rawWeightDrafts'), 'raw feed amount inputs should keep empty draft values before user entry')
assert(component.includes("value={rawWeightDrafts[material.id] ?? ''}"), 'default and added raw feed amount cells should render empty before input')
assert(component.includes("rawWeightStatus(material.id)"), 'raw feed amount cells should use red/green validity highlighting')
assert(component.includes('步骤1：输入投料量'), 'raw feed tooltip should show sequence step 1')
assert(component.includes('待物相求解'), 'raw O/C/Other inputs should be marked as pending phase solving')
assert(component.includes('联动迭代结果：熔剂投料量由出炉渣型目标求解'), 'solvent feed result cells should point to coupled iteration solving')
assert(component.includes('border-emerald') && component.includes('bg-emerald'), 'refilled calculation inputs should support a green resolved state')
assert(component.includes("type SolveInputStatus = 'none' | 'pending' | 'resolved'"), 'calculation input highlighting should distinguish none, pending, and resolved states')
assert(component.includes('manualPhaseCells'), 'phase O/C/Other cells should also resolve green when manually typed')
assert(component.includes('manualSolventWeights'), 'solvent feed cells should resolve green after coupled iteration writes results')
assert(component.includes('manualFuelWeightValid'), 'fuel coal cell should resolve green after coupled iteration writes results')
assert(component.includes('步骤2：物相反推元素') && component.includes('可直接手动输入'), 'phase tooltip should show sequence step 2 and allow manual input')
assert(component.includes('phaseCompletedMaterials'), 'phase completion should be tracked per raw material instead of marking all materials at once')
assert(component.includes('phasePreviewUnknowns'), 'phase assistant should keep phase preview state for case persistence after refill')
assert(component.includes('calculatePhaseUnknownsPreview'), 'phase assistant should calculate merged table results on demand')
assert(component.includes('计算元素补全结果') && component.includes('回填到配料总表'), 'phase assistant should separate calculate and refill actions')
assert(component.includes('formatPhaseCell'), 'phase assistant should hide solver cells until calculate is clicked')
assert(component.includes('activePhasePreview'), 'phase assistant should only show solver preview after calculate is clicked')
assert(component.includes('联动迭代结果：熔剂投料量由出炉渣型目标求解'), 'solvent amount cells should route users into the coupled iteration input')
assert(component.includes('产出由静态系数 × 混料总质量计算'), 'product output cells should route users into the coupled iteration input')
assert(component.includes('燃料煤由热平衡基于熔剂投料量求解'), 'fuel amount cell should route users into the coupled iteration input')
assert(component.includes('calculationTableRef'), 'calculation table needs a ref so assistant calculations can return after refill')
assert(component.includes('scrollToCalculationTable()'), 'assistant refill actions should jump back to the calculation table')
assert(component.includes('onClick={(event) => event.stopPropagation()}'), 'manual calculation inputs should not jump away on ordinary click')
assert(component.includes('openIterationAssist') && component.includes('iterationAssistRef'), 'solvent, product, and heat result cells should open the iteration input section')
assert(component.includes('onDoubleClick={() => {') && component.includes('openElementAssist(material.id)'), 'double-clicking raw O/C/Other cells should still open element completion')
assert(component.includes('混料关键参数'), 'blend indicators should sit directly below the calculation table')
assert(component.indexOf('混料关键参数') < component.indexOf('步骤 1：物相折算与元素补全'), 'blend indicators should remain in the calculation-table card before assistant sections')
assert(component.includes('function BlendMetric'), 'blend indicators should use a dedicated lightweight metric style')
assert(component.includes('<BlendMetric darkMode={darkMode} label='), 'blend indicators should render through the lightweight blend metric component')
assert(!component.includes('compact={true}'), 'blend indicators should not keep result-card compact Metric styling')
assert(component.includes('mt-0.5 font-mono text-base'), 'blend metric values should be only one step larger than table body text')
assert(component.includes('gap-2 md:grid-cols-3 xl:grid-cols-6'), 'blend indicator grid should stay visually compact')
assert(component.includes('>名称<'), 'second header row first data column should be 名称')
assert(component.includes('熔剂1') && component.includes('熔剂2'), 'solvent headers should be numbered 熔剂1 and 熔剂2')
assert(component.includes('石灰石') && component.includes('铁矿石'), 'second header row should show solvent material names')
assert(((component.match(/>混料<\/th>/g) ?? []).length >= 2), 'mix column should show 混料 on both header rows')
assert(component.includes('productColumns.map((product) =>') && component.includes('product.name'), 'product outputs should be shown as one product column per product')
assert(component.indexOf('>混料</th>') < component.indexOf("key={`product-head-${product.key}`"), 'product columns should sit to the right of the blend column')
assert(!component.includes('>物相</td>'), 'old bottom phase row should be removed from the calculation table')
assert(!component.includes('O/C/Other</button>'), 'old phase-row O/C/Other buttons should be removed')
assert(component.includes('步骤 1：物相折算与元素补全'), 'first assistant section should be renamed professionally')
assert(component.includes('步骤 2：开始迭代计算'), 'second assistant section should be the coupled iteration entry')
assert(component.includes('开始迭代计算'), 'workflow should expose a one-click iterative calculation entry after phase completion')
assert(component.includes('runIterativeCalculation'), 'workflow should run coupled solvent-product-heat iteration from the UI')
assert(component.includes('迭代轨迹'), 'iterative calculation should show trace rows so users can review convergence')
assert(component.includes('出炉渣型'), 'iterative calculation entry should ask for the tapped/final slag type target')
assert(component.includes('联动求解已开启') && component.includes('首次迭代后开启联动求解'), 'iteration entry should show linked-solve status')
assert(component.includes('iterationAutoLinked') && component.includes('iterationInputSignature'), 'workflow should auto-refresh linked results after the first iteration')
assert(component.includes('迭代结果：熔剂投料量'), 'solvent detail view should be retained as an iteration result panel')
const solventAssistSection = component.slice(component.indexOf('迭代结果：熔剂投料量'), component.indexOf('迭代结果：产出计算'))
assert(solventAssistSection.includes('熔剂计算参数') && solventAssistSection.includes('熔剂回填结果'), 'solvent result panel should keep parameter and result displays')
assert(solventAssistSection.includes('<table className="w-full table-fixed text-sm">'), 'solvent assist result display should use a compact table instead of mismatched metric cards')
assert(component.includes('solventPreviewSolution') && !component.includes('applySolventSolution'), 'solvent panel should display iterative results without a standalone refill action')
assert(!component.includes('计算熔剂投料量') && !component.includes('回填熔剂投料量'), 'solvent panel should no longer expose single-step solvent actions')
assert(component.includes('迭代结果：产出计算'), 'product detail view should be retained as an iteration result panel')
assert(component.includes('COPPER_PRODUCT_FORMULAS') && component.includes('主要成分'), 'product result panel should show product main components in the product column headers')
assert(workflowCalc.includes("'N (氮)'") && component.includes('COPPER_ELEMENT_KEYS.map((element) =>'), 'product and feed element displays should include nitrogen through the shared element list')
assert(component.includes('混料总质量 × 元素含量 × 静态分配系数 × 化合物折算系数') || component.includes('静态分配系数'), 'product result panel should explain static coefficient calculation')
assert(!component.includes('calculateProductsPreview') && !component.includes('refillProductsToTable'), 'product panel should not use standalone calculate/refill handlers')
assert(!component.includes('计算产出') && !component.includes('回填产出'), 'product panel should no longer expose single-step product actions')
assert(component.includes('迭代结果：热平衡与燃料煤'), 'heat detail view should be retained as an iteration result panel')
assert(component.includes('heatPreviewReady') && !component.includes('calculateHeatBalancePreview'), 'heat panel should display iterative heat result without a standalone preview handler')
assert(!component.includes('计算热平衡') && !component.includes('回填燃料煤并复算'), 'heat panel should no longer expose single-step heat actions')
assert(component.includes('燃料煤'), 'calculation table should include a fuel coal column after heat balance is introduced')
assert(component.includes("'待联动'"), 'product output cells should remain pending before iteration')
assert(component.includes('步骤1：请输入「') && component.includes('步骤2：请双击') && component.includes('步骤3：请点击熔剂'), 'calculation table should show prominent step-by-step guidance')
assert(component.includes('IteratingOverlay') && component.includes('迭代计算中，请稍候') && component.includes('window.setTimeout(resolve, 1000)'), 'first iterative calculation should show a perceptible one-second progress animation')
assert(component.includes('IterationSubstepCard') && component.includes('1 熔剂渣型求解') && component.includes('2 产物分配计算') && component.includes('3 热平衡配煤'), 'iteration input should distinguish detailed substeps from the overall calculation')
assert(!component.includes('>计算并回填熔剂<'), 'solvent section should no longer calculate and refill in one action')
assert(!component.includes('>计算并回填产出<'), 'product section should no longer calculate and refill in one action')
const productAssistSection = component.slice(component.indexOf('迭代结果：产出计算'), component.indexOf('迭代结果：热平衡'))
assert(
  productAssistSection.includes('<table className="w-full table-fixed text-sm">') &&
    productAssistSection.includes('COPPER_ELEMENT_KEYS.map((element) =>') &&
    productAssistSection.includes('product-detail-head') &&
    productAssistSection.includes('productOutputCellClass(darkMode, productCalculated'),
  'product result panel should reuse the summary-table vertical product columns, all element rows, and matching cell typography'
)
assert(
  productAssistSection.includes('whitespace-normal break-words') &&
    !productAssistSection.includes('productDetailTableWidth') &&
    !productAssistSection.includes('w-32" />'),
  'fixed product outputs should distribute across the full result table and show component text without truncation'
)
assert(!productAssistSection.includes('PRODUCT_DISPLAY_ELEMENTS'), 'product result panel should not use a separate short element list')
assert(
  productAssistSection.includes('assistAlertPanelClassName') && productAssistSection.includes('联动迭代结果'),
  'product result panel should show an iteration result summary beside the merged flow'
)
const heatAssistSection = component.slice(
  component.indexOf('迭代结果：热平衡与燃料煤'),
  component.indexOf('{canProceed && nextProcessStage')
)
assert(
  heatAssistSection.includes('联动迭代结果') && heatAssistSection.includes('assistAlertPanelClassName'),
  'heat result panel should show deficit, recommended coal, and iteration result guidance'
)
assert(
  productAssistSection.indexOf('table') < productAssistSection.indexOf('重新迭代计算') &&
    productAssistSection.includes('justify-end'),
  'product iteration action should be placed at the lower-right after the product assist table'
)
assert(component.includes('calculateCopperProducts') && component.includes('calculateCopperHeatBalance'), 'copper workflow should use the product and heat-balance calculation utilities')
assert(component.includes('phaseCompleted') && component.includes('productCalculated'), 'workflow should validate sequential calculation prerequisites')
assert(component.includes('请先逐一完成所有原料的物相折算') && component.includes('请先补全出炉渣型'), 'workflow should tell users which iteration input is missing')
assert(component.includes('showElementAssist') && component.includes('showSolventAssist'), 'assistant sections should be collapsible')
assert(component.includes('calculatePhaseElementCompletion'), 'phase assistant should derive phase contents from known elements and activity factors')
const phaseAssistSection = component.slice(component.indexOf('步骤 1：物相折算与元素补全'), component.indexOf('步骤 2：开始迭代计算'))
assert(
  phaseAssistSection.includes('<th className="w-24 px-2 py-2 text-center">Other</th>'),
  'phase assistant table should expose an Other column header aligned with O/C elemental columns'
)
assert(phaseAssistSection.includes('min-w-[1040px]'), 'phase assistant merged table should reserve width for the Other column')
assert(
  !phaseAssistSection.includes('colSpan={3} className="px-2 py-2 text-right font-semibold">元素补全'),
  'phase assistant footer should align element completion with columns instead of spanning three cells'
)
assert(
  phaseAssistSection.includes('>元素补全</td>'),
  'phase assistant should keep a dedicated left label cell for the completion summary row'
)
assert(
  phaseAssistSection.includes('软件严格遵循冶金热力学中的质量守恒定律，通过物相的化学计量关系进行顺序反推。'),
  'phase assistant should show a concise mass-conservation introduction'
)
assert(component.includes('活度修正系数') && component.includes('等效生成量(%)'), 'phase assistant should combine activity inputs and derived solver columns in one table')
assert(!component.includes('>求解项<'), 'phase assistant should not use a separate solver panel below the input table')
assert(!component.includes('折算/活度修正系数'), 'phase assistant should rename the activity input column')
assert(component.includes('O贡献') && component.includes('C贡献') && component.includes('S贡献'), 'phase assistant should show elemental contribution columns')
assert(component.includes("'Cu2S'") && component.includes("'FeS'"), 'phase assistant should include sulfide phases for MetCal-style assignment')
assert(!component.includes('物相反推 O / C / Other'), 'old phase reverse wording should be removed')
assert(component.includes('>混料<') || component.includes('混料</th>'), 'right-most result column should be named 混料')
assert(!component.includes('入炉计'), 'right-most result column should no longer be named 入炉计')
assert(component.includes('function StageSheetTabs'), 'copper workflow should use Excel-like sheet tabs for stage switching')
assert(!component.includes('{index + 1}. {stage.name}'), 'stage header should not show the old numbered stage button group')
assert(component.includes('操作流程：选择/添加原料 → 输入投料量 → 物相折算元素 → 输入出炉渣型与热平衡设置 → 开始迭代计算 → 复核配料总表 → 进入下一工序'), 'stage header should explain the iterative workflow instead of showing stage buttons')
assert(component.includes('COPPER_CASES_STORAGE_KEY'), 'copper workflow should persist case records in localStorage')
assert(component.includes('铜冶炼项目工作区'), 'clicking 铜冶炼 should enter a formal project workspace instead of a process-choice panel')
assert(component.includes('案例名称') && component.includes('newCaseName'), 'case creation should let users name the case themselves')
assert(component.includes('useState(() => suggestCopperCaseName())'), 'new case name should be prefilled with the suggested default title')
assert(component.includes('铜熔炼试算'), 'default case name should use the suggested copper smelting trial title')
assert(component.includes('新建案例') && component.includes('历史案例'), 'case workspace should let users create and review previous cases')
assert(component.includes('保存当前案例'), 'process pages should expose a save-current-case action')
assert(component.includes('METCAL_COPPER_CASE_FILE_TYPE') && component.includes('.metcal-copper-case.json'), 'cases should export as a documented JSON case file')
assert(component.includes('导入案例') && component.includes('importCopperCaseFile'), 'case workspace should import exported case files')
assert(component.includes('handleCaseDrop') && component.includes('onDrop={handleCaseDrop}'), 'case workspace should allow opening case JSON files by drag and drop')
assert(component.includes('拖入 .metcal-copper-case.json'), 'case workspace should explain that a portable JSON case file can be dragged in')
assert(component.includes('删除案例') && component.includes('deleteCopperCase'), 'case workspace should allow deleting previous cases')
assert(component.includes('返回案例页面'), 'process pages should return to the copper case page')
const caseWorkspaceSection = component.slice(component.indexOf("if (activeSheet === 'raw_material')"), component.indexOf("if (activeSheet === 'cu_equipment')"))
assert(!caseWorkspaceSection.includes('案例管理'), 'case workspace create area should be one row without the separate case-management explainer panel')
assert(!caseWorkspaceSection.includes('当前案例数'), 'case workspace should not show the current case count badge')
assert(!caseWorkspaceSection.includes('保存当前案例'), 'case workspace history area should not expose a save-current-case action')
assert(!caseWorkspaceSection.includes('当前页面'), 'case history should not show a low-value current-page column')
assert(caseWorkspaceSection.includes('上次修改时间') && !caseWorkspaceSection.includes('保存时间'), 'case history should label updatedAt as last modified time')
assert(caseWorkspaceSection.includes('onClick={() => openCopperCase(record)}') && caseWorkspaceSection.includes('hover:text-blue'), 'clicking the case name should open the case with hover affordance')
assert(!caseWorkspaceSection.includes('打开案例'), 'case history action area should not keep a separate open button')
assert(caseWorkspaceSection.includes('保存桌面') && component.includes('saveCopperCaseToDesktop'), 'case history should allow saving a case file to Desktop')
assert(caseWorkspaceSection.includes('whitespace-nowrap'), 'history actions should keep short action labels on one line')
assert(component.includes('function CaseFooterActions'), 'case save/export actions should live at the bottom of each process page')
assert(component.includes('快捷键 Ctrl+S') && component.includes('keydown') && component.includes("event.key.toLowerCase() === 's'"), 'Ctrl+S should save the active case')
assert(component.includes('confirmSaveBeforeCaseNavigation') && component.includes('是否保存当前页面的内容'), 'stage switching should support save confirmation when needed')
assert(component.includes('hasCopperCaseGeneratedData') && component.includes('isCopperCaseContentDirty'), 'stage switching should only prompt after generated data and unsaved edits')
assert(component.includes('function SaveBeforeNavigationDialog'), 'save-before-navigation prompt should be a branded in-app dialog')
assert(component.includes('src="./icon.png"') && component.includes('APP_NAME_ZH'), 'save prompt should show the software icon and name')
assert(component.includes('保存并切换') && component.includes('不保存继续') && component.includes('取消切换'), 'save prompt should expose clear branded actions')
assert(!component.includes('window.confirm'), 'save prompt should not use the browser/native confirm dialog')
const stageHeaderSection = component.slice(component.indexOf('function StageHeader'), component.indexOf('function CaseFooterActions'))
assert(!stageHeaderSection.includes('保存当前案例') && !stageHeaderSection.includes('当前案例：'), 'stage header should not keep top save/current-case controls')
assert(stageHeaderSection.includes('返回项目工作区'), 'case pages should expose a top back action to the copper project workspace')
assert(!component.includes('铜冶炼计算流程'), 'old process-choice title should be removed from the copper entry page')
assert(!component.includes('点击熔炼进入原料、熔剂和目标渣型计算'), 'old click-smelting workflow copy should be removed')
assert(!component.includes('返回铜冶炼流程'), 'return wording should not point back to the old flow page')
assert(!component.includes('该阶段会承接上一阶段的物料结果继续计算'), 'converting and refining should reuse the full smelting worksheet instead of a placeholder page')
assert(component.includes('isCopperProcessSheet'), 'shared copper process sheets should use one full worksheet implementation')
assert(component.includes('规模（万吨/a）') && component.includes('10万吨') && component.includes('20万吨'), 'equipment selection should start from a target production scale')
assert(component.includes('设备选型总表'), 'equipment selection should show a summary sizing table')
assert(component.includes('calculateCopperEquipmentSizing'), 'equipment selection should use a dedicated sizing calculation utility')
assert(component.includes('调整系数'), 'equipment selection table should expose adjustment factors for later tuning')

assert(!splash.includes('class="features"'), 'splash should not use feature-card blocks')
assert(
  splash.includes('面向有色冶炼配料计算、渣型控制和物料平衡的专业工程工具'),
  'splash subtitle should explain the product in one or two direct sentences'
)

console.log('CopperWorkflow UI checks passed')
