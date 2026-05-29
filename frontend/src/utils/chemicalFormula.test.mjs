import assert from 'node:assert/strict'

const { parseFormulaInput, formulaToDisplayLabel, validatePhaseFormulaInput } = await import('./chemicalFormula.ts')

const cus = parseFormulaInput('cus')
assert(cus.ok, 'cus should parse as CuS')
assert.equal(cus.formula, 'CuS')
assert.equal(cus.displayLabel, 'CuS')
assert(Math.abs((cus.elementFractions['Cu(铜)'] ?? 0) - 63.546 / (63.546 + 32.066)) < 0.001)

const cusValidated = validatePhaseFormulaInput('cus')
assert(cusValidated.ok, 'cus alias should pass semantic validation')

const fe3o4 = parseFormulaInput('fe3o4')
assert(fe3o4.ok, 'fe3o4 should parse')
assert.equal(fe3o4.formula, 'Fe3O4')
assert.equal(fe3o4.displayLabel, 'Fe₃O₄')

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
