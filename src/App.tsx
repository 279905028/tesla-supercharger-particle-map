import { useCallback, useMemo, useRef, useState } from 'react'
import ControlBar from './components/ControlBar'
import ParticleMap from './components/ParticleMap'
import { ASIA, EUROPE, OCEANIA, SOUTH_AMERICA, type Anchor } from './data/cities'
import type { BBox } from './lib/geo'
import {
  BRUSH_DEFAULTS,
  CHARGER_DEFAULTS,
  STORAGE_DEFAULTS,
  type BrushConfig,
  type LayerConfig,
} from './lib/layerConfig'
import {
  downloadJson,
  parseMapState,
  type MapState,
  type PanelApi,
  type PanelSnapshot,
} from './lib/mapState'

const PANELS: { label: string; bbox: BBox; anchors: Anchor[] }[] = [
  {
    label: 'Europe',
    bbox: { west: -12, east: 52, south: 33, north: 71 },
    anchors: EUROPE,
  },
  {
    label: 'Asia',
    bbox: { west: 62, east: 148, south: -11, north: 54 },
    anchors: ASIA,
  },
  {
    label: 'South America',
    bbox: { west: -82, east: -33, south: -55, north: 13 },
    anchors: SOUTH_AMERICA,
  },
  {
    label: 'Oceania',
    bbox: { west: 111, east: 179, south: -48, north: -8 },
    anchors: OCEANIA,
  },
]

type Stats = { sites: number; totalGWh: number }

export default function App() {
  const [charger, setCharger] = useState<LayerConfig>(CHARGER_DEFAULTS)
  const [storage, setStorage] = useState<LayerConfig>(STORAGE_DEFAULTS)
  const [brush, setBrush] = useState<BrushConfig>(BRUSH_DEFAULTS)
  const [clearToken, setClearToken] = useState(0)
  const [stats, setStats] = useState<Record<string, Stats>>({})

  const patchCharger = useCallback(
    (patch: Partial<LayerConfig>) => setCharger((c) => ({ ...c, ...patch })),
    [],
  )
  const patchStorage = useCallback(
    (patch: Partial<LayerConfig>) => setStorage((c) => ({ ...c, ...patch })),
    [],
  )

  const patchBrush = useCallback(
    (patch: Partial<BrushConfig>) => setBrush((b) => ({ ...b, ...patch })),
    [],
  )

  const handleStats = useCallback(
    (label: string, s: Stats) => setStats((prev) => ({ ...prev, [label]: s })),
    [],
  )

  const panelApis = useRef(new Map<string, PanelApi>())
  const [ioNote, setIoNote] = useState<string | null>(null)

  const registerPanel = useCallback((label: string, api: PanelApi | null) => {
    if (api) panelApis.current.set(label, api)
    else panelApis.current.delete(label)
  }, [])

  const exportState = useCallback(() => {
    const state: MapState = {
      version: 1,
      savedAt: new Date().toISOString(),
      layers: { charger, storage },
      brush,
      panels: PANELS.map((p) => panelApis.current.get(p.label)?.exportPanel()).filter(
        (p): p is PanelSnapshot => Boolean(p),
      ),
    }
    downloadJson(`map-state-${state.savedAt.slice(0, 19).replace(/[:T]/g, '-')}.json`, state)
    const marks = state.panels.reduce(
      (n, p) => n + (p.painted.charger.length + p.painted.storage.length) / 4,
      0,
    )
    setIoNote(`Exported ${state.panels.length} panels · ${marks} painted marks`)
  }, [brush, charger, storage])

  const importState = useCallback(async (file: File) => {
    try {
      const state = parseMapState(await file.text())
      setCharger(state.layers.charger)
      setStorage(state.layers.storage)
      setBrush(state.brush)
      for (const snapshot of state.panels) {
        panelApis.current.get(snapshot.label)?.importPanel(snapshot)
      }
      const missing = state.panels.filter((p) => !panelApis.current.has(p.label))
      setIoNote(
        missing.length
          ? `Imported ${state.panels.length - missing.length} panels · skipped ${missing
              .map((p) => p.label || '(unnamed)')
              .join(', ')}`
          : `Imported ${state.panels.length} panels from ${file.name}`,
      )
    } catch (error) {
      setIoNote(`Import failed: ${error instanceof Error ? error.message : 'invalid JSON'}`)
    }
  }, [])

  const totals = useMemo(() => {
    const values = Object.values(stats).filter(Boolean)
    return {
      sites: values.reduce((sum, s) => sum + (s.sites ?? 0), 0),
      gwh: values.reduce((sum, s) => sum + (s.totalGWh ?? 0), 0),
    }
  }, [stats])

  return (
    <main className="min-h-screen bg-[#000105] px-4 pb-16 pt-10 text-white md:px-8 lg:px-12">
      <div className="mx-auto max-w-[1600px]">
        <div className="grid gap-4 md:grid-cols-2 md:items-start">
          {PANELS.map((panel) => (
            <ParticleMap
              key={panel.label}
              label={panel.label}
              bbox={panel.bbox}
              anchors={panel.anchors}
              charger={charger}
              storage={storage}
              brush={brush}
              clearToken={clearToken}
              onStorageStats={handleStats}
              registerPanel={registerPanel}
            />
          ))}
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-x-8 gap-y-3">
          <span className="flex items-center gap-3">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ background: charger.dim, boxShadow: `0 0 12px 3px ${charger.dim}8c` }}
            />
            <span className="text-[15px] text-white/85">Supercharger sites</span>
          </span>
          <span className="flex items-center gap-3">
            <span
              className="h-2.5 w-2.5 rotate-45 rounded-[2px]"
              style={{ background: storage.dim, boxShadow: `0 0 12px 3px ${storage.dim}8c` }}
            />
            <span className="text-[15px] text-white/85">
              Battery storage capacity
              <span className="ml-2 text-[13px] text-white/40">
                mark scales with installed GWh · simulated
              </span>
            </span>
          </span>
        </div>

        <hr className="mt-10 border-white/10" />

        <section className="grid items-start gap-6 py-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,26rem)] lg:gap-10">
          <h2 className="max-w-[18ch] text-2xl font-semibold leading-tight tracking-[-0.02em] md:text-[28px]">
            Average uptime of Supercharger sites in 2025
          </h2>
          <p className="text-[clamp(3.5rem,8vw,6.5rem)] font-light leading-[0.95] tracking-[-0.03em]">
            99.95%
          </p>
          <p className="max-w-[52ch] text-[13px] leading-relaxed text-white/45 lg:justify-self-end">
            Uptime of Supercharger sites reflects the average percentage of sites globally that had
            at least 50% of their daily capacity functional for the year.
          </p>
        </section>

        <hr className="border-white/10" />

        <section className="grid items-start gap-6 py-10 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)_minmax(0,26rem)] lg:gap-10">
          <h2 className="max-w-[18ch] text-2xl font-semibold leading-tight tracking-[-0.02em] md:text-[28px]">
            Battery storage deployed in 2025
          </h2>
          <p className="text-[clamp(3.5rem,8vw,6.5rem)] font-light leading-[0.95] tracking-[-0.03em]">
            {totals.gwh.toFixed(1)}
            <span className="ml-3 align-middle text-[0.3em] uppercase tracking-[0.2em] text-white/45">
              GWh
            </span>
          </p>
          <p className="max-w-[52ch] text-[13px] leading-relaxed text-white/45 lg:justify-self-end">
            Simulated placement across {totals.sites} grid-scale installations. Diamond marks scale
            with the capacity installed at each site.
          </p>
        </section>

        <ControlBar
          charger={charger}
          storage={storage}
          chargerMeta="round marks · site density"
          storageMeta={`${totals.sites} sites · ${totals.gwh.toFixed(1)} GWh`}
          brush={brush}
          onCharger={patchCharger}
          onStorage={patchStorage}
          onBrush={patchBrush}
          onClearPainted={() => setClearToken((t) => t + 1)}
          onResetCharger={() => setCharger(CHARGER_DEFAULTS)}
          onResetStorage={() => setStorage(STORAGE_DEFAULTS)}
          ioNote={ioNote}
          onExport={exportState}
          onImport={importState}
        />
      </div>
    </main>
  )
}
