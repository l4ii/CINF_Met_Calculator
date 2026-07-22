import type { MetcalFloImportBundle } from '../../utils/metcalFloMixExtract.ts'
import { summarizeMetcalFloExtraction } from '../../utils/metcalFloMixExtract.ts'
import { btnPrimary, btnSecondary, cardBase, hintText, sectionTitle } from '../../theme/uiTheme'

interface MetcalFloImportPanelProps {
  darkMode: boolean
  bundle: MetcalFloImportBundle
  sourceFileName: string
  onConfirm: () => void
  onCancel: () => void
}

export function MetcalFloImportPanel({
  darkMode,
  bundle,
  sourceFileName,
  onConfirm,
  onCancel,
}: MetcalFloImportPanelProps) {
  const { extraction, rawMaterials, recomputedBlend, comparison } = bundle
  const summary = summarizeMetcalFloExtraction(extraction)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
      <div className={`${cardBase(darkMode)} max-h-[90vh] w-full max-w-4xl overflow-y-auto p-5`}>
        <h3 className={sectionTitle(darkMode)}>MetCal 混料导入预览</h3>
        <p className={`${hintText(darkMode)} mt-2 text-sm`}>来源文件：{sourceFileName}</p>

        <pre
          className={`mt-4 whitespace-pre-wrap rounded-lg border p-3 text-xs leading-relaxed ${
            darkMode ? 'border-gray-600 bg-gray-900/60 text-gray-100' : 'border-gray-200 bg-gray-50 text-gray-800'
          }`}
        >
          {summary}
        </pre>

        <div className="mt-4">
          <h4 className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            将导入 {rawMaterials.length} 路原料
          </h4>
          <ul className={`${hintText(darkMode)} mt-2 space-y-1 text-sm`}>
            {rawMaterials.map((material) => (
              <li key={material.id}>
                {material.name}：{material.weight.toFixed(3)} t/h 干基，水分{' '}
                {(material.moisture ?? 0).toFixed(2)}%
              </li>
            ))}
          </ul>
        </div>

        {extraction.blend && Object.keys(extraction.blend.phaseRatios).length > 0 && (
          <div className="mt-4">
            <h4 className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              MetCal 混合铜精矿（物相，只读对照）
            </h4>
            <p className={`${hintText(darkMode)} text-xs`}>
              干基 {extraction.blend.dryFlowTH?.toFixed(3)} t/h；MetCal 以物相存储混料结果，下方为我方按元素化验重算对照。
            </p>
            <div className={`${hintText(darkMode)} mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-xs md:grid-cols-3`}>
              {Object.entries(extraction.blend.phaseRatios)
                .slice(0, 12)
                .map(([phase, value]) => (
                  <span key={phase}>
                    {phase}: {value.toFixed(2)}%
                  </span>
                ))}
            </div>
          </div>
        )}

        <div className="mt-4 overflow-x-auto">
          <h4 className={`mb-2 text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            我方重算混料元素（湿基 %）
          </h4>
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className={darkMode ? 'text-gray-300' : 'text-gray-600'}>
                <th className="px-2 py-1">元素</th>
                <th className="px-2 py-1">我方重算</th>
                <th className="px-2 py-1">MetCal 元素行</th>
                <th className="px-2 py-1">偏差</th>
              </tr>
            </thead>
            <tbody>
              {comparison.map((row) => (
                <tr key={row.element} className={darkMode ? 'text-gray-100' : 'text-gray-900'}>
                  <td className="px-2 py-1">{row.element}</td>
                  <td className="px-2 py-1">{row.oursPercent?.toFixed(3) ?? '—'}</td>
                  <td className="px-2 py-1">{row.metcalPercent?.toFixed(3) ?? '—'}</td>
                  <td className="px-2 py-1">
                    {row.delta != null ? `${row.delta >= 0 ? '+' : ''}${row.delta.toFixed(3)}` : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className={`${hintText(darkMode)} mt-2 text-xs`}>
            合计湿基流量：{recomputedBlend.totalWeight.toFixed(3)} t/h；Cu{' '}
            {(recomputedBlend.ratios['Cu(铜)'] ?? 0).toFixed(2)}%
          </p>
        </div>

        {extraction.warnings.length > 0 && (
          <div
            className={`mt-4 rounded-lg border px-3 py-2 text-sm ${
              darkMode ? 'border-amber-700 bg-amber-950/30 text-amber-100' : 'border-amber-200 bg-amber-50 text-amber-900'
            }`}
          >
            {extraction.warnings.map((warning) => (
              <p key={warning}>{warning}</p>
            ))}
          </div>
        )}

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" className={btnSecondary(darkMode)} onClick={onCancel}>
            取消
          </button>
          <button type="button" className={btnPrimary(darkMode)} onClick={onConfirm} disabled={!rawMaterials.length}>
            导入为新案例
          </button>
        </div>
      </div>
    </div>
  )
}
