import type { CopperBatchExportRow, CopperBatchWorkbookSheet } from './copperBatchExport.ts'
import { waterElementRatios } from './copperWorkflowCalc.ts'

export interface CopperReportElement {
  key: string
  label: string
}

export interface CopperReportMaterial {
  header: string
  name: string
  dryWeightTh: number
  waterWeightTh: number
  composition: Record<string, number | null | undefined>
  compositionTotal: number
}

export interface CopperReportBlend {
  dryWeightTh: number
  waterWeightTh: number
  composition: Record<string, number | null | undefined>
  compositionTotal: number
}

export interface CopperReportProduct {
  productKey?: string
  name: string
  massTh: number
  composition: Record<string, number | null | undefined>
}

export interface CopperReportPhase {
  key: string
  label: string
}

export interface CopperReportInputPhaseMaterial {
  header: string
  name: string
  dryWeightTh: number
  waterWeightTh: number
  phaseValues: Record<string, string | number | null | undefined>
  compositionTotal: string | number | null | undefined
}

type NumberFormatter = (value: number) => string

const BALANCE_ELEMENT_PRIORITY = ['Cu', 'S', 'Fe', 'SiO2', 'SiO₂', 'Pb', 'Zn']
const WATER_ELEMENT_RATIOS = waterElementRatios()

function blankValues(length: number) {
  return Array.from({ length }, () => '')
}

function positive(value: number | null | undefined) {
  return Number.isFinite(value) ? Math.max(0, value ?? 0) : 0
}

function normalizedElementLabel(value: string) {
  return value.replace(/[₂\s_]/g, (character) => character === '₂' ? '2' : '').toLowerCase()
}

function elementValue(
  composition: Record<string, number | null | undefined>,
  element: CopperReportElement
) {
  return positive(composition[element.key])
}

export function buildInputMaterialElementSheet({
  materials,
  blend,
  elements,
  format,
  summaryName = '混料',
  includeSummary = true,
}: {
  materials: CopperReportMaterial[]
  blend: CopperReportBlend
  elements: CopperReportElement[]
  format: NumberFormatter
  summaryName?: string
  includeSummary?: boolean
}): CopperBatchWorkbookSheet {
  const columns = [
    ...materials.map((material) => ({ header: material.header, subHeader: material.name })),
    ...(includeSummary
      ? [
          { header: '汇总', subHeader: summaryName },
          { header: '汇总', subHeader: '混合干基组成' },
        ]
      : []),
  ]
  const flowValues = (selector: (material: CopperReportMaterial) => number, blendValue: number) => [
    ...materials.map((material) => format(selector(material))),
    ...(includeSummary ? [format(blendValue), ''] : []),
  ]
  const rows: CopperBatchExportRow[] = [
    { label: '流量', values: blankValues(columns.length), role: 'section' },
    {
      label: '干基量',
      values: flowValues((material) => material.dryWeightTh, blend.dryWeightTh),
    },
    {
      label: '含水量',
      values: flowValues((material) => material.waterWeightTh, blend.waterWeightTh),
    },
    {
      label: '湿基量',
      values: flowValues(
        (material) => material.dryWeightTh + material.waterWeightTh,
        blend.dryWeightTh + blend.waterWeightTh
      ),
    },
    { label: '元素组成（干基）', values: blankValues(columns.length), role: 'section' },
    ...elements.map((element) => ({
      label: element.label,
      values: [
        ...materials.map((material) => format(elementValue(material.composition, element))),
        ...(includeSummary ? ['', format(elementValue(blend.composition, element))] : []),
      ],
    })),
    {
      label: '合计',
      values: [
        ...materials.map((material) => format(material.compositionTotal)),
        ...(includeSummary ? ['', format(blend.compositionTotal)] : []),
      ],
      role: 'total',
    },
  ]
  return {
    title: '投入物料流量及元素组成表（干基）',
    columns,
    rows,
    unitNote: '流量 t/h；元素组成 w%（干基）',
    rowHeaderLabel: '项目',
    columnWidthWeights: [1.65, ...materials.map(() => 1), ...(includeSummary ? [1, 1.15] : [])],
    reportDensity: columns.length > 10 || rows.length > 24 ? 'compact' : 'normal',
    reportLayout: 'inputMaterialElement',
  }
}

export function buildInputMaterialPhaseSheet({
  materials,
  phases,
  format,
}: {
  materials: CopperReportInputPhaseMaterial[]
  phases: CopperReportPhase[]
  format: NumberFormatter
}): CopperBatchWorkbookSheet {
  const activeMaterials = materials.filter(
    (material) => material.name.trim() && material.dryWeightTh > 0
  )
  const columns = activeMaterials.map((material) => ({
    header: material.header,
    subHeader: material.name,
  }))
  const materialValues = (selector: (material: CopperReportInputPhaseMaterial) => number) =>
    activeMaterials.map((material) => format(selector(material)))
  const rows: CopperBatchExportRow[] = [
    {
      label: 't/h（干基）',
      values: materialValues((material) => material.dryWeightTh),
    },
    {
      label: '含水 t/h',
      values: materialValues((material) => material.waterWeightTh),
    },
    {
      label: 't/h（湿基）',
      values: materialValues((material) => material.dryWeightTh + material.waterWeightTh),
    },
    ...phases.map((phase) => ({
      label: phase.label,
      values: activeMaterials.map((material) => material.phaseValues[phase.key] ?? ''),
    })),
    {
      label: '合计',
      values: activeMaterials.map((material) => material.compositionTotal),
      role: 'total',
    },
  ]
  return {
    title: '投入结果-物相表',
    columns,
    rows,
    unitNote: '流量 t/h；物相组成 w%（固体按干基，气体按湿基）',
    rowHeaderLabel: '项目',
    columnWidthWeights: [1.65, ...columns.map(() => 1)],
    reportDensity: columns.length > 10 || rows.length > 24 ? 'compact' : 'normal',
  }
}

function balanceElements(elements: CopperReportElement[]) {
  return [...elements].sort((left, right) => {
    const leftLabel = normalizedElementLabel(left.label)
    const rightLabel = normalizedElementLabel(right.label)
    const leftPriority = BALANCE_ELEMENT_PRIORITY.findIndex(
      (label) => normalizedElementLabel(label) === leftLabel
    )
    const rightPriority = BALANCE_ELEMENT_PRIORITY.findIndex(
      (label) => normalizedElementLabel(label) === rightLabel
    )
    const normalizedLeftPriority = leftPriority < 0 ? Number.MAX_SAFE_INTEGER : leftPriority
    const normalizedRightPriority = rightPriority < 0 ? Number.MAX_SAFE_INTEGER : rightPriority
    return normalizedLeftPriority - normalizedRightPriority
  })
}

export function buildElementBalanceSheet({
  inputs,
  outputs,
  elements,
  format,
}: {
  inputs: CopperReportMaterial[]
  outputs: CopperReportProduct[]
  elements: CopperReportElement[]
  format: NumberFormatter
}): CopperBatchWorkbookSheet | null {
  const activeInputs = inputs.filter((material) => material.name.trim() && material.dryWeightTh > 0)
  const activeOutputs = outputs.filter(
    (product) =>
      product.name.trim() &&
      (
        product.massTh > 0 ||
        product.productKey === 'fugitive' ||
        product.productKey === 'loss' ||
        product.name.includes('无组织排放') ||
        product.name.includes('损失')
      )
  )
  const selectedElements = balanceElements(elements)
  if (activeInputs.length === 0 || activeOutputs.length === 0 || selectedElements.length === 0) return null

  const buildValues = (
    name: string,
    hourlyMass: number,
    composition: Record<string, number | null | undefined>
  ) => [
    name,
    format(hourlyMass),
    ...selectedElements.flatMap((element) => {
      const percentage = elementValue(composition, element)
      return [format(percentage), format(hourlyMass * percentage / 100)]
    }),
  ]

  const inputBalanceData = activeInputs.map((material) => {
    const massTh = material.dryWeightTh + material.waterWeightTh
    const composition = Object.fromEntries(
      selectedElements.map((element) => {
        const dryElementMass = material.dryWeightTh * elementValue(material.composition, element) / 100
        const waterElementMass =
          material.waterWeightTh * positive(WATER_ELEMENT_RATIOS[element.key as keyof typeof WATER_ELEMENT_RATIOS]) / 100
        return [element.key, massTh > 0 ? ((dryElementMass + waterElementMass) / massTh) * 100 : 0]
      })
    )
    return { ...material, massTh, composition }
  })
  const inputRows: CopperBatchExportRow[] = inputBalanceData.map((material, index) => ({
    label: String(index + 1),
    values: buildValues(material.name, material.massTh, material.composition),
  }))
  const outputRows: CopperBatchExportRow[] = activeOutputs.map((product, index) => ({
    label: String(index + 1),
    values: buildValues(product.name, product.massTh, product.composition),
  }))

  const totalRow = <T extends { composition: Record<string, number | null | undefined> }>(
    items: T[],
    hourlyMass: (item: T) => number
  ): CopperBatchExportRow => {
    const hourlyTotal = items.reduce((sum, item) => sum + hourlyMass(item), 0)
    const values: Array<string | number> = [
      '合计',
      format(hourlyTotal),
    ]
    selectedElements.forEach((element) => {
      const elementMassTh = items.reduce(
        (sum, item) => sum + hourlyMass(item) * elementValue(item.composition, element) / 100,
        0
      )
      values.push(
        format(hourlyTotal > 0 ? elementMassTh / hourlyTotal * 100 : 0),
        format(elementMassTh)
      )
    })
    return { label: '', values, role: 'total' }
  }

  return {
    title: '元素投入产出平衡表',
    columns: [
      { header: '物料名称', subHeader: '' },
      { header: '处理量', subHeader: 't/h' },
      ...selectedElements.flatMap((element) => [
        { header: element.label, subHeader: '%' },
        { header: element.label, subHeader: 't/h' },
      ]),
    ],
    rows: [
      { label: '投入', values: [], role: 'section' },
      ...inputRows,
      totalRow(inputBalanceData, (material) => material.massTh),
      { label: '产出', values: [], role: 'section' },
      ...outputRows,
      totalRow(activeOutputs, (product) => product.massTh),
    ],
    unitNote: '物料量 t/h；元素组成 w%；元素量 t/h',
    rowHeaderLabel: '序号',
    reportLayout: 'elementBalance',
    reportDensity: 'compact',
  }
}
