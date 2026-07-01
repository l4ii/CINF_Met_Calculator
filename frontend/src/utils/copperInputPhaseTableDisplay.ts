export type InputPhaseDisplayColumnKind =
  | 'raw'
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
}): InputPhaseDisplayColumn | null {
  const sourceColumns = params.columns.filter((column) => column.weight > 0)
  if (sourceColumns.length === 0) return null
  const totalWeight = sourceColumns.reduce((sum, column) => sum + Math.max(0, column.weight), 0)
  if (totalWeight <= 0) return null

  const phaseSources = sourceColumns.filter(
    (column) => column.phaseReady !== false && (column.phaseContentsByKey || column.phases)
  )
  const phaseWeight = phaseSources.reduce((sum, column) => sum + Math.max(0, column.weight), 0)
  const applicablePhaseKeys = orderedSummaryPhaseKeys(sourceColumns, params.applicablePhaseKeys)
  const totals: Record<string, number> = Object.fromEntries(applicablePhaseKeys.map((key) => [key, 0]))

  for (const column of phaseSources) {
    const weight = Math.max(0, column.weight)
    for (const key of applicablePhaseKeys) {
      const value = phaseColumnValue(column, key) ?? 0
      totals[key] = (totals[key] ?? 0) + weight * Math.max(0, value)
    }
  }

  return {
    id: params.id,
    kind: params.kind ?? 'concentrate',
    header: params.header,
    subHeader: params.subHeader,
    weight: totalWeight,
    waterWeight: sourceColumns.reduce((sum, column) => sum + Math.max(0, column.waterWeight ?? 0), 0),
    phaseContentsByKey:
      phaseWeight > 0
        ? Object.fromEntries(applicablePhaseKeys.map((key) => [key, (totals[key] ?? 0) / phaseWeight]))
        : null,
    applicablePhaseKeys,
    materialPhaseRowKeys: applicablePhaseKeys,
    phaseReady: phaseWeight > 0,
    readOnly: true,
  }
}

export function buildInputPhaseDisplayPlan<Column extends InputPhaseDisplayColumn>(params: {
  inputColumns: Column[]
  phaseRowKeys: string[]
  rawExpanded: boolean
  solventExpanded: boolean
}) {
  const displayInputColumns = params.inputColumns.filter((column) => column.kind !== 'blend')
  const rawColumns = displayInputColumns.filter((column) => column.kind === 'raw')
  const solventColumns = displayInputColumns.filter((column) => column.kind === 'solvent')
  const fuelColumn = displayInputColumns.find((column) => column.kind === 'fuel')
  const airColumns = displayInputColumns.filter((column) => column.kind === 'oxygen')
  const rawSummaryColumn = buildPhaseSummaryColumn({
    id: 'raw-phase-summary',
    kind: 'concentrate',
    header: '混料',
    subHeader: '混料',
    columns: rawColumns,
    applicablePhaseKeys: params.phaseRowKeys,
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
    solventColumns,
    fuelColumn,
    airColumns,
    rawSummaryColumn,
    solventSummaryColumn,
    materialRows,
  }
}
