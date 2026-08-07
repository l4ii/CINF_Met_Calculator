import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { extractMetcalConvertingConstraintImport } from '../frontend/src/utils/metcalFloConstraintExtract.ts'

const floPath =
  'c:\\Users\\0303003\\Desktop\\2026\\1 项目\\富氧侧吹炉冶炼配料-选型-三维设计一体化智能平台\\案例\\西南铜(吴).flo'
const flo = readFileSync(floPath)
const buffer = flo.buffer.slice(flo.byteOffset, flo.byteOffset + flo.byteLength)
const result = extractMetcalConvertingConstraintImport(buffer)

mkdirSync('.flo_converting_probe', { recursive: true })
writeFileSync(
  '.flo_converting_probe/converting_constraints_result.json',
  JSON.stringify(
    {
      notes: result.notes,
      matchedCustomExprs: result.matchedCustomExprs,
      processParameters: result.processParameters,
      convertingUnit: result.convertingUnit,
      customConstraints: result.config.customConstraints,
      elementDistributions: result.config.elementDistributions,
    },
    null,
    2
  ),
  'utf8'
)
writeFileSync(
  'frontend/src/config/copperOxyConvertingConstraints.json',
  JSON.stringify(result.config, null, 2),
  'utf8'
)
console.log('notes', result.notes)
console.log('matched', result.matchedCustomExprs)
console.log('params', result.processParameters)
console.log('custom', result.config.customConstraints.length)
console.log('elements', result.config.elementDistributions.length)
