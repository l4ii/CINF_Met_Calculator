import { Fragment, useEffect, useMemo, useState } from 'react'
import { BATCH_TABLE_MASS_COL_WIDTH, BATCH_TABLE_PCT_COL_WIDTH } from '../../utils/copperBatchTableLayout'
import {
  copperHeatPhaseMolarMass,
  type CopperHeatBalanceResult,
  type FuelCoalCrosscheck,
  type HeatComponentRow,
  type HeatFlowRow,
  type HeatReactionTerm,
} from '../../utils/copperHeatBalance'
import {
  calculateCopperHeatAuxiliaryWithTrace,
  formatAuxiliaryParam,
} from '../../utils/copperHeatAuxiliaryParams.ts'
import {
  HEAT_AUXILIARY_EXPLAIN_ITEMS,
  type HeatAuxiliaryParamKey,
} from '../../utils/copperHeatAuxiliaryExplain.ts'
import type { OxyConstraintSolverResult } from '../../utils/copperConstraintSolver.ts'
import type { CopperMaterialColumn } from '../../utils/copperWorkflowCalc.ts'
import { useAssistantContext } from '../../context/AssistantContext'
import { BatchTableNumericReadonly } from './BatchTableNumericCell'

type HeatBalanceResultTab =
  | 'summary'
  | 'reactions'
  | 'inputPhysical'
  | 'inputEnthalpy'
  | 'outputCarried'

const HEAT_BALANCE_RESULT_TABS: Array<{ id: HeatBalanceResultTab; label: string }> = [
  { id: 'summary', label: '热量平衡总表' },
  { id: 'inputPhysical', label: '热收入-投入组分物理热' },
  { id: 'reactions', label: '化学反应热' },
  { id: 'inputEnthalpy', label: '热收入 - 投入组分热焓' },
  { id: 'outputCarried', label: '热支出 - 产物组分热焓' },
]

const HEAT_TABLE_TEXT = 'text-sm'
const HEAT_TABLE_CELL = `px-2 py-1.5 text-center ${HEAT_TABLE_TEXT}`
const HEAT_TABLE_HEAD = `px-2 py-2 text-center ${HEAT_TABLE_TEXT}`

function EnthalpySymbol({ kelvin }: { kelvin: number | string }) {
  return (
    <span className="inline-flex items-baseline whitespace-nowrap">
      <span>ΔH</span>
      <sub className="text-[0.72em] leading-none">{kelvin}</sub>
    </span>
  )
}

function EnthalpyHeaderWithUnit({ kelvin, unit }: { kelvin?: number; unit: string }) {
  return (
    <span className="inline-flex items-baseline gap-1 whitespace-nowrap">
      {kelvin != null ? <EnthalpySymbol kelvin={kelvin} /> : <span>ΔH</span>}
      <span>{unit}</span>
    </span>
  )
}

function enthalpyKelvinFromTemperature(temperatureC: number | null | undefined): number {
  if (temperatureC == null || !Number.isFinite(temperatureC)) return 298
  return Math.round(temperatureC + 273)
}

function EnthalpyDifferenceSymbol({ temperatureC }: { temperatureC: number | null }) {
  const k = enthalpyKelvinFromTemperature(temperatureC)
  if (k === 298) return null
  return (
    <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
      <EnthalpySymbol kelvin={k} />
      <span>−</span>
      <EnthalpySymbol kelvin={298} />
    </span>
  )
}

function formatPhaseFormulaParts(label: string) {
  return label.split(/(\d+)/).filter(Boolean)
}

function PhaseFormula({ value }: { value: string }) {
  return (
    <span className="inline-flex items-baseline justify-center whitespace-nowrap" title={value}>
      {formatPhaseFormulaParts(value).map((part, index) =>
        /^\d+$/.test(part) ? (
          <sub key={`${part}-${index}`} className="text-[0.72em] leading-none">
            {part}
          </sub>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </span>
  )
}

function ReactionFormulaTerm({ term }: { term: string }) {
  const trimmed = term.trim()
  const match = trimmed.match(/^(\d+(?:\.\d+)?)?\s*(.+)$/)
  if (!match) return <span>{trimmed}</span>
  const coefficient = match[1]
  const formula = match[2]?.trim() ?? ''
  return (
    <span className="inline-flex items-baseline gap-0.5 whitespace-nowrap">
      {coefficient ? <span>{coefficient}</span> : null}
      {formula ? <PhaseFormula value={formula} /> : null}
    </span>
  )
}

function ReactionFormula({ value }: { value: string }) {
  const sides = value.split('=').map((side) => side.trim())
  return (
    <span className="block whitespace-normal break-words font-mono leading-relaxed" title={value}>
      {sides.map((side, sideIndex) => (
        <Fragment key={sideIndex}>
          {sideIndex > 0 ? <span className="mx-1">=</span> : null}
          {side.split('+').map((term, termIndex) => (
            <Fragment key={termIndex}>
              {termIndex > 0 ? <span className="mx-0.5">+</span> : null}
              <ReactionFormulaTerm term={term} />
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  )
}

function numberCell(darkMode: boolean, value: number | string | null | undefined, helpTitle?: string) {
  return (
    <BatchTableNumericReadonly
      darkMode={darkMode}
      value={value == null ? '' : value}
      applicable={value != null && value !== ''}
      className={HEAT_TABLE_TEXT}
      helpTitle={helpTitle}
    />
  )
}

function tableTone(darkMode: boolean) {
  return {
    border: darkMode ? 'border-gray-600' : 'border-gray-200',
    head: darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600',
    total: darkMode ? 'bg-gray-900/40' : 'bg-gray-50/80',
  }
}

function heatFlowTone(darkMode: boolean, side: 'income' | 'expenditure') {
  if (side === 'income') {
    return {
      border: darkMode ? 'border-emerald-800' : 'border-emerald-200',
      head: darkMode ? 'bg-emerald-950/60 text-emerald-100' : 'bg-emerald-50 text-emerald-900',
      total: darkMode ? 'bg-emerald-950/35' : 'bg-emerald-50/80',
    }
  }
  return {
    border: darkMode ? 'border-rose-800' : 'border-rose-200',
    head: darkMode ? 'bg-rose-950/60 text-rose-100' : 'bg-rose-50 text-rose-900',
    total: darkMode ? 'bg-rose-950/35' : 'bg-rose-50/80',
  }
}

function heatTypeLabel(type: HeatFlowRow['type']) {
  if (type === 'physical') return '物理热'
  if (type === 'chemical') return '化学热'
  if (type === 'exchange') return '交换热'
  return '散热'
}

function displayHeatFlowRows(rows: HeatFlowRow[], side: 'income' | 'expenditure') {
  return rows.flatMap((row) => {
    if (side === 'income' && row.material.includes('冷却水')) return []
    if (side === 'income' && (row.material === '燃料煤燃烧热' || row.material === '入炉燃料煤燃烧热')) return []
    if (side === 'income' && (row.material.includes('补充燃料煤') || row.material.includes('补充煤'))) return []
    return [row]
  })
}

function BalanceHalfTable({
  darkMode,
  title,
  rows,
  side,
}: {
  darkMode: boolean
  title: string
  rows: HeatFlowRow[]
  side: 'income' | 'expenditure'
}) {
  const tone = heatFlowTone(darkMode, side)
  const cellBorder = `border ${tone.border}`
  const displayRows = displayHeatFlowRows(rows, side)
  const total = displayRows.reduce((sum, row) => {
    if (row.isSubtotal) return sum
    const isError = row.isBalanceError || row.material === '误差'
    return sum + (isError ? row.heatMJh : Math.max(0, row.heatMJh))
  }, 0)
  const subtotalRowClass = darkMode ? 'bg-gray-800/50' : 'bg-gray-100'
  const errorRowClass = darkMode ? 'bg-red-900/45' : 'bg-red-100'
  const errorOutOfBandRowClass = darkMode ? 'bg-red-800/60 font-semibold' : 'bg-red-200 font-semibold'

  return (
    <div className={`overflow-auto rounded-lg border ${tone.border}`}>
      <table className={`w-full min-w-[420px] table-fixed border-collapse ${HEAT_TABLE_TEXT}`}>
        <thead className={tone.head}>
          <tr>
            <th colSpan={6} className={`${HEAT_TABLE_HEAD} ${cellBorder}`}>
              {title}
            </th>
          </tr>
          <tr>
            <th className={`w-10 ${HEAT_TABLE_HEAD} ${cellBorder}`}>序号</th>
            <th className={`w-20 ${HEAT_TABLE_HEAD} ${cellBorder}`}>热类型</th>
            <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`}>物料</th>
            <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`} style={{ width: BATCH_TABLE_PCT_COL_WIDTH }}>温度/℃</th>
            <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`} style={{ width: BATCH_TABLE_MASS_COL_WIDTH }}>MJ/h</th>
            <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`} style={{ width: BATCH_TABLE_PCT_COL_WIDTH }}>%</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.map((row, index) => {
            const isError = row.isBalanceError || row.material === '误差'
            const heatForPercent = isError ? row.heatMJh : Math.max(0, row.heatMJh)
            const percent = total !== 0 ? (heatForPercent / Math.abs(total)) * 100 : 0
            const rowClass = isError
              ? row.isBalanceErrorOutOfBand
                ? errorOutOfBandRowClass
                : errorRowClass
              : row.isSubtotal
                ? subtotalRowClass
                : undefined
            return (
            <tr
              key={`${title}-${row.material}-${index}`}
              className={rowClass}
            >
              <td className={`${HEAT_TABLE_CELL} ${cellBorder}`}>{row.isSubtotal ? '小计' : index + 1}</td>
              <td className={`${HEAT_TABLE_CELL} ${cellBorder}`}>
                {heatTypeLabel(row.type)}
              </td>
              <td className={`${HEAT_TABLE_CELL} ${row.isSubtotal || isError ? 'font-semibold' : ''} ${cellBorder}`}>
                {row.material}
              </td>
              <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
                {numberCell(darkMode, row.temperature)}
              </td>
              <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
                {numberCell(darkMode, row.heatMJh)}
              </td>
              <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
                {numberCell(darkMode, percent)}
              </td>
            </tr>
            )
          })}
          <tr className={tone.total}>
            <td colSpan={4} className={`${HEAT_TABLE_CELL} font-semibold ${cellBorder}`}>
              合计
            </td>
            <td className={`${HEAT_TABLE_CELL} font-mono font-semibold ${cellBorder}`}>
              {numberCell(darkMode, total)}
            </td>
            <td className={`${HEAT_TABLE_CELL} font-mono font-semibold ${cellBorder}`}>
              {numberCell(darkMode, displayRows.length > 0 ? 100 : null)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

type ComponentHeatMatrixSide = 'input' | 'output'

type ComponentHeatMatrixGroup = {
  section: string
  rows: Array<{ component: string; heatMJh: number }>
  total: number
  orderIndex: number
}

const COMPONENT_HEAT_EPSILON = 1e-9

function normalizeComponentHeatSection(section: string, side: ComponentHeatMatrixSide) {
  const name = section.trim() || '未命名'
  if (side === 'input') {
    if (name.endsWith('含水') && name.length > '含水'.length) return name.slice(0, -'含水'.length)
    if (name.includes('燃料煤') || name.includes('热平衡煤') || name === '煤') return '煤'
  }
  return name
}

function inputComponentHeatPriority(section: string) {
  if (section.includes('铜精矿') || section.includes('精矿')) return 0
  if (section.includes('石英') || section.includes('熔剂') || section.includes('石灰')) return 1
  if (section.includes('煤') || section.includes('燃料')) return 2
  if (section.includes('含水')) return 3
  if (section.includes('空气') || section.includes('氧气') || section.includes('风')) return 4
  if (section.includes('冷却水')) return 5
  return 6
}

function componentEnthalpy298MJh(kmolh: number, enthalpy25KJmol: number | null): number {
  return enthalpy25KJmol == null ? 0 : kmolh * enthalpy25KJmol
}

function componentEnthalpyTMJh(kmolh: number, enthalpyTKJmol: number | null): number {
  return enthalpyTKJmol == null ? 0 : kmolh * enthalpyTKJmol
}

function enthalpySummaryValue(group: HeatEnthalpyMatrixGroup, side: ComponentHeatMatrixSide) {
  return side === 'output' ? group.totalT - group.total298 : group.totalT
}

function outputComponentHeatPriority(section: string) {
  if (section.includes('熔炼渣') || (section.includes('渣') && !section.includes('烟'))) return 0
  if (section.includes('白铜锍') || section.includes('铜锍')) return 1
  if (section.includes('熔炼出炉烟气') || (section.includes('烟气') && !section.includes('尘') && !section.includes('无组织'))) return 2
  if (section.includes('烟气含尘') || (section.includes('尘') && section.includes('烟'))) return 3
  if (section.includes('无组织')) return 4
  if (section.includes('损失')) return 5
  return 6
}

function buildComponentHeatMatrixGroups(rows: HeatComponentRow[], side: ComponentHeatMatrixSide) {
  const groups = new Map<
    string,
    {
      components: Map<string, { component: string; heatMJh: number; orderIndex: number }>
      orderIndex: number
    }
  >()

  rows.forEach((row, rowIndex) => {
    if (row.massTh <= 0 && Math.abs(row.heatMJh) <= COMPONENT_HEAT_EPSILON) return
    const section = normalizeComponentHeatSection(row.section, side)
    const group = groups.get(section) ?? { components: new Map(), orderIndex: rowIndex }
    const current = group.components.get(row.component) ?? {
      component: row.component,
      heatMJh: 0,
      orderIndex: rowIndex,
    }
    current.heatMJh += row.heatMJh
    group.components.set(row.component, current)
    groups.set(section, group)
  })

  return [...groups.entries()]
    .map(([section, group]): ComponentHeatMatrixGroup => {
      const componentRows = [...group.components.values()]
        .sort((a, b) => a.orderIndex - b.orderIndex)
        .map(({ component, heatMJh }) => ({ component, heatMJh }))
      return {
        section,
        rows: componentRows,
        total: componentRows.reduce((sum, row) => sum + row.heatMJh, 0),
        orderIndex: group.orderIndex,
      }
    })
    .sort((a, b) => {
      const priorityA = side === 'input' ? inputComponentHeatPriority(a.section) : outputComponentHeatPriority(a.section)
      const priorityB = side === 'input' ? inputComponentHeatPriority(b.section) : outputComponentHeatPriority(b.section)
      return priorityA - priorityB || a.orderIndex - b.orderIndex
    })
}

function ComponentHeatMatrix({
  darkMode,
  rows,
  title,
  side,
}: {
  darkMode: boolean
  rows: HeatComponentRow[]
  title: string
  side: ComponentHeatMatrixSide
}) {
  const tone = tableTone(darkMode)
  const cellBorder = `border ${tone.border}`
  const groups = buildComponentHeatMatrixGroups(rows, side)
  const maxRowCount = Math.max(0, ...groups.map((group) => group.rows.length))
  const total = groups.reduce((sum, group) => sum + group.total, 0)
  const minWidth = Math.max(360, 56 + groups.length * 176)

  if (groups.length === 0) {
    return (
      <div className={`overflow-auto rounded-lg border ${tone.border}`}>
        <table className={`w-full table-fixed border-collapse ${HEAT_TABLE_TEXT}`}>
          <tbody>
            <tr>
              <td className={`px-2 py-4 text-center ${cellBorder} ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                —
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }

  return (
    <div className={`overflow-auto rounded-lg border ${tone.border}`}>
      <table className={`w-full table-fixed border-collapse ${HEAT_TABLE_TEXT}`} style={{ minWidth }}>
        <thead className={tone.head}>
          <tr>
            <th rowSpan={2} className={`w-12 ${HEAT_TABLE_HEAD} ${cellBorder}`}>№</th>
            {groups.map((group) => (
              <th key={group.section} colSpan={2} className={`${HEAT_TABLE_HEAD} ${cellBorder}`}>
                {group.section}
              </th>
            ))}
          </tr>
          <tr>
            {groups.map((group) => (
              <Fragment key={`${group.section}-headers`}>
                <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`}>组分</th>
                <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`} style={{ width: BATCH_TABLE_MASS_COL_WIDTH }}>MJ/h</th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: maxRowCount }).map((_, rowIndex) => (
            <tr key={`${title}-${rowIndex}`}>
              <td className={`${HEAT_TABLE_CELL} ${cellBorder}`}>{rowIndex + 1}</td>
              {groups.map((group) => {
                const row = group.rows[rowIndex]
                return (
                  <Fragment key={`${group.section}-${rowIndex}`}>
                    <td className={`${HEAT_TABLE_CELL} ${cellBorder}`}>
                      {row ? <PhaseFormula value={row.component} /> : ''}
                    </td>
                    <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
                      {row ? numberCell(darkMode, row.heatMJh) : ''}
                    </td>
                  </Fragment>
                )
              })}
            </tr>
          ))}
          <tr className={tone.total}>
            <td className={`${HEAT_TABLE_CELL} font-semibold ${cellBorder}`}>合计</td>
            {groups.map((group) => (
              <Fragment key={`${group.section}-total`}>
                <td className={`${HEAT_TABLE_CELL} font-semibold ${cellBorder}`}>合计</td>
                <td className={`${HEAT_TABLE_CELL} font-mono font-semibold ${cellBorder}`}>
                  {numberCell(darkMode, group.total)}
                </td>
              </Fragment>
            ))}
          </tr>
          <tr className={tone.total}>
            <td colSpan={groups.length * 2} className={`${HEAT_TABLE_CELL} text-right font-semibold ${cellBorder}`}>
              总计
            </td>
            <td className={`${HEAT_TABLE_CELL} font-mono font-semibold ${cellBorder}`}>
              {numberCell(darkMode, total)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

type HeatEnthalpyMatrixRow = {
  component: string
  kmolh: number
  enthalpy298MJh: number
  enthalpyTMJh: number
  orderIndex: number
}

type HeatEnthalpyMatrixGroup = {
  section: string
  rows: HeatEnthalpyMatrixRow[]
  total298: number
  totalT: number
  orderIndex: number
  temperature: number | null
}

function buildHeatEnthalpyMatrixGroups(
  rows: HeatComponentRow[],
  side: ComponentHeatMatrixSide
): HeatEnthalpyMatrixGroup[] {
  const groups = new Map<
    string,
    {
      components: Map<string, HeatEnthalpyMatrixRow>
      orderIndex: number
      temperature: number | null
    }
  >()

  rows.forEach((row, rowIndex) => {
    if (row.massTh <= 0 && Math.abs(row.heatMJh) <= COMPONENT_HEAT_EPSILON) return
    const section = normalizeComponentHeatSection(row.section, side)
    const group = groups.get(section) ?? {
      components: new Map<string, HeatEnthalpyMatrixRow>(),
      orderIndex: rowIndex,
      temperature: row.temperature,
    }
    if (group.temperature == null) group.temperature = row.temperature
    const molarMass = copperHeatPhaseMolarMass(row.component)
    const kmolh = molarMass > 0 ? (row.massTh * 1000) / molarMass : 0
    const current = group.components.get(row.component) ?? {
      component: row.component,
      kmolh: 0,
      enthalpy298MJh: 0,
      enthalpyTMJh: 0,
      orderIndex: rowIndex,
    }
    current.kmolh += kmolh
    current.enthalpy298MJh += componentEnthalpy298MJh(kmolh, row.enthalpy25KJmol)
    current.enthalpyTMJh += componentEnthalpyTMJh(kmolh, row.enthalpyTKJmol)
    group.components.set(row.component, current)
    groups.set(section, group)
  })

  return [...groups.entries()]
    .map(([section, group]) => {
      const matrixRows = [...group.components.values()].sort((a, b) => a.orderIndex - b.orderIndex)
      return {
        section,
        rows: matrixRows,
        total298: matrixRows.reduce((sum, row) => sum + row.enthalpy298MJh, 0),
        totalT: matrixRows.reduce((sum, row) => sum + row.enthalpyTMJh, 0),
        orderIndex: group.orderIndex,
        temperature: group.temperature,
      }
    })
    .sort((a, b) => {
      const priorityA = side === 'input' ? inputComponentHeatPriority(a.section) : outputComponentHeatPriority(a.section)
      const priorityB = side === 'input' ? inputComponentHeatPriority(b.section) : outputComponentHeatPriority(b.section)
      return priorityA - priorityB || a.orderIndex - b.orderIndex
    })
}

function HeatEnthalpyTable({
  darkMode,
  rows,
  title,
  side,
}: {
  darkMode: boolean
  rows: HeatComponentRow[]
  title: string
  side: ComponentHeatMatrixSide
}) {
  const tone = tableTone(darkMode)
  const cellBorder = `border ${tone.border}`
  const groups = buildHeatEnthalpyMatrixGroups(rows, side)
  const maxRowCount = Math.max(0, ...groups.map((group) => group.rows.length))
  const minWidth = Math.max(480, 56 + groups.length * 400)

  return (
    <div className={`overflow-auto rounded-lg border ${tone.border}`}>
      <table className={`w-full table-fixed border-collapse ${HEAT_TABLE_TEXT}`} style={{ minWidth }}>
        <thead className={tone.head}>
          <tr>
            <th rowSpan={2} className={`w-12 ${HEAT_TABLE_HEAD} ${cellBorder}`}>№</th>
            {groups.map((group) => (
              <th key={group.section} colSpan={4} className={`${HEAT_TABLE_HEAD} ${cellBorder}`}>
                {group.section}
              </th>
            ))}
          </tr>
          <tr>
            {groups.map((group) => (
              <Fragment key={`${group.section}-headers`}>
                <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`}>组分</th>
                <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`}>kmol/h</th>
                <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`}>
                  <EnthalpySymbol kelvin={298} />
                </th>
                <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`}>
                  <EnthalpySymbol kelvin={enthalpyKelvinFromTemperature(group.temperature)} />
                </th>
              </Fragment>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.length === 0 ? (
            <tr>
              <td colSpan={1 + groups.length * 4} className={`px-2 py-4 text-center ${cellBorder} ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                —
              </td>
            </tr>
          ) : (
            Array.from({ length: maxRowCount }).map((_, rowIndex) => (
              <tr key={`${title}-${rowIndex}`}>
                <td className={`${HEAT_TABLE_CELL} ${cellBorder}`}>{rowIndex + 1}</td>
                {groups.map((group) => {
                  const row = group.rows[rowIndex]
                  return (
                    <Fragment key={`${group.section}-${rowIndex}`}>
                      <td className={`${HEAT_TABLE_CELL} ${cellBorder}`}>
                        {row ? <PhaseFormula value={row.component} /> : ''}
                      </td>
                      <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
                        {row ? numberCell(darkMode, row.kmolh) : ''}
                      </td>
                      <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
                        {row ? numberCell(darkMode, row.enthalpy298MJh) : ''}
                      </td>
                      <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
                        {row ? numberCell(darkMode, row.enthalpyTMJh) : ''}
                      </td>
                    </Fragment>
                  )
                })}
              </tr>
            ))
          )}
          <tr className={tone.total}>
            <td className={`${HEAT_TABLE_CELL} ${cellBorder}`}>合计</td>
            {groups.map((group) => (
              <Fragment key={`${group.section}-total`}>
                <td colSpan={2} className={`${HEAT_TABLE_CELL} ${cellBorder}`}>
                  {side === 'output' ? <EnthalpyDifferenceSymbol temperatureC={group.temperature} /> : null}
                </td>
                <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
                  {numberCell(darkMode, group.total298)}
                </td>
                <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
                  {numberCell(darkMode, group.totalT)}
                </td>
              </Fragment>
            ))}
          </tr>
          <tr className={tone.total}>
            <td className={`${HEAT_TABLE_CELL} font-bold ${cellBorder}`}>合计</td>
            {groups.map((group) => (
              <Fragment key={`${group.section}-summary`}>
                <td colSpan={2} className={`${HEAT_TABLE_CELL} ${cellBorder}`}></td>
                <td colSpan={2} className={`${HEAT_TABLE_CELL} font-mono font-bold ${cellBorder}`}>
                  {numberCell(darkMode, enthalpySummaryValue(group, side))}
                </td>
              </Fragment>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function reactionExtentHelpTitle(row: HeatReactionTerm) {
  const parts = [
    row.note,
    `入炉量 kmol/h：${row.inputExtentKmolh.toFixed(4)}（入炉该基准相的量）`,
    `实际反应 kmol/h：${row.extentKmolh.toFixed(4)}（入炉量扣产物残留，再经顺序消耗与产物锚定）`,
    row.extentSource === 'coupled'
      ? '已与产出耦合：产物中残留的相不再作为反应物；部分反应由产物量锚定（如 Fe3O4、Cu2O、造渣）。'
      : '仅按入炉量估算（尚未耦合产出）',
  ].filter(Boolean)
  return parts.join('\n')
}

function reactionInputExtentHelpTitle(row: HeatReactionTerm) {
  if (row.limitingPhase === 'C') {
    return '燃料煤入炉碳的摩尔流量；换算煤干量 = kmol/h × 12.011 / 1000 ÷ C%'
  }
  return '入炉物料中该基准相的摩尔流量'
}

function reactionActualExtentHelpTitle(row: HeatReactionTerm) {
  if (row.limitingPhase === 'C') {
    return 'C+O₂→CO₂ 实际反应量，受前面反应耗氧与顺序扣池限制；不可直接当作煤干量'
  }
  return '扣除产物残留并经顺序扣池后的实际反应量；产物锚定反应（如 Fe3O4、Cu2O）另受产物量上限约束'
}

function isFuelCarbonReaction(row: HeatReactionTerm) {
  return row.limitingPhase === 'C' && row.reactants.C === 1 && row.products.CO2 === 1
}

function FuelCoalCrosscheckDetails({
  darkMode,
  crosscheck,
}: {
  darkMode: boolean
  crosscheck: FuelCoalCrosscheck
}) {
  const tone = darkMode ? 'border-amber-700/60 bg-amber-950/25 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-950'
  const muted = darkMode ? 'text-amber-200/80' : 'text-amber-900/80'
  const rows: Array<{ label: string; value: string; help?: string }> = [
    { label: '热平衡总煤量', value: `${crosscheck.fuelWeightTh.toFixed(3)} t/h` },
    ...(crosscheck.ratioReferenceFuelWeightTh != null
      ? [
          {
            label: '煤/精矿比参考',
            value: `${crosscheck.ratioReferenceFuelWeightTh.toFixed(3)} t/h`,
            help: '产出初值，仅对照，不作为热平衡初值',
          },
          ...(crosscheck.ratioReferenceDeviationTh != null
            ? [
                {
                  label: '与参考差值',
                  value: `${crosscheck.ratioReferenceDeviationTh >= 0 ? '+' : ''}${crosscheck.ratioReferenceDeviationTh.toFixed(3)} t/h`,
                },
              ]
            : []),
        ]
      : []),
    {
      label: '煤投入碳',
      value: `${crosscheck.inputCarbonKmolh.toFixed(2)} kmol/h（${crosscheck.inputCarbonMassTh.toFixed(3)} t/h）`,
      help: '来自燃料煤物相/化验 C%',
    },
    {
      label: '已反应碳（C+O₂）',
      value: `${crosscheck.reactedCarbonKmolh.toFixed(2)} kmol/h（${crosscheck.reactedCarbonMassTh.toFixed(3)} t/h）`,
      help: '反应表「实际反应 kmol/h」',
    },
    {
      label: '碳燃尽率',
      value: `${crosscheck.carbonUtilizationPct.toFixed(1)}%`,
      help: crosscheck.o2Limited ? 'O₂ 不足导致部分煤碳未计入放热反应' : '投入碳均已反应',
    },
    {
      label: '已反应等效煤量',
      value: `${crosscheck.inferredCoalFromReactedCarbonTh.toFixed(3)} t/h`,
      help: '已反应碳 ÷ C%；不是配料煤干量',
    },
    {
      label: '未反应等效煤量',
      value: `${crosscheck.unreactedCoalEquivalentTh.toFixed(3)} t/h`,
      help: '可提高二次风供氧以减少此项',
    },
    {
      label: '供氧约束估算燃烧碳',
      value: `${crosscheck.oxygenConstraintCarbonKmolh.toFixed(2)} kmol/h（煤碳×${crosscheck.oxygenConstraintFactor}）`,
      help: '二次风初值/硬约束口径，煤碳按 70% 参与供氧估算',
    },
  ]

  return (
    <div className={`rounded-lg border px-3 py-3 text-sm ${tone}`}>
      <p className="font-medium">燃料煤量对照</p>
      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.label} className="min-w-0" title={row.help}>
            <dt className={`text-xs ${muted}`}>{row.label}</dt>
            <dd className="font-mono">{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  )
}

function fuelCoalDetailButtonClass(darkMode: boolean) {
  return `ml-2 shrink-0 rounded border px-2 py-0.5 text-xs font-medium transition-colors ${
    darkMode
      ? 'border-blue-600/60 text-blue-300 hover:bg-blue-950/40'
      : 'border-blue-300 text-blue-700 hover:bg-blue-50'
  }`
}

function ReactionTable({ darkMode, result }: { darkMode: boolean; result: CopperHeatBalanceResult }) {
  const [fuelCoalDetailsOpen, setFuelCoalDetailsOpen] = useState(false)
  const tone = tableTone(darkMode)
  const cellBorder = `border ${tone.border}`
  const columnWidths = [52, 360, 88, 120, 120, 112, 120]
  const rows = result.equations.filter((row) => Math.abs(row.heatMJh) > 1e-9)
  const releaseMJh = result.chemicalHeatReleaseMJh
  const absorptionMJh = result.chemicalHeatAbsorptionMJh
  const pathNetMJh = result.chemicalHeatPathMJh ?? releaseMJh - absorptionMJh
  const hessNetMJh = result.chemicalHeatMJh
  const crosscheck = result.fuelCoalCrosscheck
  return (
    <div className="space-y-3">
      <div className={`overflow-auto rounded-lg border ${tone.border}`}>
      <table className={`w-full table-fixed border-collapse ${HEAT_TABLE_TEXT}`} style={{ minWidth: 1080 }}>
        <colgroup>
          {columnWidths.map((width, index) => (
            <col key={index} style={{ width }} />
          ))}
        </colgroup>
        <thead className={tone.head}>
          <tr>
            <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`}>序号</th>
            <th className={`px-3 py-2 text-left ${HEAT_TABLE_TEXT} ${cellBorder}`}>反应</th>
            <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`}>基准相</th>
            <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`} title="入炉物料中该基准相的摩尔流量">
              入炉量 kmol/h
            </th>
            <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`} title="扣除产物残留并经顺序扣池、产物锚定后的实际反应量">
              实际反应 kmol/h
            </th>
            <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`}>
              <EnthalpyHeaderWithUnit unit="kJ/mol" />
            </th>
            <th className={`${HEAT_TABLE_HEAD} ${cellBorder}`}>热量 MJ/h</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className={`px-2 py-4 text-center ${cellBorder} ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                —
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr key={`${row.formula}-${row.limitingPhase}-${index}`}>
                <td className={`${HEAT_TABLE_CELL} ${cellBorder}`}>{index + 1}</td>
                <td className={`px-3 py-1.5 text-left ${HEAT_TABLE_TEXT} ${cellBorder}`} title={reactionExtentHelpTitle(row)}>
                  <div className="flex flex-wrap items-center gap-x-1 gap-y-1">
                    <ReactionFormula value={row.formula} />
                    {isFuelCarbonReaction(row) && crosscheck ? (
                      <button
                        type="button"
                        className={fuelCoalDetailButtonClass(darkMode)}
                        onClick={() => setFuelCoalDetailsOpen((open) => !open)}
                        aria-expanded={fuelCoalDetailsOpen}
                      >
                        {fuelCoalDetailsOpen ? '收起详情' : '查看详情'}
                      </button>
                    ) : null}
                  </div>
                </td>
                <td className={`${HEAT_TABLE_CELL} ${cellBorder}`}>
                  <PhaseFormula value={row.limitingPhase} />
                </td>
                <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
                  {numberCell(darkMode, row.inputExtentKmolh, reactionInputExtentHelpTitle(row))}
                </td>
                <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
                  {numberCell(
                    darkMode,
                    row.extentKmolh,
                    reactionActualExtentHelpTitle(row)
                  )}
                </td>
                <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
                  {numberCell(darkMode, row.reactionHeatKJmol)}
                </td>
                <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
                  {numberCell(darkMode, row.heatMJh)}
                </td>
              </tr>
            ))
          )}
          <tr className={tone.total}>
            <td colSpan={6} className={`${HEAT_TABLE_CELL} text-right ${cellBorder}`}>
              放热合计
            </td>
            <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
              {numberCell(darkMode, releaseMJh)}
            </td>
          </tr>
          <tr className={tone.total}>
            <td colSpan={6} className={`${HEAT_TABLE_CELL} text-right ${cellBorder}`}>
              吸热合计
            </td>
            <td className={`${HEAT_TABLE_CELL} font-mono ${cellBorder}`}>
              {numberCell(darkMode, absorptionMJh)}
            </td>
          </tr>
          <tr className={tone.total}>
            <td colSpan={6} className={`${HEAT_TABLE_CELL} font-semibold text-right ${cellBorder}`}>
              路径净化学热
            </td>
            <td className={`${HEAT_TABLE_CELL} font-mono font-semibold ${cellBorder}`}>
              {numberCell(darkMode, pathNetMJh)}
            </td>
          </tr>
          <tr className={tone.total}>
            <td colSpan={6} className={`${HEAT_TABLE_CELL} font-semibold text-right ${cellBorder}`}>
              总表化学热（Hess）
            </td>
            <td className={`${HEAT_TABLE_CELL} font-mono font-semibold ${cellBorder}`}>
              {numberCell(darkMode, hessNetMJh)}
            </td>
          </tr>
        </tbody>
      </table>
      </div>
      {fuelCoalDetailsOpen && crosscheck ? (
        <FuelCoalCrosscheckDetails darkMode={darkMode} crosscheck={crosscheck} />
      ) : null}
      <p className={`text-xs leading-relaxed ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
        路径净化学热 = 放热合计 − 吸热合计，仅供反应解释；热量总表与 MetCal 对齐，采用进出物流 ΣΔH298 差（Hess）。
        {Math.abs(pathNetMJh - hessNetMJh) > 1e-3
          ? ` 路径与 Hess 差额 ${(pathNetMJh - hessNetMJh).toFixed(2)} MJ/h（含水蒸发、Other 等已含于 Hess）。`
          : null}
      </p>
    </div>
  )
}

function HeatAuxiliaryMetric({
  darkMode,
  label,
  value,
  unit,
  onAskHow,
}: {
  darkMode: boolean
  label: string
  value: string
  unit: string
  onAskHow: () => void
}) {
  return (
    <div
      className={`min-w-0 rounded-md border px-2.5 py-2 ${
        darkMode ? 'border-gray-600 bg-gray-800/30' : 'border-gray-200 bg-gray-50/70'
      }`}
    >
      <div className="flex items-start justify-between gap-1">
        <div className={`min-w-0 flex-1 text-sm ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          <span className="break-words">{label}</span>
          <span className={`ml-1 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>({unit})</span>
        </div>
        <button
          type="button"
          onClick={onAskHow}
          className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-xs font-semibold leading-none transition-colors ${
            darkMode
              ? 'border-gray-500 text-gray-200 hover:border-blue-400 hover:bg-blue-950/50 hover:text-blue-200'
              : 'border-gray-300 text-gray-600 hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700'
          }`}
          title={`${label}如何计算？`}
          aria-label={`${label}如何计算？`}
        >
          ?
        </button>
      </div>
      <div className={`mt-1 truncate font-mono text-base ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
        {value}
      </div>
    </div>
  )
}

function HeatAuxiliaryParamsStrip({
  darkMode,
  concentrateMassTh,
  productResult,
  airColumns,
}: {
  darkMode: boolean
  concentrateMassTh: number
  productResult: OxyConstraintSolverResult | null | undefined
  airColumns: CopperMaterialColumn[] | null | undefined
}) {
  const { askAssistant, setAssistantSnapshot } = useAssistantContext()

  const { params, trace } = useMemo(
    () =>
      calculateCopperHeatAuxiliaryWithTrace({
        concentrateMassTh,
        productResult,
        airColumns,
      }),
    [airColumns, concentrateMassTh, productResult]
  )

  useEffect(() => {
    setAssistantSnapshot((prev) => ({
      ...(prev ?? {
        currentView: 'module' as const,
        aboutDepartment: null,
        language: 'zh' as const,
        selectedMethod: null,
        activeSheet: 'cu_smelting' as const,
        materialCount: 0,
        mixTotalWeight: null,
        totalCostPerHour: 0,
        materialsPreview: [],
      }),
      heatAuxiliaryParams: params,
      heatAuxiliaryTrace: trace,
    }))
  }, [params, trace, setAssistantSnapshot])

  const items: Array<{ key: HeatAuxiliaryParamKey; label: string; unit: string; value: string }> =
    HEAT_AUXILIARY_EXPLAIN_ITEMS.map((item) => ({
      key: item.key,
      label: item.label,
      unit: item.unit,
      value: formatAuxiliaryParam(params[item.key], 2),
    }))

  const askHowCalculated = (label: string) => {
    askAssistant(`${label}如何计算？`)
  }

  return (
    <div className={`rounded-lg border p-3 ${darkMode ? 'border-gray-600 bg-gray-900/40' : 'border-gray-200 bg-white'}`}>
      <h4 className={`mb-3 text-sm font-semibold ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
        热平衡相关参数
      </h4>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {items.map((item) => (
          <HeatAuxiliaryMetric
            key={item.key}
            darkMode={darkMode}
            label={item.label}
            value={item.value}
            unit={item.unit}
            onAskHow={() => askHowCalculated(item.label)}
          />
        ))}
      </div>
    </div>
  )
}

export function CopperHeatBalancePlaceholderTables({
  darkMode,
  result,
  concentrateMassTh = 0,
  productResult,
  airColumns,
}: {
  darkMode: boolean
  result: CopperHeatBalanceResult
  concentrateMassTh?: number
  productResult?: OxyConstraintSolverResult | null
  airColumns?: CopperMaterialColumn[] | null
}) {
  const [activeTab, setActiveTab] = useState<HeatBalanceResultTab>('summary')
  const resolvedProductResult = productResult ?? result.finalProductResult
  const resolvedAirColumns = airColumns ?? result.finalAirColumns ?? null

  return (
    <div className="space-y-4">
      <HeatAuxiliaryParamsStrip
        darkMode={darkMode}
        concentrateMassTh={concentrateMassTh}
        productResult={resolvedProductResult}
        airColumns={resolvedAirColumns}
      />

      <div className={`flex flex-wrap gap-1 border-b px-1 pt-1 ${darkMode ? 'border-gray-600' : 'border-gray-300'}`}>
        {HEAT_BALANCE_RESULT_TABS.map((tab) => {
          const active = tab.id === activeTab
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-w-24 rounded-t-md border px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? darkMode
                    ? 'border-blue-500 border-b-gray-900 bg-gray-900 text-gray-100'
                    : 'border-blue-500 border-b-white bg-white text-gray-900'
                  : darkMode
                    ? 'border-gray-700 border-b-transparent bg-gray-900/40 text-gray-400 hover:text-gray-200'
                    : 'border-gray-200 border-b-transparent bg-gray-100 text-gray-600 hover:text-gray-900'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>

      {activeTab === 'summary' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
            <BalanceHalfTable darkMode={darkMode} title="热收入" rows={result.heatIncomeRows} side="income" />
            <BalanceHalfTable darkMode={darkMode} title="热支出" rows={result.heatExpenditureRows} side="expenditure" />
          </div>
        </div>
      )}

      {activeTab === 'reactions' && (
        <div>
          <ReactionTable darkMode={darkMode} result={result} />
        </div>
      )}

      {activeTab === 'inputPhysical' && (
        <div>
          <ComponentHeatMatrix darkMode={darkMode} rows={result.inputPhysicalRows} title="投入组分物理热（热焓差法）" side="input" />
        </div>
      )}

      {activeTab === 'outputCarried' && (
        <div>
          <HeatEnthalpyTable darkMode={darkMode} rows={result.outputPhysicalRows} title="产物组分热焓" side="output" />
        </div>
      )}

      {activeTab === 'inputEnthalpy' && (
        <div>
          <HeatEnthalpyTable darkMode={darkMode} rows={result.inputPhysicalRows} title="投入组分热焓" side="input" />
        </div>
      )}

    </div>
  )
}
