# Tesla Supercharger Particle Map

A Three.js particle visualization inspired by Tesla's Supercharger network map. Displays charging sites and battery storage installations across four global regions with glowing particle effects.

## Features

- **Four region panels**: Europe, Asia, South America, Oceania
- **Dual layers**: Supercharger sites (circle marks) and battery storage (diamond marks)
- **3-pass glow rendering**: halo / mid / core stacked additively in WebGL — no post-processing needed
- **Land silhouettes**: faint landmass contours via `world-atlas` + `topojson-client`
- **Brush tool**: paint or erase marks directly on the map, with adjustable size and density
- **Real-time controls**: size, glow radius, glow alpha, dim/hot color swatches per layer
- **JSON import/export**: save and restore the full map state including painted marks and erasures
- **Deterministic particles**: same seed → same layout every reload

## Stack

- React 19, Vite 8, TypeScript 5.7
- Three.js 0.185 (WebGL, custom GLSL shaders)
- Tailwind CSS v4
- `world-atlas` + `topojson-client` for land polygons

## Getting Started

```bash
npm install
npm run dev
```

Open `http://localhost:8443` in your browser.
