/**
 * Geometry overrides are scoped by model and an optional case/stage key.
 * Keeping the scope in storage prevents a manual adjustment in one case from
 * appearing in another case or process stage.
 */
export type NumericGeometryOverrides = Record<string, number | undefined>

export type SmeltingGeometryOverrides = {
  lengthM?: number
  widthM?: number
  jacketPitchMm?: number
  components?: Record<string, Record<string, number>>
}

export type KivcetGeometryOverrides = {
  lengthM?: number
  widthM?: number
  heightM?: number
  components?: Record<string, Record<string, number>>
}

export type ModelGeometryKind = 'smelting' | 'kivcet'

export type OverrideMap = {
  smelting: SmeltingGeometryOverrides
  kivcet: KivcetGeometryOverrides
}

type StoredOverrideMap = {
  version: 2
  models: {
    [K in keyof OverrideMap]: Record<string, OverrideMap[K]>
  }
}

const STORAGE_KEY = 'metcal:model-geometry-overrides:v2'
const LEGACY_STORAGE_KEY = 'metcal:model-geometry-overrides:v1'
const EVENT_NAME = 'metcal:model-geometry-overrides'
const DEFAULT_SCOPE = 'default'

function emptyMap(): StoredOverrideMap {
  return { version: 2, models: { smelting: {}, kivcet: {} } }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value))
}

/** Drop malformed values loaded from localStorage and keep only finite positive dimensions. */
function sanitizeOverrides<T>(value: unknown): T {
  if (!isRecord(value)) return {} as T
  const result: Record<string, unknown> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (key === 'components' && isRecord(raw)) {
      const components: Record<string, Record<string, number>> = {}
      for (const [componentId, params] of Object.entries(raw)) {
        if (!isRecord(params)) continue
        const clean: Record<string, number> = {}
        for (const [param, candidate] of Object.entries(params)) {
          if (typeof candidate === 'number' && Number.isFinite(candidate)) clean[param] = candidate
        }
        if (Object.keys(clean).length) components[componentId] = clean
      }
      if (Object.keys(components).length) result.components = components
      continue
    }
    if (typeof raw === 'number' && Number.isFinite(raw) && raw > 0) result[key] = raw
  }
  return result as T
}

function normalizeScope(scopeKey?: string | null): string {
  const normalized = typeof scopeKey === 'string' ? scopeKey.trim() : ''
  return normalized || DEFAULT_SCOPE
}

function parseStoredMap(raw: string | null): StoredOverrideMap {
  if (!raw) return emptyMap()
  try {
    const parsed: unknown = JSON.parse(raw)
    if (!isRecord(parsed)) return emptyMap()
    if (isRecord(parsed.models)) {
      const next = emptyMap()
      for (const model of ['smelting', 'kivcet'] as const) {
        const scopes = parsed.models[model]
        if (!isRecord(scopes)) continue
        for (const [scope, value] of Object.entries(scopes)) {
          next.models[model][normalizeScope(scope)] = sanitizeOverrides(value)
        }
      }
      return next
    }
    // v1 migration to the default scope is read-only; no storage writes occur here.
    const migrated = emptyMap()
    for (const model of ['smelting', 'kivcet'] as const) {
      if (isRecord(parsed[model])) migrated.models[model][DEFAULT_SCOPE] = sanitizeOverrides(parsed[model])
    }
    return migrated
  } catch {
    return emptyMap()
  }
}

function readMap(): StoredOverrideMap {
  if (typeof window === 'undefined') return emptyMap()
  try {
    return parseStoredMap(window.localStorage.getItem(STORAGE_KEY) ?? window.localStorage.getItem(LEGACY_STORAGE_KEY))
  } catch {
    return emptyMap()
  }
}

export function readModelGeometryOverrides<K extends keyof OverrideMap>(model: K, scopeKey?: string | null): OverrideMap[K] {
  return sanitizeOverrides<OverrideMap[K]>(readMap().models[model][normalizeScope(scopeKey)])
}

/** Persist one scoped override set. Returns false when storage is unavailable or quota is exceeded. */
export function writeModelGeometryOverrides<K extends keyof OverrideMap>(model: K, value: OverrideMap[K], scopeKey?: string | null): boolean {
  if (typeof window === 'undefined') return false
  const scope = normalizeScope(scopeKey)
  const next = readMap()
  const modelScopes = next.models[model] as Record<string, OverrideMap[K]>
  modelScopes[scope] = sanitizeOverrides<OverrideMap[K]>(value)
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    return false
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { model, scopeKey: scope, value: modelScopes[scope] } }))
  return true
}

export function clearModelGeometryOverrides<K extends keyof OverrideMap>(model: K, scopeKey?: string | null): boolean {
  if (typeof window === 'undefined') return false
  const scope = normalizeScope(scopeKey)
  const next = readMap()
  delete next.models[model][scope]
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch {
    return false
  }
  window.dispatchEvent(new CustomEvent(EVENT_NAME, { detail: { model, scopeKey: scope, value: {} } }))
  return true
}

export function subscribeModelGeometryOverrides(listener: (model: keyof OverrideMap, scopeKey?: string) => void) {
  if (typeof window === 'undefined') return () => undefined
  const handler = (event: Event) => {
    const detail = (event as CustomEvent<{ model?: keyof OverrideMap; scopeKey?: string }>).detail
    if (detail?.model) listener(detail.model, detail.scopeKey)
  }
  window.addEventListener(EVENT_NAME, handler)
  return () => window.removeEventListener(EVENT_NAME, handler)
}

export { DEFAULT_SCOPE as DEFAULT_MODEL_GEOMETRY_SCOPE }
export type ModelGeometryOverrides = OverrideMap

