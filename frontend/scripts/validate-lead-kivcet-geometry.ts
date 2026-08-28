import assert from 'node:assert/strict'
import { buildLeadKivcetGeometry } from '../src/utils/leadKivcetGeometry.ts'

const geometry = buildLeadKivcetGeometry({ bodyLengthM: 10, bodyWidthM: 4, bodyHeightM: 6 })
const reaction = geometry.parts.find((part) => part.id === 'reaction-tower')
const flue = geometry.parts.find((part) => part.id === 'flue-tower')
const connector = geometry.parts.find((part) => part.id === 'connecting-flue')
const lance = geometry.parts.find((part) => part.id === 'lance')
const jacket = geometry.parts.find((part) => part.id === 'lance-water-jacket')
assert(reaction && flue && connector && lance && jacket)
assert(reaction.heightM > flue.heightM)
assert(connector.centerXM - connector.lengthM / 2 < reaction.centerXM + reaction.lengthM / 2)
assert(connector.centerXM + connector.lengthM / 2 > flue.centerXM - flue.lengthM / 2)
assert(jacket.outerRadiusM > jacket.innerRadiusM)
assert(jacket.outerRadiusM > lance.radiusM)

console.log('lead kivcet geometry validation passed')
