# Sample corpus — 14 InfoPanel exports

Source: `G:\win_user-folders\Downloads\infopanel-profiles\*.infopanel`, surveyed 2026-10-16 with Python's zipfile and
ElementTree. Font packs in the same folder: `JetBrains_Mono,Nunito_Sans,Roboto.zip`, `Nunito_Sans,Roboto.zip`.

## Profiles

| Profile | Size | Font | Items* | Sensors (HwInfo/Libre/Plugin) | Assets |
|---|---|---|---|---|---|
| 480x1920 | 480x1920 | Roboto | 50 | 18/10/3 | 1 png |
| ARCRAIDERS | 600x1024 | Barlow | 84 | 0/34/34 | 193 png |
| ARCv2 | 600x1024 | Barlow, Roboto Mono | 92 | 0/41/32 | 190 png |
| ARCv2_WIDE | 1920x550 | Barlow, Roboto Mono | 112 | 0/41/43 | 194 png |
| Catppuccin_Mocha | 1920x1280 | Nunito Sans, JetBrains Mono, Segoe UI Symbol | 87 | 19/0/20 | none |
| Dashboard | 1920x480 | Arial | 121 | 0/50/15 | 1 png |
| InfoSpot | 600x1024 | Spotify Mix (+ Extrabold, Medium as families) | 72 | 0/47/22 | 1 jpg |
| MARATHON | 600x1024 | PP Fraktion Mono, Marathon Shapiro Wide 65 | 55 | 0/27/17 | 1 png |
| Noctua_Cyan_Gold | 1280x480 | Orbitron | 26 | 4/11/4 | 1 jpg |
| Starfield | 600x1024 | NB Architekt Std | 13 | 7/2/0 | 19 png, 3 gif |
| Terminal | 600x1024 | Inconsolata | 72 | 2/41/20 | 1 png |
| Umbrella | 515x1920 | Arial | 49 | 0/13/9 | gif, webp, **mp4**, jpg, png |
| Umbrella_V.2 | 515x1920 | Nirmala UI, ANIME VISION | 58 | 0/13/14 | gif, webp, jpg, png |
| [Import]_TheForeverWinter | 600x1023 | VCR OSD Mono, Tahoma | 53 | 2/44/0 | 17 png |

\* Items excludes gauge frames.

## Findings beyond the source research

- **Every type occurs.** Donut appears 22 times (480x1920, Dashboard) and SensorImage 25 times (InfoSpot, Starfield,
  Terminal).
- **HwInfo bindings occur in 6 profiles.** HWiNFO was not running here; `/api/sensors` had no `hwinfo.*` keys.
- **FontScale is 1.33 in all 14 profiles,** but it is a profile field, so it must be honoured per profile.
- **Fonts:**
  - 18 families. Most are not system fonts (Spotify Mix, PP Fraktion Mono, NB Architekt Std, VCR OSD Mono, ANIME
    VISION, Orbitron and others).
  - Some files name a weight as the family ("Spotify Mix Extrabold").
  - FontStyle values seen: Regular, Bold, Medium, Light, Semilight, SemiBold, Normal.
- **Profile background:** BackgroundColor can be transparent (`#00FFFFFF`) or 6-digit (`#000080`).
- **Fields outside the current source:** `AutoScale`, `SeparateUnitWithSpace` (Sensor), `RefreshInterval`
  (HttpImage), and `Threshold`/`ThresholdColor` on Bar. They appear in 480x1920 and Noctua_Cyan_Gold, so different
  InfoPanel versions write different schemas. The parser must keep unknown fields and report them.
- **Asset entries** use `/` in every archive; no backslash was seen.
- **Media:** gif and webp (Umbrella, Starfield) and mp4 (Umbrella). The dashboard asset store takes all of these;
  SVG did not occur.
- **Usage by feature:**

  | Feature | Items | Notes |
  |---|---|---|
  | text Width>0 | 259 | |
  | Wrap=false (multi-line) | 71 | |
  | thresholds | 45 | |
  | rotation | 29 | |
  | hidden | 28 | |
  | AutoValue | 20 | |
  | FlipX | 20 | |
  | marquee | 18 | |
  | uppercase | 11 | |
  | ShowName | 10 | |
  | bar gradient | 9 | |
  | animated shape gradient | 3 | Dashboard; types Linear, Spiral, Radial |
  | ValueType MAX | 1 | |
  | glow | 0 | |
  | image layer | 0 | |
  | gauge animation | 0 | |
  | HISTOGRAM graph | 0 | |

- **Clock and calendar formats seen:** `HH:mm:ss`, `HH:mm`, `H:mm`, `h:mm tt`, `hh:mm:ss tt`, `:ss`, `dddd`,
  `dd.MM.yyyy`, `dd/MM/yyyy`, `MM/dd/yyyy`, `dd-MMM-yy`, `d MMMM yyyy`.

## Data API (InfoPanel fork, `InfoPanel/Services/DataApi/SensorSnapshotBuilder.cs`)

- **Plugin keys are exact:** `"plugins." + id.TrimStart('/').Replace('/', '.')` (line 113).
- **Libre and HWiNFO keys are lossy.** They are built from name slugs with collision suffixes (lines 316-356 and
  427-450). `DataApiValue` (`DataApiModels.cs:6`) carries no native id.
