# Visualizer  `Visualizer`

Canvas audio visualiser driven by the level meter: bars, mirror, radial, wave, blob or LED dots.

| | |
|---|---|
| File | `widgets/Visualizer.jsx` |
| Category | Audio |
| Default / min span | 3×2 / 1×1 |
| Icon | `equalizer` (Material Symbols Rounded) |
| Rendering | Canvas 2D + requestAnimationFrame (paused off-screen) |
| Compact views | own layout in every shape |
| Studio variant | custom `studio` descriptor |

## Props
Common shell props (every widget): `data`, `accent`, `surface`, `radius`, `skin`, `graph`, `meter`, `variant`, `size`, `title`, `showHeader`, `compactView`, `className`, `style` — see [../ARCHITECTURE.md](../ARCHITECTURE.md#shell-props).

Widget-specific:
```
mode 'bars' | 'mirror' | 'radial' | 'wave' | 'blob' | 'dots', devices (audio-level-meter containers; the loudest is drawn), flow 'all' | 'output' | 'input', bands, ramp, sensitivity, peaks (default true)
```

## Data
Keys read (literal parts; `${…}` segments are resolved at runtime by detection or props):
- `plugins.audio-level-meter.*`

## Layout by size
- Tiers handled explicitly: continuous (measures w/h)
- Shapes handled explicitly: —
- Inner content size (after padding + header) is passed to the layout as `{ w, h }`; tier/shape come from the outer size. See [../ARCHITECTURE.md](../ARCHITECTURE.md#sizing).

## Core building blocks used
`Widget` · `shell` · `get` · `num` · `fmt` · `rampColor` · `accentOf` · `stepBands`

## Demo configurations on the overview page
- **2×2**: `{"mode":"radial"}`
- **1×2**: `{"mode":"mirror"}`
- **3×1**: `{"mode":"wave"}`
