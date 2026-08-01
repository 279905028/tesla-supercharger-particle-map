import landTopo from 'world-atlas/land-110m.json'
import { feature } from 'topojson-client'

export type Ring = Float64Array // [lon, lat, lon, lat, ...]
export type Poly = { rings: Ring[]; bbox: [number, number, number, number] }
export type BBox = { west: number; east: number; south: number; north: number }

function toPolys(): Poly[] {
  const geo = feature(landTopo as any, (landTopo as any).objects.land) as any
  const out: Poly[] = []
  const push = (coords: number[][][]) => {
    const rings: Ring[] = []
    let w = 180, e = -180, s = 90, n = -90
    for (const ring of coords) {
      const flat = new Float64Array(ring.length * 2)
      for (let i = 0; i < ring.length; i++) {
        const [lon, lat] = ring[i]
        flat[i * 2] = lon
        flat[i * 2 + 1] = lat
        if (lon < w) w = lon
        if (lon > e) e = lon
        if (lat < s) s = lat
        if (lat > n) n = lat
      }
      rings.push(flat)
    }
    out.push({ rings, bbox: [w, s, e, n] })
  }
  for (const f of geo.features) {
    const g = f.geometry
    if (g.type === 'Polygon') push(g.coordinates)
    else if (g.type === 'MultiPolygon') for (const p of g.coordinates) push(p)
  }
  return out
}

export const LAND: Poly[] = toPolys()

/** Even-odd ray cast against every land polygon overlapping the point. */
export function isLand(lon: number, lat: number): boolean {
  for (const poly of LAND) {
    const [w, s, e, n] = poly.bbox
    if (lon < w || lon > e || lat < s || lat > n) continue
    let inside = false
    for (const ring of poly.rings) {
      const len = ring.length / 2
      for (let i = 0, j = len - 1; i < len; j = i++) {
        const xi = ring[i * 2], yi = ring[i * 2 + 1]
        const xj = ring[j * 2], yj = ring[j * 2 + 1]
        if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside
      }
    }
    if (inside) return true
  }
  return false
}

/** Web-mercator-ish y so the maps read like the reference plates. */
export const mercY = (lat: number) =>
  Math.log(Math.tan(Math.PI / 4 + (Math.max(-85, Math.min(85, lat)) * Math.PI) / 360))

export const invMercY = (y: number) => ((2 * Math.atan(Math.exp(y)) - Math.PI / 2) * 180) / Math.PI

/** Maps lon/lat into normalized [0..1] panel space for a bbox (y down). */
export function makeProjector(b: BBox) {
  const y0 = mercY(b.north)
  const y1 = mercY(b.south)
  return {
    project(lon: number, lat: number): [number, number] {
      return [(lon - b.west) / (b.east - b.west), (mercY(lat) - y0) / (y1 - y0)]
    },
    unproject(u: number, v: number): [number, number] {
      return [b.west + u * (b.east - b.west), invMercY(y0 + v * (y1 - y0))]
    },
    aspect: (b.east - b.west) / (((y1 - y0) * 180) / Math.PI),
  }
}
