/**
 * 入炉原料元素组成分析表
 * 采用经典表格：行=物料，列=原料名称|投料量|占比|各元素
 * 混合矿可展开/收起查看详细原料；总计、原料/混合矿、富氧空气高亮
 */
import { useState } from 'react'
import { useCalc } from '../context/CalcContext'

interface ElementTableCompactProps {
  darkMode: boolean
  language?: 'zh' | 'en'
  /** 浮动模式：用于悬浮 overlay，去除吸顶样式 */
  variant?: 'inline' | 'floating'
}

/** 元素列顺序及表头简写 */
const ELEMENT_COLS: { key: string; label: string }[] = [
  { key: 'O (氧)', label: 'O' },
  { key: 'N (氮)', label: 'N' },
  { key: 'Sb(锑)', label: 'Sb' },
  { key: 'S (硫)', label: 'S' },
  { key: 'Fe(铁)', label: 'Fe' },
  { key: 'Pb(铅)', label: 'Pb' },
  { key: 'As(砷)', label: 'As' },
  { key: 'Zn(锌)', label: 'Zn' },
  { key: 'Cu(铜)', label: 'Cu' },
  { key: 'Si(硅)', label: 'Si' },
  { key: 'Ca(钙)', label: 'Ca' },
  { key: 'Al(铝)', label: 'Al' },
  { key: 'Ag(银)', label: 'Ag' },
  { key: 'Au(金)', label: 'Au' },
  { key: 'C (碳)', label: 'C' },
  { key: 'Other(其他)', label: 'Other' },
]

export default function ElementTableCompact({ darkMode, language = 'zh', variant = 'inline' }: ElementTableCompactProps) {
  const isEn = language === 'en'
  const { elementTableRows, mixResult, totalCost } = useCalc()
  const [mixedOreExpanded, setMixedOreExpanded] = useState(false)
  const [solventExpanded, setSolventExpanded] = useState(false)

  const cardCls = variant === 'floating'
    ? (darkMode ? 'bg-transparent border-gray-600/60' : 'bg-transparent border-gray-200/70')
    : (darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-white border-gray-200')
  const labelCls = darkMode ? 'text-gray-400' : 'text-gray-500'
  const borderCls = darkMode ? 'border-gray-600' : 'border-gray-200'
  const stickyCls = variant === 'floating' ? '' : 'sticky top-0 z-20 backdrop-blur-md ' + (darkMode ? 'bg-gray-800/90' : 'bg-white/90')

  if (elementTableRows.length === 0) {
    return null
  }

  const allCols = ELEMENT_COLS.filter((c) =>
    elementTableRows.some((r) => c.key in r.elements)
  )

  const rowsToShow = elementTableRows.flatMap((row) => {
    if (row.rowType === 'mixed' && row.detailRows) {
      if (mixedOreExpanded) {
        return [{ ...row, isDisplayOnly: true }, ...row.detailRows]
      }
      return [row]
    }
    if (row.rowType === 'solvent' && row.detailRows) {
      if (solventExpanded) {
        return [{ ...row, isDisplayOnly: true }, ...row.detailRows]
      }
      return [row]
    }
    if (row.rowType === 'base' && elementTableRows.some((r) => r.rowType === 'mixed')) {
      return []
    }
    return [row]
  })

  const getRowHighlight = (row: (typeof rowsToShow)[0]) => {
    const r = row as typeof elementTableRows[0]
    if (r.rowType === 'total') return darkMode ? 'bg-blue-900/20' : 'bg-blue-50'
    if (r.rowType === 'mixed' || r.rowType === 'base') return darkMode ? 'bg-amber-900/20' : 'bg-amber-50'
    if (r.rowType === 'solvent') return darkMode ? 'bg-purple-900/20' : 'bg-purple-50'
    if (r.rowType === 'oxygen') return darkMode ? 'bg-teal-900/20' : 'bg-teal-50'
    return ''
  }

  const getRowTextCls = (row: (typeof rowsToShow)[0]) => {
    const r = row as typeof elementTableRows[0]
    if (r.rowType === 'total') return darkMode ? 'text-blue-200' : 'text-blue-800'
    if (r.rowType === 'mixed' || r.rowType === 'base') return darkMode ? 'text-amber-200' : 'text-amber-800'
    if (r.rowType === 'solvent') return darkMode ? 'text-purple-200' : 'text-purple-800'
    if (r.rowType === 'oxygen') return darkMode ? 'text-teal-200' : 'text-teal-800'
    return ''
  }

  const nameMapEn: Record<string, string> = {
    '入炉混合矿': 'Mixed Feed',
    '混合矿': 'Mixed Feed',
    '配料总计': 'Batching Total',
    '总计': 'Total',
    '熔剂': 'Solvent',
    '富氧空气': 'Oxygen-Enriched Air',
    '石灰': 'Lime',
    '铁矿石': 'Iron Ore',
    '锑精矿': 'Antimony Concentrate',
    '锑金精矿': 'Antimony-Gold Concentrate',
    '锑锍': 'Antimony Matte',
    '铅锑混合精矿': 'Lead-Antimony Mixed Concentrate',
    '泡渣': 'Foamy Slag',
  }
  const displayName = (name: string) => (isEn ? (nameMapEn[name] ?? name) : name)

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${cardCls} ${stickyCls}`}>
      {variant === 'inline' && (
        <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          {isEn ? 'Feed Element Summary Table' : '入炉原料元素总表'}
        </h3>
      )}
      <div>
        <table className="w-full text-xs border-collapse table-fixed" style={{ tableLayout: 'fixed' }}>
          <thead>
            <tr className={`border-b ${borderCls}`}>
              <th className={`text-left py-2 px-2 font-medium w-24 ${labelCls} ${variant === 'floating' ? (darkMode ? 'bg-gray-700/40' : 'bg-gray-100/50') : (darkMode ? 'bg-gray-700/80' : 'bg-gray-50')}`}>
                {isEn ? 'Material' : '原料名称'}
              </th>
              <th className={`text-right py-2 px-1 font-medium w-16 ${labelCls}`}>{isEn ? 'Mass' : '投料量'}</th>
              <th className={`text-right py-2 px-1 font-medium w-14 ${labelCls}`}>{isEn ? 'Share(%)' : '占比(%)'}</th>
              {allCols.map((c) => (
                <th key={c.key} className={`text-right py-2 px-0.5 font-medium w-12 ${labelCls}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rowsToShow.map((row, i) => {
              const r = row as typeof elementTableRows[0] & { isDisplayOnly?: boolean }
              const isMixed = r.rowType === 'mixed' && r.detailRows
              const isSolvent = r.rowType === 'solvent' && r.detailRows
              const isDisplayOnly = r.isDisplayOnly
              return (
              <tr
                key={i}
                className={`border-b ${borderCls} ${getRowHighlight(row)}`}
              >
                <td className={`py-1.5 px-2 font-medium truncate ${getRowHighlight(row) || (variant === 'floating' ? (darkMode ? 'bg-gray-700/30' : 'bg-white/40') : (darkMode ? 'bg-gray-700/80' : 'bg-white'))} ${getRowTextCls(row)}`} title={displayName(row.name)}>
                  {isMixed ? (
                    <span className="flex items-center justify-between w-full min-w-0">
                      <span className="truncate">{displayName(row.name)}</span>
                      <button
                        type="button"
                        onClick={() => setMixedOreExpanded(!mixedOreExpanded)}
                        className="flex-shrink-0 ml-1 w-5 h-5 flex items-center justify-center rounded hover:bg-black/10"
                        title={mixedOreExpanded ? (isEn ? 'Collapse' : '收起') : (isEn ? 'Expand details' : '展开查看详细')}
                      >
                        {mixedOreExpanded ? '▼' : '▶'}
                      </button>
                    </span>
                  ) : isSolvent ? (
                    <span className="flex items-center justify-between w-full min-w-0">
                      <span className="truncate">{displayName(row.name)}</span>
                      <button
                        type="button"
                        onClick={() => setSolventExpanded(!solventExpanded)}
                        className="flex-shrink-0 ml-1 w-5 h-5 flex items-center justify-center rounded hover:bg-black/10"
                        title={solventExpanded ? (isEn ? 'Collapse' : '收起') : (isEn ? 'Expand details' : '展开查看详细')}
                      >
                        {solventExpanded ? '▼' : '▶'}
                      </button>
                    </span>
                  ) : (
                    displayName(row.name)
                  )}
                </td>
                <td className="text-right py-1.5 px-1 font-mono">{row.weight.toFixed(4)}</td>
                <td className="text-right py-1.5 px-1 font-mono">{row.ratioPct.toFixed(4)}</td>
                {allCols.map((c) => (
                  <td key={c.key} className="text-right py-1.5 px-0.5 font-mono">
                    {(row.elements?.[c.key] ?? 0).toFixed(4)}
                  </td>
                ))}
              </tr>
            )})}
          </tbody>
        </table>
      </div>
      <div className={`mt-3 pt-3 border-t ${borderCls} flex flex-wrap gap-4 text-sm`}>
        {(() => {
          const totalRow = elementTableRows.find((r) => r.rowType === 'total')
          const feedWeight = totalRow?.weight ?? mixResult?.totalWeight ?? 0
          return feedWeight > 0 ? (
            <span className={labelCls}>
              {isEn ? 'Total feed mass:' : '投料量总质量:'} <span className="font-mono font-semibold">{feedWeight.toFixed(4)} t/h</span>
            </span>
          ) : null
        })()}
        {totalCost > 0 && (
          <span className={labelCls}>
            {isEn ? 'Total batching cost:' : '配料总成本:'} <span className="font-mono font-semibold">{totalCost.toFixed(0)} {isEn ? 'CNY/h' : '元/h'}</span>
          </span>
        )}
      </div>
    </div>
  )
}
