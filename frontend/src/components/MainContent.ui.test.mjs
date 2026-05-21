import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

const mainContent = await readFile(new URL('./MainContent.tsx', import.meta.url), 'utf8')

assert(mainContent.includes('copperCaseTitleDraft'), 'main title should track the active copper case name')
assert(mainContent.includes('aria-label="案例名"'), 'active copper case title should be editable in the main page header')
assert(mainContent.includes('onActiveCaseNameChange'), 'CopperWorkflow should publish the active case name to the main header')
assert(mainContent.includes('caseTitleDraft={copperCaseTitleDraft}'), 'main header edits should flow back into CopperWorkflow')

console.log('MainContent UI checks passed')
