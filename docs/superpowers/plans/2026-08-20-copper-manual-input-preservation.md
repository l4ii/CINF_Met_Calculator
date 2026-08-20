# Copper Manual Input Preservation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep user-entered coal, flux, and gas quantities fixed through copper product calculation cold starts, case restoration, and `.metcal` imports while leaving unentered quantities available to the solver.

**Architecture:** A pure shared input helper will derive a cold-start boundary from per-column manual flags. Both copper batch pages will use that helper and will pass the same flags during restoration. Import normalization will retain the new per-gas flag map without inferring it from the old global display flag.

**Tech Stack:** TypeScript, React, Node assertion scripts, Vite.

---

### Task 1: Test cold-start input semantics

**Files:**
- Modify: `frontend/scripts/validate-oxy-settled-inputs.mjs`
- Test: `frontend/scripts/validate-oxy-settled-inputs.mjs`

- [ ] **Step 1: Write the failing test**

```js
const coldStart = resolveOxySolverColdStartInputs({
  fuelColumn: { ...sourceFuel, weight: 3 },
  solventColumns: [{ ...sourceSolvent, weight: 4 }],
  airColumns: [{ ...sourceAir, weight: 5 }],
  manualInputWeights: {
    fuel: true,
    solvents: { [sourceSolvent.id]: true },
    gases: { [sourceAir.id]: true },
  },
})
assert.equal(coldStart.fuelColumn.weight, 3)
assert.equal(coldStart.solventColumns[0].weight, 4)
assert.equal(coldStart.airColumns[0].weight, 5)
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx --yes tsx scripts/validate-oxy-settled-inputs.mjs`

Expected: FAIL because `resolveOxySolverColdStartInputs` is not exported.

### Task 2: Implement cold-start selection

**Files:**
- Modify: `frontend/src/utils/copperOxySolverInputs.ts`
- Test: `frontend/scripts/validate-oxy-settled-inputs.mjs`

- [ ] **Step 1: Add the minimal helper**

```ts
export function resolveOxySolverColdStartInputs(params: {
  fuelColumn: CopperFuelMaterial
  solventColumns: CopperMaterialColumn[]
  airColumns: CopperMaterialColumn[]
  preserveFuelInputWeight?: boolean
  manualInputWeights?: {
    fuel?: boolean
    solvents?: Record<string, boolean>
    gases?: Record<string, boolean>
  }
}) { /* clone manual columns; zero only solver-owned columns */ }
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx --yes tsx scripts/validate-oxy-settled-inputs.mjs`

Expected: PASS.

### Task 3: Use manual flags across page recovery paths

**Files:**
- Modify: `frontend/src/components/modules/copper/smelting/SmeltingBatchCalcPage.tsx`
- Modify: `frontend/src/components/modules/copper/converting/ConvertingBatchCalcPage.tsx`
- Test: `frontend/scripts/validate-oxy-settled-inputs.mjs`

- [ ] **Step 1: Replace local cold-start zeroing**

```ts
const coldInputs = resolveOxySolverColdStartInputs({
  fuelColumn: params.fuelColumn,
  solventColumns: params.solventColumns,
  airColumns: solverAirColumns,
  preserveFuelInputWeight: params.preserveFuelInputWeight,
  manualInputWeights: params.manualInputWeights,
})
```

- [ ] **Step 2: Pass flags to restored calculation and retain imported gas flags**

```ts
manualInputWeights: {
  fuel: state.manualFuelWeightValid,
  solvents: state.manualSolventWeights,
  gases: state.manualAirWeights,
}
```

```ts
manualAirWeights: candidate.manualAirWeights ?? {},
```

- [ ] **Step 3: Verify the full change**

Run: `npx tsc --noEmit -p tsconfig.json; npx --yes tsx scripts/validate-oxy-settled-inputs.mjs; npx --yes tsx scripts/validate-copper-hard-mass-balance.mjs; npm run build`

Expected: all commands exit with code 0.
