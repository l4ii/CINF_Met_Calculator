import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { batchPhaseTableColWidths, batchTableDataColWidth } from '../../../../utils/antimonyBatchTableLayout'
import { elementSymbolLabel } from '../../../../utils/antimonyElementDisplay'
import { calculateKnownTotal, type AntimonyElementKey, type AntimonyRatios } from '../../../../utils/antimonyWorkflowCalc'
import { AntimonyBatchTableColGroup } from './AntimonyBatchTableColGroup'
import { BatchTableNumericReadonly } from '../../BatchTableNumericCell'

export type ProductElementTableProduct = {
  key: string
  name: string
  mass: number
  composition: Partial<Record<AntimonyElementKey, number>>
}

const STICKY_CATEGORY = 'left-0 min-w-[56px]'
const STICKY_NAME_LEFT = 'left-[56px]'

function nameColStyle(width: number): CSSProperties {
  return { width, minWidth: width }
}

function rowToneClass(dark: boolean) {
  return dark ? 'bg-indigo-950/20 text-indigo-100' : 'bg-indigo-50 text-indigo-900'
}

function stickyCellClass(dark: boolean, side: 'category' | 'name') {
  const left = side === 'category' ? STICKY_CATEGORY : STICKY_NAME_LEFT
  const align = side === 'category' ? 'text-center font-semibold' : 'text-center'
  return `sticky ${left} z-20 border-t px-2 py-1.5 align-middle text-sm ${align} ${rowToneClass(dark)}`
}

function categoryRowSpanCellClass(dark: boolean) {
  return `sticky ${STICKY_CATEGORY} z-20 border-t px-2 py-1.5 align-middle text-center text-sm font-semibold ${rowToneClass(dark)}`
}

function dataCellClass(dark: boolean) {
  return `border-t px-0.5 py-1.5 align-middle text-center text-sm ${rowToneClass(dark)}`
}

function productElementTotal(product: ProductElementTableProduct) {
  return calculateKnownTotal(product.composition as AntimonyRatios) + (product.composition['Other(其他)'] ?? 0)
}

export function AntimonyBatchProductElementTable({
  darkMode,
  elementKeys,
  products,
  nameColWidth,
  title = '产出-产物元素表（w%）',
}: {
  darkMode: boolean
  elementKeys: AntimonyElementKey[]
  products: ProductElementTableProduct[]
  nameColWidth: number
  title?: string
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(0)
  const theadCls = darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
  const colCount = elementKeys.length + 4

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const update = () => setViewportWidth(el.clientWidth)
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const elementColumnWidths = useMemo(
    () =>
      elementKeys.map((element) =>
        batchTableDataColWidth(
          elementSymbolLabel(element),
          products.map((product) => product.composition[element] ?? 0),
          false
        )
      ),
    [elementKeys, products]
  )
  const { widths: colWidths, tableWidth: resolvedTableWidth } = batchPhaseTableColWidths(
    nameColWidth,
    elementKeys.length,
    viewportWidth,
    elementColumnWidths
  )
  const resolvedNameColWidth = colWidths[1] ?? nameColWidth

  return (
    <div
      ref={containerRef}
      className={`overflow-auto rounded-lg border ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}
    >
      <table className="table-fixed w-full text-sm" style={{ width: resolvedTableWidth }}>
        <AntimonyBatchTableColGroup widths={colWidths} />
        <thead className={theadCls}>
          <tr>
            <th colSpan={colCount} className={`p-0 ${theadCls}`}>
              <div
                className="sticky left-0 px-2 py-1.5 text-center text-sm font-semibold"
                style={{ width: viewportWidth || undefined }}
              >
                {title}
              </div>
            </th>
          </tr>
          <tr>
            <th className={`sticky left-0 z-30 px-2 py-1.5 text-center text-sm font-semibold ${theadCls}`}>类型</th>
            <th
              className={`sticky left-[56px] z-30 px-2 py-1.5 text-center text-sm font-semibold ${theadCls}`}
              style={nameColStyle(resolvedNameColWidth)}
            >
              名称
            </th>
            <th className="px-1 py-1.5 text-center text-sm font-semibold">t/h</th>
            {elementKeys.map((element) => (
              <th key={`product-element-head-${element}`} className="px-0.5 py-1.5 text-center text-sm font-semibold">
                {elementSymbolLabel(element)}
              </th>
            ))}
            <th className="px-1 py-1.5 text-center text-sm font-semibold">合计</th>
          </tr>
        </thead>
        <tbody>
          {products.length === 0 ? (
            <tr>
              <td colSpan={colCount} className={`border-t px-3 py-6 text-center ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                —
              </td>
            </tr>
          ) : (
            products.map((product, index) => (
              <tr key={`product-element-row-${product.key}`}>
                {index === 0 && (
                  <td rowSpan={products.length} className={categoryRowSpanCellClass(darkMode)}>
                    产出
                  </td>
                )}
                <td className={stickyCellClass(darkMode, 'name')} style={nameColStyle(resolvedNameColWidth)}>
                  <span className="block whitespace-nowrap text-center" title={product.name}>
                    {product.name}
                  </span>
                </td>
                <td className={dataCellClass(darkMode)}>
                  <BatchTableNumericReadonly darkMode={darkMode} value={product.mass} className="text-sm" />
                </td>
                {elementKeys.map((element) => (
                  <td key={`${product.key}-${element}`} className={dataCellClass(darkMode)}>
                    <BatchTableNumericReadonly
                      darkMode={darkMode}
                      value={product.composition[element] ?? 0}
                      helpTitle={`${product.name} · ${elementSymbolLabel(element)} w%`}
                      className="text-sm"
                    />
                  </td>
                ))}
                <td className={`${dataCellClass(darkMode)} font-semibold`}>
                  <BatchTableNumericReadonly
                    darkMode={darkMode}
                    value={productElementTotal(product)}
                    helpTitle={`${product.name} 元素合计`}
                    className="text-sm font-semibold"
                  />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}
