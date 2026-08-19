# Heat Balance Fugitive Display Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep declared output products, including `无组织排放`, visible in software heat-balance tables even when their mass and heat are both zero.

**Architecture:** The calculation layer already carries zero-mass output phase rows. A shared display predicate will make the UI retain every output-side row while preserving the existing zero-row suppression for input-side tables. Both copper and antimony heat-balance components will use the same predicate, and a focused validation script will cover the rule.

**Tech Stack:** TypeScript, React, Vite, Node validation scripts.

---

### Task 1: Add the failing display-rule regression check

**Files:**
- Create: `frontend/scripts/validate-heat-balance-display.mjs`

- [ ] **Step 1: Write the failing test**

```js
import assert from 'node:assert/strict'
import { shouldDisplayHeatComponentRow } from '../src/utils/heatBalanceDisplay.ts'

assert.equal(
  shouldDisplayHeatComponentRow({ massTh: 0, heatMJh: 0 }, 'output'),
  true,
  'zero-mass output products must remain visible'
)
assert.equal(
  shouldDisplayHeatComponentRow({ massTh: 0, heatMJh: 0 }, 'input'),
  false,
  'empty input rows remain suppressed'
)
console.log('heat-balance display validation passed')
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node frontend/scripts/validate-heat-balance-display.mjs`

Expected: FAIL because `frontend/src/utils/heatBalanceDisplay.ts` does not exist yet.

### Task 2: Implement the shared output-row display rule

**Files:**
- Create: `frontend/src/utils/heatBalanceDisplay.ts`
- Modify: `frontend/src/components/modules/CopperHeatBalancePlaceholderTables.tsx`
- Modify: `frontend/src/components/modules/antimony/shared/AntimonyHeatBalancePlaceholderTables.tsx`

- [ ] **Step 1: Implement the smallest passing helper**

```ts
export type HeatComponentDisplaySide = 'input' | 'output'

export function shouldDisplayHeatComponentRow(
  row: { massTh: number; heatMJh: number },
  side: HeatComponentDisplaySide,
  epsilon = 1e-9
) {
  return side === 'output' || row.massTh > 0 || Math.abs(row.heatMJh) > epsilon
}
```

- [ ] **Step 2: Use the helper in both heat matrix builders**

Replace each zero-row guard with:

```ts
if (!shouldDisplayHeatComponentRow(row, side, COMPONENT_HEAT_EPSILON)) return
```

This applies to both `buildComponentHeatMatrixGroups` and `buildHeatEnthalpyMatrixGroups` in copper and antimony components.

- [ ] **Step 3: Run the focused validation**

Run: `node frontend/scripts/validate-heat-balance-display.mjs`

Expected: PASS.

### Task 3: Verify the complete application path

**Files:**
- Test: `frontend/scripts/validate-reference-batch-workbook.mjs`

- [ ] **Step 1: Run the existing export and heat-balance regression suite**

Run: `node frontend/scripts/validate-reference-batch-workbook.mjs outputs/reference-batch-heat-ui-final-check`

Expected: PASS, including zero-valued `无组织排放` output rows in generated heat-balance exports.

- [ ] **Step 2: Run TypeScript validation**

Run: `npx --prefix frontend tsc --noEmit --pretty false`

Expected: exit code 0.

- [ ] **Step 3: Build the frontend**

Run: `npm --prefix frontend run build`

Expected: successful Vite build.

- [ ] **Step 4: Check the edited files for whitespace errors**

Run: `git diff --check -- frontend/src/utils/heatBalanceDisplay.ts frontend/src/components/modules/CopperHeatBalancePlaceholderTables.tsx frontend/src/components/modules/antimony/shared/AntimonyHeatBalancePlaceholderTables.tsx frontend/scripts/validate-heat-balance-display.mjs`

Expected: no output.
