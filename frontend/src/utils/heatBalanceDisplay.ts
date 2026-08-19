export type HeatComponentDisplaySide = 'input' | 'output'

export function shouldDisplayHeatComponentRow(
  row: { massTh: number; heatMJh: number },
  side: HeatComponentDisplaySide,
  epsilon = 1e-9
) {
  return side === 'output' || row.massTh > 0 || Math.abs(row.heatMJh) > epsilon
}
