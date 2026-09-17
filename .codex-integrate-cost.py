from pathlib import Path

root = Path('frontend/src/components/modules/copper')
files = [root/'shared/CopperOxySideBlowSession.tsx', root/'converting/ConvertingEquipmentPage.tsx', root/'smelting/SmeltingBatchCalcPage.tsx', root/'converting/ConvertingBatchCalcPage.tsx']

def replace_once(text, before, after, path):
    assert text.count(before) == 1, (str(path), before[:100], text.count(before))
    return text.replace(before, after, 1)

for path in files:
    text = path.read_text(encoding='utf-8')
    if '  projectCostWorkbooks?: Record<string, ProjectCostWorkbookState>' in text:
        continue
    is_equipment = path.name != 'SmeltingBatchCalcPage.tsx' and path.name != 'ConvertingBatchCalcPage.tsx'
    imports = "import { normalizeProjectCostWorkbooks, type ProjectCostWorkbookState" + (", createProjectCostWorkbook" if is_equipment else "") + " } from '../../../../utils/projectCostWorkbook.ts'\nimport { normalizeEquipmentBomSnapshots } from '../../../../utils/copperEquipmentBom.ts'\n"
    text = imports + text
    anchor = '  equipmentBomGenerated?: Record<EquipmentStageId, boolean>\n'
    text = replace_once(text, anchor, anchor + '  equipmentBomSnapshots?: Record<string, EquipmentBomItem[]>\n  projectCostWorkbooks?: Record<string, ProjectCostWorkbookState>\n', path)
    prefix = 'converting' if path.name == 'ConvertingEquipmentPage.tsx' else 'smelting'
    setter = 'Converting' if prefix == 'converting' else 'Smelting'
    anchor = f"  const [{prefix}DailyFeedTd, set{setter}DailyFeedTd] = useState(initialActiveCaseRecord?.{prefix}DailyFeedTd ?? '')"
    addition = "  const [equipmentBomSnapshots, setEquipmentBomSnapshots] = useState(() => normalizeEquipmentBomSnapshots(initialActiveCaseRecord?.equipmentBomSnapshots))\n  const [projectCostWorkbooks, setProjectCostWorkbooks] = useState(() => normalizeProjectCostWorkbooks(initialActiveCaseRecord?.projectCostWorkbooks))\n"
    text = replace_once(text, anchor, addition + anchor, path)
    anchor = "    setEquipmentBomGenerated(record.equipmentBomGenerated ?? { smelting: false, converting: false, refining: false })"
    text = replace_once(text, anchor, anchor + '\n    setEquipmentBomSnapshots(normalizeEquipmentBomSnapshots(record.equipmentBomSnapshots))\n    setProjectCostWorkbooks(normalizeProjectCostWorkbooks(record.projectCostWorkbooks))', path)
    anchor = '      equipmentBomGenerated: { ...equipmentBomGenerated },'
    text = replace_once(text, anchor, anchor + '\n      equipmentBomSnapshots,\n      projectCostWorkbooks,', path)
    anchor = '      equipmentBomGenerated: { smelting: false, converting: false, refining: false },'
    text = replace_once(text, anchor, anchor + '\n      equipmentBomSnapshots: {},\n      projectCostWorkbooks: {},', path)
    anchor = '    equipmentBomGenerated: candidate.equipmentBomGenerated ?? { smelting: false, converting: false, refining: false },'
    text = replace_once(text, anchor, anchor + '\n    equipmentBomSnapshots: normalizeEquipmentBomSnapshots(candidate.equipmentBomSnapshots),\n    projectCostWorkbooks: normalizeProjectCostWorkbooks(candidate.projectCostWorkbooks),', path)
    if is_equipment:
        text = replace_once(text, '  const activeEquipmentBomItems = activeEquipmentRow', '  const calculatedEquipmentBomItems = activeEquipmentRow', path)
        anchor = '  const activeEquipmentBomReady = activeEquipmentBomGenerated && activeEquipmentBomItems.length > 0'
        text = replace_once(text, anchor, "  const activeEquipmentBomItems = (activeEquipmentStageId && activeEquipmentBomGenerated\n    ? equipmentBomSnapshots[activeEquipmentStageId] : undefined) ?? calculatedEquipmentBomItems\n" + anchor, path)
        anchor = '  const annualMaterialCost = useMemo('
        addition = "  const costStageKey = activeEquipmentStageId ?? 'smelting'\n  const activeCostWorkbook = useMemo(() => projectCostWorkbooks[costStageKey] ?? {\n    ...createProjectCostWorkbook(), priceOverrides: { ...materialPriceOverrides }, annualDays: costAnnualDays,\n  }, [projectCostWorkbooks, costStageKey, materialPriceOverrides, costAnnualDays])\n  const costPriceDrafts = activeCostWorkbook.priceOverrides ?? materialPriceOverrides\n  const activeCostAnnualDays = activeCostWorkbook.annualDays ?? costAnnualDays\n  const updateCostWorkbook = (next: ProjectCostWorkbookState) =>\n    setProjectCostWorkbooks((prev) => ({ ...prev, [costStageKey]: next }))\n"
        text = replace_once(text, anchor, addition + anchor, path)
        start = text.index(anchor)
        end = text.index('\n  useEffect(', start)
        chunk = text[start:end].replace('costAnnualDays', 'activeCostAnnualDays').replace('materialPriceOverrides', 'costPriceDrafts')
        text = text[:start] + chunk + text[end:]
        start = text.index('            <ProjectCostTable\n')
        end = text.index('            />', start) + len('            />')
        chunk = text[start:end]
        chunk = chunk.replace('annualDaysText={costAnnualDays}', 'annualDaysText={activeCostAnnualDays}').replace('priceDrafts={materialPriceOverrides}', 'priceDrafts={costPriceDrafts}')
        chunk = chunk.replace('onAnnualDaysChange={setCostAnnualDays}', 'onAnnualDaysChange={(value) => updateCostWorkbook({ ...activeCostWorkbook, annualDays: value })}')
        chunk = chunk.replace('setMaterialPriceOverrides((prev) => ({ ...prev, [rowId]: value }))', 'updateCostWorkbook({ ...activeCostWorkbook, priceOverrides: { ...costPriceDrafts, [rowId]: value } })')
        chunk = chunk.replace('onResetPrices={() => setMaterialPriceOverrides({})}', "onResetPrices={() => updateCostWorkbook({ ...activeCostWorkbook, priceOverrides: {} })}\n              workbook={activeCostWorkbook}\n              onWorkbookChange={updateCostWorkbook}\n              bomItems={activeEquipmentBomItems}\n              onBomItemsChange={(items) => setEquipmentBomSnapshots((prev) => ({ ...prev, [costStageKey]: items }))}\n              caseName={activeCase?.name ?? '未命名案例'}\n              stageLabel={activeEquipmentRow?.stage ?? '当前工序'}")
        text = text[:start] + chunk + text[end:]
    anchor = '    setEquipmentBomGenerated((prev) => ({ ...prev, [activeEquipmentStageId]: true }))'
    if anchor in text:
        data = 'calculatedEquipmentBomItems' if is_equipment else 'activeEquipmentBomItems'
        text = replace_once(text, anchor, f'    setEquipmentBomSnapshots((prev) => ({{ ...prev, [activeEquipmentStageId]: {data}.map((item) => ({{ ...item }})) }}))\n' + anchor, path)
    anchor = '          const bomItems =\n            equipmentRow != null\n'
    if anchor in text:
        text = replace_once(text, anchor, '          const bomItems = equipmentBomSnapshots[section.id] ?? (\n            equipmentRow != null\n', path)
        start = text.index('          const bomItems = equipmentBomSnapshots[section.id]')
        end = text.index('          const bomReady', start)
        chunk = text[start:end].replace('              : []\n', '              : [])\n')
        text = text[:start]+chunk+text[end:]
    path.write_text(text, encoding='utf-8')

path = Path('frontend/src/utils/copperProcessStageState.ts')
text = path.read_text(encoding='utf-8')
text = "import type { ProjectCostWorkbookState } from './projectCostWorkbook.ts'\nimport type { EquipmentBomItem } from './copperEquipmentBom.ts'\n" + text
anchor = '  equipmentBomGenerated?: Record<string, boolean>\n'
text = replace_once(text, anchor, anchor + '  equipmentBomSnapshots?: Record<string, EquipmentBomItem[]>\n  projectCostWorkbooks?: Record<string, ProjectCostWorkbookState>\n', path)
path.write_text(text, encoding='utf-8')
