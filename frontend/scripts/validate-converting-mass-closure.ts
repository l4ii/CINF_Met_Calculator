import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  compileOxyConstraintSystem as compileAntimonyConstraintSystem,
  evaluateEquationResidual as evaluateAntimonyEquationResidual,
} from '../src/utils/antimonyConstraintSystemCompiler.ts'
import { classifyOxyConstraintAcceptance as classifyAntimonySolverAcceptance } from '../src/utils/antimonyConstraintSolver.ts'
import { loadOxyConvertingConstraints as loadAntimonyConvertingConstraints } from '../src/utils/antimonyConstraintConfig.ts'
import {
  compileOxyConstraintSystem as compileCopperConstraintSystem,
  evaluateEquationResidual as evaluateCopperEquationResidual,
} from '../src/utils/copperConstraintSystemCompiler.ts'
import { classifyOxyConstraintAcceptance as classifyCopperSolverAcceptance } from '../src/utils/copperConstraintSolver.ts'
import { loadOxyConvertingConstraints, OXY_PRODUCT_KEY_TO_CN, OXY_SIDE_BLOW_PRODUCT_KEYS } from '../src/utils/copperConstraintConfig.ts'
import type { ConstraintSymbolTable } from '../src/utils/copperConstraintExpression.ts'
import { extractMetcalConvertingConstraintImport } from '../src/utils/metcalFloConstraintExtract.ts'

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function tableWithProductMass(totalProductMass: number): ConstraintSymbolTable {
  const outputMass = Object.fromEntries(
    OXY_SIDE_BLOW_PRODUCT_KEYS.map((productKey, index) => [
      OXY_PRODUCT_KEY_TO_CN[productKey],
      index === 0 ? totalProductMass : 0,
    ])
  )
  return {
    variables: {},
    inputMass: { TotalInput: 0, '\u603b\u6295\u5165': 100 },
    inputElementMass: {},
    inputPhaseMass: {},
    outputMass,
    outputPhaseMass: {},
    outputElementMass: {},
  }
}

function requireMassEquation<T extends { id: string }>(equations: T[], label: string): T {
  const equation = equations.find((item) => item.id === 'mass_balance:total')
  assert(equation, `${label} converting constraints must include a total mass balance equation`)
  return equation
}

const copperConfig = loadOxyConvertingConstraints()
const copperMassEquation = requireMassEquation(
  compileCopperConstraintSystem(copperConfig),
  'copper'
)
assert(
  evaluateCopperEquationResidual(copperMassEquation, tableWithProductMass(101), copperConfig, {}, {}) === 1,
  'copper mass equation must report output minus input mass'
)
assert(
  evaluateCopperEquationResidual(copperMassEquation, tableWithProductMass(100), copperConfig, {}, {}) === 0,
  'copper mass equation must close equal input and output mass'
)

const antimonyConfig = loadAntimonyConvertingConstraints()
const antimonyMassEquation = requireMassEquation(
  compileAntimonyConstraintSystem(antimonyConfig),
  'antimony'
)
assert(
  evaluateAntimonyEquationResidual(antimonyMassEquation, tableWithProductMass(101), antimonyConfig, {}, {}) === 1,
  'antimony mass equation must report output minus input mass'
)
assert(
  classifyCopperSolverAcceptance(0, true, false) === 'failed',
  'copper solver must reject an unclosed material mass balance before fillback'
)
assert(
  classifyAntimonySolverAcceptance(0, true, false) === 'failed',
  'antimony solver must reject an unclosed material mass balance before fillback'
)

const scriptDir = dirname(fileURLToPath(import.meta.url))
const templatePath = join(scriptDir, '..', 'public', 'templates', 'southwest-copper-wu.flo')
const template = readFileSync(templatePath)
const buffer = template.buffer.slice(template.byteOffset, template.byteOffset + template.byteLength)
const importing = extractMetcalConvertingConstraintImport(buffer)
assert(importing.config.products.matte.name === '\u7c97\u94dc', 'FLO converting import must start from the converting product template')
assert(importing.config.products.smeltingSlag.name === '\u5439\u70bc\u6e23', 'FLO converting import must keep converting slag names')

console.log('converting mass-closure validation passed')
