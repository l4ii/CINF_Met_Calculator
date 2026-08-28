import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import type { MetcalFloImportBundle } from '../../utils/metcalFloMixExtract.ts'
import {
  buildMetcalPhasePreviewColumns,
  finalizeMetcalAssayRatios,
  phaseKeysForMetcalPreviewColumn,
  visibleMetcalImportElementKeys,
  type MetcalPhasePreviewColumn,
} from '../../utils/metcalFloMixExtract.ts'
import { elementSymbolLabel, elementTableHeaderLabel } from '../../utils/copperElementDisplay.ts'
import {
  formulaToDisplayLabel,
  parsePhaseFormulaDisplayParts,
} from '../../utils/chemicalFormula.ts'
import { PhaseFormulaDisplay } from '../PhaseFormulaDisplay.tsx'
import {
  calculateKnownTotal,
  calculateWeightedComposition,
  materialWaterWeight,
  partitionRawMixMaterials,
  totalWaterWeight,
  type CopperMaterialColumn,
} from '../../utils/copperWorkflowCalc.ts'
import {
  loadOxySideBlowConstraints,
  oxyProductDisplayName,
  OXY_SIDE_BLOW_PRODUCT_KEYS,
  type DistributionRuleType,
  type OxyProductDisplayStage,
  type OxySideBlowConstraintConfig,
  type OxySideBlowProductKey,
} from '../../utils/copperConstraintConfig.ts'
import { sortOxyConstraintElementKeys } from '../../utils/copperConstraintElementOrder.ts'
import { btnPrimary, btnSecondary, cardBase, inputBase, sectionTitle } from '../../theme/uiTheme'
import { CopperProductionResultTable } from './CopperProductionResultTable.tsx'

interface MetcalFloImportPanelProps {
  darkMode: boolean
  bundle: MetcalFloImportBundle
  sourceFileName: string
  onConfirm: (caseName: string) => void
  onCancel: () => void
}

const COL = {
  category: 56,
  name: 148,
  mass: 88,
  water: 88,
  total: 72,
  element: 56,
  phase: 64,
} as const

const RULE_LABELS: Record<DistributionRuleType, string> = { 'W%': 'W', 'D%': 'D' }

function formatCell(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) return ''
  if (Math.abs(value) < 1e-12) return digits === 2 ? '0.00' : '0'
  return value.toFixed(digits)
}

function materialAssayTotal(material: CopperMaterialColumn): number {
  return calculateKnownTotal(material.ratios) + (material.ratios['Other(其他)'] ?? 0)
}

function defaultCaseNameFromFile(sourceFileName: string): string {
  return sourceFileName.replace(/\.flo$/i, '').trim() || 'MetCal导入案例'
}

/** 悬停标题：Unicode 下标即可（系统 tooltip 不走 KaTeX 字体） */
function displayConstraintExpression(expr: string) {
  return expr.replace(/[A-Z][a-z]?(?:\d+[A-Z]?[a-z]?)*\d*/g, (token) => formulaToDisplayLabel(token))
}

/** 约束表达式显示：化学式用 HTML sub，避免 KaTeX 字体缺 Unicode 下标字形。 */
function ConstraintExpressionDisplay({ expr }: { expr: string }) {
  const nodes: ReactNode[] = []
  const pattern = /[A-Z][a-z]?(?:\d+[A-Z]?[a-z]?)*\d*/g
  let lastIndex = 0
  let match: RegExpExecArray | null
  let key = 0
  while ((match = pattern.exec(expr)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(<span key={`t-${key++}`}>{expr.slice(lastIndex, match.index)}</span>)
    }
    const token = match[0]
    if (/\d/.test(token)) {
      const parts = parsePhaseFormulaDisplayParts(token)
      nodes.push(
        <span key={`f-${key++}`} className="whitespace-nowrap">
          {parts.map((part, index) =>
            part.kind === 'sub' ? (
              <sub key={`${part.text}-${index}`} className="text-[0.72em] leading-none">
                {part.text}
              </sub>
            ) : (
              <span key={`${part.text}-${index}`}>{part.text}</span>
            )
          )}
        </span>
      )
    } else {
      nodes.push(<span key={`t-${key++}`}>{token}</span>)
    }
    lastIndex = match.index + token.length
  }
  if (lastIndex < expr.length) {
    nodes.push(<span key={`t-${key++}`}>{expr.slice(lastIndex)}</span>)
  }
  return (
    <span className="break-all leading-relaxed" title={displayConstraintExpression(expr)}>
      {nodes}
    </span>
  )
}

function formatConstraintValue(value: number | string | null | undefined, digits = 4): string {
  if (value == null || value === '') return '—'
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) return '—'
    return Number(value.toFixed(digits)).toString()
  }
  return String(value)
}

function PhaseFormulaLabel({ formula }: { formula: string }) {
  return <PhaseFormulaDisplay formula={formula} />
}

function blankPhasePads(count: number, className: string, prefix: string) {
  return Array.from({ length: Math.max(0, count) }, (_, index) => (
    <td key={`${prefix}-${index}`} className={className}>
      <span className="block h-5" aria-hidden="true" />
    </td>
  ))
}

function MetcalPhasePreviewRows({
  column,
  maxPhaseCount,
  borderClass,
  rowClass,
}: {
  column: MetcalPhasePreviewColumn
  maxPhaseCount: number
  borderClass: string
  rowClass: string
}) {
  const phaseKeys = phaseKeysForMetcalPreviewColumn(column)
  const isGas = column.category === '气'
  const cell = `border-t px-1 py-1.5 text-center align-middle ${borderClass}`
  const formulaCell = `${cell} whitespace-normal break-words leading-tight`
  const stickyCategory = `sticky left-0 z-10 border-t px-1.5 py-1.5 text-center font-semibold whitespace-nowrap align-middle ${borderClass} ${rowClass}`
  const stickyName = `sticky z-10 border-t px-1.5 py-1.5 text-center whitespace-nowrap align-middle ${borderClass} ${rowClass}`
  const total = phaseKeys.reduce((sum, key) => sum + (column.phases[key] ?? 0), 0)
  const unitLabel = 't/h'
  const categoryRows = isGas ? 2 : 4
  const phaseColStyle = { width: COL.phase, maxWidth: COL.phase, minWidth: COL.phase } as const

  if (isGas) {
    return (
      <Fragment key={column.id}>
        <tr className={rowClass}>
          <td rowSpan={categoryRows} className={stickyCategory}>
            {column.category}
          </td>
          <td rowSpan={2} className={stickyName} style={{ left: COL.category }} title={column.name}>
            {column.name}
          </td>
          <td className={`${cell} whitespace-nowrap`}>{unitLabel}</td>
          {phaseKeys.map((key) => (
            <td key={`${column.id}-label-${key}`} className={formulaCell} style={phaseColStyle}>
              <PhaseFormulaLabel formula={key} />
            </td>
          ))}
          {blankPhasePads(maxPhaseCount - phaseKeys.length, `${cell} whitespace-nowrap`, `${column.id}-label-pad`)}
          <td className={`${cell} whitespace-nowrap`} />
        </tr>
        <tr className={rowClass}>
          <td className={`${cell} whitespace-nowrap`}>{formatCell(column.weight, 2)}</td>
          {phaseKeys.map((key) => (
            <td key={`${column.id}-value-${key}`} className={`${cell} whitespace-nowrap`} style={phaseColStyle}>
              {formatCell(column.phases[key], 2)}
            </td>
          ))}
          {blankPhasePads(maxPhaseCount - phaseKeys.length, `${cell} whitespace-nowrap`, `${column.id}-value-pad`)}
          <td className={`${cell} whitespace-nowrap font-semibold`}>{formatCell(total, 2)}</td>
        </tr>
      </Fragment>
    )
  }

  return (
    <Fragment key={column.id}>
      <tr className={rowClass}>
        <td rowSpan={categoryRows} className={stickyCategory}>
          {column.category}
        </td>
        <td rowSpan={2} className={stickyName} style={{ left: COL.category }} title={column.name}>
          {column.name}
        </td>
        <td className={`${cell} whitespace-nowrap`}>{unitLabel}</td>
        {phaseKeys.map((key) => (
          <td key={`${column.id}-label-${key}`} className={formulaCell} style={phaseColStyle}>
            <PhaseFormulaLabel formula={key} />
          </td>
        ))}
        {blankPhasePads(maxPhaseCount - phaseKeys.length, `${cell} whitespace-nowrap`, `${column.id}-label-pad`)}
        <td className={`${cell} whitespace-nowrap`} />
      </tr>
      <tr className={rowClass}>
        <td className={`${cell} whitespace-nowrap`}>{formatCell(column.weight, 2)}</td>
        {phaseKeys.map((key) => (
          <td key={`${column.id}-value-${key}`} className={`${cell} whitespace-nowrap`} style={phaseColStyle}>
            {formatCell(column.phases[key], 2)}
          </td>
        ))}
        {blankPhasePads(maxPhaseCount - phaseKeys.length, `${cell} whitespace-nowrap`, `${column.id}-value-pad`)}
        <td className={`${cell} whitespace-nowrap font-semibold`}>{formatCell(total, 2)}</td>
      </tr>
      <tr className={rowClass}>
        <td rowSpan={2} className={stickyName} style={{ left: COL.category }}>
          含水
        </td>
        <td className={`${cell} whitespace-nowrap`}>{unitLabel}</td>
        <td className={formulaCell} style={phaseColStyle}>
          <PhaseFormulaLabel formula="H2O" />
        </td>
        {blankPhasePads(maxPhaseCount - 1, `${cell} whitespace-nowrap`, `${column.id}-water-label-pad`)}
        <td className={`${cell} whitespace-nowrap`} />
      </tr>
      <tr className={rowClass}>
        <td className={`${cell} whitespace-nowrap`}>{formatCell(column.waterWeight, 2)}</td>
        <td className={`${cell} whitespace-nowrap`} style={phaseColStyle}>
          100.00
        </td>
        {blankPhasePads(maxPhaseCount - 1, `${cell} whitespace-nowrap`, `${column.id}-water-value-pad`)}
        <td className={`${cell} whitespace-nowrap font-semibold`}>100.00</td>
      </tr>
    </Fragment>
  )
}

function productRuleMap(
  config: OxySideBlowConstraintConfig,
  productKey: OxySideBlowProductKey
): Record<string, Partial<Record<DistributionRuleType, number | string>>> {
  const map: Record<string, Partial<Record<DistributionRuleType, number | string>>> = {}
  for (const entry of config.elementDistributions) {
    for (const rule of entry.rules) {
      if (rule.product !== productKey) continue
      map[entry.element] = { ...map[entry.element], [rule.type]: rule.value }
    }
  }
  return map
}

function constraintElementRows(config: OxySideBlowConstraintConfig) {
  const defaults = loadOxySideBlowConstraints()
  const elements = new Set<string>()
  for (const entry of defaults.elementDistributions) elements.add(entry.element)
  for (const entry of config.elementDistributions) elements.add(entry.element)
  return sortOxyConstraintElementKeys(elements)
}

function selectedRuleTypeFromMap(
  values: Partial<Record<DistributionRuleType, number | string>> | undefined
): DistributionRuleType | '' {
  if (!values) return ''
  if (values['W%'] != null && String(values['W%']).trim() !== '') return 'W%'
  if (values['D%'] != null && String(values['D%']).trim() !== '') return 'D%'
  if (Object.prototype.hasOwnProperty.call(values, 'W%')) return 'W%'
  if (Object.prototype.hasOwnProperty.call(values, 'D%')) return 'D%'
  return ''
}

function ImportElementConstraintsTable({
  config,
  title,
  productDisplayStage,
  darkMode,
}: {
  config: OxySideBlowConstraintConfig
  title: string
  productDisplayStage: OxyProductDisplayStage
  darkMode: boolean
}) {
  const borderClass = darkMode ? 'border-gray-600' : 'border-gray-200'
  const headClass = darkMode ? 'bg-gray-900 text-gray-200' : 'bg-gray-50 text-gray-700'
  const stickyHead = darkMode ? 'bg-gray-900 text-gray-200' : 'bg-gray-50 text-gray-700'
  const stickyBody = darkMode ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'
  const mutedClass = darkMode ? 'text-gray-400' : 'text-gray-500'
  const ignoredCell = darkMode ? 'bg-gray-800/70 text-gray-500' : 'bg-gray-100 text-gray-500'
  const elements = constraintElementRows(config)
  const ruleMaps = Object.fromEntries(
    OXY_SIDE_BLOW_PRODUCT_KEYS.map((productKey) => [productKey, productRuleMap(config, productKey)])
  ) as Record<OxySideBlowProductKey, Record<string, Partial<Record<DistributionRuleType, number | string>>>>
  const minWidth = Math.max(860, 176 + elements.length * 76)

  return (
    <div className={`min-h-0 flex-1 overflow-auto rounded-lg border ${borderClass}`}>
      <div className={`border-b px-3 py-2 text-sm font-semibold ${headClass}`}>{title}</div>
      <div className="overflow-auto">
        <table className="w-full table-fixed text-sm" style={{ minWidth }}>
          <thead className={headClass}>
            <tr>
              <th className={`sticky left-0 z-20 w-24 px-2 py-2 text-center font-semibold ${stickyHead}`}>
                产物
              </th>
              <th className={`sticky left-24 z-20 w-20 px-2 py-2 text-center font-semibold ${stickyHead}`}>
                项目
              </th>
              {elements.map((element) => (
                <th
                  key={element}
                  className={`w-[76px] border-l px-1 py-2 text-center font-semibold ${borderClass}`}
                >
                  {elementSymbolLabel(element)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {OXY_SIDE_BLOW_PRODUCT_KEYS.map((productKey) => (
              <Fragment key={productKey}>
                <tr>
                  <td
                    rowSpan={2}
                    className={`sticky left-0 z-10 border-t px-2 py-1.5 text-center font-semibold ${borderClass} ${stickyBody}`}
                  >
                    {oxyProductDisplayName(productKey, productDisplayStage)}
                  </td>
                  <td
                    className={`sticky left-24 z-10 border-t px-2 py-1.5 text-center ${borderClass} ${stickyBody} ${mutedClass}`}
                  >
                    约束
                  </td>
                  {elements.map((element) => {
                    const type = selectedRuleTypeFromMap(ruleMaps[productKey]?.[element])
                    const ignored = !type
                    return (
                      <td
                        key={`${productKey}-${element}-type`}
                        className={`border-t border-l px-1 py-1.5 text-center ${borderClass} ${
                          ignored ? ignoredCell : ''
                        }`}
                      >
                        {type ? RULE_LABELS[type] : '—'}
                      </td>
                    )
                  })}
                </tr>
                <tr>
                  <td
                    className={`sticky left-24 z-10 border-t px-2 py-1.5 text-center ${borderClass} ${stickyBody} ${mutedClass}`}
                  >
                    数值
                  </td>
                  {elements.map((element) => {
                    const type = selectedRuleTypeFromMap(ruleMaps[productKey]?.[element])
                    const values = ruleMaps[productKey]?.[element] ?? {}
                    const ignored = !type
                    const raw = type ? values[type] : null
                    return (
                      <td
                        key={`${productKey}-${element}-value`}
                        className={`border-t border-l px-1 py-1.5 text-center ${borderClass} ${
                          ignored ? ignoredCell : ''
                        }`}
                      >
                        {ignored ? '—' : formatConstraintValue(raw, 4)}
                      </td>
                    )
                  })}
                </tr>
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function ImportCustomConstraintsTable({
  config,
  title,
  processParameters,
  darkMode,
}: {
  config: OxySideBlowConstraintConfig
  title: string
  processParameters?: {
    feSiO2: number
    oxygenEnrichmentPct: number
    matteCopperGrade: number
    slagCopperWPercent: number
    fuelConcentrateRatio: number
  }
  darkMode: boolean
}) {
  const borderClass = darkMode ? 'border-gray-600' : 'border-gray-200'
  const headClass = darkMode ? 'bg-gray-900 text-gray-200' : 'bg-gray-50 text-gray-700'
  const mutedClass = darkMode ? 'text-gray-400' : 'text-gray-500'
  const customRows = config.customConstraints
    .map((constraint, index) => ({ constraint, index }))
    .filter(({ constraint }) => !constraint.expr.includes('煤湿基'))

  return (
    <div className={`min-h-0 flex-1 overflow-auto rounded-lg border ${borderClass}`}>
      <div className={`border-b px-3 py-2 text-sm font-semibold ${headClass}`}>{title}</div>
      <div className="overflow-auto p-2">
        <table className="w-full min-w-[720px] table-fixed text-sm">
          <thead className={headClass}>
            <tr>
              <th className={`w-16 border-b px-2 py-2 text-center ${borderClass}`}>#</th>
              <th className={`border-b px-2 py-2 text-left ${borderClass}`}>表达式</th>
              <th className={`w-28 border-b px-2 py-2 text-center ${borderClass}`}>目标</th>
            </tr>
          </thead>
          <tbody>
            {customRows.length === 0 ? (
              <tr>
                <td colSpan={3} className={`px-3 py-8 text-center ${mutedClass}`}>
                  未解析到自定义约束
                </td>
              </tr>
            ) : (
              customRows.map(({ constraint, index }) => (
                <tr key={`${index}-${constraint.expr}`}>
                  <td className={`border-t px-2 py-1.5 text-center ${borderClass}`}>{index + 1}</td>
                  <td className={`border-t px-2 py-1.5 text-left break-all leading-relaxed ui-app-sans ${borderClass}`}>
                    <ConstraintExpressionDisplay expr={constraint.expr} />
                  </td>
                  <td className={`border-t px-2 py-1.5 text-center ${borderClass}`}>
                    {formatConstraintValue(constraint.target, 6)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {processParameters ? (
          <div className={`mt-3 border-t px-2 pt-2 text-xs ${mutedClass} ${borderClass}`}>
            Fe/
            <span className="whitespace-nowrap">
              SiO<sub className="text-[0.72em] leading-none">2</sub>
            </span>
            ={formatCell(processParameters.feSiO2, 3)}；富氧=
            {formatCell(processParameters.oxygenEnrichmentPct, 2)}%；锍品位=
            {formatCell(processParameters.matteCopperGrade, 2)}%；渣含铜W%=
            {formatCell(processParameters.slagCopperWPercent, 2)}%；煤/精矿=
            {formatCell(processParameters.fuelConcentrateRatio, 5)}
          </div>
        ) : null}
      </div>
    </div>
  )
}

function MaterialGroupRows({
  category,
  materials,
  elementKeys,
  borderClass,
  rowClass,
}: {
  category: string
  materials: CopperMaterialColumn[]
  elementKeys: ReturnType<typeof visibleMetcalImportElementKeys>
  borderClass: string
  rowClass: string
}) {
  if (!materials.length) return null
  return (
    <>
      {materials.map((material, index) => {
        const water = materialWaterWeight(material)
        const total = materialAssayTotal(material)
        return (
          <tr key={material.id} className={rowClass}>
            {index === 0 ? (
              <td
                rowSpan={materials.length}
                className={`sticky left-0 z-10 border-t px-1.5 py-2 text-center font-semibold whitespace-nowrap ${borderClass} ${rowClass}`}
              >
                {category}
              </td>
            ) : null}
            <td
              className={`sticky z-10 border-t px-1.5 py-2 text-center whitespace-nowrap ${borderClass} ${rowClass}`}
              style={{ left: COL.category }}
              title={material.name}
            >
              {material.name}
            </td>
            <td className={`border-t px-1.5 py-2 text-center whitespace-nowrap ${borderClass}`}>
              {formatCell(material.weight, 2)}
            </td>
            <td className={`border-t px-1.5 py-2 text-center whitespace-nowrap ${borderClass}`}>
              {formatCell(water, 2)}
            </td>
            <td className={`border-t px-1.5 py-2 text-center whitespace-nowrap ${borderClass}`}>
              {formatCell(total, 2)}
            </td>
            {elementKeys.map((key) => (
              <td key={key} className={`border-t px-1 py-2 text-center whitespace-nowrap ${borderClass}`}>
                {formatCell(material.ratios[key], 2)}
              </td>
            ))}
          </tr>
        )
      })}
    </>
  )
}

export function MetcalFloImportPanel({
  darkMode,
  bundle,
  sourceFileName,
  onConfirm,
  onCancel,
}: MetcalFloImportPanelProps) {
  const stages = bundle.stages
  const initialStageId = stages[0]?.stageId ?? 'smelting'
  const [caseName, setCaseName] = useState(() => defaultCaseNameFromFile(sourceFileName))
  const [previewTab, setPreviewTab] = useState(`${initialStageId}:element`)
  const previewSection = previewTab.split(':')[1] ?? 'element'
  const {
    rawMaterials,
    solventColumns,
    airColumns,
    fuelColumn,
    recomputedBlend,
    extraction,
    constraints,
    productResults,
    productDisplayStage,
    stageName,
  } =
    stages.find((stage) => stage.stageId === previewTab.split(':')[0]) ??
    stages[0] ?? {
      ...bundle,
      stageId: 'smelting' as const,
      stageName: '熔炼' as const,
      productDisplayStage: 'smelting' as const,
      productResults: bundle.productResults,
    }
  useEffect(() => {
    setCaseName(defaultCaseNameFromFile(sourceFileName))
    setPreviewTab(`${stages[0]?.stageId ?? 'smelting'}:element`)
  }, [sourceFileName, stages])

  const fuelPreview = useMemo(() => {
    if (!extraction.fuels.length) return [] as CopperMaterialColumn[]
    return [{ ...fuelColumn } as CopperMaterialColumn]
  }, [extraction.fuels.length, fuelColumn])

  const { concentrates: concentrateMaterials, others: otherMaterials } = useMemo(
    () => partitionRawMixMaterials(rawMaterials),
    [rawMaterials]
  )

  const blendDryWeight = useMemo(
    () => concentrateMaterials.reduce((sum, material) => sum + Math.max(0, material.weight), 0),
    [concentrateMaterials]
  )
  const blendWater = useMemo(
    () => concentrateMaterials.reduce((sum, material) => sum + materialWaterWeight(material), 0),
    [concentrateMaterials]
  )
  // 元素表混料行：仅精矿加权（Flo 混合铜精矿块多为物相 W%，不宜直接当地元素化验；其他固体单列）
  const blendRatios = useMemo(() => {
    if (Object.keys(recomputedBlend.ratios).length > 0) return recomputedBlend.ratios
    const metcal = extraction.blend
    if (metcal && Object.keys(metcal.elementRatios).length > 0) {
      return finalizeMetcalAssayRatios(metcal.elementRatios, metcal.phaseRatios)
    }
    return recomputedBlend.ratios
  }, [extraction.blend, recomputedBlend.ratios])
  const isSmeltingStage = productDisplayStage === 'smelting'

  const previewMaterials = useMemo(
    () => [
      ...concentrateMaterials,
      ...(isSmeltingStage ? [{
        id: 'metcal-blend-preview',
        name: '混合铜精矿',
        kind: 'raw' as const,
        weight: blendDryWeight,
        waterWeight: blendWater,
        ratios: blendRatios,
      }] : []),
      ...otherMaterials,
      ...solventColumns,
      ...fuelPreview,
      ...airColumns.filter((column) => column.weight > 0 || column.name.trim()),
    ],
    [
      airColumns,
      blendDryWeight,
      blendRatios,
      blendWater,
      concentrateMaterials,
      fuelPreview,
      isSmeltingStage,
      otherMaterials,
      solventColumns,
    ]
  )

  const inputMaterials = useMemo(
    () => [...rawMaterials, ...solventColumns, fuelColumn, ...airColumns],
    [airColumns, fuelColumn, rawMaterials, solventColumns]
  )
  const elementTotal = useMemo(() => calculateWeightedComposition(inputMaterials), [inputMaterials])
  const inputDryWeight = useMemo(
    () => inputMaterials.reduce((sum, material) => sum + Math.max(0, material.weight), 0),
    [inputMaterials]
  )
  const inputWaterWeight = useMemo(() => totalWaterWeight(inputMaterials), [inputMaterials])
  const elementKeys = useMemo(
    () => visibleMetcalImportElementKeys([...previewMaterials, { ...fuelColumn, id: 'metcal-import-total', name: '投入', weight: elementTotal.totalWeight, ratios: elementTotal.ratios }]),
    [elementTotal.ratios, elementTotal.totalWeight, fuelColumn, previewMaterials]
  )
  const phaseColumns = useMemo(
    () =>
      buildMetcalPhasePreviewColumns({
        extraction,
        rawMaterials,
        solventColumns,
        airColumns,
        fuelColumn,
      }),
    [airColumns, extraction, fuelColumn, rawMaterials, solventColumns]
  )
  const maxPhaseColumnCount = useMemo(
    () => Math.max(1, ...phaseColumns.map((column) => phaseKeysForMetcalPreviewColumn(column).length)),
    [phaseColumns]
  )

  const elementTableMinWidth =
    COL.category + COL.name + COL.mass + COL.water + COL.total + elementKeys.length * COL.element
  const phaseTableMinWidth = COL.category + COL.name + COL.mass + COL.total + maxPhaseColumnCount * COL.phase

  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900'
  const mutedClass = darkMode ? 'text-gray-400' : 'text-gray-500'
  const borderClass = darkMode ? 'border-gray-600' : 'border-gray-200'
  const headClass = darkMode ? 'bg-gray-900 text-gray-200' : 'bg-gray-50 text-gray-700'
  const rawRowClass = darkMode ? 'bg-gray-800' : 'bg-white'
  const solventRowClass = darkMode ? 'bg-emerald-950 text-emerald-50' : 'bg-emerald-50 text-emerald-950'
  const fuelRowClass = darkMode ? 'bg-orange-950 text-orange-50' : 'bg-orange-50 text-orange-950'
  const gasRowClass = darkMode ? 'bg-sky-950 text-sky-50' : 'bg-sky-50 text-sky-950'
  const blendRowClass = darkMode ? 'bg-amber-950 text-amber-50' : 'bg-amber-100 text-amber-950'
  const tabActive = darkMode ? 'border-blue-400 text-blue-200' : 'border-blue-600 text-blue-700'
  const tabIdle = darkMode ? 'border-transparent text-gray-400' : 'border-transparent text-gray-500'

  const otherRowClass = darkMode ? 'bg-violet-950 text-violet-50' : 'bg-violet-50 text-violet-950'
  const canConfirm = stages.some((stage) => stage.stageId === 'smelting') && caseName.trim().length > 0

  const categoryRowClass = (category: string) => {
    if (category === '混料') return blendRowClass
    if (category === '其他') return otherRowClass
    if (category === '熔剂') return solventRowClass
    if (category === '燃料') return fuelRowClass
    if (category === '气') return gasRowClass
    return rawRowClass
  }

  const blendElementRow = (
    <tr className={blendRowClass}>
      <td
        className={`sticky left-0 z-10 border-t px-1.5 py-2 text-center font-semibold whitespace-nowrap ${borderClass} ${blendRowClass}`}
      >
        混料
      </td>
      <td
        className={`sticky z-10 border-t px-1.5 py-2 text-center whitespace-nowrap ${borderClass} ${blendRowClass}`}
        style={{ left: COL.category }}
      >
        混合铜精矿
      </td>
      <td className={`border-t px-1.5 py-2 text-center whitespace-nowrap ${borderClass}`}>
        {formatCell(blendDryWeight, 2)}
      </td>
      <td className={`border-t px-1.5 py-2 text-center whitespace-nowrap ${borderClass}`}>
        {formatCell(blendWater, 2)}
      </td>
      <td className={`border-t px-1.5 py-2 text-center whitespace-nowrap ${borderClass}`}>
        {formatCell(calculateKnownTotal(blendRatios) + (blendRatios['Other(其他)'] ?? 0), 2)}
      </td>
      {elementKeys.map((key) => (
        <td key={key} className={`border-t px-1 py-2 text-center whitespace-nowrap ${borderClass}`}>
          {formatCell(blendRatios[key], 2)}
        </td>
      ))}
    </tr>
  )

  const elementTotalRow = (
    <tr className={darkMode ? 'bg-blue-950 text-blue-50' : 'bg-blue-50 text-blue-950'}>
      <td className={`sticky left-0 z-10 border-t px-1.5 py-2 text-center font-semibold whitespace-nowrap ${borderClass} ${darkMode ? 'bg-blue-950' : 'bg-blue-50'}`}>
        投入
      </td>
      <td className={`sticky z-10 border-t px-1.5 py-2 text-center font-semibold whitespace-nowrap ${borderClass} ${darkMode ? 'bg-blue-950' : 'bg-blue-50'}`} style={{ left: COL.category }}>
        投入
      </td>
      <td className={`border-t px-1.5 py-2 text-center font-semibold whitespace-nowrap ${borderClass}`}>
        {formatCell(inputDryWeight, 2)}
      </td>
      <td className={`border-t px-1.5 py-2 text-center font-semibold whitespace-nowrap ${borderClass}`}>
        {formatCell(inputWaterWeight, 2)}
      </td>
      <td className={`border-t px-1.5 py-2 text-center font-semibold whitespace-nowrap ${borderClass}`}>
        {formatCell(calculateKnownTotal(elementTotal.ratios) + (elementTotal.ratios['Other(其他)'] ?? 0), 2)}
      </td>
      {elementKeys.map((key) => (
        <td key={`total-${key}`} className={`border-t px-1 py-2 text-center font-semibold whitespace-nowrap ${borderClass}`}>
          {formatCell(elementTotal.ratios[key], 2)}
        </td>
      ))}
    </tr>
  )

  const tabEntries =
    bundle.caseMode === 'copper-staged'
      ? stages.flatMap((stage) =>
          ([
            ['element', '投入元素'],
            ['phase', '投入物相'],
            ['elementConstraints', '元素约束'],
            ['customConstraints', '产出约束'],
            ['productResults', '产出结果'],
          ] as const).map(
            ([section, label]) => [`${stage.stageId}:${section}`, `${stage.stageName}-${label}`] as const
          )
        )
      : [
          ['smelting:element', '投入-元素'],
          ['smelting:phase', '投入-物相'],
          ['smelting:elementConstraints', '熔炼-元素约束'],
          ['smelting:customConstraints', '熔炼-自定义约束'],
          ...(stages.some((stage) => stage.stageId === 'converting')
            ? ([
                ['converting:elementConstraints', '吹炼-元素约束'],
                ['converting:customConstraints', '吹炼-自定义约束'],
              ] as const)
            : []),
          ['smelting:productResults', '熔炼产出'],
          ...(stages.some((stage) => stage.stageId === 'converting')
            ? ([['converting:productResults', '吹炼产出']] as const)
            : []),
        ]

  const panel = (
    <div className="katex-app-typography fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-3 sm:p-5">
      <div
        className={`${cardBase(darkMode)} flex w-[min(96vw,1440px)] max-h-[88vh] flex-col overflow-hidden p-4 text-sm shadow-2xl sm:p-5 ${textClass}`}
        style={{ height: 'min(88vh, calc(min(96vw, 1440px) * 9 / 16))' }}
      >
        <div className="shrink-0">
          <h3 className={`${sectionTitle(darkMode)} !text-sm font-semibold`}>MetCal Flo 案例导入</h3>
          <p className={`mt-1.5 leading-relaxed ${mutedClass}`}>
            来源：{sourceFileName}。已识别 {stages.map((stage) => stage.stageName).join('、')}工序；各工序产出作为
            MetCal 只读对照导入。
          </p>
        </div>

        <div className="mt-3 shrink-0">
          <label className="block max-w-md">
            <span className={`mb-1 block font-medium ${textClass}`}>案例名称</span>
            <input
              className={`${inputBase(darkMode)} w-full text-sm`}
              value={caseName}
              onChange={(event) => setCaseName(event.target.value)}
              placeholder="请输入案例名称"
            />
          </label>
        </div>

        <div className={`mt-3 flex shrink-0 gap-4 overflow-x-auto border-b ${borderClass}`}>
          {tabEntries.map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`-mb-px shrink-0 border-b-2 px-1 pb-2 text-sm font-medium whitespace-nowrap ${
                previewTab === id ? tabActive : tabIdle
              }`}
              onClick={() => setPreviewTab(id)}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          {previewSection === 'element' ? (
            <div className={`min-h-0 flex-1 overflow-auto rounded-lg border ${borderClass}`}>
              <table
                className="border-collapse text-sm"
                style={{ minWidth: elementTableMinWidth, width: 'max-content' }}
              >
                <thead>
                  <tr className={headClass}>
                    <th
                      className={`sticky left-0 top-0 z-30 border-b px-1.5 py-2 text-center font-medium whitespace-nowrap ${borderClass} ${headClass}`}
                    >
                      类别
                    </th>
                    <th
                      className={`sticky top-0 z-30 border-b px-1.5 py-2 text-center font-medium whitespace-nowrap ${borderClass} ${headClass}`}
                      style={{ left: COL.category }}
                    >
                      名称
                    </th>
                    <th
                      className={`sticky top-0 z-20 border-b px-1.5 py-2 text-center font-medium whitespace-nowrap ${borderClass} ${headClass}`}
                    >
                      干基 t/h
                    </th>
                    <th
                      className={`sticky top-0 z-20 border-b px-1.5 py-2 text-center font-medium whitespace-nowrap ${borderClass} ${headClass}`}
                    >
                      水分 t/h
                    </th>
                    <th
                      className={`sticky top-0 z-20 border-b px-1.5 py-2 text-center font-medium whitespace-nowrap ${borderClass} ${headClass}`}
                    >
                      合计 %
                    </th>
                    {elementKeys.map((key) => (
                      <th
                        key={key}
                        className={`sticky top-0 z-20 border-b px-1 py-2 text-center font-medium whitespace-nowrap ${borderClass} ${headClass}`}
                      >
                        {elementTableHeaderLabel(key, 'compound')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <MaterialGroupRows
                    category="原料"
                    materials={concentrateMaterials}
                    elementKeys={elementKeys}
                    borderClass={borderClass}
                    rowClass={rawRowClass}
                  />
                  {isSmeltingStage ? blendElementRow : null}
                  <MaterialGroupRows
                    category="其他"
                    materials={otherMaterials}
                    elementKeys={elementKeys}
                    borderClass={borderClass}
                    rowClass={otherRowClass}
                  />
                  <MaterialGroupRows
                    category="熔剂"
                    materials={solventColumns}
                    elementKeys={elementKeys}
                    borderClass={borderClass}
                    rowClass={solventRowClass}
                  />
                  <MaterialGroupRows
                    category="燃料"
                    materials={fuelPreview}
                    elementKeys={elementKeys}
                    borderClass={borderClass}
                    rowClass={fuelRowClass}
                  />
                  <MaterialGroupRows
                    category="气"
                    materials={airColumns}
                    elementKeys={elementKeys}
                    borderClass={borderClass}
                    rowClass={gasRowClass}
                  />
                  {elementTotalRow}
                </tbody>
              </table>
            </div>
          ) : null}

          {previewSection === 'phase' ? (
            <div className={`min-h-0 flex-1 overflow-auto rounded-lg border ${borderClass}`}>
              <table
                className="border-collapse text-sm"
                style={{ minWidth: phaseTableMinWidth, width: 'max-content' }}
              >
                <thead>
                  <tr className={headClass}>
                    <th
                      colSpan={4 + maxPhaseColumnCount}
                      className={`border-b px-2 py-1.5 text-center font-semibold ${borderClass} ${headClass}`}
                    >
                      投入-物料物相表（w%）
                    </th>
                  </tr>
                  <tr className={headClass}>
                    <th
                      className={`sticky left-0 z-30 border-b px-1.5 py-1.5 text-center font-medium whitespace-nowrap ${borderClass} ${headClass}`}
                    >
                      类型
                    </th>
                    <th
                      className={`sticky z-30 border-b px-1.5 py-1.5 text-center font-medium whitespace-nowrap ${borderClass} ${headClass}`}
                      style={{ left: COL.category }}
                    >
                      名称
                    </th>
                    <th
                      className={`border-b px-1.5 py-1.5 text-center font-medium whitespace-nowrap ${borderClass} ${headClass}`}
                    >
                      投入
                    </th>
                    {Array.from({ length: maxPhaseColumnCount }, (_, index) => (
                      <th
                        key={`phase-head-placeholder-${index}`}
                        className={`border-b px-1 py-1.5 text-center font-medium whitespace-nowrap ${borderClass} ${headClass}`}
                      >
                        &nbsp;
                      </th>
                    ))}
                    <th
                      className={`border-b px-1.5 py-1.5 text-center font-medium whitespace-nowrap ${borderClass} ${headClass}`}
                    >
                      合计
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {phaseColumns.map((column) => (
                    <MetcalPhasePreviewRows
                      key={column.id}
                      column={column}
                      maxPhaseCount={maxPhaseColumnCount}
                      borderClass={borderClass}
                      rowClass={categoryRowClass(column.category)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}

          {previewSection === 'elementConstraints' ? (
            <ImportElementConstraintsTable
              config={constraints.config}
              title={`${stageName}-元素约束`}
              productDisplayStage={productDisplayStage}
              darkMode={darkMode}
            />
          ) : null}

          {previewSection === 'customConstraints' ? (
            <ImportCustomConstraintsTable
              config={constraints.config}
              title={`${stageName}-产出约束`}
              processParameters={constraints.processParameters}
              darkMode={darkMode}
            />
          ) : null}

          {previewSection === 'productResults' ? (
            <div className={`min-h-0 flex-1 overflow-auto rounded-lg border ${borderClass} p-2`}>
              {productResults.result ? (
                <CopperProductionResultTable
                  darkMode={darkMode}
                  result={productResults.result}
                  mode="phase"
                  phaseTitle={`MetCal ${stageName}产出-产物物相表`}
                  config={constraints.config}
                  widthMode="content"
                  productDisplayStage={productDisplayStage}
                  defaultFlueGasTotalUnit={productDisplayStage === 'converting' ? 'volume' : undefined}
                />
              ) : (
                <div className={`px-3 py-8 text-center text-sm ${mutedClass}`}>
                  未能从 Flo 解析{stageName}产出结果
                </div>
              )}
            </div>
          ) : null}
        </div>

        <div className="mt-4 flex shrink-0 flex-wrap justify-end gap-2">
          <button type="button" className={btnSecondary(darkMode)} onClick={onCancel}>
            取消
          </button>
          <button
            type="button"
            className={btnPrimary(darkMode)}
            disabled={!canConfirm}
            onClick={() => onConfirm(caseName.trim())}
          >
            导入
          </button>
        </div>
      </div>
    </div>
  )

  if (typeof document === 'undefined') return panel
  return createPortal(panel, document.body)
}
