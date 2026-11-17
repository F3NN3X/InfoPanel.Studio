# Security model and review

How the desktop app and the dashboard server are protected, the review done for 1.3.0-beta.10 against Microsoft's
[WebView2 security guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security) and Tauri 2's
security model, what was fixed, what was decided, and what is deferred.

## Trust model

- **This computer** is trusted: the Studio window, the Settings window and anything on loopback.
- **The local network** (only when Settings › Server › listen is "local network"):
  - can **read** the dashboard (kiosks, config, sensors) and use **control** (`/api/control/*`: Stream Deck, kiosk
    page switching);
  - can **write** config and integrations, upload media, and edit the library and canvases **only when "Allow editing
    from other devices" is on** (off by default; the desktop sets `ALLOW_REMOTE_EDIT=1` and `ALLOW_REMOTE_UPLOAD=1`).
    Off, those writes get a JSON 403 and a Studio opened on another device shows a read-only banner.
  - The guards (Host allow-list, Origin/`Sec-Fetch-Site` checks, custom headers, JSON content type) stop a web page in
    someone's browser from writing (CSRF, DNS rebinding). They are **not authentication**: with editing allowed, any
    program on the LAN can write.
- **The studio in a browser** (Settings › General › Open the studio in: Microsoft Edge or the default browser) is an
  ordinary page on the server's origin: it has no IPC, and other tabs and sites in that browser are other origins. The
  request guard refuses their writes (a no-cors fetch, a CORS fetch with the write headers, a form post); the e2e spec
  `cross-origin-writes.spec.ts` tries each.
- **Web pages loaded inside widgets** (Web Page frames, images, fonts) are untrusted and never get IPC.
- Same-user local software is out of scope (it can already read and write the data folder).

## Desktop shell (Tauri 2)

- **Capabilities.** App pages (`tauri.localhost`) use `src-tauri/capabilities/default.json`. The Studio and Settings
  windows load the server origin (`http://127.0.0.1:<port>`) and get runtime capabilities per window label and origin
  (`control.rs`): the Studio 13 app commands, Settings its own set (`SETTINGS_PERMISSIONS`). Tests assert dangerous
  commands stay out of the Studio set. The origin is always loopback, even in LAN mode, so LAN pages never reach IPC.
- **Navigation.** `nav::is_allowed_nav` allows only app pages, `about:blank`, same-origin http outside `/api/*` and
  same-origin `blob:`. New windows are denied; http/https/mailto links open in the system browser (rate-limited).
- **Links.** The opener plugin's injected link handler is off (`open_js_links_on_click(false)`); `target=_blank`
  links go through `on_new_window`. (Before beta.10 they failed with "plugin:opener|open_url not allowed by ACL".)
- **Devtools.** The `devtools` feature ships (debug mode needs it), but `open_devtools` refuses unless debug mode is
  on, and the Diagnostics button shows only then.
- **CSP for app pages** (`tauri.conf.json`): `default-src 'self'`, `object-src 'none'`, `base-uri 'none'`,
  `frame-ancestors 'none'`, IPC in `connect-src`; only `style-src 'unsafe-inline'` is soft.
- **Updater.** Signed (minisign) over HTTPS GitHub URLs; CI fails without the signing secret.
- **Browser arguments.** wry's defaults, plus a remote-debugging port only in debug builds, with
  `INFOPANEL_STUDIO_CDP_PORT`. No `--disable-web-security`, host objects or initialization scripts.

## Server

- **Security headers** (`crates/ips-server/src/security_headers.rs`):
  - HTML: a CSP with `script-src 'self'` (no inline script; the build emits none), `object-src 'none'`,
    `base-uri 'none'`, `connect-src` allowing http/ws (the Data API may be on another port or host, and Tauri IPC is
    `http://ipc.localhost`), `frame-src` http/https (Web Page widget), `style-src 'unsafe-inline'` (React style props).
  - `frame-ancestors 'self'` only for `?studio` and `?settings`: the Studio and Settings can't be framed by other
    sites; kiosk pages stay embeddable (e.g. a Home Assistant panel).
  - `X-Content-Type-Options: nosniff` everywhere; `Referrer-Policy: strict-origin-when-cross-origin` on HTML
    (YouTube embeds refuse to play without a referrer) and `no-referrer` elsewhere.
- **Remote edits** (`remoteEditRefusal` in `crates/ips-server/src/request_guard.rs`): `POST /api/config`, `PATCH
  /api/config/settings`, `PUT /api/integrations` from non-loopback peers need `ALLOW_REMOTE_EDIT=1`. Assets, library
  and canvases already needed `ALLOW_REMOTE_UPLOAD=1`. Agent posts, stats, installed-profile routes and the studio
  preferences (`GET`/`PUT /api/studio-prefs`, whose write also takes the config write headers) are loopback-only.
- **Image proxy** (`crates/ips-server/src/proxy.rs`): images only, SVG refused, `nosniff`, manual redirects with a hop limit, and
  since beta.10 it connects through the calendar's guarded lookup (`crates/ips-server/src/calendar.rs`, with `blockLan`), so
  private, link-local, loopback and metadata addresses are refused on the first URL and every redirect, including IP
  literals and IPv4-mapped IPv6. It sends `user-agent: InfoPanel-Studio`.
- **Calendar and font proxies**: connect-time address pinning and size caps; the font proxy is pinned to Font
  Squirrel and its https font hosts.
- **Weather by place** (`crates/ips-server/src/weather.rs`): the server, never a page, asks Open-Meteo for the places
  recipe widgets show, through the guarded client pinned to `api.open-meteo.com` and `geocoding-api.open-meteo.com` (an
  exact host list, then the address guard with `blockLan`). Only places stored placements reference are fetched, at most
  every 15 minutes, under one cap of 300 provider calls an hour; place search (`GET /api/weather/places`) is this machine's
  unless `ALLOW_REMOTE_EDIT=1`, 20 a minute. No key, no account, nothing about the user but the place.
  `WEATHER=off` turns it off.
- **Widget packages** (`crates/ips-server/src/widgets.rs`): recipe and code widgets a user imports are stored under
  `DATA_DIR/widgets/`, one folder per package, and served and nothing more: a key and a file name are matched against strict
  patterns before a path is built, a file must stay inside its folder (links are never followed), and a folder whose files are
  not exactly the manifest's, byte for byte, is not a package. Limits: 512 KB a package, 256 KB a file, 32 files, 64 packages.
  Files are served typed by extension, `nosniff` and with a CSP that allows nothing. Writes (import, remove, the code-widget
  switches) need the `X-Dashboard-Widget: 1` header and come from this computer unless `ALLOW_REMOTE_UPLOAD=1`.
  `USER_WIDGETS=off` turns the whole store off. A recipe holds no code; the studio's validator checks it on import and the
  kiosk checks it again on every load. A code widget needs a signature (below).
- **The program in front** (`crates/ips-server/src/foreground.rs`, profile auto-switch): on Windows the server reads the
  foreground window's program once a second (`GetForegroundWindow`, then `QueryFullProcessImageNameW` with limited query
  rights), only while a profile has `autoSwitch` rules, and never its own windows. It keeps the file name only, never the
  path or the window title, and publishes it in the control state (`front`, read by every kiosk the server serves) only
  while a rule exists. No route accepts it from outside; `POST /api/control/auto` (pause, resume or lock) is a control
  write with its usual guards.
- **Uploads**: per-type limits, magic-byte checks, a quota, two in flight; SVG assets are served with a sandbox CSP.
- **SVG sanitising** (`crates/ips-server/src/svg_sanitize.rs`): every SVG the asset store keeps is sanitised before it is
  stored, so a copy that leaves the server (a profile file's images, a Library export) carries nothing that runs or reaches
  out when it is opened elsewhere. Dropped with everything inside them: `script`, `foreignObject`, `iframe`, `object`,
  `embed`, `audio`, `video`, `canvas`, `handler`, `listener`, any element in another namespace (a prefix, or an `xmlns` other
  than SVG's) and an animation of a link. Dropped attributes: event handlers, `xml:base`, and a link that is not `#…` or an
  embedded PNG, JPEG, GIF or WebP. CSS is checked, never cut (cutting could stitch the text around a removed piece into a
  new one): an attribute value or a `<style>` with `@import`, a `url(…)` that leaves the file, another loading function
  (`image-set(`, `src(`, `element(`, …) or a CSS escape is dropped whole. A `<style>`'s text and CDATA are joined and
  checked once, as the browser joins them, and a `<style>` holding a comment or an element is refused, so no CSS can be
  split across parts to get past the check. Character references are decoded
  before these checks, as the parser reads them, at any length; one that can't be resolved refuses the file. The DOCTYPE
  is read in the prologue only and goes after its plain internal entities are written in (Illustrator declares its
  namespaces that way), each write measured first so the text never passes 256 KB; an external, parameter or markup
  entity is refused. Processing instructions other than the XML
  declaration go. What can't be read is refused (415), never stored as it came. A clean file comes back byte for byte, so its
  id never changes. It is still drawn only through `<img>` and served under the sandbox CSP: sanitising is the second line.
  User packs keep their stricter allow-list (`src/looks/pack-safety.ts`), which refuses an unsafe SVG rather than cleaning it.
- **App icons** (`POST /api/assets/app-icon`, `crates/ips-server/src/app_icon.rs`): a rail item's icon read from a
  program's `.exe` and stored as a PNG asset. The studio names the program by its file name only (`Chat.exe`: letters,
  digits and a few punctuation marks, no separator, drive or `%`); the server looks for it among the programs running now,
  the App Paths Windows keeps for installed programs, and the PATH folders, and reads only a file on a local drive, so a
  name can never make it open a network share (no outbound SMB). Windows draws the icon (`PrivateExtractIconsW`), and the
  server keeps the pixels as a 96 px PNG; no code from the program runs. The route is answered for this machine only,
  whatever `ALLOW_REMOTE_UPLOAD` says, since it tells which programs are installed; it needs `X-Dashboard-Asset: 1` and
  JSON, and a cross-site request is refused before it (the request guard). A program's icon is read once per run, then
  answered from a cache. Off Windows the route answers 501.
- **Profile files with images**: an exported screen carries the images it names as base64, within the import's 5 MB. On
  import each goes through the upload route above (magic bytes checked, an SVG sanitised) before the screen points at it;
  an entry whose id, type or data does not have the expected shape is dropped unread.
- **Path safety**: static and asset paths reject `..` and dot segments with prefix checks.

## Widget publisher keys

Code widgets (`ext:<publisher>.<id>`) are taken only with a publisher signature: minisign (Ed25519, pre-hashed) over a
canonical form of the package's manifest, which lists every file's SHA-256 (`crates/ips-server/src/widget_sign.rs`). The
server checks it on import and on every read; a package that does not verify is not stored, or not served. This is not the
pack signature (`pack_sign.rs`), a local check only the server can make.

- **Trusted keys** (`crates/ips-server/src/widget_keys.rs`): the owner's key, built into the app; Themely's, a slot that
  stays off until Themely signs packages; and keys the user adds in the desktop app's **Settings › Widget publishers**. A
  user key is added only there, through the app's own commands (the Settings window's capability, the same gate as every
  Settings write); never from an import or install prompt, and never over HTTP (`/api/widget-keys` is read-only).
- **Publishers**: a key signs code widgets only for its publisher names. The owner's key holds `infopanel` and
  `infopanel-studio`, Themely's `themely`; a user key holds the names given when it is added, none reserved and none
  another key holds. An import never replaces a signed package unless the same key signed it.
- **Revoke list** (`crates/ips-server/src/widget-keys-revoked.json`): ships with app updates only, never fetched. A key on it
  (matched by its key bytes as well as its id) refuses everything it signed.
- **Off switch**: `USER_CODE_WIDGETS=off` hides and refuses every code widget that is not built in (`USER_WIDGETS=off`
  every user widget). The Widgets page's "Third-party code widgets" and "Turn this widget off" are the server's too
  (`DATA_DIR/widgets/.code.json`, `PUT /api/widgets/code` under the import's guards), so every page that asks this server obeys
  them, kiosks on other devices included.
- **Loading** (`src/widgets/code/loader.ts`): the studio and the kiosk import `widget.js` same-origin, and only when the list
  says it verifies with a trusted key and is not off. The import asks for the bundle by the SHA-256 its verified manifest lists,
  and the server serves it only while it is those bytes and still verifies, so a file changed on disk never runs under a URL the
  page already holds. A widget on screen is asked again every 30 s and drops its code when it no longer verifies. It then runs
  in the page with the same access as a built-in widget (owner decision): sensors, screens, settings and the network. What the
  bundle returns is checked before it is registered, and a widget that throws while it draws is contained in its zone. How to
  write and sign one: [code-widgets.md](code-widgets.md).

### The owner's key (one-time owner step)

The owner key is its own minisign key, never the updater's: a leak of one must not compromise the other. It is set: the
public key is built into the app and its secret half lives only on the owner's machine. A build with the slot left empty
shows "Not set up" and trusts nothing. To make a new one (to replace it), on the owner's machine, outside the repo:

```
minisign -G -p infopanel-widgets.pub -s infopanel-widgets.key
```

Keep `infopanel-widgets.key` and its password offline (never in the repo, CI or an agent session). Put the second line of
`infopanel-widgets.pub` into `OWNER_KEY` in `crates/ips-server/src/widget_keys.rs` (`Some("RW...")`), and sign a package
with `node tools/widgets/sign.mjs <package-folder> --key infopanel-widgets.key --password-env MINISIGN_PASSWORD`.

## Review findings (2026-10-22) and what happened

| Severity | Finding | Outcome |
|---|---|---|
| Medium | Opener plugin link handler denied by ACL (links did nothing) | Fixed: handler off, `on_new_window` opens links |
| Medium | No CSP / framing / nosniff headers on server HTML, where the Studio has IPC | Fixed: `security_headers.rs` |
| Medium | Config, settings and integrations writable from any LAN device | Fixed: opt-in "Allow editing from other devices", off by default (decision) |
| Medium | Image proxy could reach LAN, loopback and metadata addresses (SSRF) | Fixed: guarded lookup with `blockLan` |
| Low | Integrations PUT from LAN could repoint OBS host/password | Fixed by the remote-edit opt-in |
| Low | `open_devtools` ungated in release | Fixed: debug mode only |
| Low | Runtime capabilities for an old origin are never removed after a port change | Deferred: Tauri 2.12 has no remove API; the nav guard stops windows loading the old origin (comment at `add_studio_capability`) |
| Low | The app adopts any process answering `/api/health` (same-user only) | Accepted: same-user malware is already equivalent. Option: a per-launch nonce |
| Low | Updater signing key has no passphrase | Decided: skip. The passphrase would sit in GitHub secrets next to the key. Rotating the key would break updates for installed copies; adding a passphrase means re-encrypting the same key locally (`minisign -C`-style) and updating both secrets |
| Info | `withGlobalTauri: true` exposes `window.__TAURI__` on server-origin pages (the ACL still gates commands) | Open: set false if nothing uses it |
| Info | `freezePrototype` unset | Open: try it, it may break libraries |
| Info | Installer not Authenticode-signed (updates are minisign-signed) | Open: sign when a certificate is available |
| Info | OBS password and calendar links stored in plaintext in `integrations.json` | Accepted, documented |
| Info | Loopback checks use the socket address; a same-host reverse proxy would make every client look local | Documented: don't put a reverse proxy in front without `ALLOWED_HOSTS` and auth |
| Info | `msSmartScreenProtection` is disabled by wry's default args (affects Web Page frames) | Open: would need the same args for every webview |

## Not verified

- The desktop app's IPC under the new server CSP, and a Web Page widget under it (both reasoned from the policy).
- A real write from another LAN device (unit tests cover `remoteEditRefusal`; route tests bind 127.0.0.1).
- The proxy's connect-time pinning against a real public host.
