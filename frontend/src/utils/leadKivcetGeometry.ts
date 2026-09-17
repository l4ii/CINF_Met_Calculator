import { numericParameter, type ModelComponentManifest, type ModelComponentOverrides } from './modelComponentManifest.ts'

export type LeadKivcetGeometryPart =
  | {
      id: 'reaction-tower' | 'flue-tower' | 'connecting-flue'
      kind: 'box'
      centerXM: number
      centerYM: number
      centerZM: number
      lengthM: number
      widthM: number
      heightM: number
    }
  | {
      id: 'lance'
      kind: 'cylinder'
      centerXM: number
      centerYM: number
      centerZM: number
      radiusM: number
      lengthM: number
    }
  | {
      id: 'lance-water-jacket'
      kind: 'tube'
      centerXM: number
      centerYM: number
      centerZM: number
      innerRadiusM: number
      outerRadiusM: number
      lengthM: number
    }

export interface LeadKivcetGeometry {
  parts: LeadKivcetGeometryPart[]
  overallLengthM: number
  overallWidthM: number
  overallHeightM: number
  components: ModelComponentManifest[]
}

export interface LeadKivcetGeometryInput {
  bodyLengthM?: number
  bodyWidthM?: number
  bodyHeightM?: number
}

const DEFAULTS = { bodyLengthM: 10, bodyWidthM: 4, bodyHeightM: 6 } as const

function positive(value: number | undefined, fallback: number) {
  return Number.isFinite(value) && (value ?? 0) > 0 ? value! : fallback
}

function positiveOverride(overrides: ModelComponentOverrides | undefined, id: string, key: string, fallback: number) {
  const value = overrides?.[id]?.[key]
  return Number.isFinite(value) && (value as number) > 0 ? value as number : fallback
}
function positionOverride(overrides: ModelComponentOverrides | undefined, id: string, key: string, fallback: number) {
  const value = overrides?.[id]?.[key]
  return Number.isFinite(value) ? value as number : fallback
}

export function buildLeadKivcetGeometry(input: LeadKivcetGeometryInput = {}, overrides?: ModelComponentOverrides): LeadKivcetGeometry {
  const reactionLength = positiveOverride(overrides, 'kivcet.primary-body.reaction-tower', 'lengthM', positive(input.bodyLengthM, DEFAULTS.bodyLengthM))
  const width = positiveOverride(overrides, 'kivcet.primary-body.reaction-tower', 'widthM', positive(input.bodyWidthM, DEFAULTS.bodyWidthM))
  const reactionHeight = positiveOverride(overrides, 'kivcet.primary-body.reaction-tower', 'heightM', positive(input.bodyHeightM, DEFAULTS.bodyHeightM))
  const flueLength = Math.max(reactionLength * 0.48, 1.2)
  const flueHeight = Math.max(reactionHeight * 0.55, 1.5)
  const gap = Math.max(reactionLength * 0.12, 0.8)
  const reactionX = -(reactionLength / 2 + gap / 2)
  const flueX = reactionLength / 2 + gap / 2
  const connectorLength = flueX - reactionX + Math.max(reactionLength * 0.18, 0.8)
  const connectorHeight = Math.max(reactionHeight * 0.18, 0.55)
  const connectorY = reactionHeight * 0.72
  const lanceRadius = Math.max(width * 0.035, 0.08)
  const lanceLength = reactionHeight * 0.72
  const lanceCenterY = reactionHeight - lanceLength / 2 + 0.18
  const jacketInnerRadius = lanceRadius * 1.35
  const jacketOuterRadius = lanceRadius * 2.15
  const jacketLength = Math.max(lanceLength * 0.82, 0.4)

  const parts: LeadKivcetGeometryPart[] = [
    {
      id: 'reaction-tower', kind: 'box', centerXM: positionOverride(overrides, 'kivcet.primary-body.reaction-tower', 'centerXM', reactionX), centerYM: positionOverride(overrides, 'kivcet.primary-body.reaction-tower', 'centerYM', reactionHeight / 2),
      centerZM: positionOverride(overrides, 'kivcet.primary-body.reaction-tower', 'centerZM', 0), lengthM: reactionLength, widthM: width, heightM: reactionHeight,
    },
    {
      id: 'flue-tower', kind: 'box', centerXM: positionOverride(overrides, 'kivcet.primary-body.flue-tower', 'centerXM', flueX), centerYM: positionOverride(overrides, 'kivcet.primary-body.flue-tower', 'centerYM', flueHeight / 2),
      centerZM: positionOverride(overrides, 'kivcet.primary-body.flue-tower', 'centerZM', 0), lengthM: positiveOverride(overrides, 'kivcet.primary-body.flue-tower', 'lengthM', flueLength), widthM: positiveOverride(overrides, 'kivcet.primary-body.flue-tower', 'widthM', width * 0.8), heightM: positiveOverride(overrides, 'kivcet.primary-body.flue-tower', 'heightM', flueHeight),
    },
    {
      id: 'connecting-flue', kind: 'box', centerXM: (reactionX + flueX) / 2,
      centerYM: positionOverride(overrides, 'kivcet.process-connection.connecting-flue', 'centerYM', connectorY), centerZM: positionOverride(overrides, 'kivcet.process-connection.connecting-flue', 'centerZM', 0), lengthM: positiveOverride(overrides, 'kivcet.process-connection.connecting-flue', 'lengthM', connectorLength), widthM: positiveOverride(overrides, 'kivcet.process-connection.connecting-flue', 'widthM', width * 0.72),
      heightM: positiveOverride(overrides, 'kivcet.process-connection.connecting-flue', 'heightM', connectorHeight),
    },
    {
      id: 'lance', kind: 'cylinder', centerXM: positionOverride(overrides, 'kivcet.cooling-and-injection.lance', 'centerXM', reactionX), centerYM: positionOverride(overrides, 'kivcet.cooling-and-injection.lance', 'centerYM', lanceCenterY),
      centerZM: positionOverride(overrides, 'kivcet.cooling-and-injection.lance', 'centerZM', 0), radiusM: positiveOverride(overrides, 'kivcet.cooling-and-injection.lance', 'radiusM', lanceRadius), lengthM: positiveOverride(overrides, 'kivcet.cooling-and-injection.lance', 'lengthM', lanceLength),
    },
    {
      id: 'lance-water-jacket', kind: 'tube', centerXM: positionOverride(overrides, 'kivcet.cooling-and-injection.lance-water-jacket', 'centerXM', reactionX),
      centerYM: positionOverride(overrides, 'kivcet.cooling-and-injection.lance-water-jacket', 'centerYM', lanceCenterY + 0.06), centerZM: positionOverride(overrides, 'kivcet.cooling-and-injection.lance-water-jacket', 'centerZM', 0), innerRadiusM: positiveOverride(overrides, 'kivcet.cooling-and-injection.lance-water-jacket', 'innerRadiusM', jacketInnerRadius),
      outerRadiusM: Math.max(positiveOverride(overrides, 'kivcet.cooling-and-injection.lance-water-jacket', 'outerRadiusM', jacketOuterRadius), positiveOverride(overrides, 'kivcet.cooling-and-injection.lance-water-jacket', 'innerRadiusM', jacketInnerRadius) + 0.001), lengthM: positiveOverride(overrides, 'kivcet.cooling-and-injection.lance-water-jacket', 'lengthM', jacketLength),
    },
  ]

  const lancePart = parts.find((part) => part.id === 'lance') as Extract<LeadKivcetGeometryPart, { id: 'lance' }>
  const jacketPart = parts.find((part) => part.id === 'lance-water-jacket') as Extract<LeadKivcetGeometryPart, { id: 'lance-water-jacket' }>
  jacketPart.innerRadiusM = Math.max(jacketPart.innerRadiusM, lancePart.radiusM + 0.001)
  jacketPart.outerRadiusM = Math.max(jacketPart.outerRadiusM, jacketPart.innerRadiusM + 0.001)

  const extents = parts.map((part) => {
    if (part.kind === 'box') return { minX: part.centerXM - part.lengthM / 2, maxX: part.centerXM + part.lengthM / 2, minY: part.centerYM - part.heightM / 2, maxY: part.centerYM + part.heightM / 2, minZ: part.centerZM - part.widthM / 2, maxZ: part.centerZM + part.widthM / 2 }
    const radius = part.kind === 'tube' ? part.outerRadiusM : part.radiusM
    return { minX: part.centerXM - radius, maxX: part.centerXM + radius, minY: part.centerYM - part.lengthM / 2, maxY: part.centerYM + part.lengthM / 2, minZ: part.centerZM - radius, maxZ: part.centerZM + radius }
  })
  const minX = Math.min(...extents.map((e) => e.minX)); const maxX = Math.max(...extents.map((e) => e.maxX))
  const minY = Math.min(...extents.map((e) => e.minY)); const maxY = Math.max(...extents.map((e) => e.maxY))
  const minZ = Math.min(...extents.map((e) => e.minZ)); const maxZ = Math.max(...extents.map((e) => e.maxZ))

  const geometry: LeadKivcetGeometry = {
    parts,
    overallLengthM: maxX - minX,
    overallWidthM: maxZ - minZ,
    overallHeightM: maxY - minY,
    components: [],
  }
  geometry.components = buildLeadKivcetComponentManifest(geometry)
  return geometry
}

/** Stable component metadata shared by the Kivcet viewer and engineering summary. */
export function buildLeadKivcetComponentManifest(geometry: LeadKivcetGeometry): ModelComponentManifest[] {
  return geometry.parts.map((part) => {
    const base = `kivcet.${part.id === 'connecting-flue' ? 'process-connection' : part.id === 'lance' || part.id === 'lance-water-jacket' ? 'cooling-and-injection' : 'primary-body'}.${part.id}`
    const params: ModelComponentManifest['params'] = part.kind === 'box'
      ? {
          lengthM: numericParameter(part.lengthM, 'm', { editable: true, source: 'geometry' }),
          widthM: numericParameter(part.widthM, 'm', { editable: true, source: 'geometry' }),
          heightM: numericParameter(part.heightM, 'm', { editable: true, source: 'geometry' }),
        }
      : part.kind === 'cylinder'
        ? {
            radiusM: numericParameter(part.radiusM, 'm', { editable: true, source: 'geometry' }),
            lengthM: numericParameter(part.lengthM, 'm', { editable: true, source: 'geometry' }),
          }
      : {
            innerRadiusM: numericParameter(part.innerRadiusM, 'm', { editable: true, source: 'geometry' }),
            outerRadiusM: numericParameter(part.outerRadiusM, 'm', { editable: true, source: 'geometry' }),
          lengthM: numericParameter(part.lengthM, 'm', { editable: true, source: 'geometry' }),
        }
    params.centerXM = numericParameter(part.centerXM, 'm', { editable: true, source: 'geometry', label: 'X' })
    params.centerYM = numericParameter(part.centerYM, 'm', { editable: true, source: 'geometry', label: 'Y' })
    params.centerZM = numericParameter(part.centerZM, 'm', { editable: true, source: 'geometry', label: 'Z' })
    return {
      id: base,
      model: 'lead-kivcet',
      group: part.id === 'connecting-flue' ? 'process-connection' : part.id === 'lance' || part.id === 'lance-water-jacket' ? 'cooling-and-injection' : 'primary-body',
      category: part.id,
      role: part.id === 'reaction-tower' ? '反应塔' : part.id === 'flue-tower' ? '烟道塔' : part.id === 'connecting-flue' ? '连接烟道' : part.id === 'lance' ? '喷枪' : '喷枪水套',
      kind: part.kind,
      geometryId: part.id,
      params,
    }
  })
}
