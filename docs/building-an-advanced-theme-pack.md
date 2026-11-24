# Building an advanced theme pack: Cyberspec, step by step

This walkthrough builds a theme pack the way the built-in **Cyberspec** pack was built, from a design kit to a signed pack
with an effect script. Cyberspec's own files are in [`src/looks/packs/cyberspec/`](../src/looks/packs/cyberspec/): read them
beside this page. The short reference for every key is the [customization guide](customization-guide.md#what-a-theme-pack-can-set);
what the app enforces, and why, is in the [security model](security.md).

A theme pack is a Look (colours, surfaces, data styles) plus assets plus declarations the app draws itself. **The app owns
where things go; the pack owns what they look like.** Nothing in a pack can move, resize or hide a widget, and the only code a
pack may carry is one effect script that runs in a sandbox. Every JSON and CSS snippet below is checked by the app's own pack
validator in the test suite, so what you copy from here is accepted at import.

The steps are in build order:

1. [Start from the kit](#1-start-from-the-kit)
2. [Pack layout and the two JSON files](#2-pack-layout-and-the-two-json-files)
3. [Colours and variants](#3-colours-and-variants)
4. [Type and pack CSS](#4-type-and-pack-css)
5. [Frames and ornaments](#5-frames-and-ornaments)
6. [Page layers and effects](#6-page-layers-and-effects)
7. [The motion block and its knobs](#7-the-motion-block-and-its-knobs)
8. [Effects levels, lite mode and reduced motion](#8-effects-levels-lite-mode-and-reduced-motion)
9. [Series, meter and icon colours](#9-series-meter-and-icon-colours)
10. [Changing a widget's layout](#10-changing-a-widgets-layout)
11. [The effect script](#11-the-effect-script)
12. [Signing and trust](#12-signing-and-trust)
13. [Testing your pack](#13-testing-your-pack)
14. [Limits we hit and how we solved them](#14-limits-we-hit-and-how-we-solved-them)
15. [Component treatments](#15-component-treatments)

## 1. Start from the kit

Cyberspec is after the [Cyberspec kit](https://github.com/agnelnieves/cyberspec) by Agnel Nieves, a cyberpunk HUD design
system published under the **MIT licence**. Before taking anything from a kit, read its licence and its notices:

- **Licence.** MIT lets you reuse the kit's design tokens and ideas if you keep its copyright and licence notice. The pack
  credits the kit in its `description`, and the notice ships with the app in
  [`licences/cyberspec-MIT.txt`](../licences/cyberspec-MIT.txt), which also says what was taken (colours, the cut-corner
  panel, type, micro-print, the CRT treatment) and what was not (no component or stylesheet is copied: the widgets draw
  themselves; the kit's recorded sounds, which its notices exclude, are not used). A pack you share carries the same notice in
  its folder, for example as `README.md`.
- **Fonts.** The kit uses Rajdhani and JetBrains Mono, both under the **SIL Open Font License 1.1**. A pack never loads a font
  from a font host: it carries subset `woff2` files (Cyberspec's four are about 5 KB each, Latin only) and the OFL text as
  `OFL.txt` in its root, and names each font's licence and copyright in `pack.json`. Only OFL fonts are accepted.
- **Names and art.** Use your own pack name and your own art. A pack never ships a product's logo, key art or licensed fonts.

Then read the kit for what makes it itself. For Cyberspec that was: a blue-black void, panels with one cut corner and a bright
spine, upper-case tracked labels, signal-cyan tabular readouts that glow, yellow warnings, micro-print in the margins, glitch
and decode text effects, and a faint CRT raster. Each of those maps to one of the steps below.

## 2. Pack layout and the two JSON files

A pack is a folder:

```
my-cyberspec/
  pack.json      what the app draws: fonts, page layers, effects, frame, ornaments, motion, script, the asset list
  look.json      the Look: colours, surfaces, data styles, variants
  pack.css       optional: paint for the documented parts of a card
  OFL.txt        the fonts' licence
  README.md      optional: the kit's notice and your credits
  assets/        fonts (woff2), images (svg, png, webp, avif, jpg, gif) and at most one script (.js)
```

`pack.json` starts with the gallery's facts, the modes, and the fonts:

```json pack.json
{
  "id": "my-cyberspec",
  "name": "My Cyberspec",
  "version": "1.0.0",
  "tags": ["dark", "cyberpunk", "angular", "crt"],
  "description": "Blue-black panels with a cut corner and a spine, cyan readouts that glow, under a faint CRT raster. After Cyberspec by Agnel Nieves (MIT).",
  "modes": ["dark"],
  "fonts": [
    { "family": "pack-myspec", "source": "Rajdhani", "file": "rajdhani-500.woff2", "weight": "100 500", "licence": "OFL-1.1", "copyright": "Copyright (c) 2014 Indian Type Foundry (info@indiantypefoundry.com)" },
    { "family": "pack-myspec", "source": "Rajdhani", "file": "rajdhani-600.woff2", "weight": "600 900", "licence": "OFL-1.1", "copyright": "Copyright (c) 2014 Indian Type Foundry (info@indiantypefoundry.com)" },
    { "family": "pack-myspec-mono", "source": "JetBrains Mono", "file": "jetbrains-mono-400.woff2", "weight": "100 500", "licence": "OFL-1.1", "copyright": "Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)" },
    { "family": "pack-myspec-mono", "source": "JetBrains Mono", "file": "jetbrains-mono-600.woff2", "weight": "600 900", "licence": "OFL-1.1", "copyright": "Copyright 2020 The JetBrains Mono Project Authors (https://github.com/JetBrains/JetBrainsMono)" }
  ]
}
```

- `id` is lowercase letters, digits and hyphens, and is the `id` of `look.json` too. A pack you make cannot take a built-in
  theme's id or font family name, so this one is `my-cyberspec` with `pack-myspec` families.
- Each single-weight file is registered over a weight range (`100 500`, `600 900`), so the widgets' semibold numerals use the
  600 file instead of a faked bold.
- Every file in `assets/` is listed in `pack.json`'s `assets` with its size in bytes; anything not listed is refused.
  (Cyberspec's own `pack.json` has no `assets` list: a built-in pack's files are bundled with the app. Yours needs one.)

`look.json` holds `id`, `name`, `modes` (`supported` and a one-line `stance`), `fonts` (`body`, `mono`, `display`, naming
the pack's families), `radius`, `t1` (the colours per mode), `t2` (the card surface), `t3` (the data styles) and `variants`.
Cyberspec is dark only: the kit is a display lit on a void, and a light mode would be a different design.

## 3. Colours and variants

The `t1` block takes the kit's tokens: `bg` `#07070C`, `surface` `#0E0E17`, the crimson accent `#FF3B45`, a pale `fg`, a
muted rose `muted`, and fixed status colours (`ok` `#2BF59A`, `warn` `#FFD23F`, `crit` `#FF3B45`).

The kit has six themes (Crimson, Voltage, Toxin, Ice, Ultraviolet, Monochrome), and in each the text is tinted by the accent.
A pack's **variants** are those themes: the Variant row under Quick changes (chips, or a dropdown for more than two variants). A
variant could once set only the accent, so under Toxin the labels stayed rose and the cards read as a generic dark theme. A
variant now also sets `textColor`, `mutedColor`, `ok`, `warn`, `crit`, `borderColor`, `glowColor` and `numGlowColor`, and a
colour may be **derived from the variant's accent in OKLCH**, so one rule serves every accent:

```json look.json
{
  "variants": [
    {
      "id": "crimson",
      "name": "Crimson",
      "values": {
        "accent": "#FF3B45",
        "textColor": { "from": "accent", "l": 0.94, "c": 0.03 },
        "mutedColor": { "from": "accent", "l": 0.68, "cMul": 0.5 },
        "ok": "#2BF59A",
        "warn": "#FFD23F",
        "crit": "#FF3B45"
      }
    },
    {
      "id": "toxin",
      "name": "Toxin",
      "values": {
        "accent": "#40EF7C",
        "textColor": { "from": "accent", "l": 0.94, "c": 0.03 },
        "mutedColor": { "from": "accent", "l": 0.68, "cMul": 0.5 },
        "ok": "#2BF59A",
        "warn": "#FFD23F",
        "crit": "#FF3B45"
      }
    },
    {
      "id": "monochrome",
      "name": "Monochrome",
      "values": {
        "accent": "#C6C6C6",
        "textColor": "#F2F2F2",
        "mutedColor": { "from": "accent", "l": 0.68, "cMul": 0.5 },
        "ok": "#B5B5B5",
        "warn": "#E3E3E3",
        "crit": "#DDDDDD"
      }
    }
  ]
}
```

`{"from": "accent", "l": 0.94, "c": 0.03}` keeps the accent's hue at lightness 0.94 and chroma 0.03: the kit's "ink-hi". The
fields are `l` or `lMin` (at least that light), `c`, `cMul` (a multiple of the accent's chroma) or `cMax`, and `alpha` (only on
`borderColor`, `glowColor` and `numGlowColor`). The app works the colour out when the variant is picked, so the **contrast
check** reads a real colour: a variant that sets a text or status colour is refused at import when its text is under 4.5:1 on
the pack's cards. Monochrome sets its text as a literal because a derived ink of a grey accent came out beige.

The first variant, Crimson, repeats the Look's own colours, so picking it puts the pack back after another.

## 4. Type and pack CSS

The fonts reach the widgets through `look.json`: `"fonts": {"body": "pack-myspec", "mono": "pack-myspec-mono", "display":
"pack-myspec-mono"}`. The data styles in `t3` do the rest of the type: `label-case` `upper`, `header-style` `label-bar` (the
kit's solid panel bar), segmented rings and meters, a `cell-radius` of `0px`.

What tokens cannot say goes in `pack.css`. A pack's CSS paints the documented parts of a card (`data-part` `card`, `header`,
`label`, `num`, `unit`, `ring`, `bar`, `meter`, `chip`, `status` and the others in the guide) and nothing else. For a pack you
import it is read by an **allow-list grammar**: plain `data-part` selectors, paint properties only, colours as hex, `rgb()`,
`color-mix()` of those or a `--pack-*` variable. It may not set a size, a position, a display, a font size or a font family,
and it is checked again by a render at import that refuses anything that hides or covers text. That is what lets an
unreviewed pack restyle a widget without ever breaking it.

Cyberspec's type in a pack you import:

```css user
/* Labels, titles and units: upper case and tracked, as the kit's labels. */
[data-part="label"], [data-part="header"], [data-part="unit"] { text-transform: uppercase; letter-spacing: 0.06em; }
/* Values: the kit's signal cyan, tabular figures, a soft glow in the same colour. */
[data-part="num"] { color: #5EF6FF; font-variant-numeric: tabular-nums; text-shadow: 0 0 10px #5EF6FF59; }
/* Badges: tracked a little wider. */
[data-part="chip"] { text-transform: uppercase; letter-spacing: 0.08em; }
/* A status lamp that pulses: it runs at the Full effects level only. */
@keyframes pack-lamp { 50% { opacity: 0.5; } }
[data-part="status"] { animation: pack-lamp 1.8s ease-in-out infinite; }
```

`letter-spacing` (up to `0.15em`), `text-transform` (`none` or `uppercase`) and `font-variant-numeric` are the only type
properties a pack may set; none can be animated. Animations are `@keyframes pack-*` and stop below Full (step 8).

Cyberspec, being built in, is reviewed with the app's code and its stylesheet goes a little further than the grammar allows:
a 1 px rule under the panel head, badges with a 5 px cut corner and an outline in their own colour, a 135° hatch under the
bars. Its value glow is written in `currentColor`, so a warning value glows yellow:

```css built-in
[data-part="num"] { color: #5EF6FF; text-shadow: 0 0 10px color-mix(in srgb, currentColor 35%, transparent); }
[data-part="bar"] { background-image: repeating-linear-gradient(135deg, transparent 0 5px, color-mix(in srgb, var(--w-accent) 30%, transparent) 5px 6px); }
```

## 5. Frames and ornaments

The kit's panel is a card with one cut corner and a thick accent line down its left side. The app draws that from
`pack.json`'s `frame`, so it stays inside the card and clear of the content:

```json pack.json
{
  "frame": {
    "corners": "cut",
    "size": 10,
    "which": ["br"],
    "stroke": 1,
    "spine": { "edge": "left", "width": 5 },
    "alpha": 0.55
  }
}
```

- `corners` is `square`, `cut`, `bracket` or `notch`, `size` up to 20 px, `which` the corners it applies to, `stroke` up to 2 px.
- `byCorner` gives one corner its own kind (`{"tl": "cut", "br": "notch"}`), `spine` an accent bar on one edge (1 to 6 px),
  `tab` a solid tab at a corner of the top or bottom edge (up to 64 by 8 px), `double` a second line 2 px inside.
- `alpha` (0.2 to 1) is the strength of the lines and the spine over the card: the kit's panel line is 55 % of the accent, and
  at full strength the cut read as a brighter mark than the edge it continues.

A spine, a tab or a second line is drawn only where the card's padding holds it, so it never covers text.

**Ornaments** are the kit's small marks: a reticle, a line of micro-print, tick marks. Up to four, each at a corner or along
the top or bottom edge, with a smallest card size:

```json pack.json
{
  "ornaments": [
    { "kind": "reticle", "at": "tl", "minSizeClass": "md" },
    { "kind": "micro-print", "at": "tr", "text": "CS-07 // LINK", "minSizeClass": "md" },
    { "kind": "ticks", "at": "bottom", "minSizeClass": "md" }
  ]
}
```

Ornament text is at most 64 characters and drawn by the app as plain text in a band of at most 10 px. Ornaments draw only
where the card's padding is more than 10 px, and a corner ornament keeps clear of a cut corner and of a spine on its side. The
kit's "LINK STABLE" became "CS-07 // LINK": the longer text was cut short at 150 px wide cards.

## 6. Page layers and effects

The page behind the cards is the pack's `stage`: up to three **layers** (a `fill`, or an `image` from `assets/`) and the
**effects** over everything. Cyberspec's void, its registration marks and its CRT raster:

```json pack.json
{
  "stage": {
    "layers": [
      { "fill": "#07070C" },
      { "image": "marks.svg", "minSizeClass": "sm" }
    ],
    "effects": [
      { "kind": "scanlines", "cost": "static", "opacity": 0.1, "calm": "off" },
      { "kind": "vignette", "cost": "static", "opacity": 0.15, "calm": "off" }
    ]
  },
  "burnIn": "needs-shift"
}
```

- An SVG layer is checked like every pack image: no script, no external reference. `minSizeClass` hides it on small screens.
- Effects are `grain`, `scanlines`, `vignette`, `glow`, `blur`, and the animated overlays `glitch`, `flicker`, `rgb-split` and
  `interference` (`cost` `animated`, at most two, `rate` at most 3 flashes a second). Each says what Calm draws with `calm`
  (`off` or `static`).
- The flashing overlays and a layer's glow are drawn in the **screen's accent**, so they follow the variant and an accent the
  user picks. They used to read the accent of whatever page was around the stage (amber in the studio) or a fixed cyan.
- `burnIn` is `needs-shift` because the marks are bright static art: the app drifts the layers by a pixel or two when the
  user has Pixel shift on.

Cyberspec v1 had a glitch-bar overlay on the page. The kit's glitch is a one-shot on text, not a page effect, so v2 dropped the
overlay and moved the glitch into the motion block.

## 7. The motion block and its knobs

The kit's text effects (titles that glitch in, labels that decode, readouts that scramble when they change) are declared in
`pack.json`'s `motion` block and drawn by the app's own code:

```json pack.json
{
  "motion": {
    "arrival": { "style": "clip" },
    "decode": {},
    "glitch": {},
    "scramble": { "every": 6 },
    "flicker": { "on": false, "target": "label", "every": 12 },
    "sweep": { "on": false }
  }
}
```

Each effect is an object with `on` (default true), `intensity` (0.1 to 1) and its own timing: `glitch` `ms` 80 to 300 and
`every` 0 (on arrival only) or 4 to 120 seconds; `decode` `ms` 150 to 900; `scramble` `ms` 60 to 300 and `every` 1 to 60 (the
least seconds between two scrambles of one number); `arrival` `ms` 120 to 300 and `style` `fade`, `clip` or `line`; `flicker`
`every` 2 to 120 and `target` `card` or `label`; `sweep` `ms` 400 to 3000 and `every` 4 to 120. A value out of range refuses
the pack.

The real text never changes: the noise is a copy over it that screen readers skip, so nothing changes width and privacy blur
still covers it. The page runs at most one repeat a second, three number scrambles a second and twelve texts at once.

A pack with a motion block gets a **Motion** group in the Theme view: **Level** (the screen's Effects setting), **Intensity**
and **Speed** (the pack's own values scaled within their ranges) and one switch per declared effect. An effect declared
`"on": false` is off until the user turns its switch on: Cyberspec declares flicker and sweep that way so they are offered
without being the kit's default.

## 8. Effects levels, lite mode and reduced motion

Every moving part of a pack follows the screen's **Effects** level (Screens › Performance), and the user's settings win over
the pack:

| | Full | Calm | Off | Lite mode | Reduced motion |
|---|---|---|---|---|---|
| Stage effects | all (up to two animated) | what each effect's `calm` says | none | as at Calm | as at Calm |
| Motion block | all | the one-shots: what plays as a card or a reading arrives | none | none | none |
| Pack CSS animations | run | stopped | stopped | stopped | stopped |
| Effect script | 30 frames a second | 15 frames a second, told `calm` | not run | not run | not run |

Pack CSS animations used to run at every level, so Cyberspec's lamp pulsed at Calm and Off. Now every animation a pack's CSS
names is read through a variable the page sets to `none` below Full, in lite mode and under reduced motion, and a pack may not
set it. A pack needs no switch of its own for a pulsing lamp.

Look at your pack at all three levels, and with reduced motion on (Windows: Settings › Accessibility › Visual effects ›
Animation effects off).

## 9. Series, meter and icon colours

Variants recolour the text; the `t3` block recolours the **data**, so charts, rings, meters and icons follow the variant too:

```json look.json
{
  "t3": {
    "label-color": "{accent}",
    "series-1": "{accent}",
    "series-2": "{muted}",
    "series-3": "{fg}",
    "accent-ink": "{accent}",
    "meter-ok": "{accent-ink}",
    "icon-color": "{accent}"
  }
}
```

- `label-color` colours the labels (the small names over a value), which were a fixed grey whatever the pack said.
- `series-1` to `series-6` are the series colours of widgets whose colour rows follow the theme (System Overview's CPU, GPU,
  RAM and VRAM, Network Traffic's download and upload, Steam Friends, Coding Agents). A series is held to 3:1 on the cards.
- `meter-ok` (with `meter-warn` and `meter-clip`) colours the level meters, so a pack can keep a green OK for its lamps and draw
  its meters in the accent.
- `icon-color` colours the weather icons.

Each is `{accent}`, `{fg}`, `{muted}`, `{faint}`, `{ok}`, `{warn}` or `{crit}` (the card's own colours, so a variant recolours
them), a hex colour, or an alias of another `t3` colour (`"meter-ok": "{accent-ink}"`). A colour the user sets on a widget, or
under Status & series colors, still wins.

## 10. Changing a widget's layout

Everything so far repaints the widgets as the app lays them out. Some of the kit's components are a different arrangement of the
same data: its calendar is a month navigator with notched buttons, its sensor a large readout over a signal graph, its alerts a
solid tone slab. A widget can offer such **layout variants**, and a Look names one per widget kind in `layouts`:

```json look.json
{
  "layouts": {
    "Calendar": "grid-nav",
    "DayPlanner": "board",
    "NetworkThroughput": "signal",
    "SensorValue": "readout",
    "alert": "slab",
    "island": "slab"
  }
}
```

| Kind | Layout | What it draws |
|---|---|---|
| `Calendar` | `grid-nav` | Month navigator: notched buttons that page the month, the month in the accent and the year as a number, a weekday row, six weeks with the neighbouring months dimmed and the weekend hatched, today framed with a corner flag, the next event's day (else today) as a solid slab in the numbers' colour, and a footer with `SEL 2026.11.27` beside the next event |
| `DayPlanner` | `board` | Departure board: the time now as a large readout, then the coming events one per ruled row with a lettered badge, the title and when it starts |
| `NetworkThroughput` | `signal` | Signal graph: download and upload as readouts (decimals and unit small, over a solid-and-dotted rule), both series on a dashed 0/50/100 grid with a marker on the last reading, the session totals as a mono footer |
| `SensorValue` | `readout` | Rooftop sensor: the label in the accent, the reading as a large readout, then the session's readings as a signal graph with their low, mean and high (the Value and Spark displays only; Gauge, Bar, Line and Figure keep theirs) |
| `alert` | `slab` | The kiosk's alert cards: a solid slab in the severity's tone down the left with the icon in dark ink over scan lines, the card tinted and edged in the tone, a cut corner, the title in tracked capitals with `// CAUTION` beside it |
| `island` | `slab` | The Dynamic Island: square corners with one cut, a 1 px edge in the strongest notice's tone, and an open notice as the same tone slab |

Every kind's first layout is `standard`, today's, and a kind the Look does not name draws it, so adding `layouts` changes nothing
else and an old pack is unchanged. The widget draws the layout with its own code from the data it already reads: a layout never
reads anything new, never changes the zone's size, and keeps the type floor (11 px) and the 4.5:1 text contrast. The numbers in a
layout are `num` parts, so the pack CSS that colours your readouts (section 4) colours them too, and a slab drawn in the numbers'
colour picks its ink (near black or white) from that colour. The alert and island tones are the Look's `info`, `warn` and `crit`;
a title stays in the tone only where it holds 4.5:1 on the tinted card, else it takes the pack's text colour.

The user keeps the last word: a widget that offers layouts has a **Layout** row in its inspector, where
**Theme's choice** follows your Look and any other choice keeps that layout whatever the theme says. Theme lists the layouts a pack
names under **In this theme**. The validator refuses a kind that offers no layouts and a layout the kind does not offer (rule
`layout`), so a typo is caught at import, not on the screen.

## 11. The effect script

Everything so far is data the app draws. The one thing data could not say was a per-card flourish that reacts to the cards:
brackets that lock onto a card as it arrives, a scan band down each card, a pulse round a card in warning. For that a pack may
carry **one effect script**.

```json pack.json
{
  "script": { "file": "fx.js" }
}
```

The script is an asset like any other (`assets/fx.js`, listed in `assets` with its size), a plain name ending in `.js`, at
most 64 KB of readable source. It runs in a **sandbox**: a QuickJS runtime inside a worker of its own, with the language's
built-ins and one object, `fx`. It has no `Date`, `Promise`, timers, `Math.random`, network, storage, page, settings or
files, and it draws only by handing the app a list of shapes, which the app checks and draws on a layer above the cards that
takes no clicks and that screen readers skip.

| Call | What it does |
|---|---|
| `fx.onFrame(fn)` | `fn(t)` runs once a frame; `t` is the frame's time in ms |
| `fx.draw(list)` | this frame's commands: `rect`, `arc`, `path`, `points`, `glyph` and `textbox` (a card's text box), `gradient`, `style`, `clip`, `transform`, `reset` |
| `fx.signals()` | `{ level, width, height, cards }`, updated at most 4 times a second |
| `fx.rand()`, `fx.now()` | a seeded random number, the frame's time |

Each card in `fx.signals().cards` is its box, its lead bar's or ring's value from 0 to 1 in hundredths (or `null`), its
threshold state (`ok`, `warn`, `crit` or `null`), and its texts as boxes with a letter count. **A script never sees text or an
exact reading**, and cards that blur a value for privacy, coding-agent cards and chat cards are left out and nothing is
drawn over them. Colours are **palette indices**, never CSS: 0 accent, 1 text, 2 muted, 3 ok, 4 warn, 5 crit, 6 info, 7 page,
8 card, 9 secondary text. Index 0 is the screen's accent, so a variant recolours the script with the rest of the pack.

**Richer drawing.** Beyond the four shapes the script has what the kit's showcase effects need, every one a validated, capped
command (the complete list is in the [customization guide](customization-guide.md)):

- `gradient` and a shape's `fillGrad`: a scan band that fades in behind a bright 1 px leading edge, or a radial bloom, in palette
  colours with alpha stops.
- `style`: a dash whose `phase` you move each frame (a stream along a circuit trace like the hex-stat's), round caps and joins, a
  glow of up to 12 px in a palette colour, and the composite modes `lighter` and `screen` so light adds up.
- `clip` to a card, so a band or a bloom stays inside it.
- `textbox`: highlight, underline or wipe the box of a title or number, for a reveal that follows the text without ever seeing it.
- `points`: 500 particles in one command.
- `card.event`: arrival, a value moving up or down, or a state change, once, so an effect fires on the change rather than polling.

```js fx.js
let seen = null;
const pulses = new Map();
fx.onFrame((t) => {
  const s = fx.signals();
  if (s !== seen) { // a new update: read the events once
    seen = s;
    s.cards.forEach((c, i) => c.event && c.event.state === "crit" && pulses.set(i, t));
  }
  const list = [];
  for (const [i, at] of pulses) {
    const c = s.cards[i];
    if (!c || t - at > 400) { pulses.delete(i); continue; }
    // a crit colour that fades down from the card's top edge, kept inside the card
    list.push({ op: "clip", card: i }, { op: "gradient", id: 0, x0: 0, y0: c.y, x1: 0, y1: c.y + 40, stops: [[0, 5, 0.5], [1, 5, 0]] });
    list.push({ op: "rect", x: c.x, y: c.y, w: c.w, h: 40, fillGrad: 0, alpha: 1 - (t - at) / 400 }, { op: "unclip" });
  }
  fx.draw(list);
});
```

Cyberspec's [`fx.js`](../src/looks/packs/cyberspec/assets/fx.js) does three things:

- **Brackets on arrival.** A card whose box was not in the last signals has just arrived: four corner brackets trace in round
  it over 420 ms (staggered 45 ms a card), hold, and fade. A page swipe makes the new page's cards arrive.
- **A scan band.** A soft band moves down each card every 7 s from a seeded start, its 1 px leading edge lighting the text
  boxes it crosses.
- **A pulse.** A card in `warn` or `crit` breathes an outline in the warn or crit colour, faster for crit.

The brackets, reduced to their core:

```js fx.js
const ACCENT = 0;
const TRACE = 420;
const arrived = new Map();

fx.onFrame((t) => {
  const list = [];
  for (const c of fx.signals().cards) {
    const key = `${c.x},${c.y},${c.w},${c.h}`;
    if (!arrived.has(key)) arrived.set(key, t);
    const p = Math.min(1, (t - arrived.get(key)) / TRACE);
    if (p >= 1) continue;
    const len = 12 * p;
    list.push({ op: "path", points: [c.x - 3, c.y - 3 + len, c.x - 3, c.y - 3, c.x - 3 + len, c.y - 3], close: false, stroke: ACCENT, alpha: 0.85 });
  }
  fx.draw(list);
});
```

**Calm** is `fx.signals().level === "calm"` at 15 frames a second: Cyberspec keeps the brackets (they play once, like the motion
block's one-shots), runs the band on every other card at half speed and slows the pulse. At Off, in lite mode, under reduced
motion and on a hidden page the app runs no script at all.

**Caps.** A frame has 2 ms of the script's own time: past it the frame is cut off and draws nothing, and three cut frames
within 10 s hand the screen back to the pack's declarative effects. The top level has 50 ms, the script 8 MB of memory and
2,000 commands and a cost of 3,000 a frame (a glow costs its blur in px per shape). The app shows at most three flashes a second whatever the script draws.

**What it can't do**: read or write text, see exact values, reach the network, the page, your files or other apps, set a timer,
load code, or draw outside the overlay. The pack checker measures it (step 13): Cyberspec's script spends about 0.6 ms a frame
at its 95th percentile at Full on a 20-card fixture (about 0.36 ms of that is the sandbox's own frame cost), at most 145
commands a frame, and about 0.45 ms at Calm.

A built-in pack's script ships inside the app and runs whenever the server's **Pack effect scripts** switch is on. A pack you
import runs its script only when its trust allows it (next step).

## 12. Signing and trust

Browse themes shows each imported pack's badge: **Verified by Themely** (Themely ran its checks and a person reviewed these
exact files; it does not mean the pack is safe), **Signed by ‹publisher›, not reviewed**, **Unverified** (amber), or, in red,
**Changed since it was signed** or **Withdrawn: ‹reason›**. A changed or withdrawn pack is not used. Built-in packs show
**Built-in**.

To sign your pack:

1. Make a minisign key once: `minisign -G -p acme.pub -s acme.key`, or, to try it out, `node tools/packs/sign.mjs --generate
   acme` (the secret key is then unencrypted).
2. Finish the pack, its `version` included, and sign the folder:
   `node tools/packs/sign.mjs my-cyberspec --key acme.key --password-env MINISIGN_PASSWORD`. This writes `pack.minisig`, a
   signature over every file's SHA-256: change nothing after it, and sign again with a higher `version` after any change.
3. Share the folder or a zip with `pack.minisig` in it, and your `acme.pub`. Whoever imports it adds `acme.pub` in Settings ›
   Widget publishers.

An update must be signed by the same key with a higher version. A script runs only when the pack is verified, signed by a key
whose **Allow pack scripts** is on in Settings › Widget publishers, or allowed for that pack: for an **Unverified** pack the
studio asks once (**Allow for this pack** or **Don't allow**) and asks again after an update; the kiosk never asks. **Pack
effect scripts** in Browse themes, or `PACK_SCRIPTS=off` on the server, turns every script off, built-in ones included.

## 13. Testing your pack

1. **The validator**: `node tools/validate-pack.mjs my-cyberspec` prints each problem with its rule and exits 1 on an error.
   It is the same check the import runs.
2. **The checker Themely runs**: `node tools/packs/themely-check.mjs my-cyberspec --spdx MIT` runs the validator, the script's
   static analysis (readable source, no `eval`, `Function`, `import()` or global but `fx`), a 60 s perf run of the script at Full
   and Calm in the sandbox's own runtime (95th percentile time, commands, memory, and an estimate on a CPU 4 and 6 times slower),
   and the licence checks. With `--render` (it needs `npm run build` and a debug build of the dashboard server) it also wears
   the pack at 1x1, 2x2, 4x2 and 4x4 and takes a kiosk shot at every Effects level.
3. **Import it**: Theme › Browse themes › **Import a pack**. The import report names anything refused, and a pack with
   `pack.css` goes through the render check before it is stored.
4. **The Widget QA page** (`/?widget-qa` on the dashboard server) draws every widget at a set of sizes with an overflow probe
   that marks anything cut off; the checker's `--render` step wears your pack there at 1x1, 2x2, 4x2 and 4x4, and
   `/?widget-qa&skin=cyberspec&spans=1x1,2x2,4x2,4x4` shows the built-in one. Look at the 1x1 cards most: that is where
   ornaments, spines and text run out of room.
5. **Every variant and level**: pick each variant in Quick changes, and set Effects to Full, Calm and Off, with lite mode and
   reduced motion too.

## 14. Limits we hit and how we solved them

Cyberspec was built twice. The first version used only what the format had; what it could not express became format
features, each validated and documented before the pack used it:

| Limit | Before | Format feature | After |
|---|---|---|---|
| Variants were accent only | Under Toxin the labels stayed rose and the secondary text red | Variant `textColor`, `mutedColor`, `ok`, `warn`, `crit`, `borderColor`, `glowColor`, `numGlowColor`, and the OKLCH derive from the accent | Each of the six themes tints its inks from its accent; each variant is contrast-checked |
| No tracking, case or tabular figures in pack CSS | Labels in mixed case, values jumping as digits changed | `letter-spacing` (up to 0.15em), `text-transform`, `font-variant-numeric` | Upper-case tracked labels, tabular mono values |
| One frame kind for all corners, no spine | A generic cut card | `frame` `byCorner`, `spine`, `tab`, `double` | The kit's panel: one cut corner and a 5 px spine |
| The frame drew at full accent | The cut read brighter than the edge it continues | `frame` `alpha` | Lines and spine at the kit's 55 % |
| Ornaments on 1x1 cards | The micro-print band overlapped text | Ornaments only where the padding is over 10 px, and clear of a spine | No ornaments at 1x1; nothing overlaps |
| No per-text effects | Titles and readouts static | The `motion` block | Clip arrival, decode, a glitch on arrival, scramble on change, with switches in the Theme view |
| Pack CSS animations ignored the Effects level | The lamp pulsed at Calm and Off | Pack animations read through a variable the page sets to `none` below Full | The lamp pulses at Full only |
| Labels a fixed grey | `label-color` was named but nothing read it | `label-color` reaches the labels and follows the variant | Labels in the accent ink |
| Data kept the widgets' own colours | Blue, teal and yellow sections, green meters under every variant | `series-1` to `series-6`, `meter-ok`, `icon-color` reach the widgets | Charts, meters and weather icons in the variant's colours |
| Page effects in a fixed colour | Flashing overlays in cyan, or the studio's amber | Effects and layer glows take the screen's accent | They follow the variant |
| No per-card reaction | No arrival flourish, no data pulse | The effect script, in a sandbox | Brackets, scan band and warning pulse in `fx.js` |
| Widgets laid out one way | The kit's calendar, readouts, departure board and alert slabs could only be imitated in paint | Layout variants (`layouts` in look.json), each drawn by the widget from its own data | The month navigator, readout and signal-graph sensors, the departure board, tone-slab alerts and island |

A tab that sticks out of the card, square-segmented bars, a hexagon gauge and a glow outside the card were out of reach here;
they are now format features (section 15). A numeral colour read from a variable still is: the contrast check needs a literal.

## 15. Component treatments

The kit's components (solid tone slabs, big readouts with small decimals, cell meters, hexagon gauges, signal graphs, a panel
with a wide band and a caption above it, the dot-grid screen) are drawn by the app from tokens and pack.json keys. Each is off
until a Look names it, so a pack that does not draws exactly as before. The reference is the treatments fixture,
`tests/fixtures/packs/treatments`: Cyberspec with every treatment on.

**Slabs** come from the Look's `t3`. One token per part says when the part is a slab and in which tone:

```json look.json
{
  "t3": {
    "slab-header": "accent",
    "slab-chip": "state",
    "slab-tab": "accent",
    "slab-row": "current",
    "slab-current": "warn",
    "slab-ink": "#0B0B12",
    "slab-texture": "scanlines",
    "slab-notch": 8
  }
}
```

- The parts are `header`, `chip`, `tab`, `row` and `card`. `state` draws a slab only while the part (for the header and the
  card, the card) shows a warning or a critical reading; a tone (`accent`, `info`, `ok`, `warn`, `crit`) draws one always; a
  row's `current` marks the row the widget calls current, in the `slab-current` tone. A part's own warning or critical reading
  wins over its tone.
- The ink is checked at 4.5:1 on every tone the slabs can take, in every variant, and on a scan line too. The lines are drawn
  away from the ink (light under a dark ink), so they only add contrast: under the kit's dark ink a dark line had taken the
  crimson slab to 4.1:1.
- The slab paint is the app's and not in `@layer look`, so a pack's CSS can't recolour it.

**Readouts and meters**: `readout-scale` (1 to 4) and `readout-decimals` (0.3 to 1) give the kit's `412.8` with a small `.8`;
the value is stepped down until it fits its card, so a 1x1 keeps its own size. `readout-bar: rule` adds the underline, solid to
the reading's share of its range and dotted after. `meter-style: cells` gives the 20-cell meter with triangles at the warning
and critical marks, `meter-empty` the unlit cells' colour and `meter-peak: hold` the held peak; `meter-style: ruler` the
slider's tick ruler and square thumb. `share-style: gapped` draws a stacked bar (Power Draw, Disk I/O) as gapped blocks.

**Rings, graphs and rows**: `ring-style: hex` draws every ring as a hexagon, open at the bottom, and `avatar-shape: hex` the
initials of a friends list. `graph-grid: dashed`, `graph-lead: square` and `graph-bars: striped` give the signal graph's dashed
grid with left ticks, its end square and the bar chart's stripes. `row-style: ruled` rules list rows and tints a table's head.

**The panel** is the `frame`, with the keys of section 5 and:

```json pack.json
{
  "frame": {
    "corners": "cut", "size": 18, "which": ["tr", "bl"],
    "band": { "edge": "right", "width": 28 },
    "tint": 0.05,
    "grid": { "size": 22, "alpha": 0.22 },
    "tone": "state",
    "rule": true,
    "glow": { "radius": 10, "alpha": 0.3 },
    "caption": { "text": "MB-RX // REV 3 // NODE 3F:A2", "at": "tl" },
    "tab": { "at": "tl", "width": 56, "height": 6, "out": true }
  }
}
```

The band can't share an edge with the spine, so beside Cyberspec's left spine it goes on the right (the treatments fixture has no
spine and puts it on the left). It is drawn at most as wide as the card's padding. The glow, the caption and an outside tab are drawn in a layer beside the
card, the card's own size, so no card moves; the caption is 11 px micro-print above the card and needs a gap of 14 px or more
above it. `tone: state` turns the lines crimson or yellow while the card shows a critical or warning reading.

**The screen** is the `stage`: `grid` puts the kit's dot grid behind the cards, `chrome` the framed screen with its cut corners,
the notched tab with its text at the top centre and the corner reticles:

```json pack.json
{
  "stage": {
    "grid": { "size": 22, "alpha": 0.2 },
    "chrome": { "cut": 48, "alpha": 0.55, "tab": { "width": 260, "height": 28, "text": "CYBERSPEC // DECK 07" }, "reticles": true }
  }
}
```

What these can't do yet: a meter's cells take the height the widget gives its bar (the kit's chunkier cells need the widget's
room), the overflow check does not see the caption or an outside tab (they are drawn in pseudo-elements beside the card), and the
glow is a rectangle round a cut corner.
