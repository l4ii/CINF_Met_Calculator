import {
  createContext,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type { SelectedMethod, SheetId } from '../types'

/** 供助手后端注入的软件状态（MainContent 持续更新） */
export type AssistantWorkspaceSnapshot = {
  currentView: 'module' | 'about' | 'settings'
  aboutDepartment: string | null
  language: 'zh' | 'en'
  selectedMethod: Pick<SelectedMethod, 'smeltTypeName' | 'smeltMethodName'> | null
  activeSheet: SheetId
  /** 简要工况（避免把整个配料表塞进上下文） */
  materialCount: number
  mixTotalWeight: number | null
  totalCostPerHour: number
  materialsPreview: string[]
}

type AssistantContextValue = {
  assistantSnapshot: AssistantWorkspaceSnapshot | null
  setAssistantSnapshot: Dispatch<SetStateAction<AssistantWorkspaceSnapshot | null>>
}

const AssistantContext = createContext<AssistantContextValue | null>(null)

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [assistantSnapshot, setAssistantSnapshot] = useState<AssistantWorkspaceSnapshot | null>(null)
  const value = useMemo(
    () => ({
      assistantSnapshot,
      setAssistantSnapshot,
    }),
    [assistantSnapshot]
  )
  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>
}

export function useAssistantContext(): AssistantContextValue {
  const ctx = useContext(AssistantContext)
  if (!ctx) throw new Error('useAssistantContext must be used within AssistantProvider')
  return ctx
}

/** Provider 外层或未包裹时安全调用 */
export function useAssistantSnapshotOptional(): AssistantContextValue {
  const ctx = useContext(AssistantContext)
  return (
    ctx ?? {
      assistantSnapshot: null,
      setAssistantSnapshot: () => {},
    }
  )
}
