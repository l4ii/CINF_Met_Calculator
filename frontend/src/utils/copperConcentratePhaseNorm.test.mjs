import assert from 'node:assert/strict'

const { allocateConcentratePhases, shouldUseConcentrateNormativeAllocator } = await import(
  './copperConcentratePhaseNorm.ts'
)
const { COPPER_MATERIAL_LIBRARY, calculateAssayDisplayTotal } = await import('./copperWorkflowCalc.ts')

const EXCEL_PHASE_TARGETS = {
  系统内精矿: {
    CuFeS2: 31.45242610917573,
    Cu2S: 10.280369736552872,
    FeS: 28.17202135302005,
    SiO2: 11.412548257326494,
    CaCO3: 2.8579143436887997,
    CaO: 1.0675856174083729,
    MgCO3: 1.4027214367864376,
    MgO: 0.4470613331392605,
    Al2O3: 2.4047165585385706,
    PbS: 0.2162314729138415,
    ZnS: 0.26440257057983163,
    NiS: 0.06095894646480929,
    Se: 0.014783093597573179,
    Bi2S3: 0.01333609344073617,
    Sb2S3: 0.03849603694203083,
    As2S3: 0.24273657369892024,
    Hg: 0.000029566187195146358,
    Cd: 0.03942158292686181,
    Au: 0.0003019693252197615,
    Ag: 0.0033252105198807937,
    Sn: 0.002956618719514636,
    Te: 0.009855395731715453,
    Other: 9.595800123315266,
  },
  国内外购矿: {
    CuFeS2: 51.57475923077378,
    Cu2S: 2.145721560254766,
    FeS: 19.09440852972832,
    SiO2: 8.48956032000987,
    CaCO3: 1.9156825482353506,
    CaO: 0.7156080793878281,
    MgCO3: 1.1636504424306897,
    MgO: 0.3708654703464577,
    Al2O3: 1.9591293046176623,
    PbS: 0.8043810076338903,
    ZnS: 1.787391263753631,
    NiS: 0.04284097396036459,
    Se: 0.014841888671345926,
    Bi2S3: 0.1996198089863509,
    Sb2S3: 0.07039665284665655,
    As2S3: 0.5637639173402237,
    Hg: 0.000029683777342691854,
    Cd: 0.03957836979025581,
    Au: 0.0005533056096677761,
    Ag: 0.02005633889121213,
    Sn: 0.0029683777342691853,
    Te: 0.009894592447563952,
    Other: 9.014298332772508,
  },
  进口铜精矿: {
    CuFeS2: 71.51683887385322,
    FeS2: 1.1780623327469433,
    FeS: 7.646423607938991,
    SiO2: 7.005628563475402,
    CaCO3: 1.0151600173126691,
    CaO: 0.3792135646960323,
    MgCO3: 0.803211334710385,
    MgO: 0.2559890310945972,
    Al2O3: 1.7837025916933826,
    PbS: 0.7573439564016075,
    ZnS: 3.761930843429069,
    NiS: 0.01075621375353945,
    Se: 0.014905592688245537,
    Bi2S3: 0.05745366336394849,
    Sb2S3: 0.05129129190320294,
    As2S3: 0.48949598732032096,
    Hg: 0.000029811185376491077,
    Cd: 0.039748247168654764,
    Au: 0.0002751572410250126,
    Ag: 0.022447822588497778,
    Sn: 0.0029811185376491076,
    Te: 0.009937061792163691,
    Other: 3.197173315105069,
  },
  边贸矿: {
    CuFeS2: 51.57475923077378,
    Cu2S: 2.145721560254766,
    FeS: 19.09440852972832,
    SiO2: 8.48956032000987,
    CaCO3: 1.9156825482353506,
    CaO: 0.7156080793878281,
    MgCO3: 1.1636504424306897,
    MgO: 0.3708654703464577,
    Al2O3: 1.9591293046176623,
    PbS: 0.8043810076338903,
    ZnS: 1.787391263753631,
    NiS: 0.04284097396036459,
    Se: 0.014841888671345926,
    Bi2S3: 0.1996198089863509,
    Sb2S3: 0.07039665284665655,
    As2S3: 0.5637639173402237,
    Hg: 0.000029683777342691854,
    Cd: 0.03957836979025581,
    Au: 0.0005533056096677761,
    Ag: 0.02005633889121213,
    Sn: 0.0029683777342691853,
    Te: 0.009894592447563952,
    Other: 9.014298332772508,
  },
}

const TOL = 0.08

for (const material of COPPER_MATERIAL_LIBRARY) {
  const expected = EXCEL_PHASE_TARGETS[material.name]
  if (!expected) continue
  assert(shouldUseConcentrateNormativeAllocator(material.ratios), material.name)
  const total = calculateAssayDisplayTotal(material.ratios)
  assert.ok(Math.abs(total - 100) <= 0.05, `${material.name} assay total ${total}`)
  assert.ok((material.ratios['O(氧)'] ?? 0) >= 0, `${material.name} library O should be non-negative after cleanup`)
  const phases = allocateConcentratePhases(material.ratios)
  const phaseSum = Object.values(phases).reduce((s, v) => s + v, 0)
  assert.ok(Math.abs(phaseSum - 100) <= 0.02, `${material.name} phase sum ${phaseSum}`)
  for (const [key, target] of Object.entries(expected)) {
    const got = phases[key] ?? 0
    assert.ok(
      Math.abs(got - target) <= TOL,
      `${material.name}.${key}: got ${got}, expected ${target}, diff ${Math.abs(got - target)}`
    )
  }
}

assert.equal(COPPER_MATERIAL_LIBRARY.length, 5, 'library should have 铜精矿A + 4 SW concentrates')
assert.ok(COPPER_MATERIAL_LIBRARY.some((m) => m.name === '铜精矿 A'))
assert.ok(COPPER_MATERIAL_LIBRARY.some((m) => m.name === '系统内精矿'))

console.log('copperConcentratePhaseNorm.test.mjs: all tests passed')
