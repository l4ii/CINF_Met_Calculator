import { btnPrimary, inputBase } from '../../../../theme/uiTheme'
import {
  DEFAULT_ANTIMONY_PROCESS_PARAMETERS,
  validateProcessParameters,
  type AntimonyProcessParameters,
} from '../../../../utils/antimonyProcessParameters.ts'

function isValidNumberText(value: string) {
  const trimmed = value.trim().replace(',', '.')
  return trimmed !== '' && Number.isFinite(Number(trimmed))
}

function isEditableNumberDraft(value: string) {
  return value === '' || /^-?\d*\.?\d*$/.test(value.trim().replace(',', '.'))
}

export type AntimonyProcessParameterDrafts = {
  matteAntimonyGrade: string
  slagAntimonyWPercent: string
  feSiO2: string
  caOSiO2: string
  oxygenEnrichmentPct: string
  fuelConcentrateRatio: string
}

export function processParametersToDrafts(params: AntimonyProcessParameters): AntimonyProcessParameterDrafts {
  return {
    matteAntimonyGrade: String(params.matteAntimonyGrade),
    slagAntimonyWPercent: String(params.slagAntimonyWPercent),
    feSiO2: String(params.feSiO2),
    caOSiO2: String(params.caOSiO2 ?? DEFAULT_ANTIMONY_PROCESS_PARAMETERS.caOSiO2),
    oxygenEnrichmentPct: String(params.oxygenEnrichmentPct),
    fuelConcentrateRatio: String(params.fuelConcentrateRatio),
  }
}

export function parseProcessParameterDrafts(drafts: AntimonyProcessParameterDrafts): AntimonyProcessParameters | null {
  const fields = [
    drafts.matteAntimonyGrade,
    drafts.slagAntimonyWPercent,
    drafts.feSiO2,
    drafts.caOSiO2,
    drafts.oxygenEnrichmentPct,
    drafts.fuelConcentrateRatio,
  ]
  if (!fields.every(isValidNumberText)) return null
  return {
    matteAntimonyGrade: Number(drafts.matteAntimonyGrade.replace(',', '.')),
    slagAntimonyWPercent: Number(drafts.slagAntimonyWPercent.replace(',', '.')),
    feSiO2: Number(drafts.feSiO2.replace(',', '.')),
    caOSiO2: Number(drafts.caOSiO2.replace(',', '.')),
    oxygenEnrichmentPct: Number(drafts.oxygenEnrichmentPct.replace(',', '.')),
    fuelConcentrateRatio: Number(drafts.fuelConcentrateRatio.replace(',', '.')),
  }
}

type AntimonyProcessParametersPanelProps = {
  darkMode: boolean
  drafts: AntimonyProcessParameterDrafts
  onDraftChange: (field: keyof AntimonyProcessParameterDrafts, value: string) => void
  onCommit: (params: AntimonyProcessParameters) => void
  onNext?: () => void
  nextDisabled?: boolean
  showNext?: boolean
  compact?: boolean
}

const FIELD_DEFS: Array<{
  key: keyof AntimonyProcessParameterDrafts
  label: string
  hint: string
}> = [
  { key: 'matteAntimonyGrade', label: '锑锍含锑 (%)', hint: '用于约束锑锍 Sb W%' },
  { key: 'slagAntimonyWPercent', label: '渣含锑 W%', hint: '用于约束熔炼渣 Sb W%' },
  { key: 'feSiO2', label: '铁硅比 Fe/SiO₂', hint: '用于反求铁矿石投料量' },
  { key: 'caOSiO2', label: '钙硅比 CaO/SiO₂', hint: '用于反求石灰投料量' },
  { key: 'oxygenEnrichmentPct', label: '富氧浓度 (%)', hint: '用于反求空气与氧气配比' },
  {
    key: 'fuelConcentrateRatio',
    label: '煤率（煤/精矿比）',
    hint: '用于反求无烟煤投料量',
  },
]

export function AntimonyProcessParametersPanel({
  darkMode,
  drafts,
  onDraftChange,
  onCommit,
  onNext,
  nextDisabled = false,
  showNext = true,
  compact = false,
}: AntimonyProcessParametersPanelProps) {
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
      <h4 className={`text-base font-semibold ${darkMode ? 'text-gray-100' : 'text-gray-800'}`}>关键参数输入</h4>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {FIELD_DEFS.map((field) => (
          <div key={field.key}>
            <label className={`mb-1.5 block text-sm font-medium ${darkMode ? 'text-gray-200' : 'text-gray-800'}`}>
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
