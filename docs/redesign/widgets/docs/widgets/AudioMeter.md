# Audio Meter  `AudioMeter`

L/R LED meter with peak, RMS, hold and level, or a meter bridge showing every device.

| | |
|---|---|
| File | `widgets/AudioMeter.jsx` |
| Category | Audio |
| Default / min span | 2×1 / 1×1 |
| Icon | `graphic_eq` (Material Symbols Rounded) |
| Rendering | DOM + SVG |
| Compact views | yes — `compact` descriptor (tile / strip / column) |
| Studio variant | custom `studio` descriptor |

## Props
Common shell props (every widget): `data`, `accent`, `surface`, `radius`, `skin`, `graph`, `meter`, `variant`, `size`, `title`, `showHeader`, `compactView`, `className`, `style` — see [../ARCHITECTURE.md](../ARCHITECTURE.md#shell-props).

Widget-specific:
```
device (container id, default "default-audio"), devices (container ids of the bridge columns; default all), flow 'all' | 'output' | 'input', mode 'single' | 'bridge', segments,
meterStyle 'led' | 'bar' | 'vu' | 'ring' | 'mirror' | 'wave'
```

## Data
Owns prefixes: `plugins.audio-level-meter.`

Keys read (literal parts; `${…}` segments are resolved at runtime by detection or props):
- `plugins.audio-level-meter.*`

## Layout by size
- Tiers handled explicitly: `xs` · `sm` · `lg`
- Shapes handled explicitly: via CompactView
- Inner content size (after padding + header) is passed to the layout as `{ w, h }`; tier/shape come from the outer size. See [../ARCHITECTURE.md](../ARCHITECTURE.md#sizing).

## Core building blocks used
`Widget` · `shell` · `get` · `num` · `fmt` · `Spark` · `useHistory`

## Demo configurations on the overview page
- **4×2**: `{"mode":"bridge"}`
- **1×2**: `{"mode":"bridge"}`
