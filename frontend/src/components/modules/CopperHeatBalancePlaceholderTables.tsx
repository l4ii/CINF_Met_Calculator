import { BATCH_TABLE_MASS_COL_WIDTH, BATCH_TABLE_PCT_COL_WIDTH } from '../../utils/copperBatchTableLayout'
import { BatchTableNumericReadonly } from './BatchTableNumericCell'

const HEAT_INCOME_PHYSICAL_ROWS = [
  '富氧空气',
  '粒煤',
  '石英石',
  '混合铜精矿',
  '铜烟尘',
  '渣精矿',
  '吹炼渣',
] as const

const HEAT_EXPENDITURE_PHYSICAL_ROWS = ['熔炼烟尘', '熔炼渣', '熔炼烟气', '冰铜'] as const

const INPUT_MATERIAL_SECTIONS: { title: string; components: string[] }[] = [
  { title: '富氧空气', components: ['O₂', 'N₂'] },
  { title: '粒煤', components: ['C', 'H', 'O', '灰分', 'Other'] },
  { title: '石英石', components: ['SiO₂', 'Other'] },
  {
    title: '混合铜精矿',
    components: ['FeS', 'FeS₂', 'PbS', 'SiO₂', 'ZnS', 'Ag', 'Au', 'As₂S₃', 'CuS', 'Other'],
  },
  { title: '铜烟尘', components: ['CuO', 'FeO', 'SiO₂', 'Other'] },
  { title: '渣精矿', components: ['FeO', 'SiO₂', 'Other'] },
  { title: '吹炼渣', components: ['FeO', 'SiO₂', 'Other'] },
]

const OUTPUT_PRODUCT_SECTIONS: { title: string; components: string[] }[] = [
  { title: '熔炼烟尘', components: ['CuO', 'CaO', 'FeO', 'PbO', 'Ag', 'Au', 'SiO₂', 'ZnO'] },
  { title: '熔炼渣', components: ['FeO', 'PbO', 'SiO₂', 'ZnO', 'Ag', 'Au', 'As₂O₃', 'Cu₂S'] },
  { title: '熔炼烟气', components: ['O₂', 'N₂', 'SO₂', 'CO₂'] },
  { title: '冰铜', components: ['Ag', 'Au', 'As₂O₃', 'Cu₂S', 'FeS', 'PbO', 'ZnO', 'Other'] },
]

function emptyNumericCell(darkMode: boolean) {
  return <BatchTableNumericReadonly darkMode={darkMode} value="" applicable={false} className="text-sm" />
}

function SectionTitle({ darkMode, children }: { darkMode: boolean; children: string }) {
  return (
    <div className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{children}</div>
  )
}

function BalanceHalfTable({
  darkMode,
  title,
  physicalRows,
  showNaturalLoss = false,
}: {
  darkMode: boolean
  title: string
  physicalRows: readonly string[]
  showNaturalLoss?: boolean
}) {
  const border = darkMode ? 'border-gray-600' : 'border-gray-200'
  const head = darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
  const cellBorder = `border ${border}`

  return (
    <div className={`overflow-auto rounded-lg border ${border}`}>
      <table className="w-full min-w-[360px] table-fixed border-collapse text-sm">
        <caption className={`caption-top px-2 py-2 text-left text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {title}
        </caption>
        <thead className={head}>
          <tr>
            <th className={`w-10 px-2 py-2 text-center ${cellBorder}`}>序号</th>
            <th className={`w-16 px-2 py-2 text-center ${cellBorder}`}>热类型</th>
            <th className={`px-2 py-2 text-center ${cellBorder}`}>物料</th>
            <th className={`px-2 py-2 text-center ${cellBorder}`} style={{ width: BATCH_TABLE_PCT_COL_WIDTH }}>温度/℃</th>
            <th className={`px-2 py-2 text-center ${cellBorder}`} style={{ width: BATCH_TABLE_MASS_COL_WIDTH }}>MJ/h</th>
            <th className={`px-2 py-2 text-center ${cellBorder}`} style={{ width: BATCH_TABLE_PCT_COL_WIDTH }}>%</th>
          </tr>
        </thead>
        <tbody>
          {physicalRows.map((material, index) => (
            <tr key={material}>
              <td className={`px-2 py-1.5 text-center ${cellBorder}`}>{index + 1}</td>
              <td className={`px-2 py-1.5 text-center ${cellBorder}`}>物理热</td>
              <td className={`px-2 py-1.5 text-center ${cellBorder}`}>{material}</td>
              <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>{emptyNumericCell(darkMode)}</td>
              <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>{emptyNumericCell(darkMode)}</td>
              <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>{emptyNumericCell(darkMode)}</td>
            </tr>
          ))}
          <tr>
            <td className={`px-2 py-1.5 text-center ${cellBorder}`}>{physicalRows.length + 1}</td>
            <td className={`px-2 py-1.5 text-center ${cellBorder}`}>化学热</td>
            <td className={`px-2 py-1.5 text-center ${cellBorder}`}>化学热</td>
            <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>{emptyNumericCell(darkMode)}</td>
            <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>{emptyNumericCell(darkMode)}</td>
            <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>{emptyNumericCell(darkMode)}</td>
          </tr>
          {showNaturalLoss && (
            <tr>
              <td className={`px-2 py-1.5 text-center ${cellBorder}`}>{physicalRows.length + 2}</td>
              <td className={`px-2 py-1.5 text-center ${cellBorder}`}>自然散热</td>
              <td className={`px-2 py-1.5 text-center ${cellBorder}`}>自然散热</td>
              <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>{emptyNumericCell(darkMode)}</td>
              <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>{emptyNumericCell(darkMode)}</td>
              <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>{emptyNumericCell(darkMode)}</td>
            </tr>
          )}
          <tr className={darkMode ? 'bg-gray-900/40' : 'bg-gray-50/80'}>
            <td colSpan={4} className={`px-2 py-1.5 text-center font-semibold ${cellBorder}`}>
              合计
            </td>
            <td className={`px-2 py-1.5 text-center font-mono font-semibold ${cellBorder}`}>{emptyNumericCell(darkMode)}</td>
            <td className={`px-2 py-1.5 text-center font-mono font-semibold ${cellBorder}`}>{emptyNumericCell(darkMode)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function ComponentBreakdownGrid({
  darkMode,
  sections,
}: {
  darkMode: boolean
  sections: { title: string; components: string[] }[]
}) {
  const border = darkMode ? 'border-gray-600' : 'border-gray-200'
  const head = darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600'
  const cellBorder = `border ${border}`

  return (
    <div className={`overflow-auto rounded-lg border ${border}`}>
      <div className="flex min-w-max divide-x divide-gray-200 dark:divide-gray-600">
        {sections.map((section) => (
          <table key={section.title} className="min-w-[140px] flex-1 border-collapse text-sm">
            <thead className={head}>
              <tr>
                <th colSpan={2} className={`px-2 py-2 text-center ${cellBorder}`}>
                  {section.title}
                </th>
              </tr>
              <tr>
                <th className={`px-2 py-1.5 text-center text-xs ${cellBorder}`}>组分</th>
                <th className={`px-2 py-1.5 text-center text-xs ${cellBorder}`} style={{ width: BATCH_TABLE_MASS_COL_WIDTH }}>MJ/h</th>
              </tr>
            </thead>
            <tbody>
              {section.components.map((component) => (
                <tr key={component}>
                  <td className={`px-2 py-1 text-center text-xs ${cellBorder}`}>{component}</td>
                  <td className={`px-2 py-1 text-center font-mono text-xs ${cellBorder}`}>{emptyNumericCell(darkMode)}</td>
                </tr>
              ))}
              <tr className={darkMode ? 'bg-gray-900/40' : 'bg-gray-50/80'}>
                <td className={`px-2 py-1 text-center text-xs font-semibold ${cellBorder}`}>合计</td>
                <td className={`px-2 py-1 text-center font-mono text-xs font-semibold ${cellBorder}`}>{emptyNumericCell(darkMode)}</td>
              </tr>
            </tbody>
          </table>
        ))}
      </div>
    </div>
  )
}

export function CopperHeatBalancePlaceholderTables({ darkMode }: { darkMode: boolean }) {
  return (
    <div className="space-y-4">
      <div>
        <SectionTitle darkMode={darkMode}>表10 · 侧吹熔炼收支热平衡 (Q)</SectionTitle>
        <div className="mt-2 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <BalanceHalfTable darkMode={darkMode} title="热收入" physicalRows={HEAT_INCOME_PHYSICAL_ROWS} />
          <BalanceHalfTable
            darkMode={darkMode}
            title="热支出"
            physicalRows={HEAT_EXPENDITURE_PHYSICAL_ROWS}
            showNaturalLoss
          />
        </div>
      </div>
      <div>
        <SectionTitle darkMode={darkMode}>表11 · 投入分项物理热</SectionTitle>
        <div className="mt-2">
          <ComponentBreakdownGrid darkMode={darkMode} sections={INPUT_MATERIAL_SECTIONS} />
        </div>
      </div>
      <div>
        <SectionTitle darkMode={darkMode}>表12 · 产出分项物理热</SectionTitle>
        <div className="mt-2">
          <ComponentBreakdownGrid darkMode={darkMode} sections={OUTPUT_PRODUCT_SECTIONS} />
        </div>
      </div>
    </div>
  )
}
