# Meter Bridge  `MeterBridge`

Studio-style meters for every channel: a dB scale, stereo LED ladders with dimmed zone colours, peak hold, volume and L/R dB readouts. Switches to horizontal rows in short zones.

| | |
|---|---|
| File | `widgets/MeterBridge.jsx` |
| Category | Audio |
| Default / min span | 4×3 / 1×1 |
| Icon | `graphic_eq` (Material Symbols Rounded) |
| Rendering | DOM + SVG |
| Compact views | own layout in every shape |
| Studio variant | custom `studio` descriptor |

## Props
Common shell props (every widget): `data`, `accent`, `surface`, `radius`, `skin`, `graph`, `meter`, `variant`, `size`, `title`, `showHeader`, `compactView`, `className`, `style` — see [../ARCHITECTURE.md](../ARCHITECTURE.md#shell-props).

Widget-specific:
```
channels (array of device names/ids; default all), orientation 'vertical' | 'horizontal', floor (dB, default -60),
segments, holdMs (default 1500), warnDb (-18), clipDb (-6), showScale, showVolume, ladder 'led' | 'smooth', flow 'all' | 'output' | 'input'
```

## Data
Keys read (literal parts; `${…}` segments are resolved at runtime by detection or props):
- `plugins.volume-plugin`
- `plugins.audio-level-meter.*`

## Layout by size
- Tiers handled explicitly: continuous (measures w/h)
- Shapes handled explicitly: —
- Inner content size (after padding + header) is passed to the layout as `{ w, h }`; tier/shape come from the outer size. See [../ARCHITECTURE.md](../ARCHITECTURE.md#sizing).

## Core building blocks used
`Widget` · `shell` · `get` · `num` · `fmt` · `Dot`

## Demo configurations on the overview page
- **4×2**: `{"channels":["Voice","Browser","Music","System"]}`
