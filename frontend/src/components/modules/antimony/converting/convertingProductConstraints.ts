import {
  ensureConvertingProductPhases,
  loadOxyConvertingConstraints,
  normalizeConvertingCustomConstraintExprs,
  stripUnsupportedConvertingCustomConstraints,
} from '../../../../utils/antimonyConstraintConfig.ts'
import type { OxySideBlowConstraintConfig } from '../../../../utils/antimonyConstraintConfig.ts'
import { autoFillOxyProductConstraintConfig } from '../../../../utils/antimonyConstraintValidation.ts'

/** 吹炼产物约束：始终来自吹炼 JSON，不沿用熔炼产物物相表 */
export function createConvertingProductConstraintConfig(): OxySideBlowConstraintConfig {
  const loaded = loadOxyConvertingConstraints()
  const filled = autoFillOxyProductConstraintConfig(loaded).config
  return ensureConvertingProductPhases(
    stripUnsupportedConvertingCustomConstraints(normalizeConvertingCustomConstraintExprs(filled))
  )
}

export function ensureStageUsesConvertingProductPhases(
  config: OxySideBlowConstraintConfig | null | undefined
): OxySideBlowConstraintConfig {
  const isConverting = /converting/i.test(config?.method ?? '')
  if (config && isConverting) {
    return ensureConvertingProductPhases(
      stripUnsupportedConvertingCustomConstraints(normalizeConvertingCustomConstraintExprs(config))
    )
  }
  return createConvertingProductConstraintConfig()
}
