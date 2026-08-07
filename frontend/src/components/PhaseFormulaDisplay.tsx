import { parsePhaseFormulaDisplayParts, phaseFormulaDisplayTitle } from '../utils/chemicalFormula.ts'

/** 物相式显示：长式名可在窄列内折两行，保持表头规整 */
export function PhaseFormulaDisplay({
  formula,
  className = '',
}: {
  formula: string
  className?: string
}) {
  const title = phaseFormulaDisplayTitle(formula)
  const parts = parsePhaseFormulaDisplayParts(formula)
  return (
    <span
      className={`inline-flex max-w-full flex-wrap items-baseline justify-center gap-x-0 leading-tight ${className}`}
      title={title}
    >
      {parts.map((part, index) =>
        part.kind === 'sub' ? (
          <sub key={`${part.text}-${index}`} className="text-[0.72em] leading-none">
            {part.text}
          </sub>
        ) : (
          <span key={`${part.text}-${index}`}>{part.text}</span>
        )
      )}
    </span>
  )
}
