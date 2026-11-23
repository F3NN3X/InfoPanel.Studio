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
  (`control.rs`): the Studio the app commands it calls (`STUDIO_PERMISSIONS`), Settings its own set (`SETTINGS_PERMISSIONS`).
  Tests assert dangerous commands stay out of the Studio set. Of touch, the Studio only reads the panels' state and the
  touchscreens (`touch_view`, `touch_screens`) for Screens' display cards; setting up, pairing, calibrating and the driver
  stay in the Settings window. The origin is always loopback, even in LAN mode, so LAN pages never reach IPC.
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
- **Ping** (`crates/ips-server/src/ping.rs`): the server connects to the host and port that stored Ping widgets name in
  their own settings, and to nothing else: no request carries a host (`/events/ping` only streams readings), so no page can make
  the server try one and nothing is scanned. A host must be a plain name or an address (no scheme, path, port or credentials in
  it). A probe is a TCP connect that is closed at once, sending and reading nothing, so it carries no data either way; an address
  on this computer or the LAN is allowed because the person typed it. At most 8 hosts, each once per 2 to 60 seconds (5 by
  default), 240 probes a minute in all, 2 seconds to answer. `PING=off` turns it off.
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
- **User pack CSS** (`src/looks/user-css.ts`, `crates/ips-server/src/packs.rs`): read by an allow-list grammar on every load,
  checked by a render check at import and signed by the server only after it. It paints the documented `data-part` slots
  and never moves, sizes or hides a real element: shapes (`clip-path` of `inset()`/`polygon()`, gradient and pack-file masks,
  radii, `border-image`), a border style and colour with no width, `--pack-*` lengths held to the cap of every property that
  reads them, and `::before`/`::after` decoration, whose box the app pins as `position: absolute` with `pointer-events: none`
  and must stay inside its element. The render check refuses a clip, mask or pseudo-element that hides or covers text (a
  pack-file mask is decoded and its alpha sampled over each text box; one that cannot be loaded or read is refused), and any
  border whose width differs from the page without the pack's CSS. A `url()` may name
  only one of the pack's own files (no scheme, root path, `..`, backslash, query or fragment, also after percent-decoding);
  the app rewrites it to the pack's route, `/api/packs/<id>/<file>`, which serves it under the sandbox CSP. The server
  refuses to sign CSS holding a backslash, `<`, an at-rule other than `@keyframes`, `image-set(`, `src(` or a `url()` that
  leaves the pack. `letter-spacing` (up to 0.15em), `text-transform` (`none` or `uppercase`) and `font-variant-numeric` are
  the only type properties it allows; none can be animated or transitioned, and a pack cannot set a font size. Every
  animation a pack's CSS runs (built-in or user) is mounted reading its names through `--wp-pack-motion`, a variable no pack
  may set: the page root sets it to `none` at the Effects levels Calm and Off, in lite mode and under reduced motion.
- **Variant colours** (`src/looks/look.ts`, `src/looks/pack-validate.ts`): a variant in look.json sets colours as data. A colour
  derived from the accent is a few bounded numbers the app turns into `#rrggbb` itself; no pack-supplied code or CSS runs, and
  the contrast check reads the result.
- **Pack frames, ornaments and effects** (`src/looks/pack-validate.ts`, `src/looks/pack-frame.tsx`, `src/looks/effects.ts`):
  declarations in pack.json that the app draws with its own code; a pack supplies no markup or style for them. A frame's
  corners are at most 20 px and its stroke 2 px, in the Look's accent (at an `alpha` of 0.2 to 1); its spine is at most 6 px thick, its tab 64 by 8 px, its
  second line a fixed 2 px gap, all numbers in pack.json and drawn only where the card's padding keeps them off the content. Ornament text is at most 64 characters, passes the same
  injection scan as every pack.json string, and is drawn as a text node in a band of at most 10 px that takes no clicks. The
  render check treats these elements as app chrome. The animated kinds are overlays that never filter, move or clip a widget;
  the validator and the loader both refuse more than 3 flashes a second or more than two animated effects. `oklch()` colours
  are converted to sRGB, clamped to the gamut and written as the hex that the contrast checks read.
  The server signs a pack's stylesheet only: a pack with no `pack.css` carries no signature, since its pack.json and look.json
  are validated again every time it loads.
- **Pack motion** (`src/looks/motion.ts`, `motion-render.tsx`, `motion-runtime.ts`): a pack.json `motion` block names effects
  from a fixed list with numbers; the validator and the loader refuse an unknown effect or key and any value out of its range
  (one-shots at most 300 ms, a decode 900 ms, repeats at least 2 s apart), for user packs as for built-in ones. The app draws
  them with its own keyframes and one timer: no pack code, markup, style or URL. Text is never replaced: the noise is an
  aria-hidden copy over the real text, which stays in the page for assistive technology, privacy blur and export. The page
  runs at most one repeat a second; nothing runs while the page is hidden, at the Effects level Off, in lite mode or under
  reduced motion.
- **App icons** (`POST /api/assets/app-icon`, `crates/ips-server/src/app_icon.rs`): a rail item's icon read from a
  program's `.exe` and stored as a PNG asset. The studio names the program by its file name only (`Chat.exe`: letters,
  digits and a few punctuation marks, no separator, drive or `%`); the server looks for it among the programs running now,
  the App Paths Windows keeps for installed programs, and the PATH folders, and reads only a file on a local drive, so a
  name can never make it open a network share (no outbound SMB). Windows draws the icon (`PrivateExtractIconsW`), and the
  server keeps the pixels as a 96 px PNG; no code from the program runs. The route is answered for this machine only,
  whatever `ALLOW_REMOTE_UPLOAD` says, since it tells which programs are installed; it needs `X-Dashboard-Asset: 1` and
  JSON, and a cross-site request is refused before it (the request guard). A program's icon is read once per run, then
  answered from a cache. Off Windows the route answers 501.
- **Media keys and touch actions** (`POST /api/media/act`, `crates/ips-server/src/media.rs`): a widget's or rail item's
  touch action may press play/pause, next or previous on the PC (`SendInput` of the three media keys; no other key can be
  named, and nothing is read back). Like the audio and OBS writes it needs `X-Dashboard-Control: 1` and JSON, a cross-site
  request is refused first, and another machine is refused unless `ALLOW_REMOTE_EDIT=1`. Touch actions run only routes
  that already exist with these guards (pages and the page lock through the control channel, audio, OBS scenes and mic,
  media keys), and the two below, each behind its own switch. Off Windows the route answers 503.
- **Running a command** (`POST /api/actions/run`, `crates/ips-server/src/actions.rs`): a key or a touch action `{ "op": "run",
  "command": "…" }` asks the server to start a program on this PC. Every layer has to agree before anything starts, checked in
  this order:
  - the runner is off unless `ACTION_RUNNER=on` (the desktop app sets it from **Settings › Actions › Run commands from the
    panel**), read when the server starts. While it is off a run answers 403 `off`;
  - the request comes from this machine unless `ALLOW_REMOTE_EDIT=1`, and it carries `X-Dashboard-Control: 1` and JSON, so a
    cross-site page or another device can't post one (403 `remote`);
  - the command is approved word for word. Approvals live in `DATA_DIR/actions.json`, never in the config or a profile
    file, and only this machine can give or remove one (`PUT /api/actions`), whatever `ALLOW_REMOTE_EDIT` says. A config
    written from another device, or a screen imported from a file, can name a command but never approve it; the studio lists
    an import's commands for review, and **Settings › Actions** lists every command the screens name (403 `unapproved`);
  - the command is at most 2 048 bytes and cuts into a program (400);
  - test mode (**Settings › Actions › Test mode**, kept in `actions.json`) or `"dry": true` stops here: the server answers
    with the program and arguments it would start and starts nothing. The studio's **Test** button is a dry run.
  - **No shell.** The command is cut into a program and its arguments: spaces separate, double quotes group (`"C:\Program
    Files\App\app.exe" --flag`), `""` inside quotes is a literal quote, and nothing else is special: `&`, `|`, `>`, `^`, `;`
    and `%VAR%` are plain text. `std::process::Command` starts the program with each argument separate, quoting it for the
    Windows command line, with its input and output closed and the user's home folder as the working
    folder; the server doesn't wait for it. A `.bat` or `.cmd` program is run by Windows through `cmd.exe`: Rust's standard
    library escapes its arguments for that and refuses one it can't pass safely (CVE-2024-24576, fixed in Rust 1.77.2).
  - **Hold to confirm** is the kiosk's: a command marked so, and OBS's go live, run only after a 0.6 s hold on a card that
    shows the whole command (a hold on the key itself is that hold). The server can't see a finger and never relies on it.
  - **The log**: every run that reaches a decision, run, tested, refused or failed, is a line of
    `DATA_DIR/actions-log.jsonl` (time, the peer's address, the command, the outcome and why), cut back to its newer half
    past 256 KB. `GET /api/actions/log` reads the last 200, and `GET /api/actions` the switch, test mode and the approved
    commands; both answer this machine unless `ALLOW_REMOTE_EDIT=1`.
- **OBS go live** (`POST /api/obs/act` with `{ "op": "stream", "state": "start" | "stop" | "toggle" }`): starts or stops
  streaming in OBS. It answers 403 unless `OBS_STREAM_CONTROL=on` (**Settings › Actions › Go live and stop in OBS from the
  panel**), and otherwise has the guards of the other OBS writes. The kiosk always asks for a hold first. The Stream Deck
  plugin and its widget are unchanged and offer neither.
- **Agent approvals from the panel** (`crates/ips-server/src/approvals.rs`, `hook_auth.rs` and `key_file.rs`, the hook in
  `crates/ips-agent`, the prompt window in `src-tauri/src/agent_prompt.rs` and `src/agent-prompt/`): allowing a Claude Code
  or Codex tool call from the panel approves running code on this PC, so:
  - it is off unless the agent is named in `AGENT_APPROVALS` (`claude`, `codex`; the desktop app sets it from
    **Settings › Coding agents › Answer … from the panel**, one switch per agent), read at start only. While an agent is off
    its requests are only recorded as the "waiting" state the kiosks already show, and answered at once with no decision;
  - the `PermissionRequest` hook (`ips-agent permission <agent>`, the only hook that runs in the foreground, with a 30 s
    timeout and `onFailure: continue`) posts the request from this machine with the agent header and a fresh nonce
    (`POST /api/agents/permission`, loopback-only like every agent post) and waits up to 25 s. It prints a decision only for
    an explicit allow or deny that carries the server's signature (below), in the documented
    `hookSpecificOutput.decision.behavior` shape (deny with a message, never `interrupt`). No answer, a refusal, an error, an
    unsigned or wrongly signed answer, or a server that isn't running prints nothing, and the agent shows its own prompt in
    the terminal: silence never allows and never denies. The agent's own deny and ask rules still apply to an allow;
  - a request is read and answered only in InfoPanel Studio's own prompt window on this PC, by IPC, never over HTTP:
    `GET /api/agents/requests`, `GET /api/agents/requests/log` and `POST /api/agents/answer` answer 403 to everyone,
    loopback included. The window is one of the app's local pages (`app/agent-prompt.html`), which never navigates to the
    server's pages; `agent_requests` and `agent_answer` are granted to that window alone (`capabilities/agent-prompt.json`)
    and check its label too. The studio and kiosk window, which runs the server's pages and any code widget, can only tell
    the app its page area (`agent_prompt_room`), so the window sits over the panel. A kiosk in a browser can't answer: the
    prompt still opens on the PC running the app, else the agent asks in its terminal. A server run without the desktop app
    has no prompt at all. There is no pairing of other devices;
  - the window shows every field of the tool's input, the command or file first, an edit as a diff and a file's new content
    in full, newlines and runs of spaces kept and lines never wrapped or cut, in a box that scrolls. An answer names the
    request it was given for, and the server takes it only while exactly that request waits: a hold in progress is dropped
    when another request takes the screen. Deny is a tap and Allow is a 0.6 s hold; nothing answers by itself. The Coding
    Agents cards never answer: they say to answer in the prompt or the terminal;
  - an answer is signed for the hook: keyed BLAKE2b-256 (as `pack_sign.rs` uses) over the hook's nonce, the request's id and
    the decision, with a 32-byte key the server makes on first use. The key lives in this user's own folder, never the data
    folder: `INFOPANEL_STUDIO_CONFIG_DIR` when set (test runs), else `%LOCALAPPDATA%\dev.f3nn3x.infopanel-studio` on Windows
    and `$XDG_CONFIG_HOME/infopanel-studio` (or `~/.config/infopanel-studio`) elsewhere. It is created owner-only (mode 0600;
    on Windows a protected DACL for this user and SYSTEM, nothing inherited, owned by this user), and both the server and the
    hook check that on every read: a key owned by someone else or open to another user or group is refused. The server then
    makes a fresh one; the hook takes no answer;
  - every outcome is logged to `DATA_DIR/agent-approvals-log.jsonl` (time, who answered, the agent, project, tool, the
    request in full, and allow, deny, `none` for a wait that ran out or `gone` for a hook that went away), cut back to its
    newer half past 256 KB. **Settings › Coding agents** reads the last 200 by IPC (`agent_answers_log`).

- **Profile files with images**: an exported screen carries the images it names as base64, within the import's 5 MB. On
  import each goes through the upload route above (magic bytes checked, an SVG sanitised) before the screen points at it;
  an entry whose id, type or data does not have the expected shape is dropped unread.
- **Path safety**: static and asset paths reject `..` and dot segments with prefix checks.

### Agent approvals: threat model

What answers a request has to be InfoPanel Studio's prompt window, driven by a person at this PC.

- **It protects against** the agent asking, or any other program on this PC, approving a request over HTTP (it can reach
  loopback, and could copy any static header); pages and code widgets on the server's origin, which share the studio and
  kiosk window but get none of the prompt's commands; other devices on the network, which can't post a request, read one
  or answer one; a program that takes the server's port before it starts, or answers in its place, which can't sign an
  answer, so the hook ignores it; another user of this PC planting or reading the key (it is owner-only and checked); and an
  answer meant for one request landing on another (each answer names its request and is taken only while that one waits).
- **It does not protect against** a program already running as this user. Such a program can read the key and sign its
  own answers, drive the prompt window's input, or simply edit the agent's settings and hooks; nothing in a user's session
  can tell it apart from the user. Keep the switches off for an agent you don't watch.

## Device batteries

The **Device Batteries** source (1.4.0-beta, Connections › Peripherals) reads the battery level
of your wireless devices on this PC — mice, keyboards, headsets, controllers, phones. Its rules:

- **Opt-in and local.** The master switch is off; turning it on (Connections › Peripherals) is a
  local setting. `DEVICE_BATTERIES=off` (or `0`) is a hard override that forces the source off
  regardless of the switch.
- **Read-only device I/O.** The poll core (the ported batterymon-proto drivers, in
  `crates/ips-battery`) opens HID collections and sends only the vendors' documented read-only
  battery queries; unknown devices are never written to. It needs no admin rights and installs no
  driver. A device that misbehaves can be hidden per device in Settings: it is then still opened
  by the poll but contributes no readings (a "never open at all" block-list is not exposed; the
  prototype's `IgnoreDevices` registry value had that role and is not carried over).
- **One optional external program.** The HeadsetControl fallback runs `headsetcontrol.exe -b -o
  json` on a background thread **only when that exe is found next to the server or on `PATH`**;
  nothing else leaves the process (AirPods and Galaxy Buds are read through WinRT/Winsock on this
  PC, Phone Link through the file Windows already writes).
- **What is stored.** Device renames and hidden devices live in `integrations.json`
  (`peripherals`, no secrets). The readings themselves are in memory only, streamed to kiosks
  like any other sensor reading — they leave the PC only as far as your own kiosks do.
- **Routes and guards.** `GET /api/devices/battery` and `GET /events/devices` are reads, served
  like any sensor data. Writing the settings goes through the existing integrations guard
  (`X-Dashboard-Config: 1`, JSON, size caps, refused from other machines unless remote editing is
  on). The poll never runs in a request path; the stream reads a watch channel.

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
