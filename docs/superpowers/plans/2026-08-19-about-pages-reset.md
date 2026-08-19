# About Pages Reset Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the three Met calculator “了解我们” pages with the reference project’s consistent company, research-center, and numbered department layouts, using mining content under the confirmed metallurgy-title fallback.

**Architecture:** Keep `MainContent` and the existing `cinf`/`research`/`metallurgy` navigation contract unchanged. Add the reference project’s shared about primitives and mining-page component, replace the existing AboutPage with the reference-aligned version, and adapt the mining branch identity from `mining` to `metallurgy`. Copy the reference public assets into the current app without introducing runtime dependencies.

**Tech Stack:** React 18, TypeScript, Vite, Tailwind CSS, Node validation script, existing Electron frontend.

---

### Task 1: Add failing page-contract validation

**Files:**
- Create: `frontend/scripts/validate-about-pages.mjs`

- [ ] **Step 1: Write the failing validation script**

The script must resolve the repository root from its own location and assert that the shared primitive, mining page, AboutPage identity branches, and required copied assets exist. It must assert the exact title strings `ABOUT / 01`, `ABOUT / 02`, `ABOUT / 03`, `科研创新中心`, and `冶炼事业部` in the source files. Exit with code 1 and an explanatory error when any assertion fails.

- [ ] **Step 2: Run it and verify the expected failure**

Run `node frontend/scripts/validate-about-pages.mjs`.

Expected result before implementation: FAIL because `AboutDesignPrimitives.tsx`, `MiningAboutPage.tsx`, `about/rdc`, and `about/2` are absent and the current page does not contain the new contract.

### Task 2: Copy shared page components and reference assets

**Files:**
- Create: `frontend/src/components/shell/AboutDesignPrimitives.tsx`
- Create: `frontend/src/components/shell/MiningAboutPage.tsx`
- Copy: `frontend/public/about/cinf/*`, `frontend/public/about/rdc/*`, `frontend/public/about/2/*`

- [ ] **Step 1: Copy the reference shared primitives and department component**

Copy the corresponding files from `D:\软件\CINF_RockMass_Calculator\frontend\src\components\shell\`. Preserve the existing `BackIconButton` import and the reference component props. Because this app does not depend on `lucide-react`, replace only the icon imports/usages in `MiningAboutPage.tsx` with accessible text/CSS equivalents while preserving labels and interactions.

- [ ] **Step 2: Copy the reference about assets**

Copy the reference `about/cinf`, `about/rdc`, and `about/2` directories into `frontend/public/about/`. Keep existing identical `cinf` image files unchanged when hashes match.

- [ ] **Step 3: Run the contract validation**

Run `node frontend/scripts/validate-about-pages.mjs`.

Expected result: the asset and component checks pass; identity-branch checks may still fail until AboutPage is replaced in Task 3.

### Task 3: Replace AboutPage and map the fallback department

**Files:**
- Modify: `frontend/src/components/shell/AboutPage.tsx`

- [ ] **Step 1: Replace the company and research branches with the reference implementation**

Use the reference `AboutPage.tsx` as the base so company and research pages use `AboutPageHero`, `AboutSectionHeading`, `ABOUT / 01`, and `ABOUT / 02`, including the existing lightbox behavior and current app title props.

- [ ] **Step 2: Map the department branch to `metallurgy`**

Change the reference branch guard from `aboutDepartment === 'mining'` to `aboutDepartment === 'metallurgy'`. Change the `MiningAboutPage` props passed from that branch so the page uses the current application title/subtitle while the component renders the identity text `长沙有色院 · 冶炼事业部` and `冶炼事业部`. Do not add a `mining` route and do not change `Sidebar.tsx`.

- [ ] **Step 3: Preserve current Met-specific imports and compile compatibility**

Keep `appTitleForLang`, `appSubtitleForLang`, `BackIconButton`, and the existing KaTeX imports only where the copied page still uses them. Remove unused legacy-only state/helpers after the replacement so TypeScript does not report unused or unresolved symbols.

- [ ] **Step 4: Run the contract validation and typecheck**

Run `node frontend/scripts/validate-about-pages.mjs` and `npx tsc --noEmit -p frontend/tsconfig.json`.

Expected result: both commands exit 0 and report the three identity titles plus required assets.

### Task 4: Build and visually verify the three pages

**Files:**
- Modify only files required by build fixes from Tasks 2-3.

- [ ] **Step 1: Build the frontend**

Run `npm run build --prefix frontend`.

Expected result: Vite exits 0 and emits the frontend bundle.

- [ ] **Step 2: Start the existing frontend dev server**

Run `npm run dev:web --prefix frontend -- --host 127.0.0.1` in a persistent terminal if available; otherwise use the existing project dev command with an unused port.

- [ ] **Step 3: Check each page in the browser**

Open the app and select the three sidebar entries. Confirm the visible headings are:

```text
ABOUT / 01   有色金属全产业链技术与服务提供商
ABOUT / 02   科研创新中心
ABOUT / 03   冶炼事业部
```

Confirm research images load, department images load, dark mode does not obscure text, and the back button returns to the home/module view.

- [ ] **Step 4: Record final verification**

Run `git diff --check`, `node frontend/scripts/validate-about-pages.mjs`, `npx tsc --noEmit -p frontend/tsconfig.json`, and `npm run build --prefix frontend` after the final edits. Report each exit status and preserve unrelated existing worktree changes.

