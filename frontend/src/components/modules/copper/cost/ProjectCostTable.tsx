import { useMemo, useState, type KeyboardEvent, type ReactNode } from 'react'
import { btnSecondary, btnPrimary } from '../../../../theme/uiTheme.ts'
import { EQUIPMENT_BOM_PRICING_LABELS, type EquipmentBomItem, type EquipmentBomPricingMode } from '../../../../utils/copperEquipmentBom.ts'
import type { AnnualCostRow, AnnualMaterialCostResult } from '../../../../utils/copperProjectCost.ts'
import { calculateProjectCost, compareCostScenario, createCostBaseline, parseCostNumber, type CostLine, type CostScenarioDraft, type ProjectCostWorkbookState } from '../../../../utils/projectCostWorkbook.ts'

const SHEETS = [['summary', '费用汇总'], ['equipment', '设备购置'], ['construction', '建设材料'], ['installation', '安装工程'], ['other', '其他费用'], ['funding', '资金与预备费'], ['materials', '生产原料'], ['utilities', '公辅能耗'], ['products', '产出货值'], ['optimization', '原料优化']] as const
type Sheet = typeof SHEETS[number][0]
type LineSheet = 'construction' | 'installation' | 'other' | 'utilities'
const LINE_SHEETS: LineSheet[] = ['construction', 'installation', 'other', 'utilities']
const fmt = (value: number | null | undefined, digits = 2) => value == null || !Number.isFinite(value) ? '—' : value.toLocaleString('zh-CN', { maximumFractionDigits: digits, minimumFractionDigits: digits })
const wan = (value: number | null | undefined) => value == null ? '—' : fmt(value / 10000)
const newId = (prefix: string) => `${prefix}-${globalThis.crypto.randomUUID()}`
const sourceLabel: Record<string, string> = { override: '本表单价', material: '原料库', catalog: '参考估价', missing: '待询价' }

type Props = {
  darkMode: boolean; title: string; result: AnnualMaterialCostResult
  annualDaysText: string; processDays: number; priceDrafts: Record<string, string>
  onAnnualDaysChange: (value: string) => void; onPriceChange: (rowId: string, value: string) => void; onResetPrices: () => void
  workbook: ProjectCostWorkbookState; onWorkbookChange: (state: ProjectCostWorkbookState) => void
  bomItems: EquipmentBomItem[]; onBomItemsChange: (items: EquipmentBomItem[]) => void
  caseName: string; stageLabel: string
}

function Cell({ label, value, onChange, numeric = false, placeholder, disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; numeric?: boolean; placeholder?: string; disabled?: boolean
}) {
  const invalid = numeric && value.trim() !== '' && parseCostNumber(value) == null
  return <input className={`cost-cell ${numeric ? 'cost-number' : ''} ${invalid ? 'cost-invalid' : ''}`} aria-label={label} aria-invalid={invalid || undefined}
    value={value} inputMode={numeric ? 'decimal' : undefined} placeholder={placeholder} disabled={disabled} onChange={e => onChange(e.target.value)} />
}

function Grid({ headers, children, footer }: { headers: string[]; children: ReactNode; footer?: ReactNode }) {
  const moveCell = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Enter') return
    const cell = (event.target as HTMLElement).closest('td')
    const row = cell?.parentElement
    if (!cell || !row) return
    const next = event.shiftKey ? row.previousElementSibling : row.nextElementSibling
    const target = next?.children[cell.cellIndex]?.querySelector<HTMLElement>('input,select,button')
    if (target) { event.preventDefault(); target.focus() }
  }
  return <div className="cost-grid-scroll" onKeyDown={moveCell}><table className="cost-grid"><thead><tr>{headers.map((header, i) => <th key={i}><span className="cost-column-letter">{i === 0 ? '' : String.fromCharCode(64 + i)}</span>{header}</th>)}</tr></thead><tbody>{children}</tbody>{footer && <tfoot>{footer}</tfoot>}</table></div>
}

export default function ProjectCostTable({ darkMode, title, result, annualDaysText, processDays, priceDrafts, onAnnualDaysChange,
  onPriceChange, onResetPrices, workbook, onWorkbookChange, bomItems, onBomItemsChange, caseName, stageLabel }: Props) {
  const [sheet, setSheet] = useState<Sheet>('summary')
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState('')
  const [search, setSearch] = useState('')
  const totals = useMemo(() => calculateProjectCost(bomItems, workbook, result), [bomItems, workbook, result])
  const comparison = useMemo(() => workbook.baseline ? compareCostScenario(workbook.baseline, workbook.scenario) : null, [workbook.baseline, workbook.scenario])
  const missingMaterials = result.inputRows.filter(row => row.priceSource === 'missing').length
  const daysInvalid = annualDaysText.trim() !== '' && (parseCostNumber(annualDaysText) == null || Number(annualDaysText) > 366)
  const setWorkbook = (changes: Partial<ProjectCostWorkbookState>) => onWorkbookChange({ ...workbook, ...changes })
  const updateEquipment = (id: string, field: string, value: string | boolean) => setWorkbook({ equipment: { ...workbook.equipment, [id]: { ...workbook.equipment[id], [field]: value } } })
  const updateBom = (id: string, changes: Partial<EquipmentBomItem>) => onBomItemsChange(bomItems.map(item => item.id === id ? { ...item, ...changes } : item))
  const updateLine = (section: LineSheet, id: string, field: keyof CostLine, value: string) => setWorkbook({ [section]: workbook[section].map(row => row.id === id ? { ...row, [field]: value } : row) })
  const updateScenario = (id: string, changes: CostScenarioDraft) => setWorkbook({ scenario: { ...workbook.scenario, [id]: { ...workbook.scenario[id], ...changes } } })
  const addLine = (section: LineSheet) => setWorkbook({ [section]: [...workbook[section], { id: newId(section), name: '', unit: section === 'utilities' ? 'kWh' : '项', quantity: '', unitPrice: '', note: '' }] })
  const exportExcel = async () => {
    setExporting(true); setMessage('')
    try {
      const { exportProjectCostWorkbookXlsx } = await import('../../../../utils/projectCostWorkbookXlsx.ts')
      await exportProjectCostWorkbookXlsx({ caseName, stageLabel, bomItems, state: workbook, result })
      setMessage('工作簿已导出，包含各表明细与计算公式。')
    } catch (error) { setMessage(`导出失败：${error instanceof Error ? error.message : '请重试'}`) }
    finally { setExporting(false) }
  }
  const exportOptimization = () => {
    if (!workbook.baseline || !comparison) return
    const content = { version: 1, caseName, stageLabel, quantityUnit: 't/h', priceUnit: 'CNY/t', basis: '湿基投入；固定基准价格与年运行小时', objective: 'minimize_annual_input_cost', baseline: workbook.baseline, candidate: workbook.scenario,
      review: { costScreenValid: comparison.valid, processFeasibility: 'not_evaluated', requiredChecks: ['元素及物相平衡', '热平衡', '氧气与燃料需求', '处理能力', '产品品质', '环保约束'] } }
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: 'application/json;charset=utf-8' }))
    const anchor = document.createElement('a'); anchor.href = url
    anchor.download = `${caseName}-${stageLabel}-原料优化输入.json`.replace(/[\\/:*?"<>|]/g, '_'); anchor.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    setMessage('已导出基准、候选用量和约束边界，可用于后续算法接入。')
  }
  const captureBaseline = () => {
    try {
      setWorkbook({ baseline: createCostBaseline(result), scenario: {} })
      setMessage('已保存当前投入为新基准，候选用量与边界已重置。')
    } catch (error) { setMessage(error instanceof Error ? error.message : '基准保存失败，请核对投入数据。') }
  }
  const metric = (label: string, value: number | null, unit = '万元', hint?: string) => <div className="cost-metric" key={label}><div className="cost-muted">{label}</div><div className="cost-metric-value">{unit === '元/t' ? fmt(value) : wan(value)} <small>{unit}</small></div>{hint && <div className="cost-muted cost-small">{hint}</div>}</div>
  const annualTable = (rows: AnnualCostRow[], output: boolean) => <>
    <div className="cost-sheet-toolbar"><p>{output ? '产出货值单列，含中间产品与副产物；返料转移价值不等同于外销收入。' : '用量跟随当前配料结果；候选用量请在“原料优化”中试算。单价清空时跟随原料库或参考估价。'}</p><button className={btnSecondary(darkMode)} onClick={onResetPrices}>恢复物料参考价</button></div>
    <Grid headers={['#', '物料名称', '类别', '湿基量 t/h', '年量 t/a', '单价 元/t', output ? '年货值 万元' : '年费用 万元', '价格来源']} footer={<tr><td colSpan={6}>已计价{output ? '货值' : '费用'}小计</td><td className="cost-number">{wan(output ? result.outputAnnualValue : result.inputAnnualCost)}</td><td /></tr>}>
      {rows.length === 0 ? <tr><td colSpan={8} className="cost-empty">请先完成本工序的{output ? '产出' : '配料'}计算。</td></tr> : rows.map((row, i) => <tr key={row.id}><td>{i + 1}</td><td>{row.name}</td><td>{row.kindLabel}</td><td className="cost-number cost-calculated">{fmt(row.hourlyWetTh, 3)}</td><td className="cost-number cost-calculated">{fmt(row.annualTonnage)}</td>
        <td><Cell label={`${row.name}单价`} value={priceDrafts[row.id] ?? (row.priceSource === 'missing' ? '' : String(row.unitPrice))} placeholder={row.priceSource === 'missing' ? '待询价' : String(row.unitPrice)} numeric onChange={value => onPriceChange(row.id, value)} /></td><td className="cost-number cost-calculated">{row.priceSource === 'missing' ? '待询价' : wan(row.annualCost)}</td><td><span className={row.priceSource === 'missing' ? 'cost-warning' : 'cost-muted'}>{sourceLabel[row.priceSource]}</span></td></tr>)}
    </Grid><p className="cost-footnote">湿基 t/h × {fmt(result.annualHours, 0)} h/a × 元/t。矿石干基、金属计价或运费应先统一折算。参考价格须按实际合同、税口径和日期复核。</p>
  </>

  return <section className={`cost-workbook ${darkMode ? 'cost-dark' : ''}`} aria-label={`${stageLabel}工程造价工作簿`}>
    <style>{STYLES}</style>
    <div className="cost-header"><div><div className="cost-eyebrow">PROJECT COST WORKBOOK · {stageLabel}</div><h3>{title}</h3><p className="cost-muted">设备与建设费用分表管理，生产成本随配料联动。</p></div><button type="button" disabled={exporting || daysInvalid} className={btnSecondary(darkMode)} onClick={exportExcel}>{exporting ? '正在导出…' : '导出 Excel 工作簿'}</button></div>
    <div className="cost-formula-bar"><span className="cost-fx">ƒx</span><span>{sheet === 'summary' ? '建设投资 = 设备 + 建设材料 + 安装 + 其他建设费用 + 预备费' : sheet === 'optimization' ? '候选年费用 = Σ（候选湿基用量 × 基准单价）× 基准年运行小时' : sheet === 'materials' || sheet === 'products' ? '年费用 / 货值 = 湿基小时量 × 年处理天数 × 24 × 单价' : sheet === 'utilities' ? '公辅年费用 = 年用量 × 单价' : '费用 = 工程量 × 单价；成套包含和接口预留项不重复计价'}</span></div>
    <div className="cost-time-bar"><label>年处理天数 <input aria-label="造价年处理天数" className={`cost-days ${daysInvalid ? 'cost-invalid' : ''}`} value={annualDaysText} placeholder={String(processDays)} inputMode="decimal" onChange={e => onAnnualDaysChange(e.target.value)} /> d</label><span className="cost-muted">{annualDaysText.trim() ? '本表覆盖' : '跟随工序'} · {fmt(result.annualHours, 0)} h/a</span>{annualDaysText && <button className="cost-text-button" onClick={() => onAnnualDaysChange('')}>跟随工序</button>}<span className="cost-muted cost-time-note">可编辑格为蓝字 · Enter 向下移动 · 随案例保存</span></div>
    {daysInvalid && <div role="alert" className="cost-alert">年处理天数请填写 0–366 的有效数值；当前测算不能作为完整结果。</div>}{message && <div role="status" className="cost-alert">{message}</div>}
    <div role="tabpanel" aria-label={SHEETS.find(item => item[0] === sheet)?.[1]} className="cost-sheet">
      {sheet === 'summary' && <>
        <div className="cost-metrics">{metric('建设投资 · 已计价', totals.constructionInvestment, '万元', '设备、材料、安装、其他及已填预备费')}{metric('年度物料与公辅 · 已计价', totals.operatingAnnualCost, '万元/a', '不含人工、折旧、修理及财务费用')}{metric('项目总投资', totals.projectTotalInvestment, '万元', '建设投资 + 利息 + 全额流动资金')}{metric('吨产品物料与公辅成本', result.productAnnualTonnage > 0 && totals.operatingAnnualCost != null ? totals.operatingAnnualCost / result.productAnnualTonnage : null, '元/t', `${result.productName} · 当前产出量口径`)}</div>
        <div className="cost-summary-columns"><div><h4>建设投资构成</h4>{([['equipment', '设备购置', totals.equipmentTotal], ['construction', '建设材料与土建', totals.constructionTotal], ['installation', '安装工程', totals.installationTotal], ['other', '其他建设费用', totals.otherTotal], ['funding', '基本预备费', totals.reserveAmount]] as const).map(([key, label, value]) => <button className="cost-summary-row" key={key} onClick={() => setSheet(key)}><span>{label}</span><strong>{wan(value)} <small>万元</small> →</strong></button>)}</div>
          <div><h4>运行成本与资金口径</h4>{([['materials', '年生产原料费用', result.inputAnnualCost], ['utilities', '年公辅能耗费用', totals.utilitiesAnnualTotal], ['products', '年产出货值', result.outputAnnualValue], ['funding', '铺底流动资金', totals.initialWorkingCapital], ['funding', '报批总投资', totals.approvalTotalInvestment]] as const).map(([key, label, value]) => <button className="cost-summary-row" key={label} onClick={() => setSheet(key)}><span>{label}</span><strong>{wan(value)} <small>{key === 'funding' ? '万元' : '万元/a'}</small> →</strong></button>)}</div></div>
        <div className="cost-completeness"><strong>{totals.incompleteCount + totals.fundingIncompleteCount > 0 ? '报价待完善' : '已填项目已完成计价'}</strong><span>{totals.incompleteCount} 项费用待完善（含 {missingMaterials} 项物料缺价）· {totals.fundingIncompleteCount} 项资金参数待填{totals.invalidCount ? ` · ${totals.invalidCount} 项输入异常` : ''}</span></div>
        <p className="cost-footnote">建设投资显示已计价小计；未填写项目不会被当成零成本。产出货值与投入差额不代表利润，工序间转移物料不宜直接汇总为全厂收入。请统一报价的含税口径，剔除成套设备已含的材料及安装费用。</p>
      </>}
      {sheet === 'equipment' && <>
        <div className="cost-sheet-toolbar"><input aria-label="搜索造价设备" className="cost-search" placeholder="搜索设备名称、编码、系统…" value={search} onChange={e => setSearch(e.target.value)} /><button className={btnSecondary(darkMode)} onClick={() => onBomItemsChange([...bomItems, { id: newId('custom-equipment'), name: '新增设备', specification: '', quantity: 1, unit: '台', material: '', note: '', group: '配套设备', pricingMode: 'separate', source: '手工补充' }])}>＋ 补充设备</button></div>
        <Grid headers={['#', '设备名称 / 编码', '规格参数', '系统 / 材质', '采购范围', 'BOM量', '采购量', '单位', '单价 元', '合价 万元', '报价来源 / 备注', '操作']} footer={<tr><td colSpan={9}>设备购置已计价小计</td><td className="cost-number">{wan(totals.equipmentTotal)}</td><td colSpan={2}>成套包含 / 接口项不计</td></tr>}>
          {totals.equipmentRows.filter(row => `${row.name} ${row.id} ${row.group}`.toLowerCase().includes(search.toLowerCase())).map((row, i) => {
            const item = bomItems.find(item => item.id === row.id)!
            const draft = workbook.equipment[row.id] ?? {}
            return <tr key={row.id}><td>{i + 1}</td><td><Cell label={`${item.name}设备名称`} value={item.name} onChange={name => updateBom(item.id, { name })} /><small className="cost-id">{row.id}</small></td><td><Cell label={`${item.name}规格`} value={item.specification} onChange={specification => updateBom(item.id, { specification })} /></td>
              <td><Cell label={`${item.name}系统`} value={item.group ?? ''} onChange={group => updateBom(item.id, { group })} /><Cell label={`${item.name}材质`} value={item.material} onChange={material => updateBom(item.id, { material })} /></td>
              <td><select aria-label={`${item.name}计价范围`} className="cost-cell" value={item.pricingMode ?? 'separate'} onChange={e => updateBom(item.id, { pricingMode: e.target.value as EquipmentBomPricingMode })}>{Object.entries(EQUIPMENT_BOM_PRICING_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>{(item.pricingMode ?? 'separate') === 'separate' && <label className="cost-small"><input aria-label={`${item.name}计入投资`} type="checkbox" checked={row.included} onChange={e => updateEquipment(row.id, 'included', e.target.checked)} />计入投资</label>}</td>
              <td className="cost-number cost-calculated">{item.quantity}</td><td><Cell label={`${item.name}采购量`} value={draft.quantity ?? String(item.quantity)} numeric onChange={value => updateEquipment(row.id, 'quantity', value)} /></td><td><Cell label={`${item.name}单位`} value={item.unit} onChange={unit => updateBom(item.id, { unit })} /></td><td><Cell label={`${item.name}设备单价`} value={draft.unitPrice ?? ''} placeholder={row.included ? '待询价' : '不重复计价'} numeric disabled={!row.included} onChange={value => updateEquipment(row.id, 'unitPrice', value)} /></td>
              <td className={`cost-number cost-calculated ${row.incomplete ? 'cost-warning' : ''}`} title={row.errors.join('；')}>{row.included ? row.amount == null ? '待完善' : wan(row.amount) : '—'}</td><td><Cell label={`${item.name}报价备注`} value={draft.note ?? item.note} placeholder="厂家、日期、税口径及包含范围" onChange={value => updateEquipment(row.id, 'note', value)} /></td><td><button className="cost-text-button" aria-label={`删除设备${item.name}`} onClick={() => onBomItemsChange(bomItems.filter(item => item.id !== row.id))}>删除</button></td></tr>
          })}
        </Grid><p className="cost-footnote">BOM 量来自选型；采购量可计入备用设备。拆分采购时先调整成套供货范围，避免炉体与水套、耐材或安装重复计价。重新生成 BOM 会刷新设备清单，已填报价按编码保留。</p>
      </>}
      {LINE_SHEETS.includes(sheet as LineSheet) && (() => {
        const section = sheet as LineSheet
        const calculated = totals.sections[section]
        return <><div className="cost-sheet-toolbar"><p>{section === 'utilities' ? '填写年用量。氧气若已在生产原料中计价，请勿重复录入。' : section === 'construction' ? '土建、钢材、耐火材料按实际工程量计价；炉体成套已含材料不要重复列入。' : section === 'installation' ? '仅填写采购报价未含的安装工作。' : '填写设计、管理、试车等建设费用；利息与流动资金在“资金与预备费”单列。'}</p><button className={btnSecondary(darkMode)} onClick={() => addLine(section)}>＋ 增加费用行</button></div>
          <Grid headers={['#', '项目名称', '单位', section === 'utilities' ? '年用量' : '工程量', '单价 元', section === 'utilities' ? '年费用 万元' : '合价 万元', '来源 / 备注', '操作']} footer={<tr><td colSpan={5}>已计价小计</td><td className="cost-number">{wan(calculated.total)}</td><td colSpan={2}>{calculated.incompleteRows.length} 项待完善</td></tr>}>
            {workbook[section].map((row, i) => <tr key={row.id}><td>{i + 1}</td><td><Cell label={`第${i + 1}行项目名称`} value={row.name} placeholder="填写项目名称" onChange={value => updateLine(section, row.id, 'name', value)} /></td><td><Cell label={`${row.name || `第${i + 1}行`}单位`} value={row.unit} onChange={value => updateLine(section, row.id, 'unit', value)} /></td><td><Cell label={`${row.name || `第${i + 1}行`}数量`} value={row.quantity} placeholder="待填" numeric onChange={value => updateLine(section, row.id, 'quantity', value)} /></td><td><Cell label={`${row.name || `第${i + 1}行`}单价`} value={row.unitPrice} placeholder="待询价" numeric onChange={value => updateLine(section, row.id, 'unitPrice', value)} /></td><td className={`cost-number cost-calculated ${calculated.rows[i].incomplete ? 'cost-warning' : ''}`} title={calculated.rows[i].errors.join('；')}>{calculated.rows[i].amount == null ? '待完善' : wan(calculated.rows[i].amount)}</td><td><Cell label={`${row.name || `第${i + 1}行`}备注`} value={row.note} placeholder="价格日期、来源及包含范围" onChange={value => updateLine(section, row.id, 'note', value)} /></td><td><button className="cost-text-button" aria-label={`删除${row.name || `第${i + 1}行`}`} onClick={() => setWorkbook({ [section]: workbook[section].filter(item => item.id !== row.id) })}>删除</button></td></tr>)}
            {workbook[section].length === 0 && <tr><td colSpan={8} className="cost-empty">此表暂无项目，可增加费用行。</td></tr>}
          </Grid><p className="cost-footnote">空白为待完善，填 0 表示已确认无费用。单价均按“元 / 所填单位”，备注建议保留报价来源。</p></>
      })()}
      {sheet === 'funding' && <><p className="cost-footnote">预备费以已计价的工程及其他建设费用为基数。利息、全额流动资金分别录入；不适用时明确填 0。</p>
        <Grid headers={['#', '资金参数', '输入值', '单位', '计费口径']}>{([['reserveRate', '基本预备费率', '%', '（设备 + 建设材料 + 安装 + 其他）× 费率'], ['constructionInterest', '建设期利息', '元', '按融资与建设进度测算后录入'], ['workingCapital', '全额流动资金', '元', '按运营周转需求录入，不计入建设投资'], ['initialWorkingCapitalRate', '铺底流动资金比例', '%', '30% 为资料参考初值，请按实际口径调整']] as const).map(([key, label, unit, note], i) => <tr key={key}><td>{i + 1}</td><td>{label}</td><td><Cell label={label} value={workbook.funding[key]} numeric placeholder="待填" onChange={value => setWorkbook({ funding: { ...workbook.funding, [key]: value } })} /></td><td>{unit}</td><td>{note}</td></tr>)}</Grid>
        <div className="cost-metrics">{metric('基本预备费', totals.reserveAmount)}{metric('铺底流动资金', totals.initialWorkingCapital)}{metric('项目总投资', totals.projectTotalInvestment)}{metric('报批总投资', totals.approvalTotalInvestment)}</div>{totals.fundingErrors.length > 0 && <div role="alert" className="cost-alert">{totals.fundingErrors.join('；')}</div>}<p className="cost-footnote">项目总投资 = 建设投资 + 利息 + 全额流动资金；报批总投资采用铺底流动资金。有待完善的建设费用或资金参数时，总投资暂不显示完整金额。</p>
      </>}
      {sheet === 'materials' && annualTable(result.inputRows, false)}{sheet === 'products' && annualTable(result.outputRows, true)}
      {sheet === 'optimization' && <>
        <div className="cost-sheet-toolbar"><div><h4>原料方案成本比较</h4><p>保存基准后，调整候选用量、上下限和锁定项，比较相同时基与价格下的投入成本。</p></div><div className="cost-actions"><button className={btnPrimary(darkMode)} disabled={!result.inputRows.length || missingMaterials > 0 || daysInvalid} onClick={captureBaseline}>{workbook.baseline ? '用当前配料更新基准' : '保存当前配料为基准'}</button>{comparison && <button className={btnSecondary(darkMode)} onClick={exportOptimization}>导出优化输入</button>}</div></div>
        {!comparison ? <div className="cost-optimization-empty"><div className="cost-optimization-symbol">Σ</div><h4>先保存一个可比较的基准</h4><p>沿用当前配料的物料与单价，设置用量边界后即可测算候选方案。后续算法可使用同一份输入数据。</p><span>需要已计算的投入量和完整单价。</span></div> : <>
          <div className="cost-metrics">{metric('基准年投入', comparison.baselineAnnualCost, '万元/a')}{metric('候选年投入', comparison.candidateAnnualCost, '万元/a')}{metric('测算年节约', comparison.saving, '万元/a')}<div className="cost-metric"><div className="cost-muted">成本变化</div><div className="cost-metric-value">{fmt(comparison.savingPct)} <small>%</small></div><span className="cost-small cost-muted">正值为节约，负值为增加</span></div></div>
          <Grid headers={['#', '投入物料', '基准 t/h', '候选 t/h', '下限 t/h', '上限 t/h', '锁定', '基准价 元/t', '候选年费用 万元', '核对状态']}>{comparison.rows.map((row, i) => <tr key={row.id}><td>{i + 1}</td><td>{row.name}</td><td className="cost-number cost-calculated">{fmt(row.baselineQuantity, 3)}</td><td><Cell label={`${row.name}候选用量`} numeric value={workbook.scenario[row.id]?.quantity ?? String(row.baselineQuantity)} disabled={row.locked} onChange={value => updateScenario(row.id, { quantity: value })} /></td><td><Cell label={`${row.name}下限`} numeric value={workbook.scenario[row.id]?.min ?? ''} placeholder="不限" onChange={value => updateScenario(row.id, { min: value })} /></td><td><Cell label={`${row.name}上限`} numeric value={workbook.scenario[row.id]?.max ?? ''} placeholder="不限" onChange={value => updateScenario(row.id, { max: value })} /></td><td><input type="checkbox" aria-label={`${row.name}锁定用量`} checked={row.locked} onChange={e => updateScenario(row.id, { locked: e.target.checked, ...(e.target.checked ? { quantity: String(row.baselineQuantity) } : {}) })} /></td><td className="cost-number cost-calculated">{fmt(row.unitPrice)}</td><td className="cost-number cost-calculated">{wan(row.candidateAnnualCost)}</td><td className={row.errors.length ? 'cost-warning' : 'cost-muted'}>{row.errors.join('；') || '边界符合'}</td></tr>)}</Grid>
          <div className="cost-completeness"><strong>{comparison.valid ? '成本边界检查通过 · 工艺待复核' : '候选方案待调整'}</strong><span>总投入 {fmt(comparison.baselineTotalFlow, 3)} → {fmt(comparison.candidateTotalFlow, 3)} t/h · {comparison.massConsistent ? '总量一致' : '总量不一致'}</span></div>{comparison.errors.length > 0 && <div role="alert" className="cost-alert">{comparison.errors.join('；')}</div>}<p className="cost-footnote">基准保存于 {new Date(workbook.baseline!.capturedAt).toLocaleString('zh-CN')} · {fmt(comparison.annualHours, 0)} h/a。后续修改单价或运行天数不改变已存基准。{comparison.warnings.join(' ')}</p>
        </>}
        <div className="cost-next-step"><strong>后续算法接入</strong><p>物料价格、成分、可用量和边界 → 求解候选配方 → 校核元素、物相、热平衡与设备能力 → 比较成本。当前提供成本测算和数据导出，候选方案经工艺复核后再回填配料。</p></div>
      </>}
    </div>
    <div className="cost-tabs" role="tablist" aria-label="工程造价工作表">{SHEETS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={sheet === key} className={sheet === key ? 'cost-tab-active' : ''} onClick={() => { setSheet(key); setMessage('') }}>{label}{key === 'optimization' && <span className="cost-tab-dot" />}</button>)}</div>
    <div className="cost-status"><span>{caseName} / {stageLabel}</span><span>{SHEETS.find(item => item[0] === sheet)?.[1]} · 汇总：万元 · 单价：元</span></div>
  </section>
}

const STYLES = `
.cost-workbook{--cw-bg:#fff;--cw-border:#dce4ec;--cw-soft:#f5f8fb;--cw-text:#233449;--cw-muted:#687a8e;--cw-blue:#1767bc;--cw-green:#137c66;margin-top:20px;border:1px solid var(--cw-border);border-radius:12px;overflow:hidden;background:var(--cw-bg);color:var(--cw-text);font-family:inherit;font-style:normal;font-size:13px}
.cost-workbook.cost-dark{--cw-bg:#17212f;--cw-border:#354358;--cw-soft:#202d3e;--cw-text:#e0e8f2;--cw-muted:#a5b4c5;--cw-blue:#7bb9ff;--cw-green:#70d1b1}
.cost-header{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:20px 22px}.cost-header h3{font-size:19px;font-weight:700;margin:5px 0}.cost-header p{margin:0}.cost-eyebrow{font-size:10px;letter-spacing:1.4px;color:var(--cw-green);font-weight:700}.cost-muted{color:var(--cw-muted)}.cost-small,.cost-footnote{font-size:12px}.cost-formula-bar{display:flex;gap:14px;padding:9px 20px;border-block:1px solid var(--cw-border);background:var(--cw-soft);font-size:12px}.cost-fx{font-weight:700;color:var(--cw-green);font-size:15px}.cost-time-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 20px;border-bottom:1px solid var(--cw-border);font-size:12px}.cost-days{width:70px;margin:0 5px;border:1px solid var(--cw-border);border-radius:3px;background:var(--cw-bg);padding:4px 6px;color:var(--cw-blue);text-align:right}.cost-time-note{margin-left:auto}
.cost-sheet{padding:20px;min-height:340px}.cost-sheet h4{font-size:14px;font-weight:650;margin:0 0 8px}.cost-sheet-toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px}.cost-sheet-toolbar p{color:var(--cw-muted);font-size:12px;line-height:1.7;margin:0;max-width:700px}.cost-actions{display:flex;gap:8px;flex-wrap:wrap}.cost-metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:20px;margin-top:16px}.cost-metric{border:1px solid var(--cw-border);border-radius:6px;padding:14px;background:var(--cw-bg)}.cost-metric-value{font-size:23px;font-weight:650;line-height:1.4;margin:6px 0;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.cost-metric-value small,.cost-summary-row small{font-size:11px;font-weight:400;color:var(--cw-muted)}.cost-summary-columns{display:grid;grid-template-columns:1fr 1fr;gap:24px}.cost-summary-row{display:flex;align-items:center;justify-content:space-between;text-align:left;gap:12px;width:100%;padding:12px 0;border-bottom:1px solid var(--cw-border);font-size:13px}.cost-summary-row:hover{color:var(--cw-blue)}.cost-summary-row strong{font-variant-numeric:tabular-nums;font-weight:600;white-space:nowrap}.cost-completeness{display:flex;gap:18px;flex-wrap:wrap;padding:12px 14px;background:var(--cw-soft);margin-top:18px;border-radius:4px;font-size:12px}.cost-completeness span{color:var(--cw-muted)}.cost-footnote{line-height:1.8;color:var(--cw-muted);margin:12px 0 0}
.cost-grid-scroll{overflow:auto;border:1px solid var(--cw-border);max-height:560px}.cost-grid{border-collapse:separate;border-spacing:0;width:100%;min-width:800px;font-size:12px}.cost-grid th{position:sticky;top:0;background:var(--cw-soft);z-index:1;text-align:left;white-space:nowrap;font-weight:600;padding:7px 10px;border-right:1px solid var(--cw-border);border-bottom:1px solid var(--cw-border)}.cost-column-letter{display:block;color:var(--cw-muted);font-size:9px;font-weight:400;margin-bottom:3px}.cost-grid td{border-right:1px solid var(--cw-border);border-bottom:1px solid var(--cw-border);padding:5px 8px;vertical-align:middle;min-width:70px}.cost-grid th:first-child,.cost-grid td:first-child{width:36px;min-width:36px;text-align:center;background:var(--cw-soft);color:var(--cw-muted)}.cost-grid tr:last-child td{border-bottom:0}.cost-grid tbody tr:hover td{background:var(--cw-soft)}.cost-grid td:has(.cost-cell){padding:0}.cost-grid tfoot{font-weight:650;background:var(--cw-soft)}.cost-grid tfoot td{padding:11px 10px;border-top:1px solid var(--cw-border)}.cost-cell{display:block;width:100%;min-width:88px;max-width:100%;border:1px solid transparent;border-radius:0;outline:none;background:transparent;color:var(--cw-blue);padding:9px 8px;font-size:12px;line-height:1.4}.cost-cell:focus{border:1px solid var(--cw-green);background:var(--cw-bg);box-shadow:inset 0 0 0 1px var(--cw-green)}.cost-cell::placeholder{color:var(--cw-muted);opacity:.65}.cost-cell:disabled{color:var(--cw-muted);opacity:.7}.cost-cell option{background:var(--cw-bg);color:var(--cw-text)}.cost-number{text-align:right;font-variant-numeric:tabular-nums;font-family:ui-monospace,SFMono-Regular,Consolas,monospace}.cost-calculated{background:var(--cw-soft)}.cost-warning{color:#b97713}.cost-invalid{background:#fff0f0!important;color:#b42318!important}.cost-alert{padding:10px 20px;background:var(--cw-soft);color:var(--cw-blue);font-size:12px;line-height:1.7}.cost-id{display:block;font-size:9px;color:var(--cw-muted);padding:0 8px 5px;white-space:nowrap}.cost-text-button{color:var(--cw-blue);white-space:nowrap;font-size:12px;padding:4px}.cost-search{border:1px solid var(--cw-border);border-radius:4px;background:var(--cw-bg);color:var(--cw-text);padding:7px 10px;width:260px}.cost-empty{text-align:center!important;padding:35px!important;color:var(--cw-muted)}
.cost-tabs{display:flex;overflow-x:auto;background:var(--cw-soft);border-top:1px solid var(--cw-border);padding:0 8px;gap:1px}.cost-tabs button{position:relative;display:flex;align-items:center;gap:6px;white-space:nowrap;padding:12px 16px;border-right:1px solid var(--cw-border);font-size:12px;color:var(--cw-muted)}.cost-tabs button:hover{color:var(--cw-green)}.cost-tabs .cost-tab-active{background:var(--cw-bg);color:var(--cw-green);font-weight:700;box-shadow:inset 0 -3px var(--cw-green)}.cost-tab-dot{width:5px;height:5px;background:var(--cw-green);border-radius:50%}.cost-status{display:flex;justify-content:space-between;gap:16px;background:var(--cw-soft);padding:7px 16px;font-size:10px;color:var(--cw-muted)}.cost-optimization-empty{text-align:center;padding:28px 20px 36px;background:var(--cw-soft);border:1px dashed var(--cw-border);border-radius:8px}.cost-optimization-symbol{font-size:32px;color:var(--cw-green);margin-bottom:8px}.cost-optimization-empty p{max-width:560px;margin:8px auto;line-height:1.9;color:var(--cw-muted)}.cost-optimization-empty span{font-size:12px;color:var(--cw-muted)}.cost-next-step{border-left:3px solid var(--cw-green);background:var(--cw-soft);padding:13px 16px;margin-top:20px}.cost-next-step p{font-size:12px;line-height:1.8;color:var(--cw-muted);margin:4px 0 0}
@media(max-width:1100px){.cost-metrics{grid-template-columns:repeat(2,minmax(0,1fr))}.cost-sheet-toolbar{align-items:flex-start;flex-wrap:wrap}.cost-time-note{margin-left:0}.cost-summary-columns{gap:16px}}@media(max-width:640px){.cost-header{flex-wrap:wrap;padding:16px}.cost-sheet{padding:12px}.cost-metrics,.cost-summary-columns{grid-template-columns:1fr}.cost-status{flex-wrap:wrap}.cost-tabs button{padding:11px}}
`
