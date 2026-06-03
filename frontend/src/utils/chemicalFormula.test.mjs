import assert from 'node:assert/strict'

const { parseFormulaInput, formulaToDisplayLabel, validatePhaseFormulaInput } = await import('./chemicalFormula.ts')

const cus = parseFormulaInput('cus')
assert(cus.ok, 'cus should parse as CuS')
assert.equal(cus.formula, 'CuS')
assert.equal(cus.displayLabel, 'CuS')
const { atomicMass } = await import('./atomicMass.ts')
assert(
  Math.abs(
    (cus.elementFractions['Cu(铜)'] ?? 0) - atomicMass('Cu') / (atomicMass('Cu') + atomicMass('S'))
  ) < 0.001
)

const cusValidated = validatePhaseFormulaInput('cus')
assert(cusValidated.ok, 'cus alias should pass semantic validation')

const fe3o4 = parseFormulaInput('fe3o4')
assert(fe3o4.ok, 'fe3o4 should parse')
assert.equal(fe3o4.formula, 'Fe3O4')
assert.equal(fe3o4.displayLabel, 'Fe₃O₄')

const feo = parseFormulaInput('FeO')
assert(feo.ok, 'FeO should parse')
assert(Math.abs(Object.values(feo.elementFractions).reduce((sum, value) => sum + value, 0) - 1) < 1e-9)
assert(
  Math.abs((feo.elementFractions['O(氧)'] ?? 0) - atomicMass('O') / (atomicMass('Fe') + atomicMass('O'))) <
    1e-9,
  'oxide oxygen fraction should be oxygen-element mass, not doubled O2 equivalent'
)

const as2o3 = parseFormulaInput('as2o3')
assert(as2o3.ok, 'as2o3 alias should parse')
assert.equal(as2o3.formula, 'As2O3')
assert(Math.abs(Object.values(as2o3.elementFractions).reduce((sum, value) => sum + value, 0) - 1) < 1e-9)

const sb2o3 = validatePhaseFormulaInput('sb2o3')
assert(sb2o3.ok, 'sb2o3 alias should pass semantic validation')
assert.equal(sb2o3.formula, 'Sb2O3')

const unicodeSub = parseFormulaInput('Fe₃O₄')
assert(unicodeSub.ok, 'unicode subscripts should parse')
assert.equal(unicodeSub.formula, 'Fe3O4')

const invalid = parseFormulaInput('ojbk')
assert(!invalid.ok, 'ojbk should fail')
assert(invalid.errors.some((error) => error.includes('未识别')), 'should report unknown token')

const ooo = validatePhaseFormulaInput('ooo')
assert(!ooo.ok, 'ooo should fail semantic validation')

const ofe = validatePhaseFormulaInput('ofe')
assert(!ofe.ok, 'ofe should fail semantic validation')

const empty = parseFormulaInput('')
assert(!empty.ok)

assert.equal(formulaToDisplayLabel('Cu2S'), 'Cu₂S')

console.log('chemicalFormula checks passed')
