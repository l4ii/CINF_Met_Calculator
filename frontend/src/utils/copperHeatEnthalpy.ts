export type CopperHeatEnthalpyRecord = {
  h25: number
  h1300?: number
  h1350?: number
}

export type CopperHeatEnthalpyContext = 'smeltingSlag' | 'matte' | 'flueGas' | 'dust' | 'fugitive' | 'loss'

export const COPPER_HEAT_ENTHALPY_TEMPERATURES_C = [25, 1300, 1350] as const
export const COPPER_INPUT_STANDARD_ENTHALPY_KJ_MOL: Record<string, number> = {
  SiO2: -910.879,
  CaO: -634.935,
  MgO: -601.614,
  Fe: 0,
  C: 0,
  H: 218.004,
  S: 0,
  N: 472.69,
  O: 249.18,
  Fe2O3: -823.02,
  CuFeS2: -190.377,
  CuS: -56.001,
  Cu2S: -79.498,
  FeS2: -170.304,
  FeS: -101.674,
  CaCO3: -1206.629,
  MgCO3: -1096.026,
  Al2O3: -1675.732,
  PbS: -99.466,
  ZnS: -203.005,
  NiS: -87.866,
  Se: 0,
  Bi2S3: -143.105,
  Sb2S3: -205.021,
  As2S3: -92.702,
  Hg: 0,
  Cd: 0,
  Au: 0,
  Ag: 0,
  CuSO4: -770,
  Cu: 0,
  Sn: 0,
  Te: 0,
  H2O: -285.837,
  O2: 0,
  N2: 0,
  Other: -634.935195826723,
}

export const COPPER_PHASE_ENTHALPY_KJ_MOL: Record<string, CopperHeatEnthalpyRecord> = {
  Cu2S: { h25: -79.498, h1300: 46.408, h1350: 50.592 },
  Cu2O: { h25: -170.604, h1300: 2.006, h1350: 2.006 },
  FeS: { h25: -101.674, h1300: 15.123, h1350: 18.251 },
  FeO: { h25: -267.276, h1300: -189.916, h1350: -189.916 },
  Fe3O4: { h25: -1118.41, h1300: -856.488, h1350: -846.525 },
  As2O3: { h25: -654.812, h1300: -441.086, h1350: -441.086 },
  PbO: { h25: -218.067, h1300: -116.124, h1350: -116.124 },
  ZnO: { h25: -350.508, h1300: -282.732, h1350: -282.732 },
  NiO: { h25: -239.706, h1300: -166.652, h1350: -166.652 },
  SeO2: { h25: -225.505, h1300: -81.353, h1350: -81.353 },
  Bi2O3: { h25: -578.024, h1300: -323.167, h1350: -323.167 },
  Sb2O3: { h25: -708.564, h1300: -437.15, h1350: -437.15 },
  Fe2SiO4: { h25: -1479.147, h1350: -1143.099 },
  CaSiO3: { h25: -1634.979, h1350: -1475.585 },
  MgSiO3: { h25: -1548.535, h1350: -1391.168 },
  '3Al2O3•2SiO2': { h25: -6819.372, h1350: -6169.136 },
  SnO: { h25: -280.715, h1350: -177.883 },
  SiO2: { h25: -910.879, h1350: -818.744 },
  Cd: { h25: 0, h1300: 43.531, h1350: 45.026 },
  Au: { h25: 0, h1300: 49.086, h1350: 50.636 },
  Ag: { h25: 0, h1300: 49.053, h1350: 50.727 },
  Te: { h25: 0, h1300: 57.551, h1350: 59.179 },
  Ni: { h25: 0, h1300: 41.792 },
  Pb: { h25: 0, h1300: 41.847 },
  Zn: { h25: 0, h1300: 45.809 },
  As2S3: { h25: -92.702, h1300: 153.945 },
  Se: { h25: 0, h1300: 48.407 },
  Bi: { h25: 0, h1300: 46.54 },
  Sb: { h25: 0, h1300: 57.541 },
  Sn: { h25: 0, h1300: 43.298 },
  SO2: { h25: -296.82, h1350: -226.265 },
  SO3: { h25: -395.774, h1350: -298.322 },
  CO2: { h25: -393.515, h1350: -324.555 },
  O2: { h25: 0, h1350: 45.134 },
  N2: { h25: 0, h1350: 42.718 },
  H2O: { h25: -285.837, h1350: -140.471 },
  Hg: { h25: 0 },
  PbS: { h25: -99.466, h1350: 25.015 },
  ZnS: { h25: -203.005, h1350: -132.345 },
  CaO: { h25: -634.935, h1350: -567.766 },
  MgO: { h25: -601.614, h1350: -535.989 },
  Al2O3: { h25: -1675.732, h1350: -1516.891 },
  Cu: { h25: 0, h1350: 51.24 },
  S: { h25: 0, h1350: 45.09 },
  CuFeS2: { h25: -190.377, h1300: -58.412, h1350: -52.186 },
  CuS: { h25: -56.001, h1300: 28.654, h1350: 32.118 },
  FeS2: { h25: -170.304, h1300: 8.236, h1350: 12.451 },
  CaCO3: { h25: -1206.629, h1300: -1098.214, h1350: -1086.552 },
  MgCO3: { h25: -1096.026, h1300: -992.418, h1350: -981.236 },
  NiS: { h25: -87.866, h1300: 22.118, h1350: 25.884 },
  Bi2S3: { h25: -143.105, h1300: 68.442, h1350: 74.118 },
  Sb2S3: { h25: -205.021, h1300: 42.336, h1350: 48.112 },
  Other: { h25: -634.935195826723, h1350: -567.766361898923 },
}

export const COPPER_PRODUCT_PHASE_ENTHALPY_KJ_MOL: Partial<
  Record<CopperHeatEnthalpyContext, Record<string, CopperHeatEnthalpyRecord>>
> = {
  smeltingSlag: {
    Cu2S: { h25: -68.0999927175524, h1350: 50.7064824493219 },
    Cu2O: { h25: -130.224007388878, h1350: 2.16509605846882 },
    FeS: { h25: -64.6311124709127, h1350: 18.2506773466658 },
    FeO: { h25: -267.276370083618, h1350: -189.916386535416 },
    Fe3O4: { h25: -993.333789019775, h1350: -710.593231519775 },
    As2O3: { h25: -643.439192651366, h1350: -441.085656401366 },
    PbO: { h25: -202.248988017654, h1350: -116.123997476091 },
    ZnO: { h25: -309.541934674072, h1350: -229.154913424073 },
    NiO: { h25: -178.631864425278, h1350: -106.560741925277 },
    SeO2: { h25: -225.505391318893, h1350: -81.3532577552513 },
    Bi2O3: { h25: -578.023812817384, h1350: -323.166723545054 },
    Sb2O3: { h25: -675.489924728393, h1350: -467.592455978393 },
    CaSiO3: { h25: -1634.97895686035, h1350: -1475.58496051791 },
    MgSiO3: { h25: -1548.53543553772, h1350: -1391.16840082593 },
    '3Al2O3•2SiO2': { h25: -6819.37151912842, h1350: -6169.13581095134 },
    SnO: { h25: -280.715467401124, h1350: -177.882920642539 },
    SiO2: { h25: -927.548048405456, h1350: -813.897432155455 },
    Cd: { h25: 5.60722883566617, h1350: 44.9691490569556 },
    Au: { h25: 0, h1350: 50.6361474271563 },
    Ag: { h25: 6.39274116257428, h1350: 50.7442011625742 },
    Te: { h25: 0, h1350: 59.179420724791 },
    Other: { h25: -572.908288334654, h1350: -489.749300834656 },
  },
  matte: {
    Cu2S: { h25: -68.099992717552, h1300: 46.2232192354775 },
    FeS: { h25: -64.6311124709127, h1300: 15.1230626365685 },
    Fe3O4: { h25: -993.333789019775, h1300: -721.262686519776 },
    Ni: { h25: 3.36060505344271, h1300: 58.3082993209612 },
    Pb: { h25: 3.87294882187844, h1300: 41.7927945825456 },
    Zn: { h25: 5.7270032351017, h1300: 45.7374594851018 },
    As2S3: { h25: -81.9991759975436, h1300: 153.881458631945 },
    Se: { h25: 0, h1300: 48.4066016333974 },
    Bi: { h25: 9.2714312391758, h1300: 46.548449218704 },
    Sb: { h25: 17.5308884363652, h1300: 57.5413446863653 },
    Cd: { h25: 5.60722883566616, h1300: 43.4837935769068 },
    Sn: { h25: 0, h1300: 43.297919388547 },
    Au: { h25: 0, h1300: 49.0862364693751 },
    Ag: { h25: 6.39274116257429, h1300: 49.0705611625744 },
    Te: { h25: 0, h1300: 57.5513818148478 },
    Other: { h25: -572.908288334658, h1300: -492.887375834656 },
  },
  flueGas: {
    SO2: { h25: -296.820064215088, h1350: -226.264542483756 },
    CO2: { h25: -393.51461776886, h1350: -324.5549818372 },
    O2: { h25: 0, h1350: 45.1341287525456 },
    N2: { h25: 0, h1350: 42.7183197570547 },
    H2O: { h25: -241.831783228682, h1350: -187.623221762462 },
    As2O3: { h25: -322.845171322633, h1350: -207.282421048901 },
    Hg: { h25: 61.3814575870515, h1350: 88.936704514893 },
  },
  loss: {
    Cu: { h25: 0, h1350: 51.2402623146897 },
    S: { h25: 0, h1350: 45.0895370065435 },
  },
}

function phaseEnthalpyRecord(phase: string, context?: CopperHeatEnthalpyContext) {
  return (context ? COPPER_PRODUCT_PHASE_ENTHALPY_KJ_MOL[context]?.[phase] : undefined) ??
    COPPER_PHASE_ENTHALPY_KJ_MOL[phase]
}

export function copperEnthalpy25KJmol(phase: string, context?: CopperHeatEnthalpyContext) {
  return phaseEnthalpyRecord(phase, context)?.h25 ?? COPPER_INPUT_STANDARD_ENTHALPY_KJ_MOL[phase] ?? null
}

export function copperEnthalpyAtTemperatureKJmol(
  phase: string,
  temperatureC: number,
  context?: CopperHeatEnthalpyContext
) {
  const record = phaseEnthalpyRecord(phase, context)
  if (record) {
    if (temperatureC <= 25) return record.h25
    const low = record.h1300
    const high = record.h1350
    if (low != null && high != null) {
      if (temperatureC <= 1300) {
        return record.h25 + ((low - record.h25) * (temperatureC - 25)) / (1300 - 25)
      }
      return low + ((high - low) * (temperatureC - 1300)) / (1350 - 1300)
    }
    if (high != null) {
      return record.h25 + ((high - record.h25) * (temperatureC - 25)) / (1350 - 25)
    }
    if (low != null) {
      return record.h25 + ((low - record.h25) * (temperatureC - 25)) / (1300 - 25)
    }
    return record.h25
  }
  const h25 = COPPER_INPUT_STANDARD_ENTHALPY_KJ_MOL[phase]
  if (h25 == null) return null
  const sensibleSlopeKJmolPerC = 0.035
  return h25 + sensibleSlopeKJmolPerC * Math.max(0, temperatureC - 25)
}

export function copperStandardFormationHeatKJmol(phase: string) {
  return COPPER_INPUT_STANDARD_ENTHALPY_KJ_MOL[phase] ?? COPPER_PHASE_ENTHALPY_KJ_MOL[phase]?.h25 ?? 0
}
