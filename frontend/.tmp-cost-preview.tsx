import React, { useMemo, useState } from 'react'
import { createRoot } from 'react-dom/client'
import ProjectCostTable from './src/components/modules/copper/cost/ProjectCostTable.tsx'
import { buildAnnualMaterialCost, resolveCostAnnualDays } from './src/utils/copperProjectCost.ts'
import { createProjectCostWorkbook, type ProjectCostWorkbookState } from './src/utils/projectCostWorkbook.ts'
import type { EquipmentBomItem } from './src/utils/copperEquipmentBom.ts'
import './src/index.css'

const initialBom: EquipmentBomItem[] = [
  { id: 'furnace', name: '熔炼炉', specification: 'Φ 4.2 × 12 m', quantity: 2, unit: '台', material: '钢结构及耐火内衬',
    note: '炉体成套供货', group: '炉体及冷却', pricingMode: 'separate', source: '选型计算' },
  { id: 'jacket', name: '炉体冷却水套', specification: '双侧水冷构件', quantity: 10, unit: '块', material: '水冷构件',
    note: '已含在炉体成套报价中', group: '炉体及冷却', pricingMode: 'included', source: '选型计算' },
  { id: 'interface', name: '烟气系统接口', specification: '预留连接口', quantity: 1, unit: '处', material: '钢',
    note: '接口预留，范围外设备另行估算', group: '烟气系统', pricingMode: 'interface', source: '配套配置' },
]

function Preview() {
  const [darkMode, setDarkMode] = useState(false)
  const [bomItems, setBomItems] = useState(initialBom)
  const [workbook, setWorkbook] = useState<ProjectCostWorkbookState>(() => ({ ...createProjectCostWorkbook(), priceOverrides: { product: '400' } }))
  const result = useMemo(() => buildAnnualMaterialCost({
    rawMaterials: [
      { id: 'ore-a', name: '精矿 A', kind: 'raw', weight: 10, waterWeight: 0, ratios: {}, unitPrice: 100 },
      { id: 'ore-b', name: '精矿 B', kind: 'raw', weight: 10, waterWeight: 0, ratios: {}, unitPrice: 200 },
    ], solventColumns: [], airColumns: [], fuelColumn: null,
    products: [{ id: 'product', name: '粗铜', hourlyMass: 10 }],
    annualDays: resolveCostAnnualDays(workbook.annualDays, 300),
    priceOverrides: workbook.priceOverrides, productName: '粗铜', productHourlyTh: 10,
  }), [workbook.annualDays, workbook.priceOverrides])
  return <main style={{ height: '100vh', overflow: 'auto', padding: 24, background: darkMode ? '#111827' : '#f1f5f9', color: darkMode ? '#f1f5f9' : '#0f172a' }}>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <h1 style={{ fontSize: 20, fontWeight: 600 }}>铜冶炼工程造价工作簿</h1>
      <button type="button" onClick={() => setDarkMode(value => !value)}
        style={{ border: '1px solid #94a3b8', borderRadius: 6, padding: '6px 12px' }}>
        {darkMode ? '切换浅色' : '切换深色'}
      </button>
    </div>
    <ProjectCostTable darkMode={darkMode} title="熔炼工序工程造价" result={result}
      annualDaysText={workbook.annualDays ?? ''} processDays={300} priceDrafts={workbook.priceOverrides ?? {}}
      onAnnualDaysChange={annualDays => setWorkbook(current => ({ ...current, annualDays }))}
      onPriceChange={(id, price) => setWorkbook(current => ({ ...current, priceOverrides: { ...current.priceOverrides, [id]: price } }))}
      onResetPrices={() => setWorkbook(current => ({ ...current, priceOverrides: { product: '400' } }))}
      workbook={workbook} onWorkbookChange={setWorkbook} bomItems={bomItems} onBomItemsChange={setBomItems}
      caseName="铜冶炼造价校核" stageLabel="熔炼" />
  </main>
}

createRoot(document.getElementById('root')!).render(<React.StrictMode><Preview /></React.StrictMode>)
