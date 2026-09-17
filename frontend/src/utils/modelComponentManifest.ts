/** Shared, viewer-agnostic description of model components.
 *
 * The manifest is intentionally plain data: viewers can build THREE groups from
 * it, while engineering summaries can display the same ids and parameters.
 */
export type ModelComponentModel = 'smelting-furnace' | 'lead-kivcet'

export type ModelComponentGroup =
  | 'primary-body'
  | 'process-connection'
  | 'cooling-and-injection'
  | 'support'
  | 'annotation'

export type ModelComponentParameter = {
  value: number | string | boolean
  unit?: string
  editable: boolean
  source?: 'calculation' | 'geometry' | 'manual'
  label?: string
}

export type ModelComponentManifest = {
  /** Stable id used for viewer groups, engineering hand-off and persistence. */
  id: string
  model: ModelComponentModel
  group: ModelComponentGroup
  category: string
  role: string
  kind: string
  params: Record<string, ModelComponentParameter>
  /** Existing geometry id, when the component wraps a legacy placement. */
  geometryId?: string
  parentId?: string
}

/** Numeric overrides keyed by a stable manifest or legacy geometry id. */
export type ModelComponentOverrides = Record<string, Record<string, number>>

export const MODEL_GROUP_LABELS: Record<ModelComponentGroup, string> = {
  'primary-body': '主体设备',
  'process-connection': '工艺连接',
  'cooling-and-injection': '冷却与喷吹',
  support: '基础与支撑',
  annotation: '标注与汇总',
}

export function numericParameter(
  value: number,
  unit: string,
  options: Pick<ModelComponentParameter, 'editable' | 'source' | 'label'> = { editable: true },
): ModelComponentParameter {
  return { value, unit, ...options }
}

export function countParameter(
  value: number,
  options: Pick<ModelComponentParameter, 'editable' | 'source' | 'label'> = { editable: false, source: 'calculation' },
): ModelComponentParameter {
  return { value, unit: 'count', ...options }
}
