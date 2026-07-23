import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from 'react'
import type { SelectedMethod, SheetId } from '../types'
import type {
  CopperHeatAuxiliaryParams,
  CopperHeatAuxiliaryTrace,
} from '../utils/copperHeatAuxiliaryParams.ts'

/** 供助手后端注入的软件状态（MainContent 持续更新） */
export type AssistantWorkspaceSnapshot = {
  currentView: 'module' | 'about' | 'settings'
  aboutDepartment: string | null
  language: 'zh' | 'en'
  selectedMethod: Pick<SelectedMethod, 'smeltTypeName' | 'sectionName' | 'smeltMethodName'> | null
  activeSheet: SheetId
  /** 简要工况（避免把整个配料表塞进上下文） */
  materialCount: number
  mixTotalWeight: number | null
  totalCostPerHour: number
  materialsPreview: string[]
  /** 热平衡相关参数当前值（有产出结果时写入，供规则 FAQ 引用） */
  heatAuxiliaryParams?: CopperHeatAuxiliaryParams | null
  /** 热平衡相关参数演算中间量 */
  heatAuxiliaryTrace?: CopperHeatAuxiliaryTrace | null
}

type AssistantContextValue = {
  assistantSnapshot: AssistantWorkspaceSnapshot | null
  setAssistantSnapshot: Dispatch<SetStateAction<AssistantWorkspaceSnapshot | null>>
  /** 强制展开右下角助手面板 */
  assistantDockOpen: boolean
  setAssistantDockOpen: Dispatch<SetStateAction<boolean>>
  /** 外部注入的待发送问题（发送后由面板清空） */
  pendingAssistantPrompt: string | null
  askAssistant: (prompt: string) => void
  clearPendingAssistantPrompt: () => void
}

const AssistantContext = createContext<AssistantContextValue | null>(null)

export function AssistantProvider({ children }: { children: ReactNode }) {
  const [assistantSnapshot, setAssistantSnapshot] = useState<AssistantWorkspaceSnapshot | null>(null)
  const [assistantDockOpen, setAssistantDockOpen] = useState(false)
  const [pendingAssistantPrompt, setPendingAssistantPrompt] = useState<string | null>(null)

  const askAssistant = useCallback((prompt: string) => {
    const text = prompt.trim()
    if (!text) return
    setPendingAssistantPrompt(text)
    setAssistantDockOpen(true)
  }, [])

  const clearPendingAssistantPrompt = useCallback(() => {
    setPendingAssistantPrompt(null)
  }, [])

  const value = useMemo(
    () => ({
      assistantSnapshot,
      setAssistantSnapshot,
      assistantDockOpen,
      setAssistantDockOpen,
      pendingAssistantPrompt,
      askAssistant,
      clearPendingAssistantPrompt,
    }),
    [
      askAssistant,
      assistantDockOpen,
      assistantSnapshot,
      clearPendingAssistantPrompt,
      pendingAssistantPrompt,
    ]
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
      assistantDockOpen: false,
      setAssistantDockOpen: () => {},
      pendingAssistantPrompt: null,
      askAssistant: () => {},
      clearPendingAssistantPrompt: () => {},
    }
  )
}
