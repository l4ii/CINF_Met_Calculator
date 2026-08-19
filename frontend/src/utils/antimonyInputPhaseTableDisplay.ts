export type InputPhaseDisplayColumnKind =
  | 'raw'
  | 'other'
  | 'concentrate'
  | 'solvent'
  | 'fuel'
  | 'oxygen'
  | 'blend'
  | 'product'

export type InputPhaseDisplayColumn = {
  id: string
  kind: InputPhaseDisplayColumnKind
  header: string
  subHeader: string
  weight: number
  phases?: Partial<Record<string, number>>
  phaseContentsByKey?: Record<string, number> | null
  materialPhaseRowKeys?: string[]
  applicablePhaseKeys?: string[]
  phaseReady?: boolean
  oxygenAir?: {
    weightPct: { O2: number; N2: number; H2O?: number }
    volumePct?: { O2: number; N2: number; H2O?: number }
  }
  readOnly?: boolean
  moisture?: number
  waterWeight?: number
}

export type InputPhaseDisplayRowRole =
  | 'raw-summary'
  | 'raw-detail'
  | 'solvent-summary'
  | 'solvent-detail'
  | 'fuel'

export type InputPhaseDisplayRow<Column extends InputPhaseDisplayColumn = InputPhaseDisplayColumn> = {
  role: InputPhaseDisplayRowRole
  column: Column | InputPhaseDisplayColumn
  collapsibleGroup?: 'raw' | 'solvent'
  expanded?: boolean
  count?: number
}

function phaseColumnValue(column: InputPhaseDisplayColumn, rowKey: string): number | null {
  if (column.kind === 'oxygen') {
    if (rowKey === 'O2') return column.oxygenAir?.weightPct.O2 ?? null
    if (rowKey === 'N2') return column.oxygenAir?.weightPct.N2 ?? null
    if (rowKey === 'H2O') return column.oxygenAir?.weightPct.H2O ?? null
    return null
  }
  if (column.phaseReady === false) return null
  if (rowKey === 'O2' || rowKey === 'N2') return null
  if (column.phaseContentsByKey) return column.phaseContentsByKey[rowKey] ?? 0
  if (column.phases) return column.phases[rowKey] ?? 0
  return null
}

function uniquePhaseKeys(keys: string[]) {
  return [...new Set(keys.filter((key) => key && key !== 'O2' && key !== 'N2'))]
}

function sourcePhaseKeys(column: InputPhaseDisplayColumn) {
  const declaredKeys = uniquePhaseKeys([
    ...(column.applicablePhaseKeys ?? []),
    ...(column.materialPhaseRowKeys ?? []),
    ...Object.keys(column.phaseContentsByKey ?? {}),
  ])
  if (declaredKeys.length > 0) return declaredKeys
  return uniquePhaseKeys(Object.keys(column.phases ?? {}))
}

function orderedSummaryPhaseKeys(columns: InputPhaseDisplayColumn[], preferredKeys: string[]) {
  const sourceKeys = uniquePhaseKeys(columns.flatMap(sourcePhaseKeys))
  const fallbackKeys = uniquePhaseKeys(preferredKeys)
  if (sourceKeys.length === 0) return fallbackKeys
  return [
    ...fallbackKeys.filter((key) => sourceKeys.includes(key)),
    ...sourceKeys.filter((key) => !fallbackKeys.includes(key)),
  ]
}

export function buildPhaseSummaryColumn(params: {
  id: string
  header: string
  subHeader: string
  kind?: InputPhaseDisplayColumnKind
  columns: InputPhaseDisplayColumn[]
  applicablePhaseKeys: string[]
  /** 投料量全为 0 时仍生成汇总列（吹炼：避免输入投料量后突然出现汇总/折叠） */
  includeZeroWeight?: boolean
}): InputPhaseDisplayColumn | null {
  const weightedColumns = params.columns.filter((column) => column.weight > 0)
  const sourceColumns =
    weightedColumns.length > 0
      ? weightedColumns
      : params.includeZeroWeight
        ? params.columns
        : []
  if (sourceColumns.length === 0) return null
  const totalWeight = sourceColumns.reduce((sum, column) => sum + Math.max(0, column.weight), 0)
  if (totalWeight <= 0 && !params.includeZeroWeight) return null

  const phaseSources = sourceColumns.filter(
    (column) => column.phaseReady !== false && (column.phaseContentsByKey || column.phases)
  )
  const phaseWeight = phaseSources.reduce((sum, column) => sum + Math.max(0, column.weight), 0)
  const useEqualWeights = phaseWeight <= 0 && params.includeZeroWeight && phaseSources.length > 0
  const applicablePhaseKeys = orderedSummaryPhaseKeys(sourceColumns, params.applicablePhaseKeys)
  const totals: Record<string, number> = Object.fromEntries(applicablePhaseKeys.map((key) => [key, 0]))

  for (const column of phaseSources) {
    const weight = useEqualWeights ? 1 : Math.max(0, column.weight)
    for (const key of applicablePhaseKeys) {
      const value = phaseColumnValue(column, key) ?? 0
      totals[key] = (totals[key] ?? 0) + weight * Math.max(0, value)
    }
  }
  const phaseDivisor = useEqualWeights ? phaseSources.length : phaseWeight

  return {
    id: params.id,
    kind: params.kind ?? 'concentrate',
    header: params.header,
    subHeader: params.subHeader,
    weight: totalWeight,
    waterWeight: sourceColumns.reduce((sum, column) => sum + Math.max(0, column.waterWeight ?? 0), 0),
    phaseContentsByKey:
      phaseDivisor > 0
        ? Object.fromEntries(applicablePhaseKeys.map((key) => [key, (totals[key] ?? 0) / phaseDivisor]))
        : null,
    applicablePhaseKeys,
    materialPhaseRowKeys: applicablePhaseKeys,
    phaseReady: phaseDivisor > 0,
    readOnly: true,
  }
}

export function buildInputPhaseDisplayPlan<Column extends InputPhaseDisplayColumn>(params: {
  inputColumns: Column[]
  phaseRowKeys: string[]
  rawExpanded: boolean
  solventExpanded: boolean
  /** 原料汇总类型列文案，吹炼用「投入」 */
  rawSummaryHeader?: string
  /** 原料汇总名称列文案，吹炼用「投入」 */
  rawSummarySubHeader?: string
  /** 吹炼不显示燃料行 */
  showFuel?: boolean
  /** 吹炼：投料量未填时也显示「投入」汇总，避免输入后表结构跳变 */
  alwaysShowRawSummary?: boolean
}) {
  const rawSummaryHeader = params.rawSummaryHeader ?? '混料'
  const rawSummarySubHeader = params.rawSummarySubHeader ?? '混合锑精矿'
  const showFuel = params.showFuel !== false
  const displayInputColumns = params.inputColumns.filter((column) => column.kind !== 'blend')
  const rawColumns = displayInputColumns.filter((column) => column.kind === 'raw')
  const otherColumns = displayInputColumns.filter((column) => column.kind === 'other')
  const solventColumns = displayInputColumns.filter((column) => column.kind === 'solvent')
  const fuelColumn = showFuel ? displayInputColumns.find((column) => column.kind === 'fuel') : undefined
  const airColumns = displayInputColumns.filter((column) => column.kind === 'oxygen')
  // 混料汇总仅精矿；渣精矿/吹炼渣等「其他」单列常显
  const rawSummaryColumn = buildPhaseSummaryColumn({
    id: 'raw-phase-summary',
    kind: 'concentrate',
    header: rawSummaryHeader,
    subHeader: rawSummarySubHeader,
    columns: rawColumns,
    applicablePhaseKeys: params.phaseRowKeys,
    includeZeroWeight: params.alwaysShowRawSummary,
  })
  const solventSummaryColumn =
    solventColumns.length > 1
      ? buildPhaseSummaryColumn({
          id: 'solvent-phase-summary',
          kind: 'solvent',
          header: '熔剂',
          subHeader: '熔剂',
          columns: solventColumns,
          applicablePhaseKeys: params.phaseRowKeys,
        })
      : null

  const materialRows: InputPhaseDisplayRow<Column>[] = []
  if (rawSummaryColumn) {
    if (params.rawExpanded) {
      materialRows.push(...rawColumns.map((column) => ({ role: 'raw-detail' as const, column })))
    }
    materialRows.push({
      role: 'raw-summary',
      column: rawSummaryColumn,
      collapsibleGroup: 'raw',
      expanded: params.rawExpanded,
      count: rawColumns.length,
    })
  } else {
    materialRows.push(...rawColumns.map((column) => ({ role: 'raw-detail' as const, column })))
  }

  materialRows.push(...otherColumns.map((column) => ({ role: 'raw-detail' as const, column })))

  if (solventSummaryColumn) {
    materialRows.push({
      role: 'solvent-summary',
      column: solventSummaryColumn,
      collapsibleGroup: 'solvent',
      expanded: params.solventExpanded,
      count: solventColumns.length,
    })
    if (params.solventExpanded) {
      materialRows.push(...solventColumns.map((column) => ({ role: 'solvent-detail' as const, column })))
    }
  } else {
    materialRows.push(...solventColumns.map((column) => ({ role: 'solvent-detail' as const, column })))
  }

  if (fuelColumn) materialRows.push({ role: 'fuel', column: fuelColumn })

  return {
    displayInputColumns,
    rawColumns,
    otherColumns,
    solventColumns,
    fuelColumn,
    airColumns,
    rawSummaryColumn,
    solventSummaryColumn,
    materialRows,
  }
}
