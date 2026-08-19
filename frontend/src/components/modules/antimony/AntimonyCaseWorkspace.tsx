import AntimonyOxySideBlowSession, {
  type AntimonyOxySideBlowSessionProps,
} from './shared/AntimonyOxySideBlowSession.tsx'

export type AntimonyCaseWorkspaceProps = Omit<AntimonyOxySideBlowSessionProps, 'forcedPageKind'>

/** 锑火法富氧侧吹 — 项目工作区（新建/导入案例） */
export default function AntimonyCaseWorkspace(props: AntimonyCaseWorkspaceProps) {
  return <AntimonyOxySideBlowSession {...props} forcedPageKind="workspace" />
}
