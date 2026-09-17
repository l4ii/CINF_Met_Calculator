# Parametric model grouping and component manifest Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add stable grouped component manifests and parameter patching for the smelting and Kivcet model viewers, while keeping engineering overview read-only and synchronized.

**Architecture:** Geometry utilities produce model-specific component descriptors with stable IDs, semantic groups, categories, source fields, and resolved parameters. Viewers consume descriptors to build Three.js groups and expose controlled visibility/parameter callbacks; existing process calculations remain the source of truth.

**Tech Stack:** React, TypeScript, Three.js, existing Vite build.

**Spec:** Approved design in conversation on 2026-09-15.

## Global Constraints

- Cover the two main models only: side-blown smelting furnace and Kivcet furnace.
- Engineering overview displays final parameterized results but does not edit them.
- Preserve existing calculation inputs and localStorage case behavior.
- Use stable component IDs suitable for later manual engineering handoff.

---

### Task 1: Shared manifest types and smelting manifest

**Files:**
- Create: `frontend/src/utils/modelComponentManifest.ts`
- Modify: `frontend/src/utils/copperFurnaceGeometry.ts`
- Test: `frontend/scripts/validate-model-component-manifest.mjs`

- [x] Define manifest types and group/category constants.
- [x] Add `buildSmeltingFurnaceComponentManifest(layout)` with stable IDs and resolved parameters.
- [x] Add assertions for counts, IDs, groups, and source metadata.

### Task 2: Kivcet manifest

**Files:**
- Modify: `frontend/src/utils/leadKivcetGeometry.ts`
- Modify: `frontend/scripts/validate-model-component-manifest.mjs`

- [x] Add `buildLeadKivcetComponentManifest(geometry)` covering towers, connector, lance, and jacket.
- [x] Assert stable IDs and parameter units.

### Task 3: Smelting viewer grouped controls

**Files:**
- Modify: `frontend/src/components/modules/SmeltingFurnaceViewer.tsx`

- [x] Build semantic groups from manifest categories while preserving current geometry and screenshot handle.
- [x] Add grouped visibility controls and optional parameter patch callback.
- [x] Keep existing upstream design values as defaults and never write viewer patches into process calculation state automatically.

### Task 4: Kivcet viewer grouped controls

**Files:**
- Modify: `frontend/src/components/modules/LeadKivcetFurnaceViewer.tsx`

- [x] Consume Kivcet manifest IDs/categories for group visibility.
- [x] Add controlled parameter override support for body dimensions and component visibility.
- [x] Use semantic component groups and preserve the screenshot handle.

### Task 5: Engineering overview manifest display and verification

**Files:**
- Modify: `frontend/src/components/modules/ProcessLine3DViewer.tsx` or its active overview panel if needed.
- Modify: relevant copper/lead overview panel only if the manifest is not already surfaced.
- Test: `frontend/scripts/validate-model-component-manifest.mjs`

- [x] Expose read-only grouped manifest summary for engineering overview consumers.
- [x] Run focused manifest validation and frontend build.

---

## Final user refinements and verification (2026-09-15)

- Both main models use the shared left sidebar for geometry, component selection/movement, group visibility and export. No component manifest overlays the canvas.
- Sidebar controls and notes use 14 px text, section headings use 15–16 px. Related selection reference cards and factory cost units were enlarged; cost units use upright UI typography.
- View mode is a joined left/right choice: boundary wireframe / opaque solid. EdgesGeometry removes triangulation diagonals; solids have flat furnace faces and subtle boundaries.
- Sectioning has its own section with horizontal Y, vertical longitudinal Z, and vertical transverse X directions, absolute coordinate input in metres, a position slider, and a retained-side selector.
- Sectioning currently clips the modeled exterior surfaces without capping. It does not invent refractory, bath or internal process geometry.
- Edits persist by model and case; converting uses a separate stage suffix. Mounted engineering overviews subscribe to the same scoped result and expose no geometry edit controls.
- Storage failures display a message and restore the saved geometry. Current Three.js TransformControls helper cleanup avoids its broken dispose implementation.
- The original sizing figures below the model are explicitly labeled as selection calculation references; current geometric values are in the component parameters.

Validation: manifest and override scripts passed; boundary-edge/opaque-solid/absolute-section/resource cleanup checks passed; focused strict TypeScript checking passed. Browser verification with the actual components covered light/dark layouts, both main models, solid/wireframe, custom clipping position and side reversal, component arrow dragging, read-only overview synchronization, and computed cost unit font size/family. No browser console errors were observed during these checks. Temporary UI verification files were removed.
## Navigation, ranges and undo follow-up

- Restored an interactive bottom-left XYZ orientation indicator synchronized to the camera; retained the Fit Model button and added a workspace-scoped F shortcut.
- Reserved the sidebar scrollbar gutter permanently and kept disabled section controls in place, so enabling clipping does not resize/reflow earlier controls.
- Section ranges now distinguish nominal body dimensions from whole-assembly bounds, show both endpoints and total span, and use normalized slider steps that reach both endpoints exactly. Side-blown Y uses the furnace bottom; Kivcet Y uses its component centroid.
- A 34.5 m by 2.2 m nominal body has X [-17.25, 17.25], Z [-1.1, 1.1]; the example assembly with foundation is 36.3 m by 4 m.
- Shared atomic model history supports up to 50 undo steps, redo, parameter edits, complete drags and resets. Buttons and Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y operate only in the focused model workspace, preserving native input editing. History restarts on scope change/reopening and cannot cross cases.
- Added a local function directory and recent operation labels. Read-only overviews receive the saved undo/redo result without editing geometry.
- Verified focused strict types, production build, existing geometry/display/override checks and the new navigation/history regression script. Browser checks covered fixed layout measurements, clipping ranges/endpoints, axis clicks, F, dragging and one-step undo, redo/reset reversal, overview synchronization, case isolation and Kivcet in dark mode. No browser console errors. Temporary verification files removed.

### Follow-up: compact model panels and workflow typography (2026-09-15)

- Removed outer card frames and viewer padding from all nine furnace panels; retained direct sidebar/viewport workbench. Raised scheme title to 18px.
- Scoped a 14px minimum for existing small text utilities across central copper, antimony and lead workflows, including material menu portals and MetCal import dialog. Small semantic section headings use 16px; formula scripts retain their sizing.
- Increased Pareto chart labels to 14px, expanded label margins, and retained readable chart width with horizontal scrolling.
- Validation: production build passed (existing chunk size advisory only); diff whitespace check passed. Browser checked actual copper batch table and material menu (14px), and extracted real furnace panel with actual viewer in light/dark themes (18px title, outer padding/border both 0, no console errors). Other workflow layouts covered through shared typography scope and all panel source/build checks, not exhaustive end-to-end calculation runs. Temporary browser fixture removed.


### Follow-up: integrated vector axis navigation (2026-09-15)

- Removed sidebar jump menu and duplicated top-right camera controls from the shared viewport.
- Drew SVG RGB arrow axes linked to camera orientation; projected axes retain labels when looking directly along an axis. Click axes to snap; click origin to fit. Preserved F shortcut, added keyboard activation and focus feedback.
- Browser verified X/Y/Z views, origin fit, and camera rotation with live SVG orientation updates. Targeted TypeScript check passed; production build passed. Temporary fixture removed.
