import { useRef } from 'react'
import { CHARGER_DEFAULTS, type BrushConfig, type LayerConfig } from '../lib/layerConfig'

type SliderProps = {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (value: number) => void
  format?: (value: number) => string
}

function Slider({ label, value, min, max, step, onChange, format }: SliderProps) {
  return (
    <label className="group flex min-w-0 items-center gap-3">
      <span className="w-[6.5rem] shrink-0 text-[11px] uppercase tracking-[0.14em] text-white/45">
        {label}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-1 min-w-0 flex-1 cursor-pointer appearance-none rounded-full bg-white/12 outline-none transition-colors group-hover:bg-white/20 focus-visible:ring-2 focus-visible:ring-white/40"
        style={{ accentColor: 'currentColor' }}
      />
      <span className="w-12 shrink-0 text-right text-[12px] tabular-nums text-white/75">
        {format ? format(value) : `${value.toFixed(2)}×`}
      </span>
    </label>
  )
}

function Swatch({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[11px] uppercase tracking-[0.14em] text-white/45">{label}</span>
      <span className="relative h-6 w-9 overflow-hidden rounded-md border border-white/15 transition-colors hover:border-white/35">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="absolute -inset-2 h-[calc(100%+1rem)] w-[calc(100%+1rem)] cursor-pointer border-0 bg-transparent p-0"
          aria-label={label}
        />
      </span>
      <span className="text-[11px] uppercase tabular-nums text-white/55">{value}</span>
    </label>
  )
}

function LayerControls({
  title,
  meta,
  marker,
  config = CHARGER_DEFAULTS,
  onChange,
  onReset,
}: {
  title: string
  meta: string
  marker: 'dot' | 'diamond'
  config: LayerConfig | undefined
  onChange: (patch: Partial<LayerConfig>) => void
  onReset: () => void
}) {
  const tint = config.hot
  return (
    <section
      className="min-w-0 rounded-lg border border-white/8 bg-white/[0.02] p-4"
      style={{ color: tint }}
    >
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          className="h-2.5 w-2.5 shrink-0"
          style={{
            background: config.dim,
            boxShadow: `0 0 12px 3px ${config.dim}80`,
            borderRadius: marker === 'dot' ? '9999px' : '2px',
            transform: marker === 'diamond' ? 'rotate(45deg)' : undefined,
          }}
        />
        <h3 className="text-[13px] font-medium text-white/90">{title}</h3>
        <span className="text-[11px] tabular-nums text-white/40">{meta}</span>
        <label className="ml-auto flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/45">
          <input
            type="checkbox"
            checked={config.visible}
            onChange={(e) => onChange({ visible: e.target.checked })}
            className="h-3.5 w-3.5 cursor-pointer accent-current"
          />
          Show
        </label>
      </header>

      <div className="grid gap-2.5">
        <Slider
          label="Size"
          value={config.sizeScale}
          min={0.2}
          max={3}
          step={0.05}
          onChange={(v) => onChange({ sizeScale: v })}
        />
        <Slider
          label="Glow radius"
          value={config.glowScale}
          min={0}
          max={4}
          step={0.05}
          onChange={(v) => onChange({ glowScale: v })}
        />
        <Slider
          label="Glow alpha"
          value={config.glowAlpha}
          min={0}
          max={3}
          step={0.05}
          onChange={(v) => onChange({ glowAlpha: v })}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2 border-t border-white/8 pt-3">
        <Swatch label="Dim" value={config.dim} onChange={(v) => onChange({ dim: v })} />
        <Swatch label="Hot" value={config.hot} onChange={(v) => onChange({ hot: v })} />
        <button
          type="button"
          onClick={onReset}
          className="ml-auto rounded-md border border-white/12 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-white/55 transition-colors hover:border-white/30 hover:text-white"
        >
          Reset
        </button>
      </div>
    </section>
  )
}

function BrushControls({
  brush,
  onChange,
  onClear,
}: {
  brush: BrushConfig
  onChange: (patch: Partial<BrushConfig>) => void
  onClear: () => void
}) {
  return (
    <section className="min-w-0 rounded-lg border border-white/8 bg-white/[0.02] p-4 lg:col-span-2">
      <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-[13px] font-medium text-white/90">Brush</h3>
        <span className="text-[11px] text-white/40">
          {brush.enabled
            ? brush.mode === 'erase'
              ? 'drag on any map to erase marks'
              : 'drag on any map to paint sites'
            : 'off'}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {(['paint', 'erase'] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => onChange({ mode })}
              className={`rounded-md border px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                brush.mode === mode
                  ? mode === 'erase'
                    ? 'border-rose-300/60 text-rose-200'
                    : 'border-white/40 text-white'
                  : 'border-white/10 text-white/45 hover:border-white/25 hover:text-white/75'
              }`}
            >
              {mode}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-white/10" />
          {(['charger', 'storage'] as const).map((target) => (
            <button
              key={target}
              type="button"
              onClick={() => onChange({ target })}
              className={`rounded-md border px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                brush.target === target
                  ? 'border-white/40 text-white'
                  : 'border-white/10 text-white/45 hover:border-white/25 hover:text-white/75'
              }`}
            >
              {target === 'charger' ? 'Sites' : 'Storage'}
            </button>
          ))}
          <label className="ml-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-white/45">
            <input
              type="checkbox"
              checked={brush.enabled}
              onChange={(e) => onChange({ enabled: e.target.checked })}
              className="h-3.5 w-3.5 cursor-pointer accent-white"
            />
            Enable
          </label>
        </div>
      </header>

      <div className="grid gap-2.5 lg:grid-cols-2 lg:gap-x-10">
        <Slider
          label="Brush size"
          value={brush.size}
          min={6}
          max={140}
          step={1}
          onChange={(v) => onChange({ size: v })}
          format={(v) => `${Math.round(v)}px`}
        />
        <Slider
          label={brush.mode === 'erase' ? 'Density (paint)' : 'Density'}
          value={brush.density}
          min={1}
          max={40}
          step={1}
          onChange={(v) => onChange({ density: v })}
          format={(v) => `${Math.round(v)}/tick`}
        />
      </div>

      <div className="mt-3 flex items-center gap-4 border-t border-white/8 pt-3">
        <p className="text-[11px] leading-relaxed text-white/40">
          Painted marks use the active series' colour, size and glow settings. The eraser removes
          painted and original marks alike.
        </p>
        <button
          type="button"
          onClick={onClear}
          className="ml-auto shrink-0 rounded-md border border-white/12 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-white/55 transition-colors hover:border-white/30 hover:text-white"
        >
          Restore all
        </button>
      </div>
    </section>
  )
}

function StateIO({
  note,
  onExport,
  onImport,
}: {
  note: string | null
  onExport: () => void
  onImport: (file: File) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  return (
    <section className="min-w-0 rounded-lg border border-white/8 bg-white/[0.02] p-4 lg:col-span-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <h3 className="text-[13px] font-medium text-white/90">Map data</h3>
        <span className="min-w-0 flex-1 truncate text-[11px] text-white/40">
          {note ?? 'Save painted marks, erasures and every slider to a JSON file, then reload it.'}
        </span>
        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) onImport(file)
            e.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          className="shrink-0 rounded-md border border-white/12 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-white/55 transition-colors hover:border-white/30 hover:text-white"
        >
          Import JSON
        </button>
        <button
          type="button"
          onClick={onExport}
          className="shrink-0 rounded-md border border-white/40 px-2.5 py-1 text-[11px] uppercase tracking-[0.14em] text-white transition-colors hover:bg-white/10"
        >
          Export JSON
        </button>
      </div>
    </section>
  )
}

export default function ControlBar({
  charger,
  storage,
  brush,
  chargerMeta,
  storageMeta,
  onCharger,
  onStorage,
  onBrush,
  onClearPainted,
  onResetCharger,
  onResetStorage,
  ioNote,
  onExport,
  onImport,
}: {
  charger: LayerConfig
  storage: LayerConfig
  brush: BrushConfig
  chargerMeta: string
  storageMeta: string
  onCharger: (patch: Partial<LayerConfig>) => void
  onStorage: (patch: Partial<LayerConfig>) => void
  onBrush: (patch: Partial<BrushConfig>) => void
  onClearPainted: () => void
  onResetCharger: () => void
  onResetStorage: () => void
  ioNote: string | null
  onExport: () => void
  onImport: (file: File) => void
}) {
  return (
    <div className="sticky bottom-4 z-10 mt-10 grid gap-3 rounded-xl border border-white/10 bg-[#080b12]/85 p-3 backdrop-blur-md lg:grid-cols-2">
      <LayerControls
        title="Supercharger sites"
        meta={chargerMeta}
        marker="dot"
        config={charger}
        onChange={onCharger}
        onReset={onResetCharger}
      />
      <LayerControls
        title="Battery storage capacity"
        meta={storageMeta}
        marker="diamond"
        config={storage}
        onChange={onStorage}
        onReset={onResetStorage}
      />
      <BrushControls brush={brush} onChange={onBrush} onClear={onClearPainted} />
      <StateIO note={ioNote} onExport={onExport} onImport={onImport} />
    </div>
  )
}
