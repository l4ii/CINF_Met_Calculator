import { BASE_ELEMENTS, RAW_MATERIAL_DEFAULT_PRICES, type ElementRatios } from './rawMaterialConfig'

export type LeadFlashMaterial = {
  id: string
  name: string
  category: 'lead' | 'sulfide' | 'secondary' | 'flux' | 'return'
  unitPrice: number
  ratios: ElementRatios
  defaultPriority: number
  defaultAnnualMin: number
}

export const LEAD_FLASH_ELEMENTS = {
  O: 'O (氧)',
  N: 'N (氮)',
  Sb: 'Sb(锑)',
  S: 'S (硫)',
  Fe: 'Fe(铁)',
  Pb: 'Pb(铅)',
  As: 'As(砷)',
  Zn: 'Zn(锌)',
  Cu: 'Cu(铜)',
  Si: 'Si(硅)',
  Ca: 'Ca(钙)',
  Al: 'Al(铝)',
  Ag: 'Ag(银)',
  Au: 'Au(金)',
  C: 'C (碳)',
  Other: 'Other(其他)',
} as const

const E = LEAD_FLASH_ELEMENTS

function normalizeRatios(ratios: Partial<ElementRatios>): ElementRatios {
  const out: ElementRatios = {}
  for (const key of Object.values(E)) out[key] = ratios[key] ?? 0
  const known = Object.entries(out)
    .filter(([key]) => key !== E.Other)
    .reduce((sum, [, value]) => sum + value, 0)
  out[E.Other] = Math.max(0, ratios[E.Other] ?? 100 - known)
  return out
}

function fromSbBase(id: number, patch: Partial<LeadFlashMaterial>): LeadFlashMaterial {
  const base = BASE_ELEMENTS[id]
  return {
    id: patch.id ?? `sb-base-${id}`,
    name: patch.name ?? base.name,
    category: patch.category ?? 'sulfide',
    unitPrice: patch.unitPrice ?? (RAW_MATERIAL_DEFAULT_PRICES[base.name] ?? 8) * 10000,
    ratios: normalizeRatios({ ...base.ratios, ...(patch.ratios ?? {}) }),
    defaultPriority: patch.defaultPriority ?? 2,
    defaultAnnualMin: patch.defaultAnnualMin ?? 0,
  }
}

export const LEAD_FLASH_MATERIAL_LIBRARY: LeadFlashMaterial[] = [
  {
    id: 'pb-conc-1',
    name: '高铅硫化精矿 A',
    category: 'lead',
    unitPrice: 9200,
    ratios: normalizeRatios({ [E.Pb]: 58, [E.S]: 18, [E.Fe]: 7, [E.Zn]: 3.5, [E.Si]: 2.2, [E.Ca]: 0.8, [E.Ag]: 0.08, [E.O]: 4.5 }),
    defaultPriority: 5,
    defaultAnnualMin: 12000,
  },
  {
    id: 'pb-conc-2',
    name: '高铅硫化精矿 B',
    category: 'lead',
    unitPrice: 8800,
    ratios: normalizeRatios({ [E.Pb]: 52, [E.S]: 21, [E.Fe]: 9, [E.Zn]: 4.2, [E.Si]: 2.8, [E.Cu]: 0.6, [E.Ag]: 0.06, [E.O]: 4.2 }),
    defaultPriority: 4,
    defaultAnnualMin: 8000,
  },
  {
    id: 'pb-conc-3',
    name: '低锌铅精矿',
    category: 'lead',
    unitPrice: 10300,
    ratios: normalizeRatios({ [E.Pb]: 64, [E.S]: 16.5, [E.Fe]: 3.6, [E.Zn]: 2.1, [E.Si]: 1.8, [E.Ag]: 0.1, [E.O]: 5 }),
    defaultPriority: 3,
    defaultAnnualMin: 0,
  },
  {
    id: 'pb-conc-4',
    name: '高银铅精矿',
    category: 'lead',
    unitPrice: 11200,
    ratios: normalizeRatios({ [E.Pb]: 49, [E.S]: 20, [E.Fe]: 8.5, [E.Zn]: 5.5, [E.Cu]: 1.3, [E.Ag]: 0.22, [E.Au]: 0.01, [E.Si]: 2.4, [E.O]: 4 }),
    defaultPriority: 4,
    defaultAnnualMin: 3000,
  },
  {
    id: 'pb-conc-5',
    name: '高锌铅精矿',
    category: 'lead',
    unitPrice: 7600,
    ratios: normalizeRatios({ [E.Pb]: 43, [E.S]: 22, [E.Fe]: 10, [E.Zn]: 11, [E.Cu]: 0.4, [E.Si]: 3, [E.O]: 4.8 }),
    defaultPriority: 2,
    defaultAnnualMin: 0,
  },
  {
    id: 'pb-conc-6',
    name: '低砷铅精矿',
    category: 'lead',
    unitPrice: 9800,
    ratios: normalizeRatios({ [E.Pb]: 56, [E.S]: 19, [E.Fe]: 7.8, [E.Zn]: 3.2, [E.As]: 0.05, [E.Si]: 2.3, [E.O]: 4.7 }),
    defaultPriority: 4,
    defaultAnnualMin: 0,
  },
  {
    id: 'pb-conc-7',
    name: '复杂铅锌精矿',
    category: 'lead',
    unitPrice: 6900,
    ratios: normalizeRatios({ [E.Pb]: 36, [E.S]: 24, [E.Fe]: 13, [E.Zn]: 14, [E.Cu]: 1.1, [E.As]: 0.45, [E.Si]: 3.6, [E.O]: 3.5 }),
    defaultPriority: 2,
    defaultAnnualMin: 0,
  },
  {
    id: 'pb-conc-8',
    name: '高铁铅精矿',
    category: 'lead',
    unitPrice: 7200,
    ratios: normalizeRatios({ [E.Pb]: 41, [E.S]: 23, [E.Fe]: 18, [E.Zn]: 3, [E.Si]: 2.5, [E.O]: 4.2 }),
    defaultPriority: 3,
    defaultAnnualMin: 5000,
  },
  {
    id: 'pyrite-1',
    name: '硫铁矿',
    category: 'sulfide',
    unitPrice: 620,
    ratios: normalizeRatios({ [E.Fe]: 42, [E.S]: 48, [E.Si]: 3, [E.O]: 2 }),
    defaultPriority: 2,
    defaultAnnualMin: 0,
  },
  {
    id: 'silica-1',
    name: '硅石粉',
    category: 'flux',
    unitPrice: 180,
    ratios: normalizeRatios({ [E.Si]: 44.5, [E.O]: 50.7, [E.Al]: 1.2, [E.Ca]: 0.3 }),
    defaultPriority: 2,
    defaultAnnualMin: 0,
  },
  {
    id: 'lime-1',
    name: '石灰石粉',
    category: 'flux',
    unitPrice: 220,
    ratios: normalizeRatios({ [E.Ca]: 38, [E.O]: 46, [E.Si]: 2, [E.Al]: 0.8 }),
    defaultPriority: 2,
    defaultAnnualMin: 0,
  },
  {
    id: 'coke-1',
    name: '还原煤粉',
    category: 'flux',
    unitPrice: 1250,
    ratios: normalizeRatios({ [E.C]: 78, [E.O]: 8, [E.S]: 0.8, [E.Si]: 3.2, [E.Al]: 1.1 }),
    defaultPriority: 1,
    defaultAnnualMin: 0,
  },
  {
    id: 'return-dust',
    name: '铅烟尘返料',
    category: 'return',
    unitPrice: 1500,
    ratios: normalizeRatios({ [E.Pb]: 42, [E.Zn]: 9, [E.S]: 6, [E.Fe]: 4, [E.As]: 0.6, [E.O]: 25, [E.Si]: 2 }),
    defaultPriority: 3,
    defaultAnnualMin: 3000,
  },
  {
    id: 'return-slag',
    name: '铅渣返料',
    category: 'return',
    unitPrice: 300,
    ratios: normalizeRatios({ [E.Pb]: 8, [E.Fe]: 24, [E.Si]: 13, [E.Ca]: 4.5, [E.Zn]: 6, [E.O]: 33 }),
    defaultPriority: 2,
    defaultAnnualMin: 0,
  },
  {
    id: 'secondary-battery',
    name: '含铅二次物料',
    category: 'secondary',
    unitPrice: 5200,
    ratios: normalizeRatios({ [E.Pb]: 62, [E.S]: 4, [E.Fe]: 1.6, [E.Si]: 1.4, [E.Ca]: 2.1, [E.O]: 18 }),
    defaultPriority: 3,
    defaultAnnualMin: 0,
  },
  {
    id: 'secondary-oxide',
    name: '氧化铅物料',
    category: 'secondary',
    unitPrice: 6100,
    ratios: normalizeRatios({ [E.Pb]: 68, [E.O]: 22, [E.S]: 1.2, [E.Fe]: 1, [E.Si]: 1.6, [E.Ca]: 0.5 }),
    defaultPriority: 2,
    defaultAnnualMin: 0,
  },
  fromSbBase(1, { id: 'sb-ref-1', name: '锑精矿（参考样）', unitPrice: 140000, defaultPriority: 1 }),
  fromSbBase(2, { id: 'sb-ref-2', name: '锑金精矿（参考样）', unitPrice: 150000, defaultPriority: 1 }),
  fromSbBase(3, { id: 'sb-ref-3', name: '锑锍返料（参考样）', unitPrice: 90000, defaultPriority: 1 }),
  fromSbBase(4, { id: 'sb-ref-4', name: '铅锑混合精矿（参考样）', unitPrice: 80000, defaultPriority: 2 }),
  fromSbBase(5, { id: 'sb-ref-5', name: '泡渣返料（参考样）', unitPrice: 8000, defaultPriority: 2 }),
  {
    id: 'custom-slot-1',
    name: '备用原料 1',
    category: 'secondary',
    unitPrice: 4500,
    ratios: normalizeRatios({ [E.Pb]: 28, [E.S]: 12, [E.Fe]: 11, [E.Zn]: 8, [E.Si]: 9, [E.Ca]: 3, [E.O]: 18 }),
    defaultPriority: 1,
    defaultAnnualMin: 0,
  },
  {
    id: 'custom-slot-2',
    name: '备用原料 2',
    category: 'secondary',
    unitPrice: 3800,
    ratios: normalizeRatios({ [E.Pb]: 18, [E.S]: 8, [E.Fe]: 18, [E.Zn]: 10, [E.Si]: 12, [E.Ca]: 5, [E.O]: 20 }),
    defaultPriority: 1,
    defaultAnnualMin: 0,
  },
  {
    id: 'custom-slot-3',
    name: '备用原料 3',
    category: 'secondary',
    unitPrice: 5600,
    ratios: normalizeRatios({ [E.Pb]: 32, [E.S]: 16, [E.Fe]: 7, [E.Zn]: 6, [E.Si]: 5, [E.Ca]: 1.5, [E.O]: 17 }),
    defaultPriority: 1,
    defaultAnnualMin: 0,
  },
]

export const LEAD_FLASH_TARGET_ELEMENTS = [
  E.O,
  E.N,
  E.Sb,
  E.S,
  E.Fe,
  E.Pb,
  E.As,
  E.Zn,
  E.Cu,
  E.Si,
  E.Ca,
  E.Al,
  E.Ag,
  E.Au,
  E.C,
  E.Other,
] as const
