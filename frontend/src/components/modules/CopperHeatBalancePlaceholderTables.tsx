import { BATCH_TABLE_MASS_COL_WIDTH, BATCH_TABLE_PCT_COL_WIDTH } from '../../utils/copperBatchTableLayout'
import type { CopperHeatBalanceResult, HeatComponentRow, HeatFlowRow } from '../../utils/copperHeatBalance'
import { BatchTableNumericReadonly } from './BatchTableNumericCell'

function formatPhaseFormulaParts(label: string) {
  return label.split(/(\d+)/).filter(Boolean)
}

function PhaseFormula({ value }: { value: string }) {
  return (
    <span className="inline-flex items-baseline justify-center whitespace-nowrap" title={value}>
      {formatPhaseFormulaParts(value).map((part, index) =>
        /^\d+$/.test(part) ? (
          <sub key={`${part}-${index}`} className="text-[0.72em] leading-none">
            {part}
          </sub>
        ) : (
          <span key={`${part}-${index}`}>{part}</span>
        )
      )}
    </span>
  )
}

function numberCell(darkMode: boolean, value: number | string | null | undefined, helpTitle?: string) {
  return (
    <BatchTableNumericReadonly
      darkMode={darkMode}
      value={value == null ? '' : value}
      applicable={value != null && value !== ''}
      className="text-sm"
      helpTitle={helpTitle}
    />
  )
}

function SectionTitle({ darkMode, children }: { darkMode: boolean; children: string }) {
  return (
    <div className={`text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-600'}`}>{children}</div>
  )
}

function tableTone(darkMode: boolean) {
  return {
    border: darkMode ? 'border-gray-600' : 'border-gray-200',
    head: darkMode ? 'bg-gray-800 text-gray-300' : 'bg-gray-50 text-gray-600',
    total: darkMode ? 'bg-gray-900/40' : 'bg-gray-50/80',
  }
}

function BalanceHalfTable({
  darkMode,
  title,
  rows,
}: {
  darkMode: boolean
  title: string
  rows: HeatFlowRow[]
}) {
  const tone = tableTone(darkMode)
  const cellBorder = `border ${tone.border}`
  const total = rows.reduce((sum, row) => sum + row.heatMJh, 0)

  return (
    <div className={`overflow-auto rounded-lg border ${tone.border}`}>
      <table className="w-full min-w-[420px] table-fixed border-collapse text-sm">
        <caption className={`caption-top px-2 py-2 text-left text-xs font-semibold ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
          {title}
        </caption>
        <thead className={tone.head}>
          <tr>
            <th className={`w-10 px-2 py-2 text-center ${cellBorder}`}>序号</th>
            <th className={`w-20 px-2 py-2 text-center ${cellBorder}`}>热类型</th>
            <th className={`px-2 py-2 text-center ${cellBorder}`}>物料</th>
            <th className={`px-2 py-2 text-center ${cellBorder}`} style={{ width: BATCH_TABLE_PCT_COL_WIDTH }}>温度/℃</th>
            <th className={`px-2 py-2 text-center ${cellBorder}`} style={{ width: BATCH_TABLE_MASS_COL_WIDTH }}>MJ/h</th>
            <th className={`px-2 py-2 text-center ${cellBorder}`} style={{ width: BATCH_TABLE_PCT_COL_WIDTH }}>%</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={`${title}-${row.material}-${index}`}>
              <td className={`px-2 py-1.5 text-center ${cellBorder}`}>{index + 1}</td>
              <td className={`px-2 py-1.5 text-center ${cellBorder}`}>
                {row.type === 'physical' ? '物理热' : row.type === 'chemical' ? '化学热' : '散热'}
              </td>
              <td className={`px-2 py-1.5 text-center ${cellBorder}`}>{row.material}</td>
              <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>
                {numberCell(darkMode, row.temperature)}
              </td>
              <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>
                {numberCell(darkMode, row.heatMJh)}
              </td>
              <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>
                {numberCell(darkMode, row.percent)}
              </td>
            </tr>
          ))}
          <tr className={tone.total}>
            <td colSpan={4} className={`px-2 py-1.5 text-center font-semibold ${cellBorder}`}>
              合计
            </td>
            <td className={`px-2 py-1.5 text-center font-mono font-semibold ${cellBorder}`}>
              {numberCell(darkMode, total)}
            </td>
            <td className={`px-2 py-1.5 text-center font-mono font-semibold ${cellBorder}`}>
              {numberCell(darkMode, rows.length > 0 ? 100 : null)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function ComponentBreakdownGrid({
  darkMode,
  rows,
  title,
}: {
  darkMode: boolean
  rows: HeatComponentRow[]
  title: string
}) {
  const tone = tableTone(darkMode)
  const cellBorder = `border ${tone.border}`
  const displayRows = rows.filter((row) => Math.abs(row.heatMJh) > 1e-9 || row.massTh > 0)
  const total = displayRows.reduce((sum, row) => sum + row.heatMJh, 0)

  return (
    <div className={`overflow-auto rounded-lg border ${tone.border}`}>
      <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
        <thead className={tone.head}>
          <tr>
            <th colSpan={7} className={`px-2 py-2 text-center ${cellBorder}`}>
              {title}
            </th>
          </tr>
          <tr>
            <th className={`px-2 py-1.5 text-center text-xs ${cellBorder}`}>物料</th>
            <th className={`px-2 py-1.5 text-center text-xs ${cellBorder}`}>组分</th>
            <th className={`px-2 py-1.5 text-center text-xs ${cellBorder}`}>t/h</th>
            <th className={`px-2 py-1.5 text-center text-xs ${cellBorder}`}>温度/℃</th>
            <th className={`px-2 py-1.5 text-center text-xs ${cellBorder}`}>H25 kJ/mol</th>
            <th className={`px-2 py-1.5 text-center text-xs ${cellBorder}`}>HT kJ/mol</th>
            <th className={`px-2 py-1.5 text-center text-xs ${cellBorder}`} style={{ width: BATCH_TABLE_MASS_COL_WIDTH }}>MJ/h</th>
          </tr>
        </thead>
        <tbody>
          {displayRows.length === 0 ? (
            <tr>
              <td colSpan={7} className={`px-2 py-4 text-center ${cellBorder} ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                —
              </td>
            </tr>
          ) : (
            displayRows.map((row, index) => (
              <tr key={`${title}-${row.section}-${row.component}-${index}`}>
                <td className={`px-2 py-1 text-center text-xs ${cellBorder}`}>{row.section}</td>
                <td className={`px-2 py-1 text-center text-xs ${cellBorder}`}>
                  <PhaseFormula value={row.component} />
                </td>
                <td className={`px-2 py-1 text-center font-mono text-xs ${cellBorder}`}>
                  {numberCell(darkMode, row.massTh)}
                </td>
                <td className={`px-2 py-1 text-center font-mono text-xs ${cellBorder}`}>
                  {numberCell(darkMode, row.temperature)}
                </td>
                <td className={`px-2 py-1 text-center font-mono text-xs ${cellBorder}`}>
                  {numberCell(darkMode, row.enthalpy25KJmol)}
                </td>
                <td className={`px-2 py-1 text-center font-mono text-xs ${cellBorder}`}>
                  {numberCell(darkMode, row.enthalpyTKJmol)}
                </td>
                <td className={`px-2 py-1 text-center font-mono text-xs ${cellBorder}`}>
                  {numberCell(darkMode, row.heatMJh)}
                </td>
              </tr>
            ))
          )}
          <tr className={tone.total}>
            <td colSpan={6} className={`px-2 py-1 text-center text-xs font-semibold ${cellBorder}`}>合计</td>
            <td className={`px-2 py-1 text-center font-mono text-xs font-semibold ${cellBorder}`}>
              {numberCell(darkMode, total)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function ReactionTable({ darkMode, result }: { darkMode: boolean; result: CopperHeatBalanceResult }) {
  const tone = tableTone(darkMode)
  const cellBorder = `border ${tone.border}`
  return (
    <div className={`overflow-auto rounded-lg border ${tone.border}`}>
      <table className="w-full min-w-[760px] table-fixed border-collapse text-sm">
        <thead className={tone.head}>
          <tr>
            <th className={`w-10 px-2 py-2 text-center ${cellBorder}`}>序号</th>
            <th className={`px-2 py-2 text-center ${cellBorder}`}>已配平方程式</th>
            <th className={`px-2 py-2 text-center ${cellBorder}`} style={{ width: BATCH_TABLE_PCT_COL_WIDTH }}>基准相</th>
            <th className={`px-2 py-2 text-center ${cellBorder}`} style={{ width: BATCH_TABLE_MASS_COL_WIDTH }}>kmol/h</th>
            <th className={`px-2 py-2 text-center ${cellBorder}`} style={{ width: BATCH_TABLE_MASS_COL_WIDTH }}>ΔH kJ/mol</th>
            <th className={`px-2 py-2 text-center ${cellBorder}`} style={{ width: BATCH_TABLE_MASS_COL_WIDTH }}>放热 MJ/h</th>
          </tr>
        </thead>
        <tbody>
          {result.equations.map((row, index) => (
            <tr key={row.formula}>
              <td className={`px-2 py-1.5 text-center ${cellBorder}`}>{index + 1}</td>
              <td className={`px-2 py-1.5 text-center ${cellBorder}`} title={row.note}>
                <span className="font-mono text-xs">{row.formula}</span>
              </td>
              <td className={`px-2 py-1.5 text-center ${cellBorder}`}>
                <PhaseFormula value={row.limitingPhase} />
              </td>
              <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>
                {numberCell(darkMode, row.extentKmolh)}
              </td>
              <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>
                {numberCell(darkMode, row.reactionHeatKJmol)}
              </td>
              <td className={`px-2 py-1.5 text-center font-mono ${cellBorder}`}>
                {numberCell(darkMode, row.heatMJh)}
              </td>
            </tr>
          ))}
          <tr className={tone.total}>
            <td colSpan={5} className={`px-2 py-1.5 text-center font-semibold ${cellBorder}`}>合计</td>
            <td className={`px-2 py-1.5 text-center font-mono font-semibold ${cellBorder}`}>
              {numberCell(darkMode, result.chemicalHeatMJh)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

export function CopperHeatBalancePlaceholderTables({
  darkMode,
  result,
}: {
  darkMode: boolean
  result: CopperHeatBalanceResult
}) {
  return (
    <div className="space-y-4">
      <div>
        <SectionTitle darkMode={darkMode}>表10 · 侧吹熔炼收支热平衡 (Q)</SectionTitle>
        <div className="mt-2 grid grid-cols-1 gap-3 xl:grid-cols-2">
          <BalanceHalfTable darkMode={darkMode} title="热收入" rows={result.heatIncomeRows} />
          <BalanceHalfTable darkMode={darkMode} title="热支出" rows={result.heatExpenditureRows} />
        </div>
      </div>
      <div>
        <SectionTitle darkMode={darkMode}>表10-1 · 化学反应热方程式</SectionTitle>
        <div className="mt-2">
          <ReactionTable darkMode={darkMode} result={result} />
        </div>
      </div>
      <div>
        <SectionTitle darkMode={darkMode}>表11 · 投入分项物理热</SectionTitle>
        <div className="mt-2">
          <ComponentBreakdownGrid darkMode={darkMode} rows={result.inputPhysicalRows} title="投入分项物理热" />
        </div>
      </div>
      <div>
        <SectionTitle darkMode={darkMode}>表12 · 产出分项物理热</SectionTitle>
        <div className="mt-2">
          <ComponentBreakdownGrid darkMode={darkMode} rows={result.outputPhysicalRows} title="产出分项物理热" />
        </div>
      </div>
    </div>
  )
}
