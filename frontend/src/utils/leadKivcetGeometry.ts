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

export function buildLeadKivcetGeometry(input: LeadKivcetGeometryInput = {}): LeadKivcetGeometry {
  const reactionLength = positive(input.bodyLengthM, DEFAULTS.bodyLengthM)
  const width = positive(input.bodyWidthM, DEFAULTS.bodyWidthM)
  const reactionHeight = positive(input.bodyHeightM, DEFAULTS.bodyHeightM)
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
      id: 'reaction-tower', kind: 'box', centerXM: reactionX, centerYM: reactionHeight / 2,
      centerZM: 0, lengthM: reactionLength, widthM: width, heightM: reactionHeight,
    },
    {
      id: 'flue-tower', kind: 'box', centerXM: flueX, centerYM: flueHeight / 2,
      centerZM: 0, lengthM: flueLength, widthM: width * 0.8, heightM: flueHeight,
    },
    {
      id: 'connecting-flue', kind: 'box', centerXM: (reactionX + flueX) / 2,
      centerYM: connectorY, centerZM: 0, lengthM: connectorLength, widthM: width * 0.72,
      heightM: connectorHeight,
    },
    {
      id: 'lance', kind: 'cylinder', centerXM: reactionX, centerYM: lanceCenterY,
      centerZM: 0, radiusM: lanceRadius, lengthM: lanceLength,
    },
    {
      id: 'lance-water-jacket', kind: 'tube', centerXM: reactionX,
      centerYM: lanceCenterY + 0.06, centerZM: 0, innerRadiusM: jacketInnerRadius,
      outerRadiusM: jacketOuterRadius, lengthM: jacketLength,
    },
  ]

  return {
    parts,
    overallLengthM: connectorLength + reactionLength * 0.15,
    overallWidthM: width,
    overallHeightM: reactionHeight + lanceLength * 0.08,
  }
}
