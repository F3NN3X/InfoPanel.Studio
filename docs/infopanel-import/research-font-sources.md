# Missing fonts: free sources, download and install

Researched and prototyped 2026-10-16 in the lab (`lab/infopanel/src/font-sources.ts`, `scripts/font-get.mjs`, the
Fonts panel). Input for the import plan (P0.8).

## Why it matters

An imported profile names fonts by family and style. If the font is not installed where InfoPanel runs, InfoPanel
falls back (to Segoe UI when a FontStyle is set, else to a similar family or Arial). The dashboard needs the font
file too, served through `@font-face`, whatever the kiosk device has installed. Here Nunito Sans (Catppuccin_Mocha)
and ANIME VISION (Umbrella_V.2) are missing, so both profiles already render in Segoe UI in InfoPanel.

## Sources

| Source | API | Coverage | Licenses | Download | CORS |
|---|---|---|---|---|---|
| Fontsource | `api.fontsource.org/v1/fonts` (full list, ~540 KB), `/v1/fonts/{id}` | 2,103 families: 1,984 Google, 119 other | all open (OFL 2,059, Apache 36, UFL 5, CC0, MIT, Unlicense) | per weight/style/subset TTF, WOFF, WOFF2 on `cdn.jsdelivr.net` | yes |
| Google Fonts | `fonts.google.com/download/list?family=` (JSON behind a `)]}'` guard) | Google families | OFL/Apache/UFL, license text in the manifest | complete family files (variable fonts) on `fonts.gstatic.com` | manifest no, files yes |
| Font Squirrel | `fontsquirrel.com/api/fontlist/all`, `/api/familyinfo/{name}` | ~1,036 families | "free for commercial use", varies per family | zip at `/fonts/download/{name}` | yes |

- **Search:** match the requested name against the Fontsource and Font Squirrel lists locally. Order: exact, then
  with style words removed ("Adwaita Mono Bold" → "Adwaita Mono"), then a prefix match. Google wins a tie.
- **Install files:** for Google families use Google's manifest. It gives the complete, unsubsetted family. Fontsource
  TTFs are split per script subset, so they suit web previews better than an OS install.
- **Font Squirrel throttles automated clients.** It answered 200 at first, then `202` with an empty body for
  every client (curl included). Treat it as best effort and report when it is unavailable.
- **No free API covers commercial or personal-use fonts** (Spotify Mix, PP Fraktion Mono, NB Architekt, Marathon
  Shapiro, ANIME VISION, VCR OSD Mono from DaFont-style sites). Scraping those sites is out: their licenses
  forbid redistribution or vary per font. The import has to ask the user for the file.

## Corpus results

| Family | Installed here | Free source |
|---|---|---|
| Nunito Sans | no | Google (OFL) |
| ANIME VISION - MB_EN REGULAR | no | none |
| Orbitron, Barlow, Roboto, Roboto Mono, JetBrains Mono, Inconsolata | yes | Google (OFL) |
| Spotify Mix, PP Fraktion Mono, NB Architekt Std, Marathon Shapiro, VCR OSD Mono | yes | none (commercial or personal use) |

## Installing on Windows

- **Per user, no admin rights needed:**
  1. Copy the files to `%LOCALAPPDATA%\Microsoft\Windows\Fonts`.
  2. Add an `HKCU\Software\Microsoft\Windows NT\CurrentVersion\Fonts` value `"{full name} (TrueType|OpenType)"` =
     the file's path.
  3. Broadcast `WM_FONTCHANGE`.
- **Uninstall** removes exactly what was added, which the lab records in `fonts/installed.json`.
- **InfoPanel must restart** to pick up a new font. Skia's font manager and InfoPanel's typeface cache keep their
  font lists for the life of the process.
- **Variable fonts:** Google ships variable files. DirectWrite lists their named instances as styles ("Bold",
  "SemiBold"…), so InfoPanel's FontStyle lookup works by instance name.
- **Not verified on this machine:** `--install` has not been run here. It would change how InfoPanel draws the
  Catppuccin profile, so it waits for the user's go-ahead.

## Where it belongs in the product (for P0.8)

- **Search and preview: the browser.** Fontsource sends CORS headers, so the studio can search it directly.
- **Download for the dashboard: the server.** `server.mjs` stores the files in the asset store for `@font-face`.
  Google's manifest has no CORS headers, so this has to run server side.
- **Install for InfoPanel: the desktop app.** It runs on the InfoPanel machine (Tauri, Rust) and can do the
  per-user install and prompt for an InfoPanel restart. A browser-only setup can only offer the download.
- **Safety, as in the lab:**
  - HTTPS to a host allowlist only.
  - Size limits on every file.
  - Every file must parse as a font.
  - File names lose any path.
  - Only standard open licenses download without a warning.
  - The license text is kept next to the files.
