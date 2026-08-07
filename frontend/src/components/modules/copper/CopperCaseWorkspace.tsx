import CopperOxySideBlowSession, {
  type CopperOxySideBlowSessionProps,
} from './shared/CopperOxySideBlowSession.tsx'

export type CopperCaseWorkspaceProps = Omit<CopperOxySideBlowSessionProps, 'forcedPageKind'>

/** 铜火法富氧侧吹 — 项目工作区（新建/导入案例） */
export default function CopperCaseWorkspace(props: CopperCaseWorkspaceProps) {
  return <CopperOxySideBlowSession {...props} forcedPageKind="workspace" />
}
