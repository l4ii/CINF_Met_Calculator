import { useState } from 'react'
import {
  EQUIPMENT_BOM_PRICING_LABELS,
  type EquipmentBomItem,
} from '../../../../utils/copperEquipmentBom.ts'

export default function EquipmentBomTable({ darkMode, items }: { darkMode: boolean; items: EquipmentBomItem[] }) {
  const [query, setQuery] = useState('')
  const [group, setGroup] = useState('')
  const groups = [...new Set(items.map((item) => item.group).filter((value): value is string => Boolean(value)))]
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const visibleRows = items.map((item, index) => ({ item, index })).filter(({ item }) =>
    (!group || item.group === group) && (!normalizedQuery || [item.id, item.name, item.specification, item.material, item.note, item.source]
      .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery)))
  )
  const separateCount = items.filter((item) => !item.pricingMode || item.pricingMode === 'separate').length
  const grid = darkMode ? 'border-slate-600' : 'border-slate-300'
  const control = `rounded border px-2.5 py-1.5 text-xs ${darkMode ? 'border-slate-600 bg-slate-900 text-slate-200' : 'border-slate-300 bg-white text-slate-700'}`
  const headers = ['设备编码', '系统分组', '设备名称', '规格 / 能力', '数量', '单位', '材质 / 类型', '计价范围', '依据', '备注']

  return (
    <div className={`overflow-hidden rounded-lg border ${grid} ${darkMode ? 'bg-slate-900/40 text-slate-200' : 'bg-white text-slate-800'}`}>
      <div className={`flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 ${grid} ${darkMode ? 'bg-slate-800' : 'bg-slate-50'}`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold">设备明细</span>
          <span className="text-xs opacity-70">{items.length} 项 · {separateCount} 项单独计价</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input type="search" aria-label="搜索 BOM 设备" placeholder="搜索编码、名称、规格…" value={query} onChange={(event) => setQuery(event.target.value)} className={`${control} w-52`} />
          <select aria-label="按设备系统筛选" value={group} onChange={(event) => setGroup(event.target.value)} className={control}>
            <option value="">全部系统</option>
            {groups.map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </div>
      </div>
      <div className="max-h-[560px] overflow-auto">
        <table className="w-full min-w-[1280px] border-separate border-spacing-0 text-xs">
          <thead className={`sticky top-0 z-10 ${darkMode ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
            <tr>
              <th className={`w-10 border-b border-r px-2 py-1 text-center font-normal ${grid}`}>#</th>
              {headers.map((header, index) => <th key={header} className={`border-b border-r px-2 py-1 text-center font-normal last:border-r-0 ${grid}`}>{String.fromCharCode(65 + index)}</th>)}
            </tr>
            <tr>
              <th className={`border-b border-r px-2 py-2 text-center ${grid}`}>序号</th>
              {headers.map((header) => <th key={header} className={`whitespace-nowrap border-b border-r px-3 py-2 text-left font-semibold last:border-r-0 ${grid}`}>{header}</th>)}
            </tr>
          </thead>
          <tbody>
            {visibleRows.map(({ item, index }) => (
              <tr key={item.id} className={darkMode ? 'hover:bg-slate-800/80' : 'hover:bg-blue-50/70'}>
                <td className={`border-b border-r px-2 py-2 text-center font-mono opacity-70 ${grid}`}>{index + 1}</td>
                <td className={`whitespace-nowrap border-b border-r px-3 py-2 font-mono ${grid}`}>{item.id}</td>
                <td className={`whitespace-nowrap border-b border-r px-3 py-2 ${grid}`}>{item.group || '—'}</td>
                <td className={`min-w-32 border-b border-r px-3 py-2 font-medium ${grid}`}>{item.name}</td>
                <td className={`min-w-64 border-b border-r px-3 py-2 leading-relaxed ${grid}`}>{item.specification}</td>
                <td className={`border-b border-r px-3 py-2 text-right font-mono tabular-nums ${grid}`}>{item.quantity.toLocaleString('zh-CN', { maximumFractionDigits: 4 })}</td>
                <td className={`border-b border-r px-3 py-2 text-center ${grid}`}>{item.unit}</td>
                <td className={`min-w-32 border-b border-r px-3 py-2 ${grid}`}>{item.material}</td>
                <td className={`whitespace-nowrap border-b border-r px-3 py-2 ${grid}`}>
                  <span className={item.pricingMode === 'included' ? (darkMode ? 'text-amber-300' : 'text-amber-700') : item.pricingMode === 'interface' ? 'opacity-60' : ''}>
                    {EQUIPMENT_BOM_PRICING_LABELS[item.pricingMode ?? 'separate']}
                  </span>
                </td>
                <td className={`whitespace-nowrap border-b border-r px-3 py-2 ${grid}`}>{item.source || '选型计算'}</td>
                <td className={`min-w-52 border-b px-3 py-2 opacity-75 ${grid}`}>{item.note}</td>
              </tr>
            ))}
            {!visibleRows.length && <tr><td colSpan={11} className="px-4 py-8 text-center opacity-60">没有符合条件的设备</td></tr>}
          </tbody>
        </table>
      </div>
      <div className={`border-t px-3 py-2 text-xs leading-relaxed ${grid} ${darkMode ? 'bg-slate-800/70 text-slate-400' : 'bg-slate-50 text-slate-500'}`}>
        显示 {visibleRows.length} / {items.length} 项。水套、风口默认含在炉体报价中；接口预留不计入设备购置费。拆分采购时可在工程造价表调整计价范围。规格依据选型计算值。
      </div>
    </div>
  )
}
