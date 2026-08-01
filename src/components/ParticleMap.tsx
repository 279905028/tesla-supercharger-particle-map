import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from 'react'
import * as THREE from 'three'
import type { Anchor } from '../data/cities'
import { LAND, makeProjector, type BBox } from '../lib/geo'
import { buildCloud, buildStorageCloud, type PointCloud } from '../lib/particles'
import {
  BRUSH_DEFAULTS,
  CHARGER_DEFAULTS,
  STORAGE_DEFAULTS,
  type BrushConfig,
  type LayerConfig,
} from '../lib/layerConfig'
import type { PanelApi, PanelSnapshot } from '../lib/mapState'

type Pass = { size: number; falloff: number; alpha: number; kind: 'glow' | 'core' }

const CHARGER_PASSES: Pass[] = [
  { size: 26, falloff: 3.0, alpha: 0.09, kind: 'glow' },
  { size: 11, falloff: 2.3, alpha: 0.2, kind: 'glow' },
  { size: 4.2, falloff: 1.7, alpha: 0.4, kind: 'core' },
  { size: 1.7, falloff: 1.0, alpha: 0.95, kind: 'core' },
]

const STORAGE_PASSES: Pass[] = [
  { size: 34, falloff: 2.6, alpha: 0.1, kind: 'glow' },
  { size: 14, falloff: 2.0, alpha: 0.22, kind: 'glow' },
  { size: 5.5, falloff: 1.2, alpha: 0.85, kind: 'core' },
]

const VERT = /* glsl */ `
  attribute float aBright;
  attribute float aPhase;
  attribute float aScale;
  uniform float uTime;
  uniform float uSize;
  uniform float uPx;
  uniform float uPulse;
  uniform float uPulseAmt;
  varying float vB;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    float tw = (1.0 - uPulseAmt) + uPulseAmt * (0.5 + 0.5 * sin(uTime * uPulse + aPhase * 9.0));
    vB = aBright * tw;
    gl_PointSize = uSize * uPx * aScale * (0.55 + aBright * 1.05);
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uDeep;
  uniform vec3 uHot;
  uniform float uFalloff;
  uniform float uAlpha;
  uniform float uDiamond;
  varying float vB;
  void main() {
    vec2 p = (gl_PointCoord - 0.5) * 2.0;
    float round = length(p);
    float diamond = abs(p.x) + abs(p.y);
    float d = mix(round, diamond, uDiamond);
    if (d > 1.0) discard;
    float f = pow(1.0 - d, uFalloff);
    vec3 col = mix(uDeep, uHot, clamp(vB * 1.45 - 0.15, 0.0, 1.0));
    gl_FragColor = vec4(col, f * clamp(vB, 0.0, 1.0) * uAlpha);
  }
`

const PAINT_CAPACITY = 60000

type BrushApi = {
  stamp: (series: number, u: number, v: number, radiusPx: number, n: number) => void
  erase: (series: number, u: number, v: number, radiusPx: number) => void
  reset: () => void
}

function makeGeometry(cloud: PointCloud) {
  const geom = new THREE.BufferGeometry()
  const xyz = new Float32Array(cloud.count * 3)
  for (let i = 0; i < cloud.count; i++) {
    xyz[i * 3] = cloud.pos[i * 2]
    xyz[i * 3 + 1] = 1 - cloud.pos[i * 2 + 1]
  }
  geom.setAttribute('position', new THREE.BufferAttribute(xyz, 3))
  geom.setAttribute('aBright', new THREE.BufferAttribute(cloud.bright.slice(), 1))
  geom.setAttribute('aPhase', new THREE.BufferAttribute(cloud.phase, 1))
  geom.setAttribute('aScale', new THREE.BufferAttribute(cloud.scale, 1))
  return geom
}

export default function ParticleMap({
  bbox,
  anchors,
  label,
  density = 240,
  charger = CHARGER_DEFAULTS,
  storage = STORAGE_DEFAULTS,
  brush = BRUSH_DEFAULTS,
  clearToken = 0,
  onStorageStats,
  registerPanel,
}: {
  bbox: BBox
  anchors: Anchor[]
  label: string
  density?: number
  charger?: LayerConfig
  storage?: LayerConfig
  brush?: BrushConfig
  clearToken?: number
  onStorageStats?: (label: string, stats: { sites: number; totalGWh: number }) => void
  registerPanel?: (label: string, api: PanelApi | null) => void
}) {
  const host = useRef<HTMLDivElement>(null)
  const landRef = useRef<HTMLCanvasElement>(null)
  const brushApi = useRef<BrushApi | null>(null)
  const painting = useRef(false)
  const lastPoint = useRef<{ u: number; v: number } | null>(null)
  const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null)

  const live = useRef({ charger, storage, brush })
  live.current = { charger, storage, brush }

  useEffect(() => {
    if (clearToken) brushApi.current?.reset()
  }, [clearToken])

  const proj = useMemo(() => makeProjector(bbox), [bbox])
  const aspect = Math.abs(proj.aspect)
  const cloud = useMemo(() => buildCloud(bbox, anchors, density), [bbox, anchors, density])
  const storageCloud = useMemo(() => buildStorageCloud(bbox, anchors), [bbox, anchors])

  useEffect(() => {
    onStorageStats?.(label, { sites: storageCloud.sites, totalGWh: storageCloud.totalGWh })
  }, [label, storageCloud, onStorageStats])

  useEffect(() => {
    const canvas = landRef.current
    const parent = host.current
    if (!canvas || !parent) return
    const draw = () => {
      const w = parent.clientWidth
      const h = parent.clientHeight
      if (!w || !h) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = w * dpr
      canvas.height = h * dpr
      const ctx = canvas.getContext('2d')!
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.clearRect(0, 0, w, h)
      ctx.fillStyle = 'rgba(122, 146, 178, 0.09)'
      ctx.lineWidth = 0.6
      ctx.strokeStyle = 'rgba(150, 178, 214, 0.16)'
      for (const poly of LAND) {
        const [pw, ps, pe, pn] = poly.bbox
        if (pe < bbox.west || pw > bbox.east || pn < bbox.south || ps > bbox.north) continue
        if (pe - pw > 180) continue
        ctx.beginPath()
        for (const ring of poly.rings) {
          for (let i = 0; i < ring.length / 2; i++) {
            const [u, v] = proj.project(ring[i * 2], ring[i * 2 + 1])
            const x = u * w
            const y = v * h
            if (i === 0) ctx.moveTo(x, y)
            else ctx.lineTo(x, y)
          }
          ctx.closePath()
        }
        ctx.fill('evenodd')
        ctx.stroke()
      }
    }
    draw()
    const ro = new ResizeObserver(draw)
    ro.observe(parent)
    return () => ro.disconnect()
  }, [proj, bbox])

  useEffect(() => {
    const parent = host.current
    if (!parent) return

    const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: true })
    renderer.setClearColor(0x000000, 0)
    renderer.domElement.style.cssText = 'position:absolute;inset:0;width:100%;height:100%'
    parent.appendChild(renderer.domElement)

    const scene = new THREE.Scene()
    const camera = new THREE.OrthographicCamera(0, 1, 1, 0, -1, 1)

    const geoms = [makeGeometry(cloud), makeGeometry(storageCloud)]

    const series = (
      [
        { passes: CHARGER_PASSES, geom: geoms[0], diamond: 0, pulse: 1.1, pulseAmt: 0.18 },
        { passes: STORAGE_PASSES, geom: geoms[1], diamond: 1, pulse: 0.55, pulseAmt: 0.32 },
      ] as const
    ).map((s) => {
      const materials = s.passes.map(
        (pass) =>
          new THREE.ShaderMaterial({
            vertexShader: VERT,
            fragmentShader: FRAG,
            transparent: true,
            depthTest: false,
            depthWrite: false,
            blending: THREE.AdditiveBlending,
            uniforms: {
              uTime: { value: 0 },
              uSize: { value: pass.size },
              uPx: { value: 1 },
              uFalloff: { value: pass.falloff },
              uAlpha: { value: pass.alpha },
              uDiamond: { value: s.diamond },
              uPulse: { value: s.pulse },
              uPulseAmt: { value: s.pulseAmt },
              uDeep: { value: new THREE.Color('#1d3fd8') },
              uHot: { value: new THREE.Color('#dceaff') },
            },
          }),
      )
      const points = materials.map((m) => new THREE.Points(s.geom, m))
      for (const p of points) scene.add(p)
      return { passes: s.passes, materials, points }
    })

    const paints = series.map((s) => {
      const g = new THREE.BufferGeometry()
      const pos = new Float32Array(PAINT_CAPACITY * 3)
      const bright = new Float32Array(PAINT_CAPACITY)
      const phase = new Float32Array(PAINT_CAPACITY)
      const scale = new Float32Array(PAINT_CAPACITY)
      const attrs = {
        position: new THREE.BufferAttribute(pos, 3),
        aBright: new THREE.BufferAttribute(bright, 1),
        aPhase: new THREE.BufferAttribute(phase, 1),
        aScale: new THREE.BufferAttribute(scale, 1),
      }
      for (const [name, attr] of Object.entries(attrs)) {
        attr.setUsage(THREE.DynamicDrawUsage)
        g.setAttribute(name, attr)
      }
      g.setDrawRange(0, 0)
      const points = s.materials.map((m) => {
        const p = new THREE.Points(g, m)
        p.frustumCulled = false
        scene.add(p)
        return p
      })
      return { g, attrs, pos, bright, phase, scale, points, count: 0 }
    })

    const stamp = (si: number, u: number, v: number, radiusPx: number, n: number) => {
      const buf = paints[si]
      const w = parent.clientWidth || 1
      const h = parent.clientHeight || 1
      const ru = radiusPx / w
      const rv = radiusPx / h
      const start = buf.count
      let added = 0
      for (let i = 0; i < n && buf.count < PAINT_CAPACITY; i++) {
        const rad = Math.sqrt(Math.random())
        const th = Math.random() * Math.PI * 2
        const x = u + Math.cos(th) * rad * ru
        const y = v + Math.sin(th) * rad * rv
        if (x < 0 || x > 1 || y < 0 || y > 1) continue
        const idx = buf.count
        buf.pos[idx * 3] = x
        buf.pos[idx * 3 + 1] = 1 - y
        buf.pos[idx * 3 + 2] = 0
        buf.bright[idx] = 0.45 + Math.random() * 0.55
        buf.phase[idx] = Math.random() * Math.PI * 2
        buf.scale[idx] = si === 1 ? 0.7 + Math.random() * 1.4 : 1
        buf.count++
        added++
      }
      if (!added) return
      buf.attrs.position.addUpdateRange(start * 3, added * 3)
      buf.attrs.aBright.addUpdateRange(start, added)
      buf.attrs.aPhase.addUpdateRange(start, added)
      buf.attrs.aScale.addUpdateRange(start, added)
      for (const a of Object.values(buf.attrs)) a.needsUpdate = true
      buf.g.setDrawRange(0, buf.count)
    }

    const dataBright = geoms.map((g) => (g.getAttribute('aBright') as THREE.BufferAttribute).array)
    const dataBrightOrig = dataBright.map((a) => (a as Float32Array).slice())

    const erase = (si: number, u: number, v: number, radiusPx: number) => {
      const w = parent.clientWidth || 1
      const h = parent.clientHeight || 1
      const ru = radiusPx / w
      const rv = radiusPx / h
      const inside = (x: number, y: number) => {
        const dx = (x - u) / ru
        const dy = (y - v) / rv
        return dx * dx + dy * dy <= 1
      }
      const buf = paints[si]
      for (let i = buf.count - 1; i >= 0; i--) {
        if (!inside(buf.pos[i * 3], 1 - buf.pos[i * 3 + 1])) continue
        const last = buf.count - 1
        if (i !== last) {
          buf.pos[i * 3] = buf.pos[last * 3]
          buf.pos[i * 3 + 1] = buf.pos[last * 3 + 1]
          buf.bright[i] = buf.bright[last]
          buf.phase[i] = buf.phase[last]
          buf.scale[i] = buf.scale[last]
        }
        buf.count--
      }
      buf.g.setDrawRange(0, buf.count)
      for (const a of Object.values(buf.attrs)) a.needsUpdate = true
      const bright = dataBright[si] as Float32Array
      const posAttr = geoms[si].getAttribute('position') as THREE.BufferAttribute
      const xyz = posAttr.array as Float32Array
      const brightAttr = geoms[si].getAttribute('aBright') as THREE.BufferAttribute
      let touched = false
      for (let i = 0; i < bright.length; i++) {
        if (bright[i] === 0) continue
        if (!inside(xyz[i * 3], 1 - xyz[i * 3 + 1])) continue
        bright[i] = 0
        touched = true
      }
      if (touched) brightAttr.needsUpdate = true
    }

    const reset = () => {
      for (const p of paints) {
        p.count = 0
        p.g.setDrawRange(0, 0)
      }
      geoms.forEach((g, i) => {
        const attr = g.getAttribute('aBright') as THREE.BufferAttribute
        ;(attr.array as Float32Array).set(dataBrightOrig[i])
        attr.needsUpdate = true
      })
    }

    const exportPanel = (): PanelSnapshot => {
      const painted = paints.map((buf) => {
        const flat: number[] = []
        for (let i = 0; i < buf.count; i++) {
          flat.push(
            +buf.pos[i * 3].toFixed(5),
            +(1 - buf.pos[i * 3 + 1]).toFixed(5),
            +buf.bright[i].toFixed(3),
            +buf.scale[i].toFixed(3),
          )
        }
        return flat
      })
      const erased = dataBright.map((arr, si) => {
        const a = arr as Float32Array
        const orig = dataBrightOrig[si]
        const idx: number[] = []
        for (let i = 0; i < a.length; i++) if (a[i] === 0 && orig[i] !== 0) idx.push(i)
        return idx
      })
      return {
        label,
        painted: { charger: painted[0] ?? [], storage: painted[1] ?? [] },
        erased: { charger: erased[0] ?? [], storage: erased[1] ?? [] },
      }
    }

    const importPanel = (snapshot: PanelSnapshot) => {
      reset()
      const flats = [snapshot.painted.charger, snapshot.painted.storage]
      flats.forEach((flat, si) => {
        const buf = paints[si]
        const n = Math.min(Math.floor(flat.length / 4), PAINT_CAPACITY)
        for (let i = 0; i < n; i++) {
          buf.pos[i * 3] = flat[i * 4]
          buf.pos[i * 3 + 1] = 1 - flat[i * 4 + 1]
          buf.pos[i * 3 + 2] = 0
          buf.bright[i] = flat[i * 4 + 2]
          buf.phase[i] = Math.random() * Math.PI * 2
          buf.scale[i] = flat[i * 4 + 3]
        }
        buf.count = n
        buf.g.setDrawRange(0, n)
        for (const a of Object.values(buf.attrs)) a.needsUpdate = true
      })
      const erasures = [snapshot.erased.charger, snapshot.erased.storage]
      erasures.forEach((idx, si) => {
        const arr = dataBright[si] as Float32Array
        for (const i of idx) if (i >= 0 && i < arr.length) arr[i] = 0
        ;(geoms[si].getAttribute('aBright') as THREE.BufferAttribute).needsUpdate = true
      })
    }

    registerPanel?.(label, { exportPanel, importPanel })
    brushApi.current = { stamp, erase, reset }

    const allMaterials = series.flatMap((s) => s.materials)

    const resize = () => {
      const w = parent.clientWidth
      const h = parent.clientHeight
      if (!w || !h) return
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      renderer.setPixelRatio(dpr)
      renderer.setSize(w, h, false)
      for (const m of allMaterials) m.uniforms.uPx.value = (w / 620) * dpr
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(parent)

    let raf = 0
    const timer = new THREE.Timer()
    const tick = (timestamp?: number) => {
      timer.update(timestamp)
      const t = timer.getElapsed()
      const cfgs = [live.current.charger, live.current.storage]
      series.forEach((s, si) => {
        const cfg = cfgs[si]
        s.materials.forEach((m, i) => {
          const pass = s.passes[i]
          const glow = pass.kind === 'glow'
          m.uniforms.uTime.value = t
          m.uniforms.uSize.value = pass.size * (glow ? cfg.glowScale : cfg.sizeScale)
          m.uniforms.uAlpha.value = pass.alpha * (glow ? cfg.glowAlpha : 1)
          m.uniforms.uDeep.value.set(cfg.dim)
          m.uniforms.uHot.value.set(cfg.hot)
          s.points[i].visible = cfg.visible
          paints[si].points[i].visible = cfg.visible
        })
      })
      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }
    tick()

    return () => {
      cancelAnimationFrame(raf)
      timer.dispose()
      ro.disconnect()
      registerPanel?.(label, null)
      brushApi.current = null
      for (const p of paints) p.g.dispose()
      for (const g of geoms) g.dispose()
      for (const m of allMaterials) m.dispose()
      renderer.dispose()
      renderer.domElement.remove()
    }
  }, [cloud, storageCloud, label, registerPanel])

  const paintAt = useCallback((event: PointerEvent<HTMLDivElement>) => {
    const api = brushApi.current
    const parent = host.current
    const cfg = live.current.brush
    if (!api || !parent || !cfg.enabled) return
    const rect = parent.getBoundingClientRect()
    const u = (event.clientX - rect.left) / rect.width
    const v = (event.clientY - rect.top) / rect.height
    const si = cfg.target === 'storage' ? 1 : 0
    const apply = (x: number, y: number) => {
      if (cfg.mode === 'erase') api.erase(si, x, y, cfg.size)
      else api.stamp(si, x, y, cfg.size, cfg.density)
    }
    const prev = lastPoint.current
    if (prev) {
      const dist = Math.hypot((u - prev.u) * rect.width, (v - prev.v) * rect.height)
      const steps = Math.min(24, Math.floor(dist / Math.max(4, cfg.size * 0.35)))
      for (let i = 1; i <= steps; i++) {
        const t = i / (steps + 1)
        apply(prev.u + (u - prev.u) * t, prev.v + (v - prev.v) * t)
      }
    }
    apply(u, v)
    lastPoint.current = { u, v }
  }, [])

  const trackCursor = (event: PointerEvent<HTMLDivElement>) => {
    if (!brush.enabled) return
    const rect = event.currentTarget.getBoundingClientRect()
    setCursor({ x: event.clientX - rect.left, y: event.clientY - rect.top })
  }

  return (
    <figure className="relative m-0 overflow-hidden bg-[#05070c]">
      <div
        ref={host}
        className="relative w-full"
        style={{
          aspectRatio: `${aspect}`,
          contain: 'paint',
          cursor: brush.enabled ? 'crosshair' : undefined,
          touchAction: brush.enabled ? 'none' : undefined,
        }}
        onPointerDown={(e) => {
          if (!brush.enabled) return
          e.currentTarget.setPointerCapture(e.pointerId)
          painting.current = true
          lastPoint.current = null
          trackCursor(e)
          paintAt(e)
        }}
        onPointerMove={(e) => {
          trackCursor(e)
          if (painting.current) paintAt(e)
        }}
        onPointerUp={(e) => {
          painting.current = false
          lastPoint.current = null
          if (e.currentTarget.hasPointerCapture(e.pointerId))
            e.currentTarget.releasePointerCapture(e.pointerId)
        }}
        onPointerLeave={() => {
          painting.current = false
          lastPoint.current = null
          setCursor(null)
        }}
      >
        <canvas ref={landRef} className="absolute inset-0 h-full w-full" />
        {brush.enabled && cursor && (
          <span
            className={`pointer-events-none absolute rounded-full ${
              brush.mode === 'erase' ? 'border border-dashed border-rose-300/70' : 'border border-white/50'
            }`}
            style={{
              left: cursor.x - brush.size,
              top: cursor.y - brush.size,
              width: brush.size * 2,
              height: brush.size * 2,
              boxShadow: `0 0 0 1px rgba(0,0,0,0.4) inset`,
              background:
                brush.mode === 'erase' ? 'rgba(255,120,150,0.08)' : 'rgba(255,255,255,0.04)',
            }}
          />
        )}
      </div>
      <figcaption className="pointer-events-none absolute left-5 top-4 text-[15px] font-medium tracking-[-0.01em] text-white/90 md:left-7 md:top-6">
        {label}
      </figcaption>
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_45%,transparent_45%,rgba(0,0,0,0.55)_100%)]" />
    </figure>
  )
}
