export const COPPER_ELEMENT_KEYS = [
  'Ag(银)',
  'Al(铝)',
  'As(砷)',
  'Au(金)',
  'C (碳)',
  'Ca(钙)',
  'Cu(铜)',
  'Fe(铁)',
  'N (氮)',
  'O (氧)',
  'Other(其他)',
  'Pb(铅)',
  'S (硫)',
  'Sb(锑)',
  'Si(硅)',
  'Zn(锌)',
] as const

export type CopperElementKey = (typeof COPPER_ELEMENT_KEYS)[number]
export type CopperRatios = Partial<Record<CopperElementKey, number>>

export interface CopperMaterialColumn {
  id: string
  name: string
  kind: 'raw' | 'solvent' | 'fuel'
  weight: number
  ratios: CopperRatios
  unitPrice?: number
}

export interface CopperLibraryMaterial {
  id: string
  name: string
  category: 'concentrate' | 'return' | 'flux'
  ratios: CopperRatios
  unitPrice: number
}

export interface CopperSolvent {
  id: string
  name: '石灰' | '铁矿石'
  unitPrice: number
  composition: {
    'Fe(铁)': number
    'SiO₂(二氧化硅)': number
    'CaO(氧化钙)': number
  }
}

export interface WeightedComposition {
  totalWeight: number
  ratios: Record<CopperElementKey, number>
  elementWeights: Record<CopperElementKey, number>
}

export interface CopperSolventSolution {
  valid: boolean
  solventWeights: Record<string, number>
  feSiO2: number
  caOSiO2: number
  message?: string
}

export type CopperPhaseInput =
  | string
  | number
  | {
      value?: string | number
      x?: string | number
      factor?: string | number
      coefficient?: string | number
    }

const SI_TO_SIO2 = 60.084 / 28.085
const CA_TO_CAO = 56.077 / 40.078
const O_IN_SIO2 = 32 / 60.084
const SI_IN_SIO2 = 28.085 / 60.084
const O_IN_CAO = 16 / 56.077
const CA_IN_CAO = 40.078 / 56.077

export const DEFAULT_COPPER_SOLVENTS: CopperSolvent[] = [
  {
    id: 'lime',
    name: '石灰',
    unitPrice: 550,
    composition: { 'Fe(铁)': 0, 'SiO₂(二氧化硅)': 0, 'CaO(氧化钙)': 85.05 },
  },
  {
    id: 'iron-ore',
    name: '铁矿石',
    unitPrice: 750,
    composition: { 'Fe(铁)': 59.94, 'SiO₂(二氧化硅)': 6, 'CaO(氧化钙)': 0 },
  },
]

export const COPPER_MATERIAL_LIBRARY: CopperLibraryMaterial[] = [
  {
    id: 'cu-conc-a',
    name: '铜精矿 A',
    category: 'concentrate',
    unitPrice: 62000,
    ratios: normalizeCopperRatios({
      'Ag(银)': 0.05,
      'Al(铝)': 1.2,
      'As(砷)': 0.12,
      'Au(金)': 0.002,
      'Ca(钙)': 0.8,
      'Cu(铜)': 24,
      'Fe(铁)': 28,
      'Pb(铅)': 0.3,
      'S (硫)': 31,
      'Sb(锑)': 0.05,
      'Si(硅)': 4.5,
      'Zn(锌)': 1.5,
    }),
  },
  {
    id: 'cu-conc-b',
    name: '铜精矿 B',
    category: 'concentrate',
    unitPrice: 58000,
    ratios: normalizeCopperRatios({
      'Ag(银)': 0.03,
      'Al(铝)': 1.8,
      'As(砷)': 0.08,
      'Au(金)': 0.001,
      'Ca(钙)': 0.5,
      'Cu(铜)': 20,
      'Fe(铁)': 32,
      'Pb(铅)': 0.2,
      'S (硫)': 33,
      'Sb(锑)': 0.03,
      'Si(硅)': 6,
      'Zn(锌)': 2.1,
    }),
  },
  {
    id: 'cu-conc-high-cu',
    name: '高品位铜精矿',
    category: 'concentrate',
    unitPrice: 70000,
    ratios: normalizeCopperRatios({
      'Ag(银)': 0.08,
      'Al(铝)': 0.9,
      'As(砷)': 0.05,
      'Au(金)': 0.004,
      'Ca(钙)': 0.4,
      'Cu(铜)': 30,
      'Fe(铁)': 24,
      'Pb(铅)': 0.18,
      'S (硫)': 29,
      'Sb(锑)': 0.02,
      'Si(硅)': 3.2,
      'Zn(锌)': 0.9,
    }),
  },
  {
    id: 'cu-conc-complex',
    name: '复杂铜精矿',
    category: 'concentrate',
    unitPrice: 52000,
    ratios: normalizeCopperRatios({
      'Ag(银)': 0.06,
      'Al(铝)': 2.4,
      'As(砷)': 0.55,
      'Au(金)': 0.002,
      'Ca(钙)': 0.8,
      'Cu(铜)': 18,
      'Fe(铁)': 30,
      'Pb(铅)': 1.1,
      'S (硫)': 32,
      'Sb(锑)': 0.12,
      'Si(硅)': 5.5,
      'Zn(锌)': 4.8,
    }),
  },
  {
    id: 'cu-return-dust',
    name: '铜烟尘返料',
    category: 'return',
    unitPrice: 8000,
    ratios: normalizeCopperRatios({
      'Ag(银)': 0.02,
      'Al(铝)': 1.5,
      'As(砷)': 1.2,
      'Ca(钙)': 2.5,
      'Cu(铜)': 18,
      'Fe(铁)': 10,
      'O (氧)': 22,
      'Pb(铅)': 5,
      'S (硫)': 7,
      'Sb(锑)': 0.3,
      'Si(硅)': 5,
      'Zn(锌)': 12,
    }),
  },
  {
    id: 'cu-return-slag',
    name: '铜渣返料',
    category: 'return',
    unitPrice: 1200,
    ratios: normalizeCopperRatios({
      'Al(铝)': 4.2,
      'Ca(钙)': 5,
      'Cu(铜)': 4.5,
      'Fe(铁)': 32,
      'O (氧)': 26,
      'S (硫)': 1.5,
      'Si(硅)': 13,
      'Zn(锌)': 1.2,
    }),
  },
]

export function emptyCopperRatios(): Record<CopperElementKey, number> {
  return Object.fromEntries(COPPER_ELEMENT_KEYS.map((element) => [element, 0])) as Record<CopperElementKey, number>
}

export function normalizeCopperRatios(ratios: CopperRatios): Record<CopperElementKey, number> {
  const out = emptyCopperRatios()
  for (const element of COPPER_ELEMENT_KEYS) {
    out[element] = Number.isFinite(ratios[element]) ? Number(ratios[element]) : 0
  }
  if (ratios['Other(其他)'] == null) {
    out['Other(其他)'] = Math.max(0, 100 - calculateKnownTotal(out))
  }
  return out
}

function parseDelimitedLine(line: string, delimiter: ',' | '\t'): string[] {
  const cells: string[] = []
  let current = ''
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"'
        i += 1
      } else {
        quoted = !quoted
      }
    } else if (ch === delimiter && !quoted) {
      cells.push(current.trim())
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim())
  return cells
}

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, '')
    .replace(/\s+/g, '')
    .replace(/[（(].*?[）)]/g, '')
    .replace(/%/g, '')
    .toLowerCase()
}

const IMPORT_HEADER_TO_ELEMENT: Record<string, CopperElementKey> = {
  ag: 'Ag(银)',
  银: 'Ag(银)',
  al: 'Al(铝)',
  铝: 'Al(铝)',
  as: 'As(砷)',
  砷: 'As(砷)',
  au: 'Au(金)',
  金: 'Au(金)',
  c: 'C (碳)',
  碳: 'C (碳)',
  ca: 'Ca(钙)',
  钙: 'Ca(钙)',
  cu: 'Cu(铜)',
  铜: 'Cu(铜)',
  fe: 'Fe(铁)',
  铁: 'Fe(铁)',
  n: 'N (氮)',
  氮: 'N (氮)',
  o: 'O (氧)',
  氧: 'O (氧)',
  other: 'Other(其他)',
  其他: 'Other(其他)',
  pb: 'Pb(铅)',
  铅: 'Pb(铅)',
  s: 'S (硫)',
  硫: 'S (硫)',
  sb: 'Sb(锑)',
  锑: 'Sb(锑)',
  si: 'Si(硅)',
  硅: 'Si(硅)',
  zn: 'Zn(锌)',
  锌: 'Zn(锌)',
}

export function parseCopperLibraryCsv(text: string): CopperLibraryMaterial[] {
  const rows = text
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.trim().length > 0)
  if (rows.length <= 1) return []

  const delimiter: ',' | '\t' = (rows[0].match(/\t/g)?.length ?? 0) > (rows[0].match(/,/g)?.length ?? 0) ? '\t' : ','
  const headers = parseDelimitedLine(rows[0], delimiter)
  const normalizedHeaders = headers.map(normalizeHeader)
  const nameIndex = normalizedHeaders.findIndex((header) =>
    ['原料名称', '原料', '名称', 'material', 'materialname', 'name'].includes(header)
  )
  const priceIndex = normalizedHeaders.findIndex((header) =>
    ['单价', '价格', 'unitprice', 'price'].includes(header)
  )
  const elementIndexes = normalizedHeaders
    .map((header, index) => ({ element: IMPORT_HEADER_TO_ELEMENT[header], index }))
    .filter((item): item is { element: CopperElementKey; index: number } => Boolean(item.element))

  if (nameIndex < 0 || elementIndexes.length === 0) return []

  return rows.slice(1).flatMap((line, rowIndex) => {
    const cells = parseDelimitedLine(line, delimiter)
    const name = (cells[nameIndex] ?? '').trim()
    if (!name) return []
    const ratios: CopperRatios = {}
    for (const { element, index } of elementIndexes) {
      const parsed = parseFloat(String(cells[index] ?? '').replace(',', '.'))
      ratios[element] = Number.isFinite(parsed) ? parsed : 0
    }
    const price = priceIndex >= 0 ? parseFloat(String(cells[priceIndex] ?? '').replace(',', '.')) : 0
    return [
      {
        id: `imported-${Date.now()}-${rowIndex}`,
        name,
        category: 'concentrate' as const,
        unitPrice: Number.isFinite(price) ? price : 0,
        ratios: normalizeCopperRatios(ratios),
      },
    ]
  })
}

export function calculateKnownTotal(ratios: CopperRatios): number {
  return COPPER_ELEMENT_KEYS
    .filter((element) => element !== 'Other(其他)')
    .reduce((sum, element) => sum + (Number.isFinite(ratios[element]) ? Number(ratios[element]) : 0), 0)
}

export function calculateWeightedComposition(materials: CopperMaterialColumn[]): WeightedComposition {
  const totalWeight = materials.reduce((sum, material) => sum + Math.max(0, material.weight), 0)
  const elementWeights = emptyCopperRatios()
  if (totalWeight <= 0) {
    return { totalWeight: 0, ratios: emptyCopperRatios(), elementWeights }
  }
  for (const material of materials) {
    const normalized = normalizeCopperRatios(material.ratios)
    for (const element of COPPER_ELEMENT_KEYS) {
      elementWeights[element] += (normalized[element] / 100) * material.weight
    }
  }
  const ratios = emptyCopperRatios()
  for (const element of COPPER_ELEMENT_KEYS) {
    ratios[element] = (elementWeights[element] / totalWeight) * 100
  }
  return { totalWeight, ratios, elementWeights }
}

export function solventOxidesToElements(composition: CopperSolvent['composition']): Record<CopperElementKey, number> {
  const out = emptyCopperRatios()
  out['Fe(铁)'] = composition['Fe(铁)'] ?? 0
  out['Si(硅)'] = (composition['SiO₂(二氧化硅)'] ?? 0) * SI_IN_SIO2
  out['Ca(钙)'] = (composition['CaO(氧化钙)'] ?? 0) * CA_IN_CAO
  out['O (氧)'] = (composition['SiO₂(二氧化硅)'] ?? 0) * O_IN_SIO2 + (composition['CaO(氧化钙)'] ?? 0) * O_IN_CAO
  out['Other(其他)'] = Math.max(0, 100 - calculateKnownTotal(out))
  return out
}

export function elementRatiosToSolventComposition(ratios: CopperRatios): CopperSolvent['composition'] {
  return {
    'Fe(铁)': ratios['Fe(铁)'] ?? 0,
    'SiO₂(二氧化硅)': (ratios['Si(硅)'] ?? 0) * SI_TO_SIO2,
    'CaO(氧化钙)': (ratios['Ca(钙)'] ?? 0) * CA_TO_CAO,
  }
}

export function createDefaultCopperMaterials(): CopperMaterialColumn[] {
  return COPPER_MATERIAL_LIBRARY.slice(0, 2).map((material) => ({
    id: material.id,
    name: material.name,
    kind: 'raw',
    weight: 0,
    ratios: { ...material.ratios },
    unitPrice: material.unitPrice,
  }))
}

export function createDefaultSolventColumns(weights: Record<string, number> = {}): CopperMaterialColumn[] {
  return DEFAULT_COPPER_SOLVENTS.map((solvent) => ({
    id: `solvent-${solvent.id}`,
    name: solvent.name,
    kind: 'solvent',
    weight: weights[solvent.name] ?? 0,
    ratios: solventOxidesToElements(solvent.composition),
    unitPrice: solvent.unitPrice,
  }))
}

export function calculateUnknownsFromPhases(
  phases: Record<string, CopperPhaseInput>,
  currentRatios: CopperRatios
): Pick<Record<CopperElementKey, number>, 'O (氧)' | 'C (碳)' | 'Other(其他)'> {
  const parsed = (value: string | number | undefined, fallback = 0) => {
    const n = typeof value === 'number' ? value : parseFloat(String(value ?? '').replace(',', '.'))
    return Number.isFinite(n) ? Math.max(0, n) : fallback
  }
  const phase = (name: string) => {
    const value = phases[name]
    if (value && typeof value === 'object') {
      return parsed(value.value ?? value.x) * parsed(value.factor ?? value.coefficient, 1)
    }
    return parsed(value)
  }
  const oxygen =
    phase('Cu2O') * (16 / 143.09) +
    phase('FeO') * (16 / 71.844) +
    phase('Fe2O3') * (48 / 159.688) +
    phase('Fe3O4') * (64 / 231.533) +
    phase('SiO2') * O_IN_SIO2 +
    phase('CaO') * O_IN_CAO +
    phase('Al2O3') * (48 / 101.961)
  const carbon = phase('C')
  const knownWithoutUnknowns = calculateKnownTotal({
    ...currentRatios,
    'O (氧)': 0,
    'C (碳)': 0,
  })
  const other = Math.max(0, 100 - knownWithoutUnknowns - oxygen - carbon)
  return { 'O (氧)': oxygen, 'C (碳)': carbon, 'Other(其他)': other }
}

export function solveCopperSolvents({
  rawMaterials,
  targetFeSiO2,
  targetCaOSiO2,
  solvents = DEFAULT_COPPER_SOLVENTS,
}: {
  rawMaterials: CopperMaterialColumn[]
  targetFeSiO2: number
  targetCaOSiO2: number
  solvents?: CopperSolvent[]
}): CopperSolventSolution {
  const [lime, ironOre] = solvents
  if (!lime || !ironOre) {
    return { valid: false, solventWeights: {}, feSiO2: 0, caOSiO2: 0, message: '缺少熔剂配置' }
  }
  const blend = calculateWeightedComposition(rawMaterials)
  const feWeight = blend.elementWeights['Fe(铁)'] ?? 0
  const sio2Weight = (blend.elementWeights['Si(硅)'] ?? 0) * SI_TO_SIO2
  const caoWeight = (blend.elementWeights['Ca(钙)'] ?? 0) * CA_TO_CAO

  const iron = ironOre.composition
  const limeComp = lime.composition
  const a11 = (iron['Fe(铁)'] ?? 0) / 100 - targetFeSiO2 * ((iron['SiO₂(二氧化硅)'] ?? 0) / 100)
  const a12 = (limeComp['Fe(铁)'] ?? 0) / 100 - targetFeSiO2 * ((limeComp['SiO₂(二氧化硅)'] ?? 0) / 100)
  const a21 = (iron['CaO(氧化钙)'] ?? 0) / 100 - targetCaOSiO2 * ((iron['SiO₂(二氧化硅)'] ?? 0) / 100)
  const a22 = (limeComp['CaO(氧化钙)'] ?? 0) / 100 - targetCaOSiO2 * ((limeComp['SiO₂(二氧化硅)'] ?? 0) / 100)
  const b1 = targetFeSiO2 * sio2Weight - feWeight
  const b2 = targetCaOSiO2 * sio2Weight - caoWeight
  const det = a11 * a22 - a12 * a21
  if (Math.abs(det) < 1e-10) {
    return { valid: false, solventWeights: {}, feSiO2: 0, caOSiO2: 0, message: '熔剂方程组不可解' }
  }

  const ironOreWeight = (b1 * a22 - a12 * b2) / det
  const limeWeight = (a11 * b2 - b1 * a21) / det
  if (ironOreWeight < -1e-8 || limeWeight < -1e-8) {
    return {
      valid: false,
      solventWeights: { [lime.name]: Math.max(0, limeWeight), [ironOre.name]: Math.max(0, ironOreWeight) },
      feSiO2: 0,
      caOSiO2: 0,
      message: '当前目标渣型需要负熔剂量，请调整目标范围或熔剂成分',
    }
  }

  const solvedIronOre = Math.max(0, ironOreWeight)
  const solvedLime = Math.max(0, limeWeight)
  const totalFe = feWeight + solvedIronOre * ((iron['Fe(铁)'] ?? 0) / 100) + solvedLime * ((limeComp['Fe(铁)'] ?? 0) / 100)
  const totalSio2 =
    sio2Weight +
    solvedIronOre * ((iron['SiO₂(二氧化硅)'] ?? 0) / 100) +
    solvedLime * ((limeComp['SiO₂(二氧化硅)'] ?? 0) / 100)
  const totalCao =
    caoWeight +
    solvedIronOre * ((iron['CaO(氧化钙)'] ?? 0) / 100) +
    solvedLime * ((limeComp['CaO(氧化钙)'] ?? 0) / 100)

  return {
    valid: true,
    solventWeights: { [lime.name]: solvedLime, [ironOre.name]: solvedIronOre },
    feSiO2: totalSio2 > 0 ? totalFe / totalSio2 : 0,
    caOSiO2: totalSio2 > 0 ? totalCao / totalSio2 : 0,
  }
}
