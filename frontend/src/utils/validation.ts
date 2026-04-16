/**
 * 输入验证工具（参考 AntimonyMix Pro gui.py _validate_float、models.py validate_ratios）
 */

export class ValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ValidationError'
  }
}

/** 验证浮点数，可选范围 */
export function validateFloat(
  value: string,
  name: string,
  opts?: { min?: number; max?: number; required?: boolean }
): number {
  const s = value.trim().replace(',', '.').replace('%', '')
  if (opts?.required !== false && !s) {
    throw new ValidationError(`请输入${name}`)
  }
  const num = parseFloat(s)
  if (isNaN(num)) {
    throw new ValidationError(`${name}必须是有效的数字`)
  }
  if (opts?.min != null && num < opts.min) {
    throw new ValidationError(`${name}不能小于${opts.min}`)
  }
  if (opts?.max != null && num > opts.max) {
    throw new ValidationError(`${name}不能大于${opts.max}`)
  }
  return num
}

/** 验证元素配比总和，返回是否有效及调整后的值 */
export function validateElementRatios(
  ratios: Record<string, number>,
  options?: { tolerance?: number; autoScale?: boolean; fillOther?: boolean }
): { valid: boolean; adjusted: Record<string, number> } {
  const tolerance = options?.tolerance ?? 0.01
  const total = Object.values(ratios).reduce((s, v) => s + (typeof v === 'number' ? v : 0), 0)

  if (Math.abs(total - 100) <= tolerance) {
    return { valid: true, adjusted: { ...ratios } }
  }

  const adjusted = { ...ratios }

  if (options?.fillOther && 'Other(其他)' in adjusted) {
    const remaining = 100 - total
    if (remaining < 0) {
      throw new ValidationError(`无法补全，总和超过100%且Other不足`)
    }
    adjusted['Other(其他)'] = (adjusted['Other(其他)'] ?? 0) + remaining
    return { valid: true, adjusted }
  }

  if (options?.autoScale || total > 0) {
    const scale = 100 / total
    for (const k of Object.keys(adjusted)) {
      adjusted[k] = (adjusted[k] ?? 0) * scale
    }
    return { valid: true, adjusted }
  }

  return { valid: false, adjusted }
}
