# Lead Kivcet Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fully usable, independently persisted Pb/Kivcet workflow that mirrors the current copper smelting/converting capabilities while using a dedicated Kivcet equipment model.

**Architecture:** Copy the stable copper workflow surface into a `lead` namespace, mechanically retargeting sheet ids, case storage, events, and imports while preserving copper calculation utilities/defaults for this first release. Add a pure Kivcet geometry builder and a dedicated Three.js viewer used by lead equipment pages.

**Tech Stack:** TypeScript, React 18, Vite, Three.js, Node assertion scripts, localStorage case persistence.

---

### Task 1: Add lead sheet routing and algorithm selection

**Files:**
- Modify: `frontend/src/types.ts`
- Modify: `frontend/src/components/MainContent.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`
- Test: `frontend/scripts/validate-lead-kivcet-routing.mjs`

- [ ] **Step 1: Write the failing test**

Create `frontend/scripts/validate-lead-kivcet-routing.mjs` with assertions that `SheetId` source text contains `pb_kivcet_smelting`, `pb_kivcet_smelting_equipment`, `pb_kivcet_converting`, `pb_kivcet_converting_equipment`, `pb_kivcet_summary`; that `getSelectedSmeltAlgorithm` returns `lead-kivcet` for `{smeltTypeId:'pb',sectionId:'pyro',smeltMethodId:'kivcet'}`; and that `MainContent.tsx` references `LeadKivcetWorkflow`.

- [ ] **Step 2: Run test to verify it fails**

Run: `node frontend/scripts/validate-lead-kivcet-routing.mjs`

Expected: FAIL because the new sheet ids, algorithm, and workflow import do not exist.

- [ ] **Step 3: Implement the minimal routing changes**

Add the five `pb_kivcet_*` ids to `SheetId`, add `LEAD_KIVCET_SHEETS`, return `lead-kivcet` from `getSelectedSmeltAlgorithm`, lazy-load the lead workflow in `MainContent`, and route the selected Pb Kivcet method to it. Add English labels for the new method and its five sheets in the sidebar.

- [ ] **Step 4: Run test to verify it passes**

Run: `node frontend/scripts/validate-lead-kivcet-routing.mjs`

Expected: PASS.

- [ ] **Step 5: Commit**

Run: `git add frontend/src/types.ts frontend/src/components/MainContent.tsx frontend/src/components/Sidebar.tsx frontend/scripts/validate-lead-kivcet-routing.mjs && git commit -m "feat: route lead kivcet workflow"`

### Task 2: Create the independent lead workflow namespace

**Files:**
- Create: `frontend/src/components/modules/lead/LeadKivcetWorkflow.tsx`
- Create: `frontend/src/components/modules/lead/LeadKivcetCaseWorkspace.tsx`
- Create: `frontend/src/components/modules/lead/LeadKivcetCaseSummaryPage.tsx`
- Create: `frontend/src/components/modules/lead/LeadKivcetWorkflowShell.tsx`
- Create: `frontend/src/components/modules/lead/shared/LeadKivcetOxySideBlowSession.tsx`
- Create: `frontend/src/components/modules/lead/shared/leadKivcetStageNavigation.tsx`
- Create: `frontend/src/components/modules/lead/shared/leadKivcetStageCacheStore.ts`
- Create: `frontend/src/components/modules/lead/shared/useLeadKivcetStageCache.ts`
- Create: `frontend/src/components/modules/lead/smelting/SmeltingBatchCalcPage.tsx`
- Create: `frontend/src/components/modules/lead/smelting/SmeltingEquipmentPage.tsx`
- Create: `frontend/src/components/modules/lead/converting/ConvertingBatchCalcPage.tsx`
- Create: `frontend/src/components/modules/lead/converting/ConvertingEquipmentPage.tsx`
- Test: `frontend/scripts/validate-lead-kivcet-isolation.mjs`

- [ ] **Step 1: Write the failing test**

Create a source-level regression that requires the lead session to use `pb_kivcet_` sheet ids, `metcal.lead-kivcet.cases.v1`, `metcal-lead-kivcet-case`, and `metcal:lead-kivcet-*` events, and rejects `metcal.copper.cases.v1` and `metcal:copper-*` in the lead session.

- [ ] **Step 2: Run test to verify it fails**

Run: `node frontend/scripts/validate-lead-kivcet-isolation.mjs`

Expected: FAIL because the lead namespace does not exist.

- [ ] **Step 3: Copy and retarget the copper workflow**

Copy the copper workflow page files into the lead namespace. Replace copper-only sheet ids and stage types with the five lead ids plus a lead stage navigation type; replace the case storage/file constants and case cache imports with lead names; replace rename/back-workspace event names with `metcal:lead-kivcet-rename-active-case` and `metcal:lead-kivcet-back-workspace`; keep imports of `copper*` calculation utilities and shared copper tables so default models remain identical. Keep the existing page-level computation, import/export, constraints, heat balance, BOM, and case UI behavior intact.

- [ ] **Step 4: Run test to verify it passes**

Run: `node frontend/scripts/validate-lead-kivcet-isolation.mjs`

Expected: PASS with no copper storage or event identifiers in the lead session.

- [ ] **Step 5: Run TypeScript checking**

Run: `npx --no-install tsc --noEmit -p frontend/tsconfig.json`

Expected: PASS; fix only lead namespace type/import errors before proceeding.

- [ ] **Step 6: Commit**

Run: `git add frontend/src/components/modules/lead frontend/scripts/validate-lead-kivcet-isolation.mjs && git commit -m "feat: add isolated lead kivcet workflow"`

### Task 3: Add Kivcet geometry and viewer

**Files:**
- Create: `frontend/src/utils/leadKivcetGeometry.ts`
- Create: `frontend/src/components/modules/LeadKivcetFurnaceViewer.tsx`
- Modify: `frontend/src/components/modules/lead/smelting/SmeltingEquipmentPage.tsx`
- Modify: `frontend/src/components/modules/lead/converting/ConvertingEquipmentPage.tsx`
- Test: `frontend/scripts/validate-lead-kivcet-geometry.mjs`

- [ ] **Step 1: Write the failing test**

Assert `buildLeadKivcetGeometry({bodyLengthM:10,bodyWidthM:4,bodyHeightM:6})` returns parts named `reaction-tower`, `flue-tower`, `connecting-flue`, `lance`, and `lance-water-jacket`; assert reaction tower height is greater than flue tower height, the connecting flue intersects both tower x ranges, and the water jacket surrounds the lance (`outerRadiusM > innerRadiusM`).

- [ ] **Step 2: Run test to verify it fails**

Run: `node frontend/scripts/validate-lead-kivcet-geometry.mjs`

Expected: FAIL because the geometry builder is missing.

- [ ] **Step 3: Implement the geometry builder**

Add typed rectangular/cylindrical part descriptors. Normalize non-positive input dimensions to documented defaults; place the reaction tower at negative x with height `bodyHeightM`, flue tower at positive x with height `bodyHeightM * 0.55`, connect them with a horizontal box at `0.72 * reactionHeight`, place the lance vertically through the reaction roof, and place a concentric jacket with larger outer radius and shorter length. Export `buildLeadKivcetGeometry` for both tests and viewer.

- [ ] **Step 4: Run test to verify it passes**

Run: `node frontend/scripts/validate-lead-kivcet-geometry.mjs`

Expected: PASS.

- [ ] **Step 5: Implement the viewer and wire both lead equipment pages**

Build the viewer by adapting the existing Three.js scene lifecycle, camera fit, axis helper, pointer controls, and layer toggles. Render the two box towers, connecting box, lance cylinder, and semi-transparent concentric water jacket; expose body, lance, and jacket visibility toggles. Replace only the viewer component used by lead equipment pages; preserve all sizing/BOM calculations and controls.

- [ ] **Step 6: Run TypeScript checking**

Run: `npx --no-install tsc --noEmit -p frontend/tsconfig.json`

Expected: PASS.

- [ ] **Step 7: Commit**

Run: `git add frontend/src/utils/leadKivcetGeometry.ts frontend/src/components/modules/LeadKivcetFurnaceViewer.tsx frontend/src/components/modules/lead && git commit -m "feat: add kivcet furnace geometry viewer"`

### Task 4: Verify workflow behavior and build

**Files:**
- Modify: `frontend/scripts/validate-lead-kivcet-routing.mjs` only if an assertion needs to cover the final shell
- Modify: `frontend/scripts/validate-lead-kivcet-isolation.mjs` only if an assertion needs to cover persistence restoration

- [ ] **Step 1: Run focused regressions**

Run: `node frontend/scripts/validate-lead-kivcet-routing.mjs; node frontend/scripts/validate-lead-kivcet-isolation.mjs; node frontend/scripts/validate-lead-kivcet-geometry.mjs`

Expected: all three print their passed message and exit 0.

- [ ] **Step 2: Run existing copper regressions**

Run: `npx --no-install tsx frontend/scripts/validate-copper-report-regressions.mjs; npx --no-install tsx frontend/scripts/validate-converting-mass-closure.ts`

Expected: existing copper validations pass unchanged.

- [ ] **Step 3: Build the frontend**

Run: `npm run build:frontend`

Expected: Vite build exits 0 and emits the frontend distribution.

- [ ] **Step 4: Inspect the final diff**

Run: `git diff --check; git status --short`

Expected: no whitespace errors; only lead Kivcet files, routing changes, tests, and plan/spec commits are present; pre-existing FLO edits remain untouched.

- [ ] **Step 5: Commit final verification adjustments**

Run: `git add frontend/scripts && git commit -m "test: verify lead kivcet workflow"`
