import { Fragment, useEffect, useRef, useState } from 'react'

import type { OxyConstraintSolverResult } from '../../utils/copperConstraintSolver.ts'

import { OXY_PRODUCT_KEY_TO_CN, OXY_SIDE_BLOW_PRODUCT_KEYS } from '../../utils/copperConstraintConfig.ts'

import type { OxySideBlowProductKey } from '../../utils/copperConstraintConfig.ts'

import {

  BATCH_TABLE_MASS_COL_WIDTH,

  BATCH_TABLE_PCT_COL_WIDTH,

  BATCH_TABLE_SHARE_COL_WIDTH,

  BATCH_TABLE_MASS_ABS_MIN,
  BATCH_TABLE_NAME_COL_MIN,
  BATCH_TABLE_PCT_ABS_MIN,
  fitBatchTableToViewport,

  oxyProductShareHighlightClass,

  oxyProductToneClass,

} from '../../utils/copperBatchTableLayout.ts'

import { phaseStorageKeyToDisplayLabel } from '../../utils/copperPhaseTableCalc.ts'

import { calculateGasVolumePercents } from '../../utils/copperProductPhaseCalc.ts'

import { formatBatchTableFull } from '../../utils/batchTableNumeric.ts'

import { BatchTableNumericReadonly } from './BatchTableNumericCell.tsx'

import { CopperBatchTableColGroup } from './CopperBatchTableColGroup'



const PRODUCT_NAME_COL_WIDTH = 144



function formatMassSource(value: number): string {

  if (!Number.isFinite(value)) return '—'

  if (value === 0) return '0'

  if (Math.abs(value) < 0.0001) return value.toExponential(2)

  return formatBatchTableFull(value)

}



function phaseLabel(key: string) {

  return phaseStorageKeyToDisplayLabel(key)

}



function productDataCellClass(dark: boolean, pk: OxySideBlowProductKey, extra = '') {

  return `border-t px-1 py-1.5 align-middle text-center text-sm ${oxyProductToneClass(dark, pk)} ${extra}`.trim()

}



function productStickyNameCellClass(dark: boolean, pk: OxySideBlowProductKey) {

  return `sticky left-0 z-20 border-t px-2 py-1.5 align-middle text-center text-sm font-semibold ${oxyProductToneClass(dark, pk)}`

}



export function CopperProductionResultTable({

  darkMode,

  result,

  empty = false,

}: {

  darkMode: boolean

  result?: OxyConstraintSolverResult | null

  empty?: boolean

}) {

  const border = darkMode ? 'border-gray-600' : 'border-gray-200'

  const head = darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'

  const shareHighlight = oxyProductShareHighlightClass(darkMode)



  const showEmpty = empty || !result

  const maxPhaseCols = showEmpty

    ? 1

    : Math.max(...OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => result!.products[pk].phases.length), 1)

  const totalMass = showEmpty ? 0 : result!.totalProductMass

  const colCount = maxPhaseCols + 3



  const containerRef = useRef<HTMLDivElement>(null)

  const [viewportWidth, setViewportWidth] = useState(0)



  useEffect(() => {

    const el = containerRef.current

    if (!el) return

    const update = () => setViewportWidth(el.clientWidth)

    update()

    const ro = new ResizeObserver(update)

    ro.observe(el)

    return () => ro.disconnect()

  }, [])



  const minWidths = [

    PRODUCT_NAME_COL_WIDTH,

    BATCH_TABLE_MASS_COL_WIDTH,

    BATCH_TABLE_SHARE_COL_WIDTH,

    ...Array.from({ length: maxPhaseCols }, () => BATCH_TABLE_PCT_COL_WIDTH),

  ]

  const flexIndices = [1, 2, ...Array.from({ length: maxPhaseCols }, (_, index) => 3 + index)]

  const absMins = [
    BATCH_TABLE_NAME_COL_MIN,
    BATCH_TABLE_MASS_ABS_MIN,
    BATCH_TABLE_PCT_ABS_MIN,
    ...Array.from({ length: maxPhaseCols }, () => BATCH_TABLE_PCT_ABS_MIN),
  ]
  const { widths: colWidths, tableWidth: resolvedTableWidth } = fitBatchTableToViewport(
    minWidths,
    viewportWidth,
    { flexibleIndices: flexIndices, absoluteMinWidths: absMins, nameColIndex: 0 }
  )



  const warnPanel = darkMode ? 'bg-amber-950/40 text-amber-200 border-amber-800' : 'bg-amber-50 text-amber-900 border-amber-200'

  const residualHead = darkMode ? 'bg-gray-900 text-gray-400' : 'bg-gray-100 text-gray-600'



  return (

    <div className="space-y-3">

      {result && !result.converged && (

        <div className={`rounded-lg border px-3 py-2 text-sm ${warnPanel}`}>

          部分自定义约束未收敛：{result.message ?? '请检查配料与约束残差。'}

        </div>

      )}

      {result && result.valid === false && result.converged && (

        <div className={`rounded-lg border px-3 py-2 text-sm ${warnPanel}`}>

          {result.message ?? '产物元素合计未闭合至 100%。'}

        </div>

      )}

      {result && result.constraintResiduals.length > 0 && (

        <div className={`overflow-auto rounded-lg border ${border}`}>

          <table className="w-full min-w-[720px] table-fixed border-collapse text-xs">

            <thead className={residualHead}>

              <tr>

                <th colSpan={4} className="px-2 py-1.5 text-center font-semibold">

                  约束残差（目标值对比）

                </th>

              </tr>

              <tr>

                <th className="px-2 py-1 text-left">表达式</th>

                <th className="w-24 px-2 py-1 text-center">当前值</th>

                <th className="w-24 px-2 py-1 text-center">目标</th>

                <th className="w-24 px-2 py-1 text-center">残差</th>

              </tr>

            </thead>

            <tbody>

              {result.constraintResiduals.map((row, index) => {

                const bad = Math.abs(row.residual) > 0.0001

                return (

                  <tr key={`${row.expr}-${index}`} className={bad ? (darkMode ? 'text-amber-300' : 'text-amber-800') : undefined}>

                    <td className={`border-t px-2 py-1 ${border}`}>{row.expr}</td>

                    <td className={`border-t px-2 py-1 text-center font-mono ${border}`}>{row.value.toFixed(6)}</td>

                    <td className={`border-t px-2 py-1 text-center font-mono ${border}`}>{row.target}</td>

                    <td className={`border-t px-2 py-1 text-center font-mono ${border}`}>{row.residual.toFixed(6)}</td>

                  </tr>

                )

              })}

            </tbody>

          </table>

        </div>

      )}

      <div ref={containerRef} className={`overflow-auto rounded-lg border ${border}`}>

        <table

          className="table-fixed w-full border-collapse text-sm"

          style={{ width: resolvedTableWidth }}

        >

          <CopperBatchTableColGroup widths={colWidths} />

          <thead className={head}>

            <tr>

              <th colSpan={colCount} className={`p-0 ${head}`}>

                <div

                  className="sticky left-0 px-2 py-1.5 text-center text-sm font-semibold"

                  style={{ width: viewportWidth || undefined }}

                >

                  产出结果表

                </div>

              </th>

            </tr>

            <tr>

              <th className={`sticky left-0 z-30 px-2 py-1.5 text-center text-sm font-semibold ${head}`}>名称</th>

              <th className="px-2 py-1.5 text-center text-sm font-semibold">t/h</th>

              <th className={`px-2 py-1.5 text-center text-sm font-semibold ${shareHighlight}`}>占比%</th>

              <th colSpan={maxPhaseCols} className="px-2 py-1.5 text-center text-sm font-semibold">

                物相

              </th>

            </tr>

          </thead>

          <tbody>

            {OXY_SIDE_BLOW_PRODUCT_KEYS.map((pk) => {

              const product = showEmpty

                ? { name: OXY_PRODUCT_KEY_TO_CN[pk], mass: 0, phases: [] as Array<{ key: string; pct: number; mass: number }> }

                : result!.products[pk]

              const phases = product.phases

              const sharePct = showEmpty ? 0 : totalMass > 0 ? (product.mass / totalMass) * 100 : 0

              const showVolumeRow = pk === 'flueGas'

              const volumePercents =

                showVolumeRow && phases.length > 0

                  ? calculateGasVolumePercents(

                      Object.fromEntries(phases.map((phase) => [phase.key, phase.pct]))

                    )

                  : null

              const bodyRowSpan = showVolumeRow ? 3 : 2



              return (

                <Fragment key={pk}>

                  <tr>

                    <td rowSpan={bodyRowSpan} className={productStickyNameCellClass(darkMode, pk)}>

                      {product.name}

                    </td>

                    <td rowSpan={bodyRowSpan} className={productDataCellClass(darkMode, pk)}>

                      {showEmpty ? (

                        '—'

                      ) : (

                        <BatchTableNumericReadonly

                          darkMode={darkMode}

                          value={formatMassSource(product.mass)}

                          helpTitle={`${product.name} 总质量`}

                          className="text-sm"

                        />

                      )}

                    </td>

                    <td

                      rowSpan={bodyRowSpan}

                      className={`${productDataCellClass(darkMode, pk)} font-semibold ${shareHighlight}`}

                    >

                      {showEmpty ? (

                        '—'

                      ) : (

                        <BatchTableNumericReadonly

                          darkMode={darkMode}

                          value={sharePct}

                          helpTitle={`${product.name} 在总产物中占比`}

                          className={`text-sm font-semibold ${shareHighlight}`}

                        />

                      )}

                    </td>

                    {Array.from({ length: maxPhaseCols }, (_, i) => {

                      const phase = phases[i]

                      return (

                        <td

                          key={`${pk}-label-${i}`}

                          className={`${productDataCellClass(darkMode, pk)} whitespace-nowrap font-medium`}

                        >

                          {phase ? phaseLabel(phase.key) : '—'}

                        </td>

                      )

                    })}

                  </tr>

                  <tr>

                    {Array.from({ length: maxPhaseCols }, (_, i) => {

                      const phase = phases[i]

                      return (

                        <td key={`${pk}-pct-${i}`} className={`${productDataCellClass(darkMode, pk)} whitespace-nowrap`}>

                          {phase ? (

                            <BatchTableNumericReadonly

                              darkMode={darkMode}

                              value={phase.pct}

                              helpTitle={`${phaseLabel(phase.key)} w% · 质量 ${formatMassSource(phase.mass)} t/h`}

                              className="text-sm"

                            />

                          ) : (

                            '—'

                          )}

                        </td>

                      )

                    })}

                  </tr>

                  {showVolumeRow && (

                    <tr>

                      {Array.from({ length: maxPhaseCols }, (_, i) => {

                        const phase = phases[i]

                        const volPct =

                          phase && volumePercents

                            ? volumePercents[phase.key as keyof typeof volumePercents]

                            : null

                        const volValue = volPct != null && volPct > 1e-12 ? volPct : phase ? 0 : null

                        return (

                          <td key={`${pk}-vol-${i}`} className={`${productDataCellClass(darkMode, pk)} whitespace-nowrap`}>

                            {phase && volValue != null ? (

                              <BatchTableNumericReadonly

                                darkMode={darkMode}

                                value={volValue}

                                helpTitle={`${phaseLabel(phase.key)} v%`}

                                className="text-sm"

                              />

                            ) : (

                              '—'

                            )}

                          </td>

                        )

                      })}

                    </tr>

                  )}

                </Fragment>

              )

            })}

          </tbody>

        </table>

      </div>

    </div>

  )

}

