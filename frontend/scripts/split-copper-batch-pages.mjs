/**
 * Split CopperOxySideBlowSession into process-locked batch pages.
 * Run: node scripts/split-copper-batch-pages.mjs
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sessionPath = join(
  root,
  'src/components/modules/copper/shared/CopperOxySideBlowSession.tsx'
)
const src = readFileSync(sessionPath, 'utf8')

function renameComponent(text, fromName, toName, propsFrom, propsTo) {
  let out = text
  out = out.replace(
    new RegExp(`export default function ${fromName}\\(`),
    `export default function ${toName}(`
  )
  out = out.replace(new RegExp(`export type ${propsFrom}`), `export type ${propsTo}`)
  out = out.replace(new RegExp(propsFrom, 'g'), propsTo)
  return out
}

function injectProcessLock(text, stageId) {
  const needle = '  const isEn = language === '
  const idx = text.indexOf(needle)
  if (idx < 0) throw new Error('isEn marker not found')
  const lineEnd = text.indexOf('\n', idx)
  const inject = `\n  /** 本页锁定工序，禁止与另一工序 UI/约束混用 */\n  const pageLockedProcessStageId = '${stageId}' as CopperProcessStageId\n`
  return text.slice(0, lineEnd + 1) + inject + text.slice(lineEnd + 1)
}

function overrideActiveProcessStageId(text) {
  const re = /const activeProcessStageId = [^\n]+/
  if (!re.test(text)) throw new Error('activeProcessStageId declaration not found')
  return text.replace(re, 'const activeProcessStageId = pageLockedProcessStageId')
}

function injectMountHydrate(text, stageId) {
  const marker = '  const switchProcessStageState = useCallback('
  const idx = text.indexOf(marker)
  if (idx < 0) throw new Error('switchProcessStageState marker not found')
  // Skip if Session already has a hydrate block immediately before switch — insert our page-specific one after Session's equipment hydrate if present.
  const hydrate = `
  useEffect(() => {
    let cancelled = false
    const run = async () => {
      let nextState =
        processStagesCacheRef.current['${stageId}'] ?? createProcessStageStateForId('${stageId}')
      if ('${stageId}' === 'cu_converting') {
        nextState = syncWhiteMatteFromSmelting(
          cloneProcessStageState(nextState),
          processStagesCacheRef.current.cu_smelting
        )
        processStagesCacheRef.current = {
          ...processStagesCacheRef.current,
          cu_converting: nextState,
        }
      }
      if (cancelled) return
      await applyProcessStageStateToUi(nextState, '${stageId}')
      if (cancelled) return
      loadedProcessStageIdRef.current = '${stageId}'
    }
    void run()
    return () => {
      cancelled = true
    }
    // 仅挂载灌库；落盘由切页 confirmSaveBeforeCaseNavigation / 保存案例负责
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

`
  return text.slice(0, idx) + hydrate + text.slice(idx)
}

function fixImportPaths(text, kind) {
  let out = text
  out = out.replaceAll(
    "from './copperStageNavigation.tsx'",
    "from '../shared/copperStageNavigation.tsx'"
  )
  out = out.replaceAll(
    "from './copperStageCacheStore.ts'",
    "from '../shared/copperStageCacheStore.ts'"
  )
  out = out.replace(/\r?\n  normalizeProcessStageId,/g, '')
  if (kind === 'converting') {
    out = out.replaceAll(
      "from '../converting/convertingHeatBalanceMaterials.ts'",
      "from './convertingHeatBalanceMaterials.ts'"
    )
    out = out.replaceAll(
      "from '../converting/convertingProductConstraints.ts'",
      "from './convertingProductConstraints.ts'"
    )
  } else {
    out = out.replaceAll(
      "from '../smelting/smeltingHeatBalanceMaterials.ts'",
      "from './smeltingHeatBalanceMaterials.ts'"
    )
  }
  return out
}

function buildPage(kind) {
  const stageId = kind === 'converting' ? 'cu_converting' : 'cu_smelting'
  const name = kind === 'converting' ? 'ConvertingBatchCalcPage' : 'SmeltingBatchCalcPage'
  const props = kind === 'converting' ? 'ConvertingBatchCalcPageProps' : 'SmeltingBatchCalcPageProps'
  let out = src
  out = renameComponent(out, 'CopperOxySideBlowSession', name, 'CopperOxySideBlowSessionProps', props)
  out = injectProcessLock(out, stageId)
  out = overrideActiveProcessStageId(out)
  out = fixImportPaths(out, kind)
  const banner =
    kind === 'converting'
      ? `/**\n * 铜-火法-富氧侧吹-吹炼-配料计算（独立页面）。\n * 产物物相 / 热平衡只走吹炼配置；挂载时从 cache 恢复吹炼快照。\n */\n`
      : `/**\n * 铜-火法-富氧侧吹-熔炼-配料计算（独立页面）。\n * 保留精矿混料 / 物相辅助 / 燃料煤；挂载时从 cache 恢复熔炼快照。\n */\n`
  return banner + out
}

const convertingDir = join(root, 'src/components/modules/copper/converting')
const smeltingDir = join(root, 'src/components/modules/copper/smelting')
mkdirSync(convertingDir, { recursive: true })
mkdirSync(smeltingDir, { recursive: true })

writeFileSync(join(convertingDir, 'ConvertingBatchCalcPage.tsx'), buildPage('converting'))
writeFileSync(join(smeltingDir, 'SmeltingBatchCalcPage.tsx'), buildPage('smelting'))
console.log('regenerated converting + smelting batch pages')
