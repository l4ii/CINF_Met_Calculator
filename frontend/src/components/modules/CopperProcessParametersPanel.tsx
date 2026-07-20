import { btnPrimary, inputBase } from '../../theme/uiTheme'
import type { CopperProcessParameters } from '../../utils/copperProcessParameters.ts'
import { validateProcessParameters } from '../../utils/copperProcessParameters.ts'

function isValidNumberText(value: string) {
  const trimmed = value.trim().replace(',', '.')
  return trimmed !== '' && Number.isFinite(Number(trimmed))
}

function isEditableNumberDraft(value: string) {
  return value === '' || /^-?\d*\.?\d*$/.test(value.trim().replace(',', '.'))
}

export type CopperProcessParameterDrafts = {
  matteCopperGrade: string
  slagCopperWPercent: string
  feSiO2: string
  oxygenEnrichmentPct: string
  fuelConcentrateRatio: string
}

export function processParametersToDrafts(params: CopperProcessParameters): CopperProcessParameterDrafts {
  return {
    matteCopperGrade: String(params.matteCopperGrade),
    slagCopperWPercent: String(params.slagCopperWPercent),
    feSiO2: String(params.feSiO2),
    oxygenEnrichmentPct: String(params.oxygenEnrichmentPct),
    fuelConcentrateRatio: String(params.fuelConcentrateRatio),
  }
}

export function parseProcessParameterDrafts(drafts: CopperProcessParameterDrafts): CopperProcessParameters | null {
  const fields = [
    drafts.matteCopperGrade,
    drafts.slagCopperWPercent,
    drafts.feSiO2,
    drafts.oxygenEnrichmentPct,
    drafts.fuelConcentrateRatio,
  ]
  if (!fields.every(isValidNumberText)) return null
  return {
    matteCopperGrade: Number(drafts.matteCopperGrade.replace(',', '.')),
    slagCopperWPercent: Number(drafts.slagCopperWPercent.replace(',', '.')),
    feSiO2: Number(drafts.feSiO2.replace(',', '.')),
    oxygenEnrichmentPct: Number(drafts.oxygenEnrichmentPct.replace(',', '.')),
    fuelConcentrateRatio: Number(drafts.fuelConcentrateRatio.replace(',', '.')),
  }
}

type CopperProcessParametersPanelProps = {
  darkMode: boolean
  drafts: CopperProcessParameterDrafts
  onDraftChange: (field: keyof CopperProcessParameterDrafts, value: string) => void
  onCommit: (params: CopperProcessParameters) => void
  onNext?: () => void
  nextDisabled?: boolean
  showNext?: boolean
  compact?: boolean
}

const FIELD_DEFS: Array<{
  key: keyof CopperProcessParameterDrafts
  label: string
  hint: string
}> = [
  { key: 'matteCopperGrade', label: '冰铜品位 (%)', hint: 'GMC：联动白铜锍 Cu W% 与约束 #11/#12（锍 S/Fe 经验式）' },
  { key: 'slagCopperWPercent', label: '渣含铜 W%', hint: '→ 熔炼渣 Cu(铜) W%' },
  { key: 'feSiO2', label: '铁硅比 Fe/SiO₂', hint: '→ 自定义约束 #6（熔炼渣 Fe/SiO₂）' },
  { key: 'oxygenEnrichmentPct', label: '富氧浓度 (%)', hint: '→ 自定义约束 #4（混合气 O₂ 体积分数）' },
  {
    key: 'fuelConcentrateRatio',
    label: '煤率（煤/精矿比）',
    hint: '→ 自定义约束 #1；热平衡闭合后随煤量反算更新',
  },
]

export function CopperProcessParametersPanel({
  darkMode,
  drafts,
  onDraftChange,
  onCommit,
  onNext,
  nextDisabled = false,
  showNext = true,
  compact = false,
}: CopperProcessParametersPanelProps) {
  const border = darkMode ? 'border-gray-600' : 'border-gray-200'

  const commitDrafts = () => {
    const parsed = parseProcessParameterDrafts(drafts)
    if (!parsed) return
    const error = validateProcessParameters(parsed)
    if (error) return
    onCommit(parsed)
  }

  const handleFieldBlur = () => {
    commitDrafts()
  }

  const parsed = parseProcessParameterDrafts(drafts)
  const validationError = parsed ? validateProcessParameters(parsed) : '请填写有效的参数数值'

  return (
    <div className={`rounded-lg border ${border} ${compact ? 'p-3' : 'p-4'} space-y-4`}>
      <h4 className={`text-sm font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>关键参数输入</h4>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELD_DEFS.map((field) => (
          <div key={field.key}>
            <label className={`mb-1 block text-xs font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {field.label}
            </label>
            <input
              className={`${inputBase(darkMode)} w-full`}
              value={drafts[field.key]}
              onChange={(event) => {
                if (!isEditableNumberDraft(event.target.value)) return
                onDraftChange(field.key, event.target.value)
              }}
              onBlur={handleFieldBlur}
            />
            <div className={`mt-1 text-xs ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>{field.hint}</div>
          </div>
        ))}
      </div>

      {validationError && parsed === null && (
        <div className={`text-xs ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>{validationError}</div>
      )}

      {showNext && onNext && (
        <div className="flex justify-end pt-1">
          <button
            type="button"
            className={btnPrimary(darkMode)}
            disabled={nextDisabled || !parsed || Boolean(validationError)}
            onClick={() => {
              commitDrafts()
              if (!parsed || validationError) return
              onNext()
            }}
          >
            下一步
          </button>
        </div>
      )}
    </div>
  )
}
