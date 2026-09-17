import assert from 'node:assert/strict'
import { buildSmeltingFurnaceLayout } from '../src/utils/copperFurnaceGeometry.ts'
import { buildLeadKivcetGeometry } from '../src/utils/leadKivcetGeometry.ts'
const d={designLengthM:8,furnaceLengthM:8,furnaceWidthM:2.2,jacketPitchMm:600,jacketCountOneSide:2,tuyereCountOneSide:2}
const base=buildSmeltingFurnaceLayout(d)
const edited=buildSmeltingFurnaceLayout(d, {'smelting.cooling-and-injection.jacket.front.01':{lengthM:0.9,centerXM:3.2,centerYM:1,centerZM:2}})
assert.equal(edited.jackets[0].lengthM,0.9); assert.equal(edited.jackets[0].centerXM,3.2); assert.equal(edited.jackets[0].index,1); assert.equal(edited.tuyeres[1].index,2)
const k=buildLeadKivcetGeometry({}, {'kivcet.cooling-and-injection.lance-water-jacket':{innerRadiusM:0.4,outerRadiusM:0.2}})
const tube=k.parts.find(p=>p.id==='lance-water-jacket'); assert(tube && tube.outerRadiusM>tube.innerRadiusM)
console.log('override validation passed')
