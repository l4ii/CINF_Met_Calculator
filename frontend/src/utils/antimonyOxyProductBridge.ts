import type { AntimonyProductKey, AntimonyProductResult } from './antimonyProcessCalc.ts'
import type { AntimonyElementKey } from './antimonyWorkflowCalc.ts'
import { ANTIMONY_ELEMENT_KEYS } from './antimonyWorkflowCalc.ts'
import type { OxyConstraintSolverResult, OxyProductResult } from './antimonyConstraintSolver.ts'
import type { OxySideBlowProductKey } from './antimonyConstraintConfig.ts'
import { PRODUCT_PHASE_DISPLAY, type ProductPhasePercentMap } from './antimonyProductPhaseCalc.ts'

function oxyProductToLegacyEntry(product: OxyProductResult, legacyKey: AntimonyProductKey) {
  const elementWeights = { ...product.elementMass } as Record<AntimonyElementKey, number>
  for (const el of ANTIMONY_ELEMENT_KEYS) {
    if (elementWeights[el] == null) elementWeights[el] = 0
  }
  return {
    key: legacyKey,
    name: product.name,
    mass: product.mass,
    elementWeights,
    composition: { ...product.composition },
  }
}

/** 将约束求解结果转为现有 AntimonyProductResult（烟气合并无组织排放） */
export function oxySolverToAntimonyProductResult(result: OxyConstraintSolverResult): AntimonyProductResult {
  const slag = result.products.smeltingSlag
  const matte = result.products.matte
  const gas = result.products.flueGas
  const fugitive = result.products.fugitive
  const dust = result.products.dust
  const loss = result.products.loss

  const gasElementWeights = { ...gas.elementMass } as Record<AntimonyElementKey, number>
  for (const [el, m] of Object.entries(fugitive.elementMass) as [AntimonyElementKey, number][]) {
    gasElementWeights[el] = (gasElementWeights[el] ?? 0) + (m ?? 0)
  }
  const gasMass = gas.mass + fugitive.mass
  const gasComposition = Object.fromEntries(
    ANTIMONY_ELEMENT_KEYS.map((el) => [el, gasMass > 0 ? ((gasElementWeights[el] ?? 0) / gasMass) * 100 : 0])
  ) as Partial<Record<AntimonyElementKey, number>>

  const products = {
    matte: oxyProductToLegacyEntry(matte, 'matte'),
    slag: oxyProductToLegacyEntry(slag, 'slag'),
    gas: {
      key: 'gas' as const,
      name: gas.name,
      mass: gasMass,
      elementWeights: gasElementWeights,
      composition: gasComposition,
    },
    dust: oxyProductToLegacyEntry(dust, 'dust'),
    loss: oxyProductToLegacyEntry(loss, 'loss'),
  }

  const totalProductMass =
    products.matte.mass + products.slag.mass + products.gas.mass + products.dust.mass + products.loss.mass

  return {
    products,
    distribution: {},
    totalProductMass,
  }
}

export function oxyProductPhasePercentMaps(
  result: OxyConstraintSolverResult
): Record<OxySideBlowProductKey, ProductPhasePercentMap> {
  const out = {} as Record<OxySideBlowProductKey, ProductPhasePercentMap>
  for (const pk of Object.keys(result.products) as OxySideBlowProductKey[]) {
    const product = result.products[pk]
    out[pk] = Object.fromEntries(product.phases.map((p) => [p.key, p.pct]))
  }
  return out
}

export function oxyProductTableColumns(result: OxyConstraintSolverResult) {
  return Object.values(result.products).map((p) => ({
    key: p.key,
    name: p.name,
    mass: p.mass,
    elementWeights: p.elementMass,
    composition: p.composition,
    displayMode: 'phases' as const,
    phases: p.phases.map((phase) => ({
      key: phase.key,
      label: PRODUCT_PHASE_DISPLAY[phase.key] ?? phase.key,
      pct: phase.pct,
      mass: phase.mass,
    })),
  }))
}
