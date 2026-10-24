# Now Playing  `NowPlaying`

Track, artist, album, cover art and progress from Windows Media, Spotify or a pushed source.

| | |
|---|---|
| File | `widgets/NowPlaying.jsx` |
| Category | Media |
| Default / min span | 3×1 / 1×1 |
| Icon | `music_note` (Material Symbols Rounded) |
| Rendering | DOM + SVG |
| Compact views | yes — `compact` descriptor (tile / strip / column) |
| Studio variant | custom `studio` descriptor |

## Props
Common shell props (every widget): `data`, `accent`, `surface`, `radius`, `skin`, `graph`, `meter`, `variant`, `size`, `title`, `showHeader`, `compactView`, `className`, `style` — see [../ARCHITECTURE.md](../ARCHITECTURE.md#shell-props).

Widget-specific:
```
source 'auto' | 'media' | 'spotify' | 'pushed', showArt (default true), layout 'card' | 'vinyl' | 'backdrop' | 'wave',
progress 'bar' | 'wave' | 'visualizer', vizMode 'bars' | 'mirror' | 'wave' | 'dots' | 'line', vizDevices (audio-level-meter containers; the loudest is drawn), vizFlow 'all' | 'output' | 'input', vizRamp, showTimeline (thin progress under the visualiser, default true)
```

## Data
Owns prefixes: `plugins.media-plugin.`, `plugins.spotify-plugin.`, `spotify.`

Keys read (literal parts; `${…}` segments are resolved at runtime by detection or props):
- `plugins.media-plugin.*`
- `plugins.spotify-plugin.*`
- `spotify.*`
- `plugins.media-plugin.media.*`
- `plugins.spotify-plugin.spotify.*`
- `plugins.spotify-plugin.spotify.current-track`
- `plugins.audio-level-meter.*`

## Layout by size
- Tiers handled explicitly: `xs` · `sm` · `md` · `lg`
- Shapes handled explicitly: via CompactView
- Inner content size (after padding + header) is passed to the layout as `{ w, h }`; tier/shape come from the outer size. See [../ARCHITECTURE.md](../ARCHITECTURE.md#sizing).

## Dynamic Island
Setting `island` (**Send to island**, off by default, in the Now playing group). With it on, a kiosk's Dynamic Island shows the playing track beside the time (title, artist, cover, progress) and opens for 4 s on a new track. Nothing shows while paused. The rules are in `src/widgets/island-sources.ts` (`nowPlayingIsland`); see [the island plan](../../../island/PLAN.md#what-shows-and-when).

## Core building blocks used
`Widget` · `shell` · `get` · `num` · `has` · `Img` · `Icon` · `Bar` · `Chip` · `MiniViz`

## Demo configurations on the overview page
- **4×2**: `{"layout":"backdrop","progress":"visualizer","vizMode":"mirror"}`
- **3×1**: `{"progress":"visualizer"}`
