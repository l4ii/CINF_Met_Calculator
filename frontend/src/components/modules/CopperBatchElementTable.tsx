/**
 * 配料总表 · 元素总表（转置：元素为列，物料为行）
 */
import { Fragment, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { inputSm } from '../../theme/uiTheme'
import type {
  CopperElementKey,
  CopperLibraryMaterial,
  CopperMaterialColumn,
  CopperRatios,
} from '../../utils/copperWorkflowCalc'

export type DraftRatioKind = 'raw' | 'solvent' | 'fuel' | 'gas'
export type MoistureKind = 'raw' | 'solvent' | 'fuel'
export type SulfurInputStatus = 'ok' | 'missing' | 'not_required'
import {
  batchElementTableColWidths,
  batchTableDataColWidth,
  isSparseDataColumn,
} from '../../utils/copperBatchTableLayout'
import { calculateKnownTotal } from '../../utils/copperWorkflowCalc'
import { CopperBatchTableColGroup } from './CopperBatchTableColGroup'
import { CopperMaterialSelect } from './CopperMaterialSelect'

export type ElementTableTone = 'raw' | 'solvent' | 'fuel' | 'oxygen' | 'total' | 'product'
export type SolveInputStatus = 'none' | 'pending' | 'resolved'

export type SolventCatalogOption = { catalogId: string; label: string }

const STICKY_CATEGORY = 'left-0 min-w-[56px]'
const STICKY_NAME_LEFT = 'left-[56px]'

function nameColStyle(width: number): CSSProperties {
  return { width, minWidth: width }
}

function elementTableToneClass(dark: boolean, tone: ElementTableTone) {
  if (tone === 'solvent') return dark ? 'border-gray-600 bg-emerald-950/20' : 'border-gray-200 bg-emerald-50/70'
  if (tone === 'fuel') return dark ? 'border-gray-600 bg-amber-950/20' : 'border-gray-200 bg-amber-50/70'
  if (tone === 'oxygen') return dark ? 'border-gray-600 bg-sky-950/20 text-sky-50' : 'border-gray-200 bg-sky-50 text-sky-950'
  if (tone === 'total') return dark ? 'border-gray-600 bg-blue-950/30' : 'border-gray-200 bg-blue-50'
  if (tone === 'product') return dark ? 'border-gray-600 bg-indigo-950/20 text-indigo-100' : 'border-gray-200 bg-indigo-50 text-indigo-900'
  return dark ? 'border-gray-600 bg-gray-800/40' : 'border-gray-200 bg-white'
}

function stickyCellClass(dark: boolean, tone: ElementTableTone, side: 'category' | 'name') {
  const left = side === 'category' ? STICKY_CATEGORY : STICKY_NAME_LEFT
  const align = side === 'category' ? 'text-center font-semibold' : 'text-center'
  return `sticky ${left} z-20 border-t px-2 py-1.5 align-middle text-sm ${align} ${elementTableToneClass(dark, tone)}`
}

function categoryRowSpanCellClass(dark: boolean, tone: ElementTableTone) {
  return `sticky ${STICKY_CATEGORY} z-20 border-t px-2 py-1.5 align-middle text-center text-sm font-semibold ${elementTableToneClass(dark, tone)}`
}

function elementDataCellClass(dark: boolean, tone: ElementTableTone) {
  return `border-t px-0.5 py-1.5 align-middle text-center text-sm ${elementTableToneClass(dark, tone)}`
}

function dataCellClass(dark: boolean, tone: ElementTableTone) {
  return `border-t px-1 py-1.5 align-middle text-center text-sm ${elementTableToneClass(dark, tone)}`
}

function deleteButtonClass(dark: boolean) {
  return `px-1 text-sm ${dark ? 'text-red-300 hover:underline' : 'text-red-600 hover:underline'}`
}

function elementHeaderLabel(element: string) {
  return element.replace(/\(.+\)/, '')
}

function feedSharePercent(weight: number, total: number) {
  return total > 0 ? (weight / total) * 100 : 0
}

function elementTableColumnCount(elementCount: number) {
  return elementCount + 5
}

export type ProductTableColumn = {
  key: string
  name: string
  mass: number
  composition: Record<string, number>
}

export function CopperBatchElementTable({
  darkMode,
  tableWidth: _tableWidth,
  nameColWidth,
  elementKeys,
  feedTotalWeight,
  rawMaterials,
  solventColumns,
  fuelColumn,
  oxygenAirColumn,
  furnaceFeedRatios,
  furnaceBlendMoisture,
  productTableColumns,
  productTotalMass,
  productCalculated,
  materialLibrary,
  formatTableNumber,
  solveInputClass,
  moistureInputClass,
  materialSelectClass,
  productOutputCellClass,
  ratioInputValue,
  moistureInputValue,
  rawWeightDrafts,
  ratioDrafts,
  phaseCellStatus,
  sulfurInputStatus,
  rawWeightStatus,
  solventWeightStatus,
  fuelWeightStatus,
  oxygenAirInputStatus,
  moistureStatus,
  phaseUnknownElements,
  phaseCompleted,
  onRawWeightChange,
  onApplyLibraryMaterial,
  onRemoveMaterial,
  onRemoveSolvent,
  onRawRatioChange,
  onRawRatioBlur,
  onSolventWeightChange,
  onSolventWeightBlur,
  onFuelWeightChange,
  onFuelWeightBlur,
  onSolventRatioChange,
  onSolventRatioBlur,
  onFuelRatioChange,
  onFuelRatioBlur,
  onGasRatioChange,
  onGasRatioBlur,
  onMaterialMoistureChange,
  onMaterialMoistureBlur,
  onFuelMoistureChange,
  onFuelMoistureBlur,
  onOpenElementAssist,
  onOpenIterationAssist,
}: {
  darkMode: boolean
  tableWidth: number
  nameColWidth: number
  elementKeys: CopperElementKey[]
  feedTotalWeight: number
  rawMaterials: CopperMaterialColumn[]
  solventColumns: CopperMaterialColumn[]
  fuelColumn: CopperMaterialColumn
  oxygenAirColumn: CopperMaterialColumn
  furnaceFeedRatios: Record<string, number>
  furnaceBlendMoisture: number
  productTableColumns: ProductTableColumn[]
  productTotalMass: number
  productCalculated: boolean
  materialLibrary: CopperLibraryMaterial[]
  formatTableNumber: (v: number) => string
  solveInputClass: (dark: boolean, status: SolveInputStatus) => string
  moistureInputClass: (dark: boolean, status: SolveInputStatus) => string
  materialSelectClass: (dark: boolean, status: SolveInputStatus) => string
  productOutputCellClass: (
    dark: boolean,
    status: SolveInputStatus,
    side: 'single' | 'left' | 'right',
    boundary: 'top' | 'middle' | 'bottom'
  ) => string
  ratioInputValue: (kind: DraftRatioKind, id: string, element: CopperElementKey, fallback: number) => string
  moistureInputValue: (kind: MoistureKind, id: string, moisture: number | undefined) => string
  rawWeightDrafts: Record<string, string>
  ratioDrafts: Record<string, string>
  phaseCellStatus: (material: CopperMaterialColumn, element: CopperElementKey) => SolveInputStatus
  sulfurInputStatus: (ratios: CopperRatios) => SulfurInputStatus
  rawWeightStatus: (id: string) => SolveInputStatus
  solventWeightStatus: (id: string) => SolveInputStatus
  fuelWeightStatus: () => SolveInputStatus
  oxygenAirInputStatus: SolveInputStatus
  moistureStatus: (kind: MoistureKind, id: string, moisture: number | undefined) => SolveInputStatus
  phaseUnknownElements: Set<CopperElementKey>
  phaseCompleted: boolean
  onRawWeightChange: (id: string, value: string) => void
  onApplyLibraryMaterial: (id: string, libraryId: string) => void
  onRemoveMaterial: (id: string) => void
  onRemoveSolvent: (id: string) => void
  onRawRatioChange: (id: string, element: CopperElementKey, value: string) => void
  onRawRatioBlur: (id: string, element: CopperElementKey, value: number | undefined) => void
  onSolventWeightChange: (id: string, value: string) => void
  onSolventWeightBlur: (id: string) => void
  onFuelWeightChange: (value: string) => void
  onFuelWeightBlur: () => void
  onSolventRatioChange: (id: string, element: CopperElementKey, value: string) => void
  onSolventRatioBlur: (id: string, element: CopperElementKey, value: number | undefined) => void
  onFuelRatioChange: (element: CopperElementKey, value: string) => void
  onFuelRatioBlur: (element: CopperElementKey, value: number | undefined) => void
  onGasRatioChange: (element: CopperElementKey, value: string) => void
  onGasRatioBlur: (element: CopperElementKey, value: number | undefined) => void
  onMaterialMoistureChange: (kind: 'raw' | 'solvent', id: string, value: string) => void
  onMaterialMoistureBlur: (kind: 'raw' | 'solvent', id: string) => void
  onFuelMoistureChange: (value: string) => void
  onFuelMoistureBlur: () => void
  onOpenElementAssist: (materialId: string) => void
  onOpenIterationAssist: () => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const theadCls = darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
  const colCount = elementTableColumnCount(elementKeys.length)
  const elementColWidths = useMemo(() => {
    const collectSamples = (element: CopperElementKey) => {
      const samples: string[] = []
      for (const material of rawMaterials) samples.push(formatTableNumber(material.ratios[element] ?? 0))
      for (const material of solventColumns) samples.push(formatTableNumber(material.ratios[element] ?? 0))
      samples.push(formatTableNumber(fuelColumn.ratios[element] ?? 0))
      samples.push(formatTableNumber(oxygenAirColumn.ratios[element] ?? 0))
      samples.push(formatTableNumber(furnaceFeedRatios[element] ?? 0))
      if (productCalculated) {
        for (const product of productTableColumns) {
          samples.push(formatTableNumber(product.composition[element] ?? 0))
        }
      }
      return samples
    }
    return elementKeys.map((element) => {
      const samples = collectSamples(element)
      return batchTableDataColWidth(elementHeaderLabel(element), samples, isSparseDataColumn(samples))
    })
  }, [
    elementKeys,
    rawMaterials,
    solventColumns,
    fuelColumn,
    oxygenAirColumn,
    furnaceFeedRatios,
    productTableColumns,
    productCalculated,
    formatTableNumber,
  ])
  const colWidths = batchElementTableColWidths(nameColWidth, elementColWidths, viewportWidth)
  const resolvedTableWidth = colWidths.reduce((sum, width) => sum + width, 0)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setViewportWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const renderElementCells = (
    tone: ElementTableTone,
    ratios: Record<string, number>,
    options: {
      kind: 'raw' | 'solvent' | 'fuel' | 'gas' | 'readonly'
      id?: string
      material?: CopperMaterialColumn
      editable?: boolean
    }
  ): ReactNode[] =>
    elementKeys.map((element) => {
      const cellCls = elementDataCellClass(darkMode, tone)
      if (options.kind === 'readonly') {
        return (
          <td key={element} className={`${cellCls} font-mono`}>
            {formatTableNumber(ratios[element] ?? 0)}
          </td>
        )
      }
      if (options.kind === 'gas') {
        if (element !== 'O(氧)' && element !== 'N(氮)') {
          return (
            <td key={element} className={`${cellCls} font-mono`}>
              0
            </td>
          )
        }
        return (
          <td key={element} className={cellCls}>
            <input
              className={solveInputClass(darkMode, oxygenAirInputStatus)}
              title="富氧空气组成：只需输入 O 或 N 之一，另一个自动按 100% 互补。双击进入迭代输入。"
              value={ratioInputValue('gas', oxygenAirColumn.id, element, ratios[element] ?? 0)}
              onChange={(event) => onGasRatioChange(element, event.target.value)}
              onBlur={() => onGasRatioBlur(element, ratios[element])}
              onDoubleClick={onOpenIterationAssist}
            />
          </td>
        )
      }
      if (options.kind === 'raw' && options.material && options.id) {
        const material = options.material
        return (
          <td key={element} className={cellCls}>
            <input
              className={solveInputClass(darkMode, phaseCellStatus(material, element))}
              step="0.0001"
              title={
                element === 'S (硫)' && sulfurInputStatus(material.ratios) === 'missing'
                  ? '含 Cu/Fe 的原料须填写 S(硫) 元素含量后方可计算物相成分'
                  : phaseUnknownElements.has(element)
                    ? phaseCompleted
                      ? '步骤2：物相成分。已回填有效物相成分结果；也可直接手动输入；双击打开辅助计算。'
                      : '步骤2：物相成分。待计算物相成分：可直接手动输入；双击打开辅助计算。'
                    : undefined
              }
              onClick={(event) => event.stopPropagation()}
              onDoubleClick={() => {
                if (phaseUnknownElements.has(element)) onOpenElementAssist(options.id!)
              }}
              value={material.name.trim() ? ratioInputValue('raw', options.id, element, material.ratios[element] ?? 0) : ''}
              onChange={(event) => onRawRatioChange(options.id!, element, event.target.value)}
              onBlur={() => onRawRatioBlur(options.id!, element, material.ratios[element])}
            />
          </td>
        )
      }
      if (options.kind === 'solvent' && options.id) {
        return (
          <td key={element} className={cellCls}>
            <input
              className={`${inputSm(darkMode)} h-7 w-full px-0.5 py-0 text-center font-mono text-sm`}
              value={ratioInputValue('solvent', options.id, element, ratios[element] ?? 0)}
              onChange={(event) => onSolventRatioChange(options.id!, element, event.target.value)}
              onBlur={() => onSolventRatioBlur(options.id!, element, ratios[element])}
              onDoubleClick={onOpenIterationAssist}
            />
          </td>
        )
      }
      if (options.kind === 'fuel') {
        return (
          <td key={element} className={cellCls}>
            <input
              className={`${inputSm(darkMode)} h-7 w-full px-0.5 py-0 text-center font-mono text-sm`}
              value={ratioInputValue('fuel', fuelColumn.id, element, ratios[element] ?? 0)}
              onChange={(event) => onFuelRatioChange(element, event.target.value)}
              onBlur={() => onFuelRatioBlur(element, ratios[element])}
              onDoubleClick={onOpenIterationAssist}
            />
          </td>
        )
      }
      return (
        <td key={element} className={cellCls}>
          —
        </td>
      )
    })

  const renderTotalCell = (ratios: Record<string, number>, tone: ElementTableTone = 'raw') => (
    <td className={`${dataCellClass(darkMode, tone)} font-mono font-semibold`}>
      {formatTableNumber(calculateKnownTotal(ratios) + (ratios['Other(其他)'] ?? 0))}
    </td>
  )

  const renderMaterialWaterRow = (
    key: string,
    tone: ElementTableTone,
    moistureInput: ReactNode,
    ops?: { label: string; onDelete: () => void }
  ) => {
    const elementCount = elementKeys.length
    const middleSpan = Math.max(0, elementCount - 1)
    const opsCell = ops ? (
      <div className="flex items-center justify-end gap-1 whitespace-nowrap pr-1 text-sm">
        <span className={darkMode ? 'text-gray-400' : 'text-gray-500'}>操作：</span>
        <button type="button" className={deleteButtonClass(darkMode)} onClick={ops.onDelete}>
          {ops.label}
        </button>
      </div>
    ) : null
    return (
      <tr key={key}>
        <td className={stickyCellClass(darkMode, tone, 'name')} style={nameColStyle(nameColWidth)}>
          水
        </td>
        <td className={`${dataCellClass(darkMode, tone)} font-medium whitespace-nowrap`}>含量：</td>
        <td className={dataCellClass(darkMode, tone)}>{moistureInput}</td>
        {middleSpan > 0 ? <td colSpan={middleSpan} className={elementDataCellClass(darkMode, tone)} /> : null}
        {elementCount > 0 ? (
          <td className={elementDataCellClass(darkMode, tone)}>{opsCell}</td>
        ) : (
          <td className={dataCellClass(darkMode, tone)}>{opsCell}</td>
        )}
        <td className={dataCellClass(darkMode, tone)} />
      </tr>
    )
  }

  return (
    <div
      ref={containerRef}
      className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}
    >
      <table className="table-fixed text-sm" style={{ width: resolvedTableWidth, minWidth: resolvedTableWidth }}>
        <CopperBatchTableColGroup widths={colWidths} />
        <thead className={theadCls}>
          <tr>
            <th colSpan={colCount} className={`p-0 ${theadCls}`}>
              <div
                className="sticky left-0 px-2 py-1.5 text-center text-sm font-semibold"
                style={{ width: viewportWidth || undefined }}
              >
                元素含量表（w%）
              </div>
            </th>
          </tr>
          <tr>
            <th className={`sticky left-0 z-30 px-2 py-1.5 text-center text-sm font-semibold ${theadCls}`}>类型</th>
            <th
              className={`sticky left-[56px] z-30 px-2 py-1.5 text-center text-sm font-semibold ${theadCls}`}
              style={nameColStyle(nameColWidth)}
            >
              名称
            </th>
            <th className="px-1 py-1.5 text-center text-sm font-semibold">t/h</th>
            <th className="px-1 py-1.5 text-center text-sm font-semibold">占比%</th>
            {elementKeys.map((element) => (
              <th key={element} className="px-0.5 py-1.5 text-center text-sm font-semibold">
                {elementHeaderLabel(element)}
              </th>
            ))}
            <th className="px-1 py-1.5 text-center text-sm font-semibold">合计</th>
          </tr>
        </thead>
        <tbody>
          {rawMaterials.map((material, index) => (
            <Fragment key={material.id}>
              <tr>
                <td rowSpan={2} className={categoryRowSpanCellClass(darkMode, 'raw')}>
                  原料{index + 1}
                </td>
                <td className={`${stickyCellClass(darkMode, 'raw', 'name')} p-1`} style={nameColStyle(nameColWidth)}>
                  <CopperMaterialSelect
                    darkMode={darkMode}
                    triggerClassName={materialSelectClass(
                      darkMode,
                      material.name.trim() ? 'resolved' : 'pending'
                    )}
                    title={
                      material.name.trim()
                        ? material.name
                        : '步骤1：请在名称下拉框中选择原料。'
                    }
                    value={
                      materialLibrary.some((item) => item.name === material.name)
                        ? materialLibrary.find((item) => item.name === material.name)?.id ?? ''
                        : ''
                    }
                    options={materialLibrary.map((item) => ({ id: item.id, label: item.name }))}
                    onChange={(libraryId) => onApplyLibraryMaterial(material.id, libraryId)}
                  />
                </td>
                <td className={dataCellClass(darkMode, 'raw')}>
                  <input
                    className={solveInputClass(darkMode, rawWeightStatus(material.id))}
                    step="0.0001"
                    title="步骤1：输入投料量。可直接手动输入原料投料量，输入有效数字后标记为绿色。"
                    value={rawWeightDrafts[material.id] ?? ''}
                    onChange={(event) => onRawWeightChange(material.id, event.target.value)}
                  />
                </td>
                <td className={`${dataCellClass(darkMode, 'raw')} font-mono`}>
                  {formatTableNumber(feedSharePercent(material.weight, feedTotalWeight))}
                </td>
                {renderElementCells('raw', material.ratios, { kind: 'raw', id: material.id, material })}
                {renderTotalCell(material.ratios, 'raw')}
              </tr>
              {renderMaterialWaterRow(
                `${material.id}-water`,
                'raw',
                <input
                  className={`${moistureInputClass(darkMode, moistureStatus('raw', material.id, material.moisture))} h-7 w-full text-center font-mono`}
                  step="0.0001"
                  title="可选。干基水分 %：湿质量 = 干料 t/h × (1 + 水分%/100)；不参与干基物相 100% 闭合"
                  value={moistureInputValue('raw', material.id, material.moisture)}
                  onChange={(event) => onMaterialMoistureChange('raw', material.id, event.target.value)}
                  onBlur={() => onMaterialMoistureBlur('raw', material.id)}
                />,
                { label: '删除原料', onDelete: () => onRemoveMaterial(material.id) }
              )}
            </Fragment>
          ))}
          {solventColumns.map((material, index) => (
            <Fragment key={material.id}>
              <tr>
                <td rowSpan={2} className={categoryRowSpanCellClass(darkMode, 'solvent')}>
                  熔剂{index + 1}
                </td>
                <td className={stickyCellClass(darkMode, 'solvent', 'name')} style={nameColStyle(nameColWidth)}>
                  {material.name === '石灰' ? '石灰石' : material.name}
                </td>
                <td className={dataCellClass(darkMode, 'solvent')}>
                  <input
                    className={solveInputClass(darkMode, solventWeightStatus(material.id))}
                    title="熔剂投料量：单击可手动输入；双击进入迭代输入。"
                    onDoubleClick={onOpenIterationAssist}
                    value={ratioDrafts[`solvent-weight:${material.id}`] ?? formatTableNumber(material.weight)}
                    onChange={(event) => onSolventWeightChange(material.id, event.target.value)}
                    onBlur={() => onSolventWeightBlur(material.id)}
                  />
                </td>
                <td className={`${dataCellClass(darkMode, 'solvent')} font-mono`}>
                  {formatTableNumber(feedSharePercent(material.weight, feedTotalWeight))}
                </td>
                {renderElementCells('solvent', material.ratios, { kind: 'solvent', id: material.id })}
                {renderTotalCell(material.ratios, 'solvent')}
              </tr>
              {renderMaterialWaterRow(
                `${material.id}-water`,
                'solvent',
                <input
                  className={`${moistureInputClass(darkMode, moistureStatus('solvent', material.id, material.moisture))} h-7 w-full text-center`}
                  title="熔剂水分 H₂O%，默认 0"
                  value={moistureInputValue('solvent', material.id, material.moisture)}
                  onChange={(event) => onMaterialMoistureChange('solvent', material.id, event.target.value)}
                  onBlur={() => onMaterialMoistureBlur('solvent', material.id)}
                />,
                { label: '删除熔剂', onDelete: () => onRemoveSolvent(material.id) }
              )}
            </Fragment>
          ))}
          <Fragment key="fuel-group">
            <tr>
              <td rowSpan={2} className={categoryRowSpanCellClass(darkMode, 'fuel')}>
                燃料
              </td>
              <td className={stickyCellClass(darkMode, 'fuel', 'name')} style={nameColStyle(nameColWidth)}>
                {fuelColumn.name}
              </td>
              <td className={dataCellClass(darkMode, 'fuel')}>
                <input
                  className={solveInputClass(darkMode, fuelWeightStatus())}
                  title="燃料煤投料量：单击可手动输入；双击进入迭代输入。"
                  onDoubleClick={onOpenIterationAssist}
                  value={ratioDrafts['fuel-weight:fuel-coal'] ?? formatTableNumber(fuelColumn.weight)}
                  onChange={(event) => onFuelWeightChange(event.target.value)}
                  onBlur={onFuelWeightBlur}
                />
              </td>
              <td className={`${dataCellClass(darkMode, 'fuel')} font-mono`}>
                {formatTableNumber(feedSharePercent(fuelColumn.weight, feedTotalWeight))}
              </td>
              {renderElementCells('fuel', fuelColumn.ratios, { kind: 'fuel' })}
              {renderTotalCell(fuelColumn.ratios, 'fuel')}
            </tr>
            {renderMaterialWaterRow(
              'fuel-water',
              'fuel',
              <input
                className={`${moistureInputClass(darkMode, moistureStatus('fuel', fuelColumn.id, fuelColumn.moisture))} h-7 w-full text-center`}
                title="燃料水分 H₂O%，默认 0"
                value={moistureInputValue('fuel', fuelColumn.id, fuelColumn.moisture)}
                onChange={(event) => onFuelMoistureChange(event.target.value)}
                onBlur={onFuelMoistureBlur}
              />
            )}
          </Fragment>
          <tr>
            <td className={stickyCellClass(darkMode, 'oxygen', 'category')}>富氧空气</td>
            <td className={stickyCellClass(darkMode, 'oxygen', 'name')} style={nameColStyle(nameColWidth)}>
              富氧空气
            </td>
            <td className={`${dataCellClass(darkMode, 'oxygen')} font-mono`}>
              {formatTableNumber(oxygenAirColumn.weight)}
            </td>
            <td className={`${dataCellClass(darkMode, 'oxygen')} font-mono`}>
              {formatTableNumber(feedSharePercent(oxygenAirColumn.weight, feedTotalWeight))}
            </td>
            {renderElementCells('oxygen', oxygenAirColumn.ratios, { kind: 'gas' })}
            {renderTotalCell(oxygenAirColumn.ratios, 'oxygen')}
          </tr>
          <Fragment key="blend-group">
            <tr>
              <td rowSpan={2} className={categoryRowSpanCellClass(darkMode, 'total')}>
                混料
              </td>
              <td className={stickyCellClass(darkMode, 'total', 'name')} style={nameColStyle(nameColWidth)}>
                混料
              </td>
              <td className={`${dataCellClass(darkMode, 'total')} font-mono font-semibold`}>
                {formatTableNumber(feedTotalWeight)}
              </td>
              <td className={`${dataCellClass(darkMode, 'total')} font-mono`}>100</td>
              {elementKeys.map((element) => (
                <td key={`blend-${element}`} className={`${dataCellClass(darkMode, 'total')} font-mono`}>
                  {formatTableNumber(furnaceFeedRatios[element] ?? 0)}
                </td>
              ))}
              <td className={`${dataCellClass(darkMode, 'total')} font-mono font-semibold`}>100</td>
            </tr>
            {renderMaterialWaterRow(
              'blend-water',
              'total',
              <span className="font-mono">{formatTableNumber(furnaceBlendMoisture)}</span>
            )}
          </Fragment>
          {productCalculated &&
            productTableColumns.map((product) => (
              <tr key={`product-row-${product.key}`}>
                <td className={stickyCellClass(darkMode, 'product', 'category')}>产出</td>
                <td className={stickyCellClass(darkMode, 'product', 'name')} style={nameColStyle(nameColWidth)}>
                  {product.name}
                </td>
                <td
                  className={`${productOutputCellClass(darkMode, 'resolved', 'single', 'top')} font-mono text-sm`}
                  onDoubleClick={onOpenIterationAssist}
                >
                  {formatTableNumber(product.mass)}
                </td>
                <td className={`${dataCellClass(darkMode, 'product')} font-mono`}>
                  {productTotalMass > 0 && product.key !== 'loss'
                    ? formatTableNumber(feedSharePercent(product.mass, productTotalMass))
                    : ''}
                </td>
                {elementKeys.map((element) => (
                  <td
                    key={`product-${product.key}-${element}`}
                    className={`${productOutputCellClass(darkMode, 'resolved', 'single', 'middle')} font-mono text-sm`}
                    onDoubleClick={onOpenIterationAssist}
                  >
                    {formatTableNumber(product.composition[element] ?? 0)}
                  </td>
                ))}
                <td
                  className={`${productOutputCellClass(darkMode, 'resolved', 'single', 'bottom')} font-mono text-sm`}
                  onDoubleClick={onOpenIterationAssist}
                >
                  {formatTableNumber(
                    calculateKnownTotal(product.composition) + (product.composition['Other(其他)'] ?? 0)
                  )}
                </td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  )
}
