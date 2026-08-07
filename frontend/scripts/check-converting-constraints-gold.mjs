/**
 * 用 MetCal 工作簿1.xlsx 金标准反算吹炼自定义约束 1–6、8（已删除错误的 CaO/渣=2%）。
 * 运行：cd frontend && npx --yes tsx scripts/check-converting-constraints-gold.mjs
 */
import { atomicMass, COMPOUND_MOLAR_MASS } from '../src/utils/atomicMass.ts'
import { loadOxyConvertingConstraints } from '../src/utils/copperConstraintConfig.ts'
import {
  evaluateConstraintExprString,
  evaluateOxygenEnrichmentRatio,
} from '../src/utils/copperConstraintExpression.ts'
import { isOxygenEnrichmentExpr } from '../src/utils/copperProcessParameters.ts'
import { COPPER_BUILTIN_PHASE_FRACTIONS } from '../src/utils/copperPhaseStoichiometry.ts'

const Fe = atomicMass('Fe')
const O = atomicMass('O')
const As = atomicMass('As')
const Ca = atomicMass('Ca')
const CaO = COMPOUND_MOLAR_MASS.CaO
const FeO = Fe + O
const As2O3 = 2 * As + 3 * O
const Fe3O4 = COMPOUND_MOLAR_MASS.Fe3O4

const feeds = {
  空气: 32.1531933295435,
  氧气: 4.96325086428054,
  漏风: 6.37020747166949,
}
const prods = {
  吹炼渣: 4.36749744175233,
  粗铜: 50.5038419495186,
  吹炼出炉烟气: 54.3582011031587,
  吹炼烟气含尘: 0.479269822982801,
}

const airPhases = {
  O2: feeds.空气 * 0.228928107576359,
  N2: feeds.空气 * 0.753956536251368,
  H2O: feeds.空气 * 0.0171153561722724,
}
const oxyPhases = {
  O2: feeds.氧气 * 0.996496448234908,
  N2: feeds.氧气 * 0.00350355176509177,
}
const leakPhases = {
  O2: feeds.漏风 * 0.228928107576359,
  N2: feeds.漏风 * 0.753956536251368,
  H2O: feeds.漏风 * 0.0171153561722724,
}

function phaseMassesFromPct(total, pctMap) {
  return Object.fromEntries(Object.entries(pctMap).map(([k, pct]) => [k, (total * pct) / 100]))
}

const slagPhases = phaseMassesFromPct(prods.吹炼渣, {
  Cu2S: 0.297851528384279,
  Cu2O: 27.8794140607698,
  Fe3O4: 5.52687020963608,
  PbO: 6.28748657687158,
  ZnO: 10.6524624211145,
  As2O3: 0.540844350283161,
  NiO: 0.187207413212308,
  Bi2O3: 0.163272025817491,
  Sb2O3: 0.140449318358553,
  CaFe2O4: 26.4783201957376,
  CaSiO3: 0.415376618502363,
  MgSiO3: 0.354580591989149,
  SeO2: 0.138504353773569,
  SnO: 0.0326367407465984,
  Cd: 0.166538781503139,
  Au: 0.0000346894889838358,
  Ag: 0.00392156394764722,
  Te: 0.153605367111098,
  Other: 20.5806231927521,
})

const dustPhases = phaseMassesFromPct(prods.吹炼烟气含尘, {
  Cu2S: 2.482096069869,
  Cu2O: 24.82096069869,
  FeO: 8.74170319147642,
  Fe3O4: 0.143004011954916,
  NiO: 0.568662201730964,
  PbO: 21.0087917389954,
  ZnO: 18.2013607503343,
  SeO2: 1.26216461327116,
  As2O3: 13.8001212851899,
  Bi2O3: 2.23180175614729,
  Sb2O3: 3.19972179141797,
  CaO: 0.324319462038153,
  SnO: 0.0495687658192135,
  Cd: 0.910582307445146,
  Au: 0.000790297276853761,
  Ag: 0.0446706106030807,
  Other: 2.20968044774022,
})

const fluePhases = phaseMassesFromPct(prods.吹炼出炉烟气, {
  SO2: 41.3757390537488,
  SO3: 0,
  CO2: 0.461301074853191,
  O2: 3.30295772857254,
  N2: 53.4645338683643,
  H2O: 1.21295722135602,
  As2O3: 0.18251105310519,
})

const slagFeOMass = prods.吹炼渣 * (22.7781623887992 / 100)
const slagFe = slagFeOMass * (Fe / FeO)
const slagCaO = prods.吹炼渣 * (7.08228685043241 / 100)

function elementFromPhases(phases, elementKey) {
  let sum = 0
  for (const [phase, mass] of Object.entries(phases)) {
    const frac = COPPER_BUILTIN_PHASE_FRACTIONS[phase]
    if (!frac) continue
    sum += mass * (frac[elementKey] ?? 0)
  }
  return sum
}

const dustFe =
  elementFromPhases(dustPhases, 'Fe(铁)') ||
  dustPhases.FeO * (Fe / FeO) + dustPhases.Fe3O4 * ((3 * Fe) / Fe3O4)

const table = {
  variables: { GMC: 98.75, Ca, CaO, Fe, O, As },
  inputMass: {
    空气: feeds.空气,
    氧气: feeds.氧气,
    // 与求解器一致：漏风顶层按 Nm³ 暴露
    加料口漏风: 5000,
    漏风: feeds.漏风,
  },
  inputElementMass: {
    空气: { 'O(氧)': airPhases.O2 },
    氧气: { 'O(氧)': oxyPhases.O2 },
    加料口漏风: { 'O(氧)': leakPhases.O2 },
  },
  inputPhaseMass: {
    空气: airPhases,
    氧气: oxyPhases,
    加料口漏风: leakPhases,
    漏风: leakPhases,
  },
  outputMass: {
    吹炼渣: prods.吹炼渣,
    粗铜: prods.粗铜,
    吹炼出炉烟气: prods.吹炼出炉烟气,
    吹炼烟气含尘: prods.吹炼烟气含尘,
  },
  outputPhaseMass: {
    吹炼渣: slagPhases,
    吹炼出炉烟气: fluePhases,
    吹炼烟气含尘: dustPhases,
  },
  outputElementMass: {
    吹炼渣: {
      'CaO(氧化钙)': slagCaO,
      'Fe(铁)': slagFe,
    },
    吹炼烟气含尘: {
      'Fe(铁)': dustFe,
    },
  },
}

const config = loadOxyConvertingConstraints()
const checks = []
for (const [index, entry] of config.customConstraints.entries()) {
  const value = isOxygenEnrichmentExpr(entry.expr)
    ? evaluateOxygenEnrichmentRatio(table)
    : evaluateConstraintExprString(entry.expr, table)
  const target = entry.target
  const abs = Math.abs(value - target)
  const rel = Math.abs(target) > 1e-12 ? abs / Math.abs(target) : abs
  checks.push({
    index: index + 1,
    expr: entry.expr,
    target,
    value,
    absResidual: abs,
    relativeResidual: rel,
    ok: rel <= 0.01 || abs <= 1e-4,
  })
}

const freeCaoStillPresent = config.customConstraints.some((e) =>
  /Output\.吹炼渣\.CaO\s*\/\s*Output\.吹炼渣/.test(e.expr)
)
const slagHasFreeCao = (config.products.smeltingSlag.phases ?? []).includes('CaO')

console.log(JSON.stringify({ checks, freeCaoStillPresent, slagHasFreeCao, constraintCount: config.customConstraints.length }, null, 2))

const failed = checks.filter((c) => !c.ok)
if (freeCaoStillPresent) {
  console.error('FAIL: free-CaO/slag constraint still present')
  process.exit(1)
}
if (slagHasFreeCao) {
  console.error('FAIL: slag phases still include free CaO')
  process.exit(1)
}
if (failed.length) {
  console.error('FAIL constraints:', failed.map((c) => c.index).join(','))
  process.exit(1)
}
console.log('OK: converting custom constraints 1-6,8 match Excel gold within 1%')
