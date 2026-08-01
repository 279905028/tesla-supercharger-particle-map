import { BRUSH_DEFAULTS, CHARGER_DEFAULTS, STORAGE_DEFAULTS } from './layerConfig'
import type { BrushConfig, LayerConfig } from './layerConfig'

/** Painted marks are stored flat as [u, v, bright, scale, ...] per series. */
export type PanelSnapshot = {
  label: string
  painted: { charger: number[]; storage: number[] }
  /** Indices of original data marks the eraser removed. */
  erased: { charger: number[]; storage: number[] }
}

export type MapState = {
  version: 1
  savedAt: string
  layers: { charger: LayerConfig; storage: LayerConfig }
  brush: BrushConfig
  panels: PanelSnapshot[]
}

export type PanelApi = {
  exportPanel: () => PanelSnapshot
  importPanel: (snapshot: PanelSnapshot) => void
}

const num = (v: unknown, fallback: number) => (typeof v === 'number' && isFinite(v) ? v : fallback)
const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback)
const bool = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback)
const nums = (v: unknown): number[] =>
  Array.isArray(v) ? v.filter((n) => typeof n === 'number' && isFinite(n)) : []

function parseLayer(raw: any, base: LayerConfig): LayerConfig {
  return {
    visible: bool(raw?.visible, base.visible),
    sizeScale: num(raw?.sizeScale, base.sizeScale),
    glowScale: num(raw?.glowScale, base.glowScale),
    glowAlpha: num(raw?.glowAlpha, base.glowAlpha),
    dim: str(raw?.dim, base.dim),
    hot: str(raw?.hot, base.hot),
  }
}

/** Tolerant parse: unknown or malformed fields fall back to defaults. */
export function parseMapState(text: string): MapState {
  const raw = JSON.parse(text)
  if (!raw || typeof raw !== 'object') throw new Error('Not a map state file')
  const panels = Array.isArray(raw.panels) ? raw.panels : []
  return {
    version: 1,
    savedAt: str(raw.savedAt, new Date().toISOString()),
    layers: {
      charger: parseLayer(raw.layers?.charger, CHARGER_DEFAULTS),
      storage: parseLayer(raw.layers?.storage, STORAGE_DEFAULTS),
    },
    brush: {
      enabled: bool(raw.brush?.enabled, BRUSH_DEFAULTS.enabled),
      size: num(raw.brush?.size, BRUSH_DEFAULTS.size),
      density: num(raw.brush?.density, BRUSH_DEFAULTS.density),
      target: raw.brush?.target === 'storage' ? 'storage' : 'charger',
      mode: raw.brush?.mode === 'erase' ? 'erase' : 'paint',
    },
    panels: panels.map((p: any): PanelSnapshot => ({
      label: str(p?.label, ''),
      painted: { charger: nums(p?.painted?.charger), storage: nums(p?.painted?.storage) },
      erased: { charger: nums(p?.erased?.charger), storage: nums(p?.erased?.storage) },
    })),
  }
}

export function downloadJson(filename: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
