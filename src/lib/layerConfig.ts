export type LayerConfig = {
  visible: boolean
  sizeScale: number
  glowScale: number
  glowAlpha: number
  dim: string
  hot: string
}

export const CHARGER_DEFAULTS: LayerConfig = {
  visible: true,
  sizeScale: 1,
  glowScale: 1,
  glowAlpha: 1,
  dim: '#1d3fd8',
  hot: '#dceaff',
}

export type BrushConfig = {
  enabled: boolean
  /** Brush radius in CSS pixels. */
  size: number
  /** Marks stamped per pointer sample. */
  density: number
  target: 'charger' | 'storage'
  mode: 'paint' | 'erase'
}

export const BRUSH_DEFAULTS: BrushConfig = {
  enabled: false,
  size: 28,
  density: 6,
  target: 'charger',
  mode: 'paint',
}

export const STORAGE_DEFAULTS: LayerConfig = {
  visible: true,
  sizeScale: 1,
  glowScale: 1,
  glowAlpha: 1,
  dim: '#2fae7a',
  hot: '#f4ffd6',
}
