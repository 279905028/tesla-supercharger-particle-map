import type { Anchor } from '../data/cities'
import { isLand, makeProjector, type BBox } from './geo'

export type PointCloud = {
  pos: Float32Array // u, v in [0..1] panel space
  bright: Float32Array
  phase: Float32Array
  scale: Float32Array // per-point size multiplier (installed capacity, for storage)
  count: number
}

// Deterministic RNG so a panel looks identical between reloads.
function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

function fieldAt(anchors: Anchor[], lon: number, lat: number) {
  const k = Math.cos((lat * Math.PI) / 180)
  let f = 0
  for (const a of anchors) {
    const r = a.r ?? 1.8
    const dx = (lon - a.lon) * k
    const dy = lat - a.lat
    const d2 = (dx * dx + dy * dy) / (r * r)
    if (d2 < 9) f += a.w * Math.exp(-d2)
  }
  return f
}

export function buildCloud(bbox: BBox, anchors: Anchor[], cols = 240): PointCloud {
  const proj = makeProjector(bbox)
  const rand = rng(Math.round((bbox.west + 200) * 7919 + bbox.north * 104729))
  const rows = Math.max(40, Math.round(cols / Math.abs(proj.aspect)))
  const us: number[] = []
  const vs: number[] = []
  const bs: number[] = []

  const add = (u: number, v: number, b: number) => {
    if (u < 0 || u > 1 || v < 0 || v > 1) return
    us.push(u)
    vs.push(v)
    bs.push(b)
  }

  // 1. Land scatter, density driven by the metro field.
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const u = (i + rand()) / cols
      const v = (j + rand()) / rows
      const [lon, lat] = proj.unproject(u, v)
      if (!isLand(lon, lat)) continue
      const f = fieldAt(anchors, lon, lat)
      const p = 0.025 + Math.min(0.6, f * 0.55)
      if (rand() > p) continue
      add(u, v, 0.18 + Math.min(0.55, f * 0.5) + rand() * 0.18)
    }
  }

  // 2. Corridors between metros within a day's drive of each other.
  for (let a = 0; a < anchors.length; a++) {
    for (let b = a + 1; b < anchors.length; b++) {
      const A = anchors[a]
      const B = anchors[b]
      const k = Math.cos((((A.lat + B.lat) / 2) * Math.PI) / 180)
      const dx = (B.lon - A.lon) * k
      const dy = B.lat - A.lat
      const dist = Math.hypot(dx, dy)
      if (dist > 9) continue
      const strength = A.w * B.w * (1 - dist / 9)
      const n = Math.round(dist * 15 * strength)
      const bend = (rand() - 0.5) * dist * 0.14
      for (let s = 0; s < n; s++) {
        const t = rand()
        const arc = Math.sin(t * Math.PI) * bend
        const lon = A.lon + (B.lon - A.lon) * t - (dy / (dist || 1)) * arc + (rand() - 0.5) * 0.5
        const lat = A.lat + (B.lat - A.lat) * t + (dx / (dist || 1)) * arc + (rand() - 0.5) * 0.5
        if (!isLand(lon, lat)) continue
        const [u, v] = proj.project(lon, lat)
        add(u, v, 0.3 + rand() * 0.35)
      }
    }
  }

  // 3. Metro blooms — tight gaussian core plus a wider halo of sites.
  for (const a of anchors) {
    const r = a.r ?? 1.8
    const n = Math.round(28 + a.w * a.w * 210)
    for (let s = 0; s < n; s++) {
      const g = Math.sqrt(-2 * Math.log(1 - rand())) * (rand() < 0.72 ? 0.3 : 0.75) * r
      const th = rand() * Math.PI * 2
      const lat = a.lat + Math.sin(th) * g
      const lon = a.lon + (Math.cos(th) * g) / Math.max(0.25, Math.cos((lat * Math.PI) / 180))
      if (!isLand(lon, lat)) continue
      const [u, v] = proj.project(lon, lat)
      const falloff = Math.exp(-((g / r) * (g / r)) * 1.2)
      add(u, v, 0.32 + falloff * 0.6 * a.w + rand() * 0.2)
    }
  }

  const count = us.length
  const pos = new Float32Array(count * 2)
  const bright = new Float32Array(count)
  const phase = new Float32Array(count)
  const scale = new Float32Array(count).fill(1)
  for (let i = 0; i < count; i++) {
    pos[i * 2] = us[i]
    pos[i * 2 + 1] = vs[i]
    bright[i] = Math.min(1, bs[i])
    phase[i] = rand() * Math.PI * 2
  }
  return { pos, bright, phase, scale, count }
}

export type StorageCloud = PointCloud & { totalGWh: number; sites: number }

export function buildStorageCloud(bbox: BBox, anchors: Anchor[], intensity = 1): StorageCloud {
  const proj = makeProjector(bbox)
  const rand = rng(Math.round((bbox.east + 400) * 6151 + bbox.south * 39916801))
  const us: number[] = []
  const vs: number[] = []
  const caps: number[] = []
  let totalGWh = 0

  const place = (lon: number, lat: number, gwh: number) => {
    if (!isLand(lon, lat)) return
    const [u, v] = proj.project(lon, lat)
    if (u < 0 || u > 1 || v < 0 || v > 1) return
    us.push(u)
    vs.push(v)
    caps.push(gwh)
    totalGWh += gwh
  }

  for (const a of anchors) {
    const odds = Math.min(0.95, (a.w * a.w * 1.5 + 0.06) * intensity)
    const n = rand() < odds ? 1 + (rand() < a.w * 0.55 ? 1 : 0) : 0
    for (let i = 0; i < n; i++) {
      const r = (a.r ?? 1.8) * (0.6 + rand() * 1.6)
      const th = rand() * Math.PI * 2
      const lat = a.lat + Math.sin(th) * r
      const lon = a.lon + (Math.cos(th) * r) / Math.max(0.25, Math.cos((lat * Math.PI) / 180))
      const gwh = Math.round((0.15 + Math.pow(rand(), 2.4) * 3.6 * (0.4 + a.w)) * 100) / 100
      place(lon, lat, gwh)
    }
  }

  const count = us.length
  const pos = new Float32Array(count * 2)
  const bright = new Float32Array(count)
  const phase = new Float32Array(count)
  const scale = new Float32Array(count)
  let maxCap = 0.01
  for (const c of caps) maxCap = Math.max(maxCap, c)
  for (let i = 0; i < count; i++) {
    const norm = Math.sqrt(caps[i] / maxCap)
    pos[i * 2] = us[i]
    pos[i * 2 + 1] = vs[i]
    bright[i] = 0.45 + norm * 0.55
    phase[i] = rand() * Math.PI * 2
    scale[i] = 0.6 + norm * 1.6
  }
  return { pos, bright, phase, scale, count, totalGWh, sites: count }
}
