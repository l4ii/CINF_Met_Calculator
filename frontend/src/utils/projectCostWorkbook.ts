import type { AnnualMaterialCostResult } from './copperProjectCost.ts'

export type CostLine = { id: string; name: string; unit: string; quantity: string; unitPrice: string; note: string }
export type EquipmentCostDraft = { quantity?: string; unitPrice?: string; included?: boolean; note?: string }
export type CostScenarioDraft = { quantity?: string; min?: string; max?: string; locked?: boolean }
export type CostFundingDraft = {
  reserveRate: string; constructionInterest: string; workingCapital: string; initialWorkingCapitalRate: string
}
export type CostBaseline = {
  capturedAt: string
  annualHours: number
  rows: Array<{ id: string; name: string; kind: string; quantity: number; unitPrice: number }>
}
export type ProjectCostWorkbookState = {
  version: 1
  equipment: Record<string, EquipmentCostDraft>
  construction: CostLine[]
  installation: CostLine[]
  other: CostLine[]
  utilities: CostLine[]
  funding: CostFundingDraft
  priceOverrides?: Record<string, string>
  annualDays?: string
  scenario: Record<string, CostScenarioDraft>
  baseline?: CostBaseline
}
export type CostEquipmentItem = {
  id: string; name: string; specification: string; quantity: number; unit: string
  material: string; note: string; group?: string; pricingMode?: 'separate' | 'included' | 'interface'; source?: string
}
export type CalculatedCostRow = {
  id: string; name: string; unit: string; quantity: number | null; unitPrice: number | null
  amount: number | null; note: string; missingPrice: boolean; incomplete: boolean; errors: string[]
}
export type EquipmentCostRow = CalculatedCostRow & Omit<CostEquipmentItem, 'quantity'> & { included: boolean }
export type CostSectionResult<Row extends CalculatedCostRow = CalculatedCostRow> = {
  rows: Row[]; total: number; incompleteRows: Row[]; invalidRows: Row[]
}
export type ProjectCostResult = {
  equipmentRows: EquipmentCostRow[]
  constructionRows: CalculatedCostRow[]
  installationRows: CalculatedCostRow[]
  otherRows: CalculatedCostRow[]
  utilityRows: CalculatedCostRow[]
  sections: {
    equipment: CostSectionResult<EquipmentCostRow>; construction: CostSectionResult
    installation: CostSectionResult; other: CostSectionResult; utilities: CostSectionResult
  }
  equipmentTotal: number; constructionTotal: number; installationTotal: number; otherTotal: number
  constructionInvestment: number; utilitiesAnnualTotal: number; materialAnnualCost: number | null
  constructionSubtotal: number; reserveAmount: number | null; constructionInterest: number | null
  workingCapital: number | null; initialWorkingCapital: number | null
  projectTotalInvestment: number | null; approvalTotalInvestment: number | null
  fundingIncompleteCount: number; fundingIncompleteFields: string[]; fundingErrors: string[]
  operatingAnnualCost: number | null; missingPriceCount: number; incompleteCount: number; invalidCount: number
  missingMaterialPriceCount: number; missingMaterialRows: AnnualMaterialCostResult['inputRows']
  annualHours: number; errors: string[]
}
export type CostScenarioRow = {
  id: string; name: string; kind: string; baselineQuantity: number; quantity: number | null; unitPrice: number
  min: number | null; max: number | null; locked: boolean
  baselineAnnualCost: number; candidateAnnualCost: number | null; errors: string[]
}
export type CostScenarioComparison = {
  rows: CostScenarioRow[]; annualHours: number; baselineAnnualCost: number; candidateAnnualCost: number | null
  saving: number | null; savingPct: number | null; baselineTotalFlow: number; candidateTotalFlow: number | null
  flowDifference: number | null; massConsistent: boolean; valid: boolean; warnings: string[]; errors: string[]
}

const unsafeKeys = new Set(['__proto__', 'prototype', 'constructor'])
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value != null && typeof value === 'object' && !Array.isArray(value)
const safeKey = (key: string) => key.length > 0 && !unsafeKeys.has(key)
const draftText = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : typeof value === 'number' && Number.isFinite(value) ? String(value) : undefined

/** Empty cells are unknown; an explicit zero is a valid quantity or quote. */
export function parseCostNumber(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null
  if (typeof value === 'string' && !value.trim()) return null
  const number = Number(value)
  return Number.isFinite(number) && number >= 0 ? number : null
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100
const knownTotal = (rows: readonly { amount: number | null }[]) => money(rows.reduce((sum, row) => sum + (row.amount ?? 0), 0))

export function createProjectCostWorkbook(): ProjectCostWorkbookState {
  const line = (id: string, name: string, unit: string, note = ''): CostLine =>
    ({ id, name, unit, quantity: '', unitPrice: '', note })
  return {
    version: 1, equipment: {}, scenario: {}, priceOverrides: {}, annualDays: '',
    funding: { reserveRate: '', constructionInterest: '', workingCapital: '', initialWorkingCapitalRate: '30' },
    construction: [line('civil-foundation', '设备基础', 'm³'), line('civil-building', '厂房及构筑物', 'm²')],
    installation: [line('install-equipment', '设备安装', '项'), line('install-piping', '工艺管道安装', '项'), line('install-electrical', '电气及仪表安装', '项')],
    other: [line('other-design', '工程设计', '项'), line('other-management', '项目管理及其他建设费用', '项')],
    utilities: [line('utility-electricity', '外购电力', 'kWh', '填写年用量；避免与物料成本重复计入'),
      line('utility-water', '新水', 'm³', '填写年用量'), line('utility-steam', '外购蒸汽', 't', '填写年用量')],
  }
}

function normalizeLines(value: unknown, fallback: CostLine[]): CostLine[] {
  if (!Array.isArray(value)) return fallback
  const ids = new Set<string>()
  return value.filter(isRecord).map((row, index) => {
    const suppliedId = typeof row.id === 'string' && safeKey(row.id) ? row.id : `imported-${index + 1}`
    let id = suppliedId
    for (let suffix = 2; ids.has(id); suffix++) id = `${suppliedId}-${suffix}`
    ids.add(id)
    return { id, name: draftText(row.name) ?? '', unit: draftText(row.unit) ?? '', quantity: draftText(row.quantity) ?? '',
      unitPrice: draftText(row.unitPrice) ?? '', note: draftText(row.note) ?? '' }
  })
}

function normalizeBaseline(value: unknown): CostBaseline | undefined {
  if (!isRecord(value) || typeof value.capturedAt !== 'string' || !Number.isFinite(Date.parse(value.capturedAt))
    || typeof value.annualHours !== 'number' || parseCostNumber(value.annualHours) == null || !Array.isArray(value.rows)) return undefined
  const rows: CostBaseline['rows'] = []
  const ids = new Set<string>()
  for (const row of value.rows) {
    if (!isRecord(row) || typeof row.id !== 'string' || !safeKey(row.id) || ids.has(row.id)
      || typeof row.name !== 'string' || typeof row.kind !== 'string' || typeof row.quantity !== 'number'
      || typeof row.unitPrice !== 'number' || parseCostNumber(row.quantity) == null || parseCostNumber(row.unitPrice) == null
      || !Number.isFinite(row.quantity * row.unitPrice * value.annualHours * 100)) return undefined
    ids.add(row.id)
    rows.push({ id: row.id, name: row.name, kind: row.kind, quantity: row.quantity, unitPrice: row.unitPrice })
  }
  return { capturedAt: value.capturedAt, annualHours: value.annualHours, rows }
}

/** Imported documents contain data only; unknown fields and unsafe dictionary keys are discarded. */
export function normalizeProjectCostWorkbook(value: unknown): ProjectCostWorkbookState {
  const result = createProjectCostWorkbook()
  if (!isRecord(value)) return result
  for (const section of ['construction', 'installation', 'other', 'utilities'] as const) {
    result[section] = normalizeLines(value[section], result[section])
  }
  if (isRecord(value.equipment)) for (const [id, item] of Object.entries(value.equipment)) {
    if (!safeKey(id) || !isRecord(item)) continue
    result.equipment[id] = {
      quantity: draftText(item.quantity), unitPrice: draftText(item.unitPrice), note: draftText(item.note),
      included: typeof item.included === 'boolean' ? item.included : undefined,
    }
  }
  if (isRecord(value.scenario)) for (const [id, item] of Object.entries(value.scenario)) {
    if (!safeKey(id) || !isRecord(item)) continue
    result.scenario[id] = {
      quantity: draftText(item.quantity), min: draftText(item.min), max: draftText(item.max),
      locked: typeof item.locked === 'boolean' ? item.locked : undefined,
    }
  }
  if (isRecord(value.priceOverrides)) for (const [id, price] of Object.entries(value.priceOverrides)) {
    const text = draftText(price)
    if (safeKey(id) && text !== undefined) result.priceOverrides![id] = text
  }
  result.annualDays = draftText(value.annualDays) ?? ''
  if (isRecord(value.funding)) for (const key of Object.keys(result.funding) as Array<keyof CostFundingDraft>) {
    result.funding[key] = draftText(value.funding[key]) ?? result.funding[key]
  }
  const baseline = normalizeBaseline(value.baseline)
  if (baseline) result.baseline = baseline
  return result
}

export function normalizeProjectCostWorkbooks(value: unknown): Record<string, ProjectCostWorkbookState> {
  const result: Record<string, ProjectCostWorkbookState> = {}
  if (isRecord(value)) for (const [id, workbook] of Object.entries(value)) {
    if (safeKey(id) && isRecord(workbook)) result[id] = normalizeProjectCostWorkbook(workbook)
  }
  return result
}

function calculateLine(line: Omit<CostLine, 'quantity' | 'unitPrice'> & { quantity: unknown; unitPrice: unknown }, included = true): CalculatedCostRow {
  const quantity = parseCostNumber(line.quantity)
  const unitPrice = parseCostNumber(line.unitPrice)
  const errors: string[] = []
  const blank = (value: unknown) => value == null || (typeof value === 'string' && !value.trim())
  if (included && quantity == null && !blank(line.quantity)) errors.push('数量必须为非负有限数值')
  if (included && unitPrice == null && !blank(line.unitPrice)) errors.push('单价必须为非负有限数值')
  let amount = !included ? 0 : quantity != null && unitPrice != null ? money(quantity * unitPrice) : null
  if (amount != null && !Number.isFinite(amount)) {
    errors.push('金额超出可计算范围')
    amount = null
  }
  return { id: line.id, name: line.name, unit: line.unit, quantity, unitPrice, amount, note: line.note,
    missingPrice: included && blank(line.unitPrice), incomplete: included && amount == null, errors }
}

function costSection<Row extends CalculatedCostRow>(rows: Row[]): CostSectionResult<Row> {
  return { rows, total: knownTotal(rows), incompleteRows: rows.filter(row => row.incomplete), invalidRows: rows.filter(row => row.errors.length > 0) }
}

export function calculateProjectCost(
  bomItems: readonly CostEquipmentItem[], state: ProjectCostWorkbookState, annualResult: AnnualMaterialCostResult,
): ProjectCostResult {
  const equipmentRows: EquipmentCostRow[] = bomItems.map(item => {
    const draft = state.equipment[item.id] ?? {}
    const included = item.pricingMode !== 'included' && item.pricingMode !== 'interface' && draft.included !== false
    return { ...item, ...calculateLine({ ...item, quantity: draft.quantity ?? item.quantity, unitPrice: draft.unitPrice,
      note: draft.note ?? item.note }, included), included }
  })
  const sections = {
    equipment: costSection(equipmentRows), construction: costSection(state.construction.map(row => calculateLine(row))),
    installation: costSection(state.installation.map(row => calculateLine(row))), other: costSection(state.other.map(row => calculateLine(row))),
    utilities: costSection(state.utilities.map(row => calculateLine(row))),
  }
  const rows = Object.values(sections).flatMap(section => section.rows)
  const missingMaterialRows = annualResult.inputRows.filter(row => row.priceSource === 'missing')
  const invalidMaterialPrices = missingMaterialRows.filter(row => {
    const draft = state.priceOverrides?.[row.id] ?? state.priceOverrides?.[row.name]
    return draft != null && draft.trim() !== '' && parseCostNumber(draft) == null
  })
  const materialAnnualCost = parseCostNumber(annualResult.inputAnnualCost)
  const errors = materialAnnualCost == null ? ['年物料费用必须为非负有限数值'] : []
  const constructionSubtotal = money(sections.equipment.total + sections.construction.total + sections.installation.total + sections.other.total)
  const fundingIncompleteFields: string[] = []
  const fundingErrors: string[] = []
  const fundingLabels: Record<keyof CostFundingDraft, string> = {
    reserveRate: '基本预备费率', constructionInterest: '建设期利息', workingCapital: '流动资金', initialWorkingCapitalRate: '铺底流动资金比例',
  }
  const fundingAmount = (value: number, label: string): number | null => {
    const rounded = money(value)
    if (Number.isFinite(rounded)) return rounded
    fundingIncompleteFields.push(label)
    fundingErrors.push(`${label}超出可计算范围`)
    return null
  }
  const fundingNumber = (key: keyof CostFundingDraft) => {
    const value = parseCostNumber(state.funding[key])
    if (value == null) {
      fundingIncompleteFields.push(fundingLabels[key])
      if (state.funding[key].trim()) fundingErrors.push(`${fundingLabels[key]}必须为非负有限数值`)
    }
    return value != null && (key === 'constructionInterest' || key === 'workingCapital')
      ? fundingAmount(value, fundingLabels[key]) : value
  }
  const reserveRate = fundingNumber('reserveRate')
  const constructionInterest = fundingNumber('constructionInterest')
  const workingCapital = fundingNumber('workingCapital')
  let initialWorkingCapitalRate = fundingNumber('initialWorkingCapitalRate')
  if (initialWorkingCapitalRate != null && initialWorkingCapitalRate > 100) {
    fundingErrors.push('铺底流动资金比例不得超过 100%')
    fundingIncompleteFields.push(fundingLabels.initialWorkingCapitalRate)
    initialWorkingCapitalRate = null
  }
  const reserveAmount = reserveRate == null ? null : fundingAmount(constructionSubtotal * reserveRate / 100, '基本预备费')
  const constructionInvestment = money(constructionSubtotal + (reserveAmount ?? 0))
  const initialWorkingCapital = workingCapital == null || initialWorkingCapitalRate == null ? null
    : fundingAmount(workingCapital * initialWorkingCapitalRate / 100, '铺底流动资金')
  const constructionComplete = [sections.equipment, sections.construction, sections.installation, sections.other]
    .every(section => section.incompleteRows.length === 0) && reserveAmount != null
  const projectTotalInvestment = constructionComplete && constructionInterest != null && workingCapital != null
    ? fundingAmount(constructionInvestment + constructionInterest + workingCapital, '项目总投资') : null
  const approvalTotalInvestment = constructionComplete && constructionInterest != null && initialWorkingCapital != null
    ? fundingAmount(constructionInvestment + constructionInterest + initialWorkingCapital, '报批总投资') : null
  return {
    equipmentRows, constructionRows: sections.construction.rows, installationRows: sections.installation.rows,
    otherRows: sections.other.rows, utilityRows: sections.utilities.rows, sections,
    equipmentTotal: sections.equipment.total, constructionTotal: sections.construction.total,
    installationTotal: sections.installation.total, otherTotal: sections.other.total,
    constructionSubtotal, reserveAmount, constructionInvestment, constructionInterest, workingCapital,
    initialWorkingCapital, projectTotalInvestment, approvalTotalInvestment,
    fundingIncompleteCount: fundingIncompleteFields.length, fundingIncompleteFields, fundingErrors,
    utilitiesAnnualTotal: sections.utilities.total, materialAnnualCost: materialAnnualCost == null ? null : money(materialAnnualCost),
    operatingAnnualCost: materialAnnualCost == null ? null : money(materialAnnualCost + sections.utilities.total),
    missingMaterialRows, missingMaterialPriceCount: missingMaterialRows.length,
    missingPriceCount: rows.filter(row => row.missingPrice).length + missingMaterialRows.length,
    incompleteCount: rows.filter(row => row.incomplete).length + missingMaterialRows.length,
    invalidCount: rows.filter(row => row.errors.length).length + errors.length + fundingErrors.length + invalidMaterialPrices.length,
    annualHours: annualResult.annualHours, errors,
  }
}

/** Copy scalar inputs so later price, process-time or material edits cannot change the comparison. */
export function createCostBaseline(result: AnnualMaterialCostResult): CostBaseline {
  if (result.inputRows.some(row => row.priceSource === 'missing')) throw new Error('请补全投入物料单价后再保存基准')
  const baseline = normalizeBaseline({ capturedAt: new Date().toISOString(), annualHours: result.annualHours,
    rows: result.inputRows.map(row => ({ id: row.id, name: row.name, kind: row.kind, quantity: row.hourlyWetTh, unitPrice: row.unitPrice })) }
  )
  if (!baseline) throw new Error('基准包含无效的投入量、单价或年运行时间')
  return baseline
}

/** A serializable quantity/price screen. Process and chemistry constraints must be checked separately. */
export function compareCostScenario(baseline: CostBaseline, scenario: Record<string, CostScenarioDraft>): CostScenarioComparison {
  const warnings = ['本比较仅核算投入量与冻结单价；总投入量一致也不代表成分、热量或工艺约束可行。']
  const errors: string[] = []
  const rows: CostScenarioRow[] = baseline.rows.map(row => {
    const draft = scenario[row.id] ?? {}
    const rowErrors: string[] = []
    const supplied = (value: string | undefined) => value !== undefined && value.trim() !== ''
    const quantity = supplied(draft.quantity) ? parseCostNumber(draft.quantity) : row.quantity
    const min = parseCostNumber(draft.min)
    const max = parseCostNumber(draft.max)
    if (quantity == null) rowErrors.push('候选投入量必须为非负有限数值')
    if (supplied(draft.min) && min == null) rowErrors.push('下限必须为非负有限数值')
    if (supplied(draft.max) && max == null) rowErrors.push('上限必须为非负有限数值')
    if (min != null && max != null && min > max) rowErrors.push('下限不得大于上限')
    if (quantity != null && min != null && quantity < min) rowErrors.push('候选投入量低于下限')
    if (quantity != null && max != null && quantity > max) rowErrors.push('候选投入量高于上限')
    if (draft.locked && quantity !== row.quantity) rowErrors.push('已锁定物料的投入量不能改变')
    let candidateAnnualCost = quantity == null ? null : money(quantity * row.unitPrice * baseline.annualHours)
    if (candidateAnnualCost != null && !Number.isFinite(candidateAnnualCost)) {
      rowErrors.push('候选年费用超出可计算范围')
      candidateAnnualCost = null
    }
    errors.push(...rowErrors.map(error => `${row.name}：${error}`))
    return { ...row, baselineQuantity: row.quantity, quantity, min, max, locked: draft.locked === true,
      baselineAnnualCost: money(row.quantity * row.unitPrice * baseline.annualHours), candidateAnnualCost, errors: rowErrors }
  })
  const baselineAnnualCost = money(rows.reduce((sum, row) => sum + row.baselineAnnualCost, 0))
  const candidateAnnualCost = rows.some(row => row.candidateAnnualCost == null) ? null
    : money(rows.reduce((sum, row) => sum + row.candidateAnnualCost!, 0))
  const baselineTotalFlow = rows.reduce((sum, row) => sum + row.baselineQuantity, 0)
  const candidateTotalFlow = rows.some(row => row.quantity == null) ? null : rows.reduce((sum, row) => sum + row.quantity!, 0)
  const flowDifference = candidateTotalFlow == null ? null : candidateTotalFlow - baselineTotalFlow
  const massConsistent = flowDifference != null && Math.abs(flowDifference) <= Math.max(1e-6, baselineTotalFlow * 1e-6)
  if (!massConsistent) warnings.push('候选方案的总投入量与基准不一致，费用差额不能视为等产量节省。')
  const saving = candidateAnnualCost == null ? null : money(baselineAnnualCost - candidateAnnualCost)
  return { rows, annualHours: baseline.annualHours, baselineAnnualCost, candidateAnnualCost, saving,
    savingPct: saving != null && baselineAnnualCost > 0 ? saving / baselineAnnualCost * 100 : null,
    baselineTotalFlow, candidateTotalFlow, flowDifference, massConsistent, valid: errors.length === 0 && massConsistent, warnings, errors }
}
