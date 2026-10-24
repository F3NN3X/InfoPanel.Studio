# Security model and review

How the desktop app and the dashboard server are protected, the review done for 1.3.0-beta.10 against Microsoft's
[WebView2 security guidance](https://learn.microsoft.com/en-us/microsoft-edge/webview2/concepts/security) and Tauri 2's
security model, what was fixed, what was decided, and what is deferred. Performance work from the same release is in
[desktop/webview-performance.md](desktop/webview-performance.md).

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
- **Uploads**: per-type limits, magic-byte checks, a quota, two in flight; SVG assets are served with a sandbox CSP.
- **Path safety**: static and asset paths reject `..` and dot segments with prefix checks.

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
