import { useEffect, useMemo, useState } from 'react'
import { createPortal } from 'react-dom'
import type { MetcalFloImportBundle } from '../../utils/metcalFloMixExtract.ts'
import { visibleMetcalImportElementKeys } from '../../utils/metcalFloMixExtract.ts'
import { elementTableHeaderLabel } from '../../utils/copperElementDisplay.ts'
import {
  calculateKnownTotal,
  materialWaterWeight,
  type CopperMaterialColumn,
} from '../../utils/copperWorkflowCalc.ts'
import { finalizeMetcalAssayRatios } from '../../utils/metcalFloMixExtract.ts'
import { btnPrimary, btnSecondary, cardBase, inputBase, sectionTitle } from '../../theme/uiTheme'

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
} as const

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
  const { rawMaterials, solventColumns, airColumns, fuelColumn, recomputedBlend, extraction } = bundle
  const [caseName, setCaseName] = useState(() => defaultCaseNameFromFile(sourceFileName))

  useEffect(() => {
    setCaseName(defaultCaseNameFromFile(sourceFileName))
  }, [sourceFileName])

  const fuelPreview = useMemo(() => {
    if (!extraction.fuels.length) return [] as CopperMaterialColumn[]
    return [{ ...fuelColumn, weight: 0, waterWeight: 0 } as CopperMaterialColumn]
  }, [extraction.fuels.length, fuelColumn])

  const blendDryWeight = useMemo(
    () => rawMaterials.reduce((sum, material) => sum + Math.max(0, material.weight), 0),
    [rawMaterials]
  )
  const blendWater = useMemo(
    () => rawMaterials.reduce((sum, material) => sum + materialWaterWeight(material), 0),
    [rawMaterials]
  )
  const blendRatios = useMemo(() => {
    const metcal = extraction.blend
    if (metcal && Object.keys(metcal.elementRatios).length > 0) {
      return finalizeMetcalAssayRatios(metcal.elementRatios, metcal.phaseRatios)
    }
    return recomputedBlend.ratios
  }, [extraction.blend, recomputedBlend.ratios])

  const previewMaterials = useMemo(
    () => [
      ...rawMaterials,
      {
        id: 'metcal-blend-preview',
        name: '混合铜精矿',
        kind: 'raw' as const,
        weight: blendDryWeight,
        waterWeight: blendWater,
        ratios: blendRatios,
      },
      ...solventColumns,
      ...fuelPreview,
      ...airColumns.filter((column) => column.weight > 0 || column.name.trim()),
    ],
    [airColumns, blendDryWeight, blendRatios, blendWater, fuelPreview, rawMaterials, solventColumns]
  )

  const elementKeys = useMemo(() => visibleMetcalImportElementKeys(previewMaterials), [previewMaterials])

  const tableMinWidth =
    COL.category + COL.name + COL.mass + COL.water + COL.total + elementKeys.length * COL.element

  const textClass = darkMode ? 'text-gray-100' : 'text-gray-900'
  const mutedClass = darkMode ? 'text-gray-400' : 'text-gray-500'
  const borderClass = darkMode ? 'border-gray-600' : 'border-gray-200'
  // sticky 列必须用不透明底色，否则横向滚动时右侧数字会透出来
  const headClass = darkMode ? 'bg-gray-900 text-gray-200' : 'bg-gray-50 text-gray-700'
  const rawRowClass = darkMode ? 'bg-gray-800' : 'bg-white'
  const solventRowClass = darkMode ? 'bg-emerald-950 text-emerald-50' : 'bg-emerald-50 text-emerald-950'
  const fuelRowClass = darkMode ? 'bg-orange-950 text-orange-50' : 'bg-orange-50 text-orange-950'
  const gasRowClass = darkMode ? 'bg-sky-950 text-sky-50' : 'bg-sky-50 text-sky-950'
  const blendRowClass = darkMode ? 'bg-amber-950 text-amber-50' : 'bg-amber-100 text-amber-950'

  const canConfirm = rawMaterials.length > 0 && caseName.trim().length > 0
  // 混料行：干基=各原料干基合计；水分=各原料水分合计（展示 2 位小数，加和与源值可能有 ±0.0x 舍入差）
  const blendRow = (
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

  const panel = (
    <div className="katex-app-typography fixed inset-0 z-[10000] flex items-center justify-center bg-black/80 p-3 sm:p-5">
      <div
        className={`${cardBase(darkMode)} flex w-[min(96vw,1440px)] max-h-[88vh] flex-col overflow-hidden p-4 text-sm shadow-2xl sm:p-5 ${textClass}`}
        style={{ height: 'min(88vh, calc(min(96vw, 1440px) * 9 / 16))' }}
      >
        <div className="shrink-0">
          <h3 className={`${sectionTitle(darkMode)} !text-sm font-semibold`}>MetCal 混料导入</h3>
          <p className={`mt-1.5 leading-relaxed ${mutedClass}`}>
            来源：{sourceFileName}。读取原料、熔剂、气体与燃料元素组成（煤量通过自定义约束中的煤量计算）。确认后进入。
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

        <div className="mt-3 flex min-h-0 flex-1 flex-col">
          <div className={`mb-2 shrink-0 font-medium ${textClass}`}>投入-物料元素表</div>
          <div className={`min-h-0 flex-1 overflow-auto rounded-lg border ${borderClass}`}>
            <table
              className="border-collapse text-sm"
              style={{ minWidth: tableMinWidth, width: 'max-content' }}
            >
              <colgroup>
                <col style={{ width: COL.category }} />
                <col style={{ width: COL.name }} />
                <col style={{ width: COL.mass }} />
                <col style={{ width: COL.water }} />
                <col style={{ width: COL.total }} />
                {elementKeys.map((key) => (
                  <col key={key} style={{ width: COL.element }} />
                ))}
              </colgroup>
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
                  materials={rawMaterials}
                  elementKeys={elementKeys}
                  borderClass={borderClass}
                  rowClass={rawRowClass}
                />
                {blendRow}
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
              </tbody>
            </table>
          </div>
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
