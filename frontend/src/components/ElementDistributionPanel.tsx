/**
 * 元素分布表：可嵌入原料页，或由悬浮按钮弹出的浮层
 */
import { useCalc } from '../context/CalcContext'

interface ElementDistributionPanelProps {
  darkMode: boolean
  /** 浮层模式：有关闭按钮 */
  asOverlay?: boolean
  onClose?: () => void
}

export default function ElementDistributionPanel({
  darkMode,
  asOverlay = false,
  onClose,
}: ElementDistributionPanelProps) {
  const { elementTableRows, mixResult } = useCalc()

  const cardCls = darkMode ? 'bg-gray-700/50 border-gray-600' : 'bg-white border-gray-200'
  const labelCls = darkMode ? 'text-gray-300' : 'text-gray-700'

  const allElements = elementTableRows.length > 0
    ? Array.from(
        new Set(elementTableRows.flatMap((r) => Object.keys(r.elements)))
      ).sort()
    : []

  if (elementTableRows.length === 0) {
    return (
      <div className={`rounded-xl border p-5 ${cardCls}`}>
        <h3 className={`text-lg font-semibold mb-4 ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          入炉原料元素组成分析
        </h3>
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
          请先在配料计算页添加物料
        </p>
      </div>
    )
  }

  return (
    <div
      className={`rounded-xl border p-5 ${cardCls} ${
        asOverlay ? 'shadow-xl max-w-2xl max-h-[80vh] overflow-auto' : ''
      }`}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className={`text-lg font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
          入炉原料元素组成分析 (单位:%)
        </h3>
        {asOverlay && onClose && (
          <button
            onClick={onClose}
            className={`p-1.5 rounded-lg ${darkMode ? 'hover:bg-gray-600 text-gray-300' : 'hover:bg-gray-200 text-gray-600'}`}
            aria-label="关闭"
          >
            ×
          </button>
        )}
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className={`border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
              <th className={`text-left py-2 px-2 ${labelCls}`}>原料名称</th>
              <th className={`text-right py-2 px-2 ${labelCls}`}>投料量</th>
              <th className={`text-right py-2 px-2 ${labelCls}`}>占比(%)</th>
              {allElements.map((e) => (
                <th key={e} className={`text-right py-2 px-2 ${labelCls}`}>
                  {e.split('(')[0].trim()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {elementTableRows.map((row, i) => (
              <tr key={i} className={`border-b ${darkMode ? 'border-gray-600' : 'border-gray-200'}`}>
                <td className="py-2 px-2">{row.name}</td>
                <td className="text-right py-2 px-2 font-mono">{row.weight.toFixed(2)}</td>
                <td className="text-right py-2 px-2 font-mono">{row.ratioPct.toFixed(2)}</td>
                {allElements.map((e) => (
                  <td key={e} className="text-right py-2 px-2 font-mono">
                    {(row.elements[e] ?? 0).toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {mixResult && (
        <div className={`mt-3 text-xs ${labelCls}`}>
          固态混料总质量：<span className="font-mono font-semibold">{mixResult.totalWeight.toFixed(4)} t/h</span>
        </div>
      )}
    </div>
  )
}
