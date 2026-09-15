# Open Sea

Realtime procedural ocean — WebGPU · Three.js TSL · Gerstner swell · Boids fish · weather.

Extracted from [procedural-modeling-demo](https://github.com/anlzou/procedural-modeling-demo). See [docs/PLAN.md](docs/PLAN.md).

## Run

```bash
bun install   # or pnpm / npm
bun run dev
```

Requires a WebGPU-capable browser.

Production build deploys under `/open-sea/`:

```bash
bun run build    # → dist/ with base /open-sea/
bun run preview  # preview at http://localhost:4173/open-sea/
```

Fish models use Draco (`public/draco/`); keep that folder when deploying.

## Controls

- Drag to orbit · scroll to zoom
- Bottom ring opens the glass console (draggable)
- Space: fish-eye camera · M: meteor (clear night) · Esc/Q: exit wallpaper mode
