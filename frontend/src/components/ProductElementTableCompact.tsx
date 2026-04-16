/**
 * 产物元素分布表：行=产物，列=产物名称|质量|占比|各元素
 * 采用与入炉原料元素总表相同的设计，支持悬浮显示
 */
import type { ProductResult } from '../utils/productCalc'

interface ProductElementTableCompactProps {
  darkMode: boolean
  productResult: ProductResult
  /** 浮动模式：用于悬浮 overlay */
  variant?: 'inline' | 'floating'
  language?: 'zh' | 'en'
}

const PRODUCT_KEYS = ['slag', 'flue', 'sb2o3', 'matte', 'nobleSb'] as const
const PRODUCT_NAMES: Record<string, string> = {
  slag: '熔炼渣',
  flue: '烟气',
  sb2o3: '锑氧粉',
  matte: '锑锍',
  nobleSb: '贵锑',
}

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
  { key: 'Other(其他)', label: 'Other' },
  { key: 'C (碳)', label: 'C' },
]

export default function ProductElementTableCompact({
  darkMode,
  productResult,
  variant = 'inline',
  language = 'zh',
}: ProductElementTableCompactProps) {
  const isEn = language === 'en'
  const { masses, elementAllocation } = productResult
  const totalMass = Object.values(masses).reduce((a, b) => a + b, 0)
  const productNames: Record<string, string> = isEn
    ? {
        slag: 'Smelting Slag',
        flue: 'Flue Gas',
        sb2o3: 'Sb₂O₃ Powder',
        matte: 'Antimony Matte',
        nobleSb: 'Noble Antimony',
      }
    : PRODUCT_NAMES

  const rows = PRODUCT_KEYS.map((key) => {
    const weight = masses[key]
    const ratioPct = totalMass > 0 ? (weight / totalMass) * 100 : 0
    const elements: Record<string, number> = {}
    for (const a of elementAllocation) {
      const val = a[key as keyof typeof a] as number
      if (val > 1e-12) elements[a.element] = val
    }
    return {
      name: productNames[key],
      key,
      weight,
      ratioPct,
      elements,
    }
  })

  const allCols = ELEMENT_COLS.filter((c) =>
    rows.some((r) => c.key in r.elements)
  )

  const cardCls = variant === 'floating'
    ? (darkMode ? 'bg-transparent border-gray-600/60' : 'bg-transparent border-gray-200/70')
    : (darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-white border-gray-200')
  const labelCls = darkMode ? 'text-gray-400' : 'text-gray-500'
  const borderCls = darkMode ? 'border-gray-600' : 'border-gray-200'
  const stickyCls = variant === 'floating' ? '' : 'sticky top-0 z-20 backdrop-blur-md ' + (darkMode ? 'bg-gray-800/90' : 'bg-white/90')

  const firstCellCls = variant === 'floating'
    ? (darkMode ? 'bg-gray-700/30' : 'bg-white/40')
    : (darkMode ? 'bg-gray-700/80' : 'bg-white')

  return (
    <div className={`rounded-xl border p-4 shadow-sm w-full min-w-0 ${cardCls} ${stickyCls}`}>
      {variant === 'inline' && (
        <h3 className={`text-base font-semibold mb-3 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          {isEn ? 'Product Element Distribution Table' : '产物元素分布表'}
        </h3>
      )}
      <div className="w-full min-w-0">
        <table className="w-full min-w-full text-xs border-collapse" style={{ tableLayout: 'fixed', width: '100%' }}>
          <thead>
            <tr className={`border-b ${borderCls}`}>
              <th className={`text-left py-2 px-2 font-medium w-24 ${labelCls} ${variant === 'floating' ? (darkMode ? 'bg-gray-700/40' : 'bg-gray-100/50') : (darkMode ? 'bg-gray-700/80' : 'bg-gray-50')}`}>
                {isEn ? 'Product' : '产物名称'}
              </th>
              <th className={`text-right py-2 px-1 font-medium w-16 ${labelCls}`}>{isEn ? 'Mass (t/h)' : '质量(t/h)'}</th>
              <th className={`text-right py-2 px-1 font-medium w-14 ${labelCls}`}>{isEn ? 'Share (%)' : '占比(%)'}</th>
              {allCols.map((c) => (
                <th key={c.key} className={`text-right py-2 px-0.5 font-medium w-12 ${labelCls}`}>
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={`border-b ${borderCls}`}>
                <td className={`py-1.5 px-2 font-medium truncate ${firstCellCls} ${darkMode ? 'text-gray-200' : 'text-gray-800'}`} title={row.name}>
                  {row.name}
                </td>
                <td className="text-right py-1.5 px-1 font-mono">{row.weight.toFixed(4)}</td>
                <td className="text-right py-1.5 px-1 font-mono">{row.ratioPct.toFixed(2)}</td>
                {allCols.map((c) => (
                  <td key={c.key} className="text-right py-1.5 px-0.5 font-mono">
                    {(row.elements?.[c.key] ?? 0).toFixed(4)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={`mt-3 pt-3 border-t ${borderCls} flex flex-wrap gap-4 text-sm`}>
        <span className={labelCls}>
          {isEn ? 'Total product mass' : '产物总质量'}: <span className="font-mono font-semibold">{totalMass.toFixed(4)} t/h</span>
        </span>
      </div>
    </div>
  )
}
