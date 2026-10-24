# Server contract

The specification the native server (`ips-server`, footprint Phase 3) must reproduce: everything `server.mjs` and
`server/*.mjs` do that a client, a kiosk or the data folder can observe. Written from the code at `59c784f`; every rule
cites `file:line`. Where the two parts' "Discrepancies and oddities" call something a bug, the port keeps it unless a
gate decides otherwise, and the parity tests pin it either way.

- **Part A:** the HTTP surface: request pipeline, guards, security headers, static files, every route, SSE, environment
  variables, process lifecycle, the proxies and the config semantics.
- **Part B:** the data folder (every file, its format and write strategy), timers and background work, the module
  specifications (control, alerts, ical, calendar, OBS, integrations, extras, agents, library, assets, canvases), and the
  agent hooks.

Workspace layout and dependencies: [server-native.md](server-native.md).

## Server contract, part A: HTTP surface, guards, static, SSE, env, proxies, config semantics

Source of truth: `server.mjs` (607 lines) and `server/*.mjs` at commit 59c784f. File:line cites are to those files.
Part B (below) covers: data-folder files (`config.json`, `control.json`, `alerts.json`, `integrations.json`, `studio-prefs.json`, `library/`, `canvases/`, `cache/`, `assets/` on-disk layout), timers, and the internals of alerts, ical, obs, agents, agent-usage, claude-sessions, control reducer, integrations `apply`. Where a route hands off to those, this document gives the route-level contract and says "see part B".

Conventions used below:
- `send(res, status, body = "", type = "text/plain; charset=utf-8")` (server.mjs:308) writes `Content-Type: <type>` and `Cache-Control: no-store`, then ends with `body`. Every plain error below is this: text/plain, no-store, body is the quoted message, or empty when none is quoted.
- `JSON` = `application/json; charset=utf-8` (`TYPES[".json"]`, server.mjs:92).
- Node adds `Date` and, for streamed or unsized bodies, `Transfer-Encoding: chunked` (no `Content-Length`) automatically. `send` never sets `Content-Length` (Node derives it for `res.end(body)` when no headers were flushed). A port must behave the same observably: bodies set by `send` carry a Content-Length, SSE and streamed static files are chunked.
- "loopback" = `isLoopback(remoteAddress)` (request-guard.mjs:115): regex `^(127\.|::1$|::ffff:127\.)` on the socket peer address (not on Host, not on forwarded headers; there is no `X-Forwarded-For` handling anywhere). `server/assets.mjs:201` has a second `isLoopback` (`a === "::1" || /^(::ffff:)?127\./`) used by assets/library/canvases/installed; it is equivalent for Node-produced addresses.

---

### 1. Request pipeline (order decides which status wins)

`http.createServer` handler, server.mjs:563-602. Order of evaluation for every request:

1. **Request guard** (`guard(req)`, section 3). If it returns a refusal: set `Connection: close`, `send(res, status, message)`; stop. Not logged by the debug request log.
2. `new URL(req.url ?? "/", "http://localhost")` gives `pathname` and `searchParams`. (A malformed request target that makes `new URL` throw happens outside the try block, so it would be an unhandled rejection in the async handler; Node's HTTP parser rejects most such request lines earlier with 400.)
3. `debug.request(req)` starts the optional request log; `res.on("close")` logs `[debug] <METHOD> <req.url> <status> <N>ms` (only with `DASHBOARD_DEBUG=1`).
4. Route dispatch, first match wins, exact order (server.mjs:573-596):

| # | Match | Handler |
|---|---|---|
| 1 | `pathname === "/api/health"` | handleHealth |
| 2 | `=== "/api/debug/stats"` | handleDebugStats |
| 3 | `=== "/api/server/stats"` | handleServerStats |
| 4 | `=== "/api/config"` | handleConfig |
| 5 | `=== "/api/config/settings"` | handleConfigSettings |
| 6 | `=== "/api/studio-prefs"` | handleStudioPrefs |
| 7 | `=== "/events/config"` | handleConfigEvents |
| 8 | `=== "/api/control"` or startsWith `"/api/control/"` | handleControl |
| 9 | `=== "/api/alerts/history"` | handleAlertHistory |
| 10 | `=== "/events/control"` | handleControlEvents |
| 11 | `=== "/api/extras"` | inline: GET 200 `extras.state()` JSON, any other method 405 |
| 12 | `=== "/events/extras"` | handleExtrasEvents |
| 13 | `=== "/api/integrations"` | handleIntegrations |
| 14 | `=== "/api/agents/event"` or `"/api/agents/statusline"` | handleAgentPost |
| 15 | `=== "/api/image-proxy"` | handleImageProxy |
| 16 | `=== "/api/assets"` or startsWith `"/api/assets/"` | handleAssets |
| 17 | `=== "/api/library"` or startsWith `"/api/library/"` | handleLibrary |
| 18 | `=== "/api/canvases"` or startsWith `"/api/canvases/"` | handleCanvases |
| 19 | `=== "/api/infopanel/installed"` or startsWith `".../installed/"` | handleInstalled |
| 20 | `=== "/api/font-proxy"` | handleFontProxy |
| 21 | `startsWith("/api/")` | `send(res, 404)` (empty body) |
| 22 | everything else | serveStatic |

Matching is on the raw (percent-encoded, not decoded) `pathname`; no trailing-slash normalisation (`/api/health/` is a 404 via row 21; `/api/config/` is 404). Query strings never affect routing.

5. Any exception thrown by a handler (including a rejected promise): `console.error("<METHOD> <pathname> failed:", err)`; if headers not yet sent, `send(res, 500, "internal error")`, else `res.destroy()` (server.mjs:597-601).

Cross-cutting facts:
- Method handling is per route (listed below); there is no global OPTIONS/CORS handling. `OPTIONS` reaches the route and gets that route's 405 (static: 405). **No `Access-Control-*` header is ever sent** anywhere. This is deliberate: custom `X-Dashboard-*` headers force a preflight that fails (assets.mjs:20-23 comment).
- `HEAD` is honoured only by static files and `/api/assets/<id>`; every other route answers `HEAD` with that route's 405 (health, config, etc.).
- JSON API responses carry only `Content-Type` and `Cache-Control: no-store`. No `nosniff`, no CSP, no ETag, no `Content-Length` override. Only static files (section 4), assets, proxies and installed-profile files carry extra security headers.
- Request body reader `readBody(req, limit)` (server.mjs:321): accumulates `data` chunks; once the running total exceeds `limit` it rejects `Error("body too large")` **and calls `req.destroy()`** (kills the socket, so the client typically sees a connection reset, not the 413 that the caller then tries to send). On `end` resolves `Buffer.concat(chunks).toString("utf8")` (invalid UTF-8 becomes U+FFFD). `Content-Length` is not consulted. Errors on the request stream reject.
- Remote-edit refusal (`refuseRemoteEdit`, server.mjs:314): status **403**, `Content-Type: JSON`, `Cache-Control: no-store`, body `{"error":"Editing from other devices is off. Turn it on in Settings > Server on the PC running InfoPanel Studio."}`. This is the only refusal with a JSON body; all others are text/plain.

---

### 2. Guard reference (who may do what)

| Guard | Defined | Checks, in order | Statuses / messages |
|---|---|---|---|
| Request guard | request-guard.mjs:38 | Host allowlist; for POST/PUT/PATCH/DELETE: Sec-Fetch-Site, then Origin | 421 `host not allowed`; 403 `cross-site request refused`; 403 `origin not allowed` |
| `remoteEditRefusal(remoteAddress)` | request-guard.mjs:109 | `process.env.ALLOW_REMOTE_EDIT === "1"` (read per call) OR loopback => pass | 403 JSON `{"error":"Editing from other devices is off. Turn it on in Settings > Server on the PC running InfoPanel Studio."}` |
| `configWriteRefusal(headers)` | request-guard.mjs:87 | content-type (before `;`, trimmed, lowercased) must equal `application/json`; then header `x-dashboard-config` must equal `"1"` | 415 `expected application/json`; 403 `missing X-Dashboard-Config header` |
| `controlWriteRefusal(headers)` | request-guard.mjs:98 | same content-type check; then `x-dashboard-control` `=== "1"` | 415 `expected application/json`; 403 `missing X-Dashboard-Control header` |
| `agentWriteRefusal(headers, remoteAddress)` | request-guard.mjs:121 | loopback; content-type; `x-agent-event` `=== "1"` | 403 `agent status is accepted from this machine only`; 415 `expected application/json`; 403 `missing X-Agent-Event header` |
| Asset write guard | assets.mjs:315 | header `x-dashboard-asset` `=== "1"`; then `ALLOW_REMOTE_UPLOAD=1` or loopback | 403 `missing X-Dashboard-Asset header`; 403 `uploads are accepted from this computer only` |
| Library write guard | library.mjs:187 | header `x-dashboard-library` `=== "1"`; loopback or `ALLOW_REMOTE_UPLOAD=1`; if the call carries a body: content-type | 403 `missing X-Dashboard-Library header`; 403 `library changes are accepted from this computer only`; 415 `expected application/json` |
| Canvas write guard | canvases.mjs:172 | header `x-dashboard-canvas` `=== "1"`; loopback or `ALLOW_REMOTE_UPLOAD=1`; content-type | 403 `missing X-Dashboard-Canvas header`; 403 `canvas changes are accepted from this computer only`; 415 `expected application/json` |

Header names are matched case-insensitively (Node lowercases); the values are compared exactly to the string `"1"`. Note the order differs: config/control/agent check content-type first (agent: loopback first, then type, then header); asset/library/canvas check header first, then locality, then type.

Which writes need which guard (summary):

| Route | remoteEdit | write header guard | loopback-only | notes |
|---|---|---|---|---|
| POST /api/config | yes | config | no | |
| PATCH /api/config/settings | yes | config | no | |
| PUT /api/integrations | yes | config | no | |
| PUT /api/studio-prefs | no (loopback instead) | config | yes (for GET too) | |
| POST /api/control/* | no | control | no | any LAN host with the header can control kiosks |
| POST /api/agents/* | no | agent | yes | |
| POST/DELETE /api/assets | no | asset | unless ALLOW_REMOTE_UPLOAD | |
| POST/PUT/DELETE /api/library | no | library | unless ALLOW_REMOTE_UPLOAD | |
| POST /api/canvases | no | canvas | unless ALLOW_REMOTE_UPLOAD | |
| GET /api/infopanel/installed* | n/a | n/a | yes | |
| GET /api/server/stats, /api/debug/stats | n/a | n/a | yes | |

All reads not listed as loopback-only are open to any host that passes the Host allowlist (config, control, extras, alerts history, integrations GET, assets GET/list, library GET, canvases GET, health, settings feed, SSE).

---

### 3. Request guard (`server/request-guard.mjs`) and security headers (`server/security-headers.mjs`)

#### 3.1 Host allowlist (applies to every method and every route)

Built once at startup (server.mjs:557): `createRequestGuard({ host: HOST, allowedHosts: parseAllowedHosts(process.env.ALLOWED_HOSTS), machineName: os.hostname() })`.

`hostnameOf(value)` (request-guard.mjs:21): `String(value ?? "").trim()` matched against case-insensitive regex `^(\[[0-9a-f:.]+\]|[a-z0-9._-]+)(?::\d+)?$`. Group 1 lowercased is the hostname (IPv6 keeps its brackets). Anything else (empty, spaces inside, `@`, `/`, non-numeric port, userinfo, two colons without brackets) gives `null`. The port is not range-checked and plays no part in the comparison.

Allowed names (set `names`, request-guard.mjs:38-47):
- always: `localhost`, `127.0.0.1`, `[::1]` (any port).
- `HOST` and each `ALLOWED_HOSTS` entry, each passed through `normalizeName` (= `hostnameOf`, lowercased; entries may carry a port which is dropped). Entries that fail `hostnameOf` are silently dropped. The IPv6 re-bracketing branch in `normalizeName` is dead code (`hostnameOf` returns bracketed IPv6 already, `net.isIPv6` of a bracketed string is false), so a **bare** IPv6 such as `::1` in `HOST` or `ALLOWED_HOSTS` is dropped; only `[::1]` form works.
- `allExposed = (HOST === "0.0.0.0" || HOST === "::")` (exact string compare). When true: also `os.hostname().toLowerCase()` (if non-empty), and **any IP literal** (`net.isIP` on the hostname with brackets stripped, so any IPv4 or IPv6 address) is allowed.

Decision (request-guard.mjs:49-52): `hostname = hostnameOf(req.headers.host)`; if `null` (missing or invalid Host header, including HTTP/1.0 without Host) or not allowed -> `{status: 421, message: "host not allowed"}`. Response: `Connection: close`, text/plain, no-store.

Test: `tests/server/server.test.mjs` "answers /api/health": Host `evil.example` -> 421. `tests/server/request-guard.test.mjs` for the table of allowed names.

#### 3.2 Cross-site write checks (only POST, PUT, PATCH, DELETE; request-guard.mjs:54-73)

After the Host check passes, for methods in `{POST, PUT, PATCH, DELETE}` (GET/HEAD/OPTIONS skip this entirely):
1. `Sec-Fetch-Site` header present and not `same-origin` and not `none` (so `same-site`, `cross-site`, anything else) -> **403** `cross-site request refused`.
2. `Origin` header present (`!== undefined`): parse with `new URL(origin)`; failure (including the literal `null` origin) or empty host -> **403** `origin not allowed`. Else `originHost = new URL(origin).host` (includes the port unless it is the scheme default, which the URL parser strips, e.g. `http://x:80` -> `x`). Allowed when `originHost.toLowerCase() === String(hostHeader).trim().toLowerCase()` (string compare incl. port) OR both `hostnameOf(originHost)` and the Host-header hostname are in `{localhost, 127.0.0.1, [::1]}` (two different loopback names or ports count as the same machine, for the Vite dev proxy). Otherwise **403** `origin not allowed`.
3. Neither header present (curl, Node, Stream Deck, the app's Rust client) -> pass.

Order: Host (421) -> Sec-Fetch-Site (403) -> Origin (403) -> route handler. This guard runs before any route-specific guard, so a cross-site POST gets 403 even where the route would say 415 or 405.

#### 3.3 Security headers (static files only; `securityHeaders(isHtml, search)`, security-headers.mjs:37)

Applied only in `serveStatic` (server.mjs:549). Nothing else in the server sends CSP or Referrer-Policy except the specific ones noted per route.

| Header | HTML (`file.endsWith(".html")`) | Non-HTML static file |
|---|---|---|
| `X-Content-Type-Options` | `nosniff` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` | `no-referrer` |
| `Content-Security-Policy` | the CSP below | absent |

CSP string (directives joined by `"; "`, in this order, security-headers.mjs:13-25):
```
default-src 'self'; script-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: blob: https:; img-src 'self' data: blob: http: https:; media-src 'self' blob: http: https:; connect-src 'self' http: https: ws: wss: ipc:; frame-src 'self' blob: http: https:
```
If the request query (the `search` of `new URL(req.url, "http://x")`) contains parameter name `studio` or `settings` (`URLSearchParams.has`, any value including empty; `isEditorPage`), `; frame-ancestors 'self'` is appended as the last directive. Kiosk pages (no such param) have no `frame-ancestors`. The check uses the query of the *request URL*, so the SPA fallback page for any path with `?studio` also gets it.

Tests: `tests/server/security-headers.test.mjs`; `tests/server/server.test.mjs` "sends the security headers".

---

### 4. Static serving (`serveStatic`, server.mjs:532-555)

Reached only when no `/api/` prefix matched (and `/events/*` exact routes matched nothing; an unknown `/events/foo` is static).

Steps, in order:
1. Method not `GET` and not `HEAD` -> `send(405)` (empty body).
2. `DIST` does not exist (`fs.existsSync`, evaluated per request) -> `send(503, "No build found. Run \`npm run build\` first.")`. Applies to HEAD too.
3. `rel = decodeURIComponent(pathname).replace(/^\/+/, "") || "index.html"`. A malformed percent-escape makes `decodeURIComponent` throw `URIError` -> falls to the catch -> **500** `internal error`.
4. Traversal/dotfile rule: if `rel.split("/")` has any segment equal to `".."` or starting with `"."` -> `send(404)` (empty body). (Note: only `/` is the separator here; see Discrepancies for backslashes.)
5. `file = path.join(DIST, rel)`. If `!file.startsWith(DIST + path.sep)` OR the file does not exist OR it is not a regular file (`statSync(...).isFile()`; a directory counts as missing) -> `file = path.join(DIST, "index.html")` (**SPA fallback with status 200**, not 404; this includes `/missing.js`, `/foo/bar`, `/favicon.ico` when absent, and any traversal that escapes DIST). If `index.html` is itself missing, `createReadStream` errors after headers: `res.destroy()` (see step 8).
6. `isHtml = file.endsWith(".html")`. Response 200 headers:
   - `Content-Type`: `TYPES[path.extname(file).toLowerCase()] ?? "application/octet-stream"`.
   - `Cache-Control`: `no-store` for html, `no-cache` for everything else. No ETag, no Last-Modified, no Content-Length (chunked), no Range support.
   - plus section 3.3 headers.
7. `HEAD` -> `res.end()` right after the headers (no body, headers as for GET, no Content-Length).
8. GET: `fs.createReadStream(file).pipe(res)`; stream `error` -> `res.destroy()`.

`TYPES` (server.mjs:88-107), extension (lowercased, with dot) -> value:

| ext | Content-Type |
|---|---|
| .html | text/html; charset=utf-8 |
| .js | text/javascript; charset=utf-8 |
| .css | text/css; charset=utf-8 |
| .json | application/json; charset=utf-8 |
| .map | application/json; charset=utf-8 |
| .svg | image/svg+xml |
| .png | image/png |
| .jpg, .jpeg | image/jpeg |
| .gif | image/gif |
| .webp | image/webp |
| .avif | image/avif |
| .mp4 | video/mp4 |
| .webm | video/webm |
| .ico | image/x-icon |
| .woff | font/woff |
| .woff2 | font/woff2 |
| .txt | text/plain; charset=utf-8 |
| (other) | application/octet-stream |

`DIST` = `resolveDist(process.env, path.join(ROOT, "dist"))` (server.mjs:66): `DASHBOARD_DIST` non-empty -> `path.resolve(DASHBOARD_DIST)` (relative to the process cwd), else `<dir of server.mjs>/dist`. `DIST` has no trailing separator, so the `startsWith(DIST + sep)` test is a directory-boundary test. Test: `tests/server/server.test.mjs` (custom dist serves `/` and `/a.txt`).

---

### 5. Routes

Legend: "ok" statuses first, then refusals in the order the checks run.

#### GET /api/health (server.mjs:490)
- Methods: GET only; others (including HEAD) -> 405 empty.
- No guards beyond the request guard.
- 200 JSON: `{"app":"infopanel-dashboard","version":"<package.json version>","configVersion":<int>}`. Key order exactly app, version, configVersion. `version` = `readVersion(<ROOT>/package.json)` read once at start ("0.0.0" when missing, unreadable, or not a non-empty string; env.mjs:13). `configVersion` is the live in-memory version (0 when no config file at start and none saved).
- The app id `infopanel-dashboard` is load-bearing: `src-tauri/src/probe.rs:11` (`DASHBOARD_APP`) classifies a server as ours only when status is 200 and body JSON has `app == "infopanel-dashboard"`; it reads `version` as optional string. Any other body/status => "other".
- Example (tests/server/server.test.mjs "answers /api/health"): `{"app":"infopanel-dashboard","version":"<pkg.version>","configVersion":0}`; POST -> 405.

#### GET /api/server/stats (server.mjs:526)
- Order: method (405 if not GET) -> loopback (403 `server stats are served to this machine only`) -> 200.
- 200 JSON `{"uptimeSeconds":<Math.round(process.uptime())>,"clients":<open SSE streams across all channels>,"studios":<open "studio" channel streams>}` (debug.mjs:55). Always available, with or without DASHBOARD_DEBUG. Test: server.test.mjs "serves /api/server/stats in any mode" (keys sorted equal `["clients","studios","uptimeSeconds"]`; POST 405).

#### GET /api/debug/stats (server.mjs:497)
- Order: `debug.enabled` false (DASHBOARD_DEBUG !== "1") -> **404 empty, even for non-GET** -> method (405) -> loopback (403 `debug stats are served to this machine only`) -> 200.
- 200 JSON (debug.mjs:59): `{"memory":<process.memoryUsage() object: rss, heapTotal, heapUsed, external, arrayBuffers>,"uptimeSeconds":N,"sseClients":{"<channel>":<count>,...},"resources":{"<handle type>":N,...},"eventLoopDelayMs":{"p50":ms,"p99":ms,"max":ms}}`. ms rounded to 2 decimals (`Math.round(ns/1e6*100)/100`). `sseClients` is every channel ever opened (counts can be 0). In a port, `memory`, `resources` and `eventLoopDelayMs` are runtime-specific; consumers (tests) only need `memory.rss > 0`, `eventLoopDelayMs.p99` present, `sseClients.config` present after a config stream connected. Debug-only, so Node-shaped fidelity is not required.

#### GET/POST /api/config (server.mjs:351)
Config file: `DATA_DIR/config.json`; cap `MAX_CONFIG_BYTES = 5 * 1024 * 1024` (5,242,880) (server.mjs:81).

**GET**
- 404 (empty body, no X-Settings-Rev) when `config.json` does not exist.
- 200: header `X-Settings-Rev: <settingsRev>` (decimal), `Content-Type: JSON`, `Cache-Control: no-store`; body = the exact bytes of the file (a Buffer, not re-serialised). No guard other than the request guard (kiosks on the LAN read it). If the file exists but is unreadable -> exception -> 500.

**POST** (the only write method; anything else 405) - check order:
1. method != POST -> 405.
2. `refuseRemoteEdit` -> 403 JSON `{"error":"Editing from other devices is off. ..."}` (non-loopback and `ALLOW_REMOTE_EDIT !== "1"`).
3. `configWriteRefusal` -> 415 `expected application/json`; 403 `missing X-Dashboard-Config header`.
4. Read body, limit 5 MiB: exceed -> 413 empty (the socket has been destroyed, see readBody note).
5. `JSON.parse(body)`; failure, `null`, non-object, or array (including the empty body) -> 400 `expected a config object`.
6. If `config.json` exists: downgrade guard `versionRefusal(storedText, parsed)` -> 409 `a newer dashboard version saved this config; reload` (rule below).
7. `X-Settings-Rev` reapply (rule below): may replace `body`.
8. Canvas refs: `referencedCanvasIds(body)` (null when the text is not a config object with a `profiles` array -> treated as no refs); every id not in the canvas store (`CANVAS_ID_RE` match and `canvases/<id>.json` exists) -> 422 `canvas files missing from the store: <first five ids, joined ", ">` (more than 5 are truncated, no ellipsis).
9. `saveConfig(body)`: write `config.json.tmp` then rename over `config.json` (atomic); `configVersion = Math.max(Date.now(), configVersion + 1)`; push a config SSE event to every `/events/config` listener; `control.configChanged()`; `alerts.configChanged()`; `sweepCanvases()`.
10. 200 JSON `{"ok":true,"version":<new configVersion>}`.

What is stored: the request body **verbatim** (same bytes, formatting and key order as sent) unless step 7 replaced it with `JSON.stringify(reapplied)` (compact). The server never validates the config schema beyond "is a JSON object" and the checks above.

Downgrade guard (`versionRefusal`, config-guard.mjs:18): stored text unparsable -> accept. `versionOf(x)` = `x.version` if it is a JSON number, else 0 (strings, missing, null all 0). Refuse (409) iff `versionOf(stored) > versionOf(incoming)`; equal or higher incoming passes. Only POST /api/config is guarded (PATCH settings is not).

`X-Settings-Rev` reapply (server.mjs:383-386): `knownRev = Number(req.headers["x-settings-rev"])`. If `Number.isFinite(knownRev)` and the log has any entry with `rev > knownRev`, then `body = JSON.stringify(reapplySettings(parsed, settingsLog, knownRev))`: every log entry with `rev > knownRev`, oldest first, is applied again over the posted config with `applySettingsPatch`; a patch that fails (e.g. its screen is gone) is skipped (`result.config ?? acc`). No header -> `Number(undefined)` is NaN -> no reapply. A non-numeric header -> NaN -> none. **An empty header value `X-Settings-Rev:` gives `Number("")` = 0, which is finite, so every logged patch is reapplied.** `settingsRev` is not changed by POST. Test: server.test.mjs "applies a Settings patch again over a Studio push built before it landed".

Settings log constants: `settingsRev = Date.now()` at process start (server.mjs:119; an integer ms clock); each accepted PATCH does `settingsRev += 1`, pushes `{rev: settingsRev, patch}` (the raw parsed patch object as sent, not normalised), and drops the oldest when length > `SETTINGS_LOG_MAX = 50` (server.mjs:121,429). The log is in memory only (lost on restart; `settingsRev` re-seeds from the clock, so it is always larger than any earlier run's).

Example flow (server.test.mjs): POST `{"version":11,"general":{"maxFps":60},"profiles":[{"id":"desk","pages":[{"id":"one","placements":[]}]}]}` -> 200 `{"ok":true,"version":1739...}`; GET returns same bytes with `X-Settings-Rev: <n>`.

#### PATCH /api/config/settings and GET /api/config/settings?since= (server.mjs:400; config-settings.mjs)
Cap `MAX_SETTINGS_BYTES = 16 * 1024` (16,384).

**GET `?since=<rev>`** (no guard but the request guard):
- `since = Number(query.get("since") || NaN)`: missing, empty -> NaN. Non-finite (NaN, Infinity) -> **400** `expected ?since=<revision>`. Otherwise any finite number (negative, fractional, `0x10` hex all parse).
- 200 JSON `{"settingsRev":<current>,"patches":[{"rev":<n>,"patch":<as posted>},...]}` where patches = log entries with `rev > since`, oldest first. Only what the 50-entry log still holds. Test: server.test.mjs "feeds a studio the Settings patches it missed" -> `{"settingsRev":K+1,"patches":[{"rev":K+1,"patch":{"general":{"maxFps":15}}}]}`; `since=K+1` -> `"patches":[]`; no `since` -> 400.

**PATCH** check order:
1. method not GET/PATCH -> 405.
2. `refuseRemoteEdit` (403 JSON).
3. `configWriteRefusal` (415, 403).
4. Body (cap 16 KiB) too large -> 413 empty.
5. `JSON.parse(body)` fails (including empty body) -> 400 `expected a settings patch`.
6. `config.json` missing -> 404 `no config saved yet`. (This precedes patch validation.)
7. `applySettingsPatch(readConfigFile(), patch)` -> on failure `send(status, message)`.
8. `settingsRev += 1`; log push (cap 50); `saveConfig(JSON.stringify(result.config))` (compact re-serialisation of the whole config, see Discrepancies); 
9. 200 JSON `{"ok":true,"version":<configVersion>,"settingsRev":<new rev>}`.

No downgrade guard, no canvas check, no `X-Settings-Rev` handling on PATCH (the comment at server.mjs:396 saying "Same guards as POST /api/config" is only true for remote-edit and header/content-type guards).

`applySettingsPatch(stored, patch)` (config-settings.mjs:79), checks in order; returns `{config}` or `{status,message}`:
1. `stored` not a plain object (null from an unreadable/invalid `config.json`, array, scalar) -> **409** `the saved config is not readable` (checked before the patch is looked at).
2. `patch` not a plain object (null, array, scalar) -> 400 `expected a settings patch`.
3. Any top-level key not in `{general, style, profiles}` -> 400 `not a setting: <key>` (first such key in insertion order).
4. `patch.general !== undefined` (note `null` is not undefined):
   - not a plain object -> 400 `general must be an object`.
   - first entry (insertion order) whose key is not in the table, or whose value is not `null` and fails its check -> 400 `not a valid general.<key>`.
   - merge: for each entry, `null` deletes the key from `config.general`, else sets it. If the result has no keys (or `config.general` was a non-object and nothing was set) the `general` key is removed from the config entirely, else replaced. Other `general` keys are kept.
5. `patch.style !== undefined`: not object -> 400 `style must be an object`; invalid -> 400 `not a valid style.<key>`; same merge/removal semantics on `config.style`.
6. `patch.profiles !== undefined`: not object -> 400 `profiles must be an object`. `profiles = Array.isArray(config.profiles) ? config.profiles : []`. For each `[id, change]` in insertion order: `change` not an object or has any key other than `performance` -> 400 `not a valid profiles.<id>`; `perf = change.performance`: invalid if `perf !== null` and (not an object, or has a key outside `{maxFps, motion}`/a value failing its check, or any value is `null`) -> 400 `not a valid profiles.<id>.performance`; `change.performance` absent (undefined) is treated like invalid unless... precisely: `perf !== null && (!isObject(perf) || ...)`, so `undefined` is not an object -> 400. Then profile id not present in `profiles` (`p?.id === id`) -> **404** `no screen <id>`. Validation of entry N is fully done (400 then 404) before entry N+1. If every entry passes, `config.profiles` is rebuilt as the mapped array (always set, so a missing/non-array `config.profiles` becomes `[]`): for each profile `p` whose id is a key of `patch.profiles` with a truthy change: `performance: null` removes the profile's `performance` key; an object merges its keys (never null by now) into the existing `performance` (removed if the result is empty, e.g. `{}` on a profile that had none); other profiles unchanged.
   The mapped output relocates changed keys (see Discrepancies, key order).

Accepted keys and values:

| Path | Key | Accepted value |
|---|---|---|
| general | `showSeconds`, `hideCursor`, `kioskPageNav`, `ringGlide`, `blurLimit`, `innerBlur`, `liveGlow` | JSON boolean |
| general | `locale` | string; `""` accepted; otherwise `Intl.DateTimeFormat.supportedLocalesOf([v]).length > 0` (ICU-dependent BCP 47 support; a throwing call -> invalid) |
| general | `motion` | `"system"`, `"reduce"`, `"full"` |
| general | `maxFps` | one of the numbers `5, 15, 30, 60, 0` (strict: `"15"` and `24` rejected) |
| general | `kioskRefresh` | `"daily"` or `"off"` |
| style | `clock` | `"12"` or `"24"` (strings) |
| profiles.<id>.performance | `maxFps` | same set as above |
| profiles.<id>.performance | `motion` | same set as above |

Any `null` value (except inside `performance`) removes the key ("back to default"). Tests: `tests/server/config-settings.test.mjs`; server.test.mjs "merges a Settings patch into the saved config behind the config write guards" (no header -> 403; text/plain -> 415; POST -> 405; `maxFps: 24` -> 400; unknown profile -> 404; success body `{ok, version, settingsRev}` and stored config equals `{version:11, general:{font:"inter",maxFps:15}, style:{clock:"12"}, profiles:[{id:"desk",pages:[...]}]}`).

#### GET/PUT /api/studio-prefs (server.mjs:508; studio-prefs.mjs)
Cap `MAX_STUDIO_PREFS_BYTES = 4 * 1024` (4,096). File `DATA_DIR/studio-prefs.json` (loaded at start; part B for the file).
Order:
1. Not loopback -> **403** `studio preferences are served to this machine only` (before the method check, so even POST gets 403 remotely).
2. GET -> 200 JSON of the in-memory prefs object (`{}` when none, else `{"studio.previewData":"frozen"}`).
3. Method not PUT -> 405.
4. `configWriteRefusal` -> 415 / 403 (no remote-edit check; loopback already required).
5. Body: `JSON.parse((await readBody(req, 4096)) || "{}")`; empty body is `{}`. Too large or invalid JSON -> 400 `expected a JSON object` (not 413).
6. `applyPrefs`: patch not a plain object -> 400 `expected a JSON object`; for each entry in insertion order: key not a known key -> 400 `unknown preference <key>`; value not allowed -> 400 `<key> takes live, frozen, frozenWhenUnfocused`. Known keys: only `studio.previewData` with values `live`, `frozen`, `frozenWhenUnfocused`.
7. Merge `{...normalizePrefs(current), ...patch}`, write `studio-prefs.json.tmp` then rename (always written, even for `{}`), update memory; 200 JSON of the merged prefs.
Test: server.test.mjs "keeps the studio's preferences in their own file" (expects 403 without header, 415, 400 for `paused` and `studio.other`, 405 for POST, PUT result `{"studio.previewData":"frozen"}`). Prefs never appear in `/api/config`.

#### GET /api/control and POST /api/control/<action> (server.mjs:185)
- `pathname === "/api/control"`: method != GET -> 405; 200 JSON `control.get()` (public state shape, part B). No guard.
- `pathname` startsWith `/api/control/`: `type = pathname.slice("/api/control/".length)`. `type` not in `{page, profile, rotate, touch, alert, kiosk}` -> 404 empty (checked **before** the method; includes `/api/control/` with empty type and `/api/control/page/x`). Method != POST -> 405.
- POST check order: `controlWriteRefusal` (415 `expected application/json`; 403 `missing X-Dashboard-Control header`) -> body (cap `MAX_CONTROL_BYTES = 4096`; any read failure, oversize, invalid JSON, or non-object/array/null -> 400 `expected a JSON object`; empty body means `{}`) -> dispatch.
- No loopback or remote-edit requirement: control is open to the LAN with the header.
- `type == "alert"`: `alerts.act(body)`; `done.error` -> 400 `<error>`; else 200 JSON `{"alerts":<array>,"mutedUntil":<ms epoch|null>}`. Error strings (alerts.mjs:432-439): `unknown rule`, `unknown action`, `unknown alert`; mute errors come from the control reducer (see part B).
- Other types: `control.dispatch({...body, type})` (the URL's type always overrides `body.type`); `result.error` -> 400 `<error>` (strings from control.mjs: `no profile`, `unknown page`, `unknown profile`, `bad rotate state`, `bad mute minutes`, `bad dim state`, `bad dim level`, `bad island state`, `unknown kiosk action`, `unknown action`; see part B); else 200 JSON `result.state` (full public state).
- Public state example shape (control.mjs:287): `{"profile":null,"shown":"desk","profiles":{"desk":{"page":"one","rotating":false,"override":null,"dim":0,"island":true,"islandOverride":null,"reload":1739000000000}},"alerts":[],"mutedUntil":null,"reload":1739000000000,"kiosks":[{"id":"k1","profile":"desk","page":"two","address":"127.0.0.1","since":1739000000000}]}`. (Test cites: server.test.mjs "lists a kiosk in the control state" checks `kiosks` contains `{profile:"desk",address:"127.0.0.1"}`.) Reducer semantics: part B.

#### GET /api/alerts/history (server.mjs:213)
- GET only (others 405). No guards. 200 JSON array, newest first (max 200 entries, `HISTORY_MAX`); entry shape `{id, ruleId, name, severity, text, startedAt, ...(test: true), ...(quiet: true)}` plus fields added when it ends (e.g. `acknowledgedAt`); part B.

#### GET /api/extras (server.mjs:583)
- GET -> 200 JSON `{"obs":{...},"calendar":{...},"agents":{...}}`; other methods 405. No guards.
- Empty-state example (tests/server/integrations.test.mjs:131): `{"obs":{"configured":false,"connected":false,"streaming":false,"recording":false},"calendar":{"configured":false,"events":[]},"agents":{"sessions":[],"plan":{},"usage":{}}}`. Contents: part B.

#### GET/PUT /api/integrations (server.mjs:270)
- GET -> 200 JSON `extras.integrations.public()` (no secrets). No guard beyond the request guard (open to LAN). Example (integrations.test.mjs:132): `{"obs":{"host":"","port":4455,"hasPassword":false},"calendar":{"links":[]}}`; with data `{"obs":{"host":"127.0.0.1","port":4455,"hasPassword":true},"calendar":{"links":[{"id":"id1","label":"Work","host":"calendar.example.com"}]}}`.
- Other methods than GET/PUT -> 405 (before guards).
- PUT order: `refuseRemoteEdit` (403 JSON) -> `configWriteRefusal` (415/403) -> body (cap `MAX_INTEGRATIONS_BYTES = 16 * 1024`; oversize or invalid JSON, empty body treated as `{}`) -> 400 `expected a JSON object` -> `extras.integrations.apply(body)`; `result.error` -> 400 `<error>` (messages like `expected a JSON object`, `obs: expected an object`, `obs.host: a host name or IP address`, `calendar.links: expected a list`, `calendar.links: at most <n>`, `calendar.links: expected objects`, `calendar.links: an http(s) or webcal link`; full list in part B) -> 200 JSON `public()` after applying.

#### POST /api/agents/event?agent=claude|codex and POST /api/agents/statusline (server.mjs:291)
- POST only (else 405 before guards). Order: `agentWriteRefusal` (403 `agent status is accepted from this machine only` -> 415 `expected application/json` -> 403 `missing X-Agent-Event header`) -> body (cap `MAX_AGENT_BYTES = 512 * 1024` = 524,288; oversize, invalid JSON or empty body -> 400 `invalid JSON`) -> process.
- `/api/agents/statusline`: `extras.agents.statusline(payload)`. `/api/agents/event`: `extras.agents.event(searchParams.get("agent") ?? "", payload)`; an agent other than `claude`/`codex`, a non-object payload (JSON `null`, number, string...), or a missing session id/event name is silently ignored.
- Success: **204**, empty body, headers still `Content-Type: text/plain; charset=utf-8` and `Cache-Control: no-store`. No remote-edit check; loopback is required by the agent guard.
- Semantics of the payloads: part B.

#### GET /api/image-proxy?url= (server.mjs:451; proxy.mjs; calendar.mjs:29,70)
Constants: `MAX_PROXY_BYTES = 25 * 1024 * 1024` (26,214,400); `PROXY_TIMEOUT_MS = 10_000`; `MAX_REDIRECTS = 3` (proxy.mjs:24).
Order of outcomes:
1. Method != GET -> 405 empty. No other guard (open to LAN).
2. `target = new URL(query.get("url") ?? "")`; throws (missing, relative, malformed) -> 400 empty.
3. `isValidProxyTarget(target)`: protocol `https:` (any host, any port, userinfo allowed) -> ok; protocol `http:` only when `target.hostname` is exactly one of `localhost`, `127.0.0.1`, `[::1]` -> ok; everything else (ftp, data, file, http on any other host, `http://127.0.0.2`, `http://[::ffff:127.0.0.1]`) -> 400 empty.
4. `fetchProxied(target, {signal: AbortSignal.timeout(10_000)})`: network error, abort/timeout, DNS failure, **blocked address (see below)**, TLS failure -> exception -> **504** empty. Returns null -> **502** `redirect refused`.
5. Upstream `!ok` (status outside 200-299, including a 3xx with no Location) -> `send(status)` the same status, empty body.
6. `content-length` header numeric > 25 MiB -> 413 empty.
7. Stream the body, summing chunks; > 25 MiB at any point -> 413 empty; stream error (including timeout abort after headers) -> 502 empty. The whole body is buffered, then:
8. `resolveProxyType(upstream content-type, body)`; null -> **406** `not an image`.
9. 200 with exactly `Content-Type: <type>`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`. No upstream header is forwarded. No `Content-Length` set by the code (Node adds it for `res.end(body)`).

Redirect handling (`fetchProxied`, proxy.mjs:60): loop `hop` 0..3 (so up to four fetches, three redirects followed). Each iteration: if `!isValidProxyTarget(url)` -> null (this includes redirects to `http:` non-loopback such as `http://169.254.169.254/...`, to other schemes, and for URL parse failure of `Location` -> null). If `hop > 0` and the new URL is loopback http but the previous hop was not loopback http -> null (a public page cannot bounce to this machine). Fetch with `redirect: "manual"`; if status 300-399 **and** a `Location` header exists: cancel/destroy that body, resolve `Location` against the current URL, loop. A 3xx without `Location` is returned as the final response (then step 5 relays its status). After the loop ends with a fourth redirect -> null (502). Loopback-http to loopback-http redirects are allowed, also to any `https:` target.

Upstream request:
- `http:` loopback targets: global `fetch(url, {signal, redirect:"manual"})` with **no custom headers** (undici defaults apply: `accept: */*`, `user-agent: node`, etc.; undici also transparently decompresses `gzip/deflate/br` bodies, so the buffered bytes and size cap apply to the decompressed stream).
- `https:` targets: `guardedProxyFetch` (proxy.mjs:40): `https.get(url, {signal, headers: {"user-agent":"InfoPanel-Studio","accept":"image/*,*/*;q=0.8"}, lookup: guardedLookup(dns.lookup, blockedPrivate)})`. Default TLS verification (certificate errors -> 504). No `accept-encoding` sent. If the host is an IP literal (`net.isIP` after stripping brackets) and `blockedAddress(ip, true)` -> rejects `Error("address not allowed")` before connecting (=> 504). For names, `guardedLookup` calls `dns.lookup(host, {all:true})` (OS resolver, includes hosts file), rejects with `Error("address not allowed")` if the list is empty or **any** returned address is blocked, otherwise returns the list (or the first entry when `options.all` is falsy). The connection is made to those exact resolved addresses, so a name cannot change its answer after the check.
- Response objects for https: `ok = 200 <= status < 300`, headers lower-cased lookup, body is the socket stream.

`blockedAddress(ip, blockLan = false)` (calendar.mjs:29-47); the image proxy always calls it with `blockLan = true`; the calendar fetcher with `false`.

IPv4 (`blockedV4`), `a.b.c.d`:
- Always blocked: `a === 0` (0.0.0.0/8); `a === 127`; `a === 169 && b === 254` (link-local incl. cloud metadata); `a >= 224` (multicast 224/4, reserved 240/4, broadcast).
- Additionally blocked when `blockLan` (proxy only): `10.0.0.0/8`; `172.16.0.0/12` (`a === 172 && 16 <= b <= 31`); `192.168.0.0/16`; `100.64.0.0/10` (`a === 100 && 64 <= b <= 127`, CGNAT).
- Not blocked (kept as is): 192.0.0.0/24, 192.0.2.0/24, 198.18.0.0/15, 192.88.99.0/24, documentation ranges, etc.

IPv6 (`net.isIPv4(ip)` false -> `ipv6Words`): the address is lowercased, a `%zone` suffix is stripped, `net.isIPv6` must hold, a trailing dotted IPv4 is converted to two hex words, `::` expanded to eight 16-bit words `w[0..7]`. Not an IP at all, or not 8 words -> **blocked** (true).
- Embedded IPv4: `mapped` (`w[0..4] == 0 && w[5] == 0xffff`, ::ffff:0:0/96), `compatible` (`w[0..5] == 0 && w[6] != 0`, deprecated ::/96 excluding ::1 and ::), `nat64` (`w[0] == 0x64 && w[1] == 0xff9b && w[2..5] == 0`, 64:ff9b::/96). When any applies, the IPv4 `w[6]>>8 . w[6]&255 . w[7]>>8 . w[7]&255` is evaluated with `blockedV4(.., blockLan)` and that decides.
- Otherwise blocked when: `w[0..6] == 0 && w[7] <= 1` (`::` and `::1`); `(w[0] & 0xffc0) === 0xfe80` (fe80::/10 link-local); `(w[0] >> 8) === 0xff` (ff00::/8 multicast); or, only when `blockLan`, `(w[0] & 0xfe00) === 0xfc00` (fc00::/7 unique-local).
- Not blocked: 2002::/16 (6to4), 2001::/32 (Teredo), fec0::/10 (site-local), 64:ff9b:1::/48, and every other global address.

Content-type rules (`resolveProxyType`, proxy.mjs:100): `t` = header text before `;`, trimmed, lowercased (null -> ""). If `isAllowedProxyType(t)` (`/^image\/[a-z0-9.+-]+$/` and `t !== "image/svg+xml"`) -> serve `t` as is (upstream type, not sniffed, even if the bytes are not that format; `image/svg+xml` -> falls through to the next rules which also fail -> null). If `t === ""` or `t === "application/octet-stream"` -> `sniffImageType(body)`: PNG `89 50 4E 47 0D 0A 1A 0A` (>=8 bytes); JPEG `FF D8 FF` (>=3); GIF `GIF87a`/`GIF89a` (>=6, regex `^GIF8[79]a$`); WEBP `RIFF....WEBP` (>=12, bytes 0-3 `RIFF`, 8-11 `WEBP`); AVIF (>=12, bytes 4-7 `ftyp` and 8-11 `avif` or `avis`); else null. Any other type (`text/html`, `application/json`, `video/*`...) -> null -> 406.

Tests: server.test.mjs "proxies images only" (jpeg passes with `image/jpeg` + nosniff; octet-stream with PNG bytes -> `image/png`; octet-stream with `<html>` -> 406; `text/html` -> 406) and "follows image-proxy redirects only to allowed targets" (loopback 302 -> /jpg ok -> 200 `image/jpeg`; 302 to `http://169.254.169.254/...` -> 502). `tests/server/proxy.test.mjs` for the address table.

#### GET /api/font-proxy?url= (server.mjs:594; font-proxy.mjs)
Constants: `CATALOGUE = "https://www.fontsquirrel.com/api/fontlist/all"`; `PROXIED = {www.fontsquirrel.com}`; `FONT_HOSTS = {api.fontsource.org, cdn.jsdelivr.net, fonts.google.com, fonts.gstatic.com, www.fontsquirrel.com}`; `MAX_BYTES = 30 * 1024 * 1024` (31,457,280); `MAX_REDIRECTS = 3`; `WEEK = 604,800,000 ms`; cache file `DATA_DIR/cache/fontsquirrel-list.json`.
Order:
1. Method != GET -> 405 empty. No other guard (open).
2. `proxyAllowed(url)`: `new URL(url)` parses, protocol `https:`, `hostname` exactly `www.fontsquirrel.com` (any port and userinfo allowed because only `hostname` is compared). Else (including missing param, other hosts, http) -> 400 `not an allowed font URL`.
3. `url === CATALOGUE` (exact string equality) -> `catalogue()`; else `fetchBytes(url)`.
4. Non-catalogue body with length 0 -> error `www.fontsquirrel.com sent nothing (throttled?)` (hostname from the URL) -> 502 with that message.
5. Any error thrown -> `send(res, 502, String(e.message))`.
6. 200 headers (exactly): `Content-Type: application/octet-stream`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: sandbox; default-src 'none'`. Body = raw bytes.

`fetchBytes(url)` (font-proxy.mjs:51): loop hop 0..3: `hopAllowed(url)` (https and hostname in FONT_HOSTS) else throw `refusing to fetch <url>`; `fetch(url, {redirect:"manual", headers: {"User-Agent":"infopanel-studio"}})` (60 s `AbortSignal.timeout` over all hops and the body, no address pinning); status 300-399 with `Location` -> `url = new URL(location, url).href`, continue; `!r.ok` -> throw `<url>: HTTP <status>` (a 3xx without Location also lands here); no body -> empty `Uint8Array`; stream with running total > 30 MiB -> throw `<url>: over 31457280 bytes`; after the loop `<url>: too many redirects` (note `url` is the last URL). Messages go straight into the 502 body.

`catalogue()`: cache mtime age `< WEEK` -> return the cached file bytes (even if empty). Else `fetchBytes(CATALOGUE)`, require the body to `JSON.parse` (UTF-8 decode) - only then `mkdir -p cacheDir`, write the file, return the body. Any failure (fetch error, non-JSON like Font Squirrel's empty 202) -> the stale cache file if readable, else an **empty** body (200 with zero bytes; step 4's throttled error does not apply to the catalogue). Tests: `tests/server/font-proxy.test.mjs`.

#### Assets: GET/POST /api/assets, GET/HEAD/DELETE /api/assets/<id> (assets.mjs:438)
Constants: `ID_RE = ^[a-f0-9]{64}\.(png|jpg|gif|webp|avif|bmp|ico|svg|mp4|webm|ttf|otf|ttc|woff|woff2)$`; `LIMITS = {image: 25 MiB, video: 300 MiB, font: 30 MiB}`; `SVG_LIMIT = 256 KiB` (overrides the image limit for svg); `HEAD_BYTES = 1024`; `MAX_IN_FLIGHT = 2`; `DEFAULT_MAX_BYTES = 2 GiB` (override env `ASSETS_MAX_BYTES`); `SVG_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox"`. At creation, files named `.upload-*` in the assets dir are deleted.

Mime/kind table (`TYPES`): png image/png, jpg image/jpeg, gif image/gif, webp image/webp, avif image/avif, bmp image/bmp, ico image/x-icon, svg image/svg+xml (kind image, limit 256 KiB), mp4 video/mp4, webm video/webm, ttf font/ttf, otf font/otf, ttc font/collection, woff font/woff, woff2 font/woff2. Declared-type aliases (`MIME_ALIASES`): `video/x-matroska`, `video/matroska` -> webm; `image/x-ms-bmp` -> bmp; `image/vnd.microsoft.icon` -> ico; `font/sfnt`, `application/x-font-ttf` -> ttf; `application/x-font-otf`, `application/vnd.ms-opentype` -> otf; `application/font-woff` -> woff. Declared type = Content-Type before `;`, trimmed, lowercased.

Sniffing (`sniffType`, first match wins): png `89504E470D0A1A0A`; jpg `FFD8FF`; gif `GIF87a`/`GIF89a`; webp `RIFF` at 0 and `WEBP` at 8; bmp `BM` at 0, length >= 18 and u32le at 14 in {12,40,52,56,64,108,124}; ico `00 00 01 00` with length >= 6 and u16le at 4 > 0; webm: EBML `1A45DFA3` (Matroska too); ttf `00 01 00 00` or `true`; otf `OTTO`; ttc `ttcf`; woff `wOFF`; woff2 `wOF2`; svg: `isSvgText` (optional BOM, whitespace, XML decl/PI, comments, DOCTYPE, then `<svg` followed by whitespace, `>` or `/`); else ftyp: length >= 16, bytes 4-7 `ftyp`, box size = u32be at 0 (clamped to length); avif if the major brand or any compatible brand (4-byte words from offset 16 within the box) is `avif`/`avis`; mp4 if the major brand is in {isom, iso2, iso4, iso5, iso6, mp41, mp42, avc1, dash, "M4V ", mmp4, MSNV}; else none.

**GET /api/assets** -> 200 JSON array (no guard, open), items `{"id":"<sha256hex>.<ext>","url":"/api/assets/<id>","type":"<mime>","kind":"image|video|font","size":<bytes>,"mtime":<floor ms>}` for directory entries matching `ID_RE`, sorted by `mtime` descending. `?unused=1` (exactly `"1"`) keeps only assets whose 64-hex hash does not appear (any 64-hex run not adjacent to more hex, regex `(?<![a-f0-9])[a-f0-9]{64}(?![a-f0-9])`) in the text of `config.json` (empty when absent) plus every library item file text plus every canvas file text.

**POST /api/assets** (upload) - order:
1. Write guard: 403 `missing X-Dashboard-Asset header`; 403 `uploads are accepted from this computer only` (non-loopback and `ALLOW_REMOTE_UPLOAD !== "1"`, env read once at start). No remote-edit check.
2. `declaredType(Content-Type)` null -> 415 `unsupported type: png, jpeg, gif, webp, avif, bmp, ico, svg, mp4, webm, mkv, ttf, otf, ttc, woff or woff2`.
3. `limit = declared.limit ?? LIMITS[declared.kind]`. `Number(content-length) > limit` -> `Connection: close`, 413 empty.
4. Quota (`uploadQuotaRefusal`): `inFlight >= 2` -> 429 `too many uploads in progress`; else `dirBytes(assets dir) + incoming > maxBytes` (incoming = Content-Length when > 0 else `limit`; `dirBytes` sums sizes of all directory entries including temp files) -> 507 `media storage is full`. Both with `Connection: close`.
5. Stream to `<dir>/.upload-<uuid>.tmp` while hashing SHA-256: running size > limit -> 413 empty; once 1024 bytes are buffered, `sniffType(head).ext` must equal the declared ext else 415 `file content does not match its type`; at end: size 0 -> 400 `empty body`; short body re-checked with the same 415; request error or incomplete -> 400 `upload aborted`; write error -> 500. All failures delete the temp file and send with `Connection: close`.
6. Id = `<sha256>.<declared ext>`. If the file exists, the temp is dropped (idempotent), else renamed.
7. 200 JSON `{"id":"<hash>.<ext>","url":"/api/assets/<id>","type":"<mime>","size":<bytes>}`.
`inFlight` increments just before receiving and decrements in `finally`.

**GET|HEAD /api/assets/<id>**: `assetPath(dir, id)` (id raw from the pathname, no decoding; must match `ID_RE`) else 404 empty (any method). Stat fails -> 404 empty. Headers: `Content-Type` (mime of the extension), `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, svg only `Content-Security-Policy: <SVG_CSP>`, `Accept-Ranges: bytes`. No ETag/Last-Modified. `Range` (`parseRange`, single range only, regex `^bytes=(\d*)-(\d*)$`): absent, malformed, both empty, multi-range, or an explicit end before start -> whole file 200; unsatisfiable (`start >= size`, suffix `0`, or empty file with suffix) -> 416 with the headers plus `Content-Range: bytes */<size>` and `Content-Length: 0`; valid -> 206 with `Content-Range: bytes <start>-<end>/<size>`, end clamped to size-1, suffix `bytes=-N` = last N bytes (start clamped to 0). All 200/206 responses set `Content-Length = end-start+1`. HEAD (or a zero-size file) ends after headers. The stream is created with `{start, end}`; a stream error destroys the response.
**DELETE /api/assets/<id>**: write guard (403s as above) -> missing file 404 empty -> `rmSync` -> 204 empty. Other methods -> 405. `/api/assets` with a method other than GET/POST -> 405.

#### Library: /api/library, /api/library/<id> (library.mjs:217)
Constants: `KINDS = [image, video, font, svg, gauge, panel, style, canvas]`; `ITEM_ID_RE = ^lib_[a-z0-9]{12}$`; `MAX_ITEM_BYTES = 8 MiB`; request body cap `MAX_ITEM_BYTES + 1024`; `MAX_META_BYTES = 64 KiB`; `LIST_DATA_BYTES = 256 KiB`; `MAX_FILES = 4096`; `MAX_COPIES = 1000`; `MAX_NAME = 200`. Items stored as `library/<id>.json`.
- **GET /api/library**: 200 JSON array of `summaryOf(item)` for every readable item (`read` requires a JSON object whose own `id` matches `ITEM_ID_RE` and `kind` is in KINDS), newest first by `createdAt` string `localeCompare`. `summaryOf`: when `data` exists and `JSON.stringify(data).length > 262144`, `data` is removed and `dataSize: <that length>` appended (after the other keys). No guard (open).
- **POST /api/library**: `libraryWriteRefusal` (403/403/415) -> body JSON parse of up to 8 MiB + 1024 (read error, oversize, invalid JSON -> 400 `expected a JSON body under 8 MB`; JSON `null` parses and then fails normalisation) -> `normalizeItem(raw)`; error -> 400 `<error>`; success -> **201** JSON the stored item.
- **/api/library/<id>**: id (rest of the raw pathname) not matching `ITEM_ID_RE` -> 404 empty for any method. GET: item JSON 200 (full `data`) or 404. PUT: guard, body (same 400), then `store.update`; missing item -> 404 (checked before validation errors) ; `normalizeItem` error -> 400; ok -> 200 item. DELETE: `libraryWriteRefusal(..., body=false)` (no content-type needed) -> 404 if absent else 204. Other methods 405 (also: any method on `/api/library` other than GET/POST).
- `normalizeItem(raw, existing)` errors (400 bodies, in check order): `expected an object`; `kind must be one of image, video, font, svg, gauge, panel, style, canvas` (kind taken from `existing.kind` on update); `kind cannot change` (update with a different `raw.kind`); `name is required` (name = `pick("name","")` string-truncated to 200 then trimmed; non-string counts as empty); `files must be asset ids` (not an array, > 4096, or any element not a string matching the asset `ID_RE`); `meta must be an object`; `meta is too large` (`JSON.stringify(meta).length > 65536`); `copies must be a list` (not array or > 1000); `item is too large` (`JSON.stringify(item).length > 8388608`). `pick(key, fallback)` = `raw[key]` if `key in raw`, else existing value, else fallback. Produced item: `{id (new "lib_" + 12 chars from 9 random bytes base64url, lowercased, non-alphanumerics replaced by "0" | existing.id), kind, name, createdAt (ISO now | existing), updatedAt (ISO now), files (deduped, first-seen order), meta, copies (normalised, invalid dropped), data? (only when not undefined)}`. `normalizeCopy`: object with non-empty string `profileId` (truncated 100), plus when strings: `pageId`, `zoneId`, `itemPath` (100), `label` (200), `at` (40). Unknown keys in `raw` are dropped.

#### Canvases: POST /api/canvases, GET /api/canvases/<id> (canvases.mjs:185)
Constants: `CANVAS_ID_RE = ^cnv_[a-f0-9]{32}$`; `CANVAS_FORMAT = "infopanel-canvas"`; `MAX_CANVAS_BYTES = 8 MiB`.
- **POST /api/canvases**: other methods 405. Order: `canvasWriteRefusal` (403 header, 403 locality, 415 type) -> body cap 8 MiB (exceed -> 413 empty) -> `store.put(text)`: `Buffer.byteLength(text) > 8388608` -> 400 `canvas is too large`; not JSON -> 400 `expected JSON`; not an object/is array/`format !== "infopanel-canvas"` -> 400 `expected a canvas (format "infopanel-canvas")`; ok -> 200 JSON `{"id":"cnv_<first 32 hex of SHA-256 of the UTF-8 text>"}`. The text is stored verbatim as `canvases/<id>.json` (same id and bytes if re-posted; an existing file just gets its mtime refreshed). Test: server.test.mjs "keeps canvases apart from the config" (20 canvases of ~310 KB each stored; refs used in a config that would be > 5 MB inline; POST without the header -> 403).
- **GET /api/canvases/<id>**: id (rest of path) not matching -> 404 for any method (checked first); method != GET -> 405; file missing/unreadable -> 404; else 200 JSON with the stored text verbatim. Open to LAN. No delete route.
- Server-side canvas handling elsewhere: POST /api/config validates canvas refs (422, above) and does **not** lift/inline canvases. After saves and at start, `sweepCanvases()` (server.mjs:143): at most once per `SWEEP_EVERY_MS = 10 min` (`lastSweep` gate, initial `-Infinity`), via `setImmediate`, reads `config.json` (if present) and calls `canvases.sweep(text, now)`, which deletes `canvases/<id>.json` files not referenced by any `canvasRef` string in the config and whose mtime is older than `SWEEP_GRACE_MS = 1 h`, plus orphan temp files `cnv_<32hex>.json.<uuid>.tmp` older than 1 h; does nothing when the config text has no `profiles` array. Errors are logged `canvas sweep failed:`. (File-level details: part B.)

#### Installed InfoPanel profiles: GET /api/infopanel/installed[/...] (infopanel-local.mjs:98)
- Order: method != GET -> 405 (HEAD included); non-loopback -> 403 `installed profiles are served to this computer only`; then:
  - exact `/api/infopanel/installed` -> 200 JSON array `[{"guid":"<guid>","name":"<name>","bytes":<size of profiles/<guid>.xml or 0>,"assets":["<sorted file names>"]}]` (empty array when `profiles.xml` is missing; non-ENOENT errors -> 500). `name` is XML-unescaped (`&lt; &gt; &amp; &quot; &apos;`). `assets`: entries of `assets/<guid>/` passing `isAssetName` (`^[^\\/:*?"<>|\0]+$` and not only dots), sorted by default string order.
  - `/api/infopanel/installed/<guid>/Profile.xml` -> that profile's own `<Profile>...</Profile>` element text from `profiles.xml`; `/DisplayItems.xml` -> bytes of `profiles/<guid>.xml`; `/assets/<name>` -> bytes of `assets/<guid>/<name>`. The remainder of the pathname is split on `/` and each segment `decodeURIComponent`-decoded; a decode error, wrong segment count, invalid guid (`^[0-9a-f]{8}-...-[0-9a-f]{12}$`, case-insensitive), invalid asset name, or missing file -> 404 empty (a bare `/api/infopanel/installed/` is 404).
  - 200 headers: `Content-Type: application/octet-stream` for assets else `application/xml; charset=utf-8`; `Cache-Control: no-store`; `X-Content-Type-Options: nosniff`.
- `profiles.xml` parsing: every `<Profile>...</Profile>` block (regex `<Profile>[\s\S]*?<\/Profile>`), fields via `<Guid>([^<]*)</Guid>` and `<Name>([^<]*)</Name>`; blocks with an invalid Guid are skipped.
- Data folder: `infopanelDataDir(process.env)` = `INFOPANEL_DATA_DIR` if non-empty else `path.join(LOCALAPPDATA || "", "InfoPanel")`, evaluated once at start (server.mjs:348).

#### SSE streams
Common to all three (server.mjs:224,248,434): response `200` with headers `Content-Type: text/event-stream`, `Cache-Control: no-store`, `Connection: keep-alive` (written with `writeHead`; no charset, no `X-Accel-Buffering`, no `retry:`/`id:`/`event:` fields). **No method check**: any method (GET, POST, HEAD...) that passes the request guard opens the stream. No other guard (open to LAN). Every event is a single line `data: <JSON>\n\n`. Each connection has its own `setInterval(() => res.write(": keep-alive\n\n"), 15_000)` (first tick 15 s after connect). On `req` `close`: clear the interval, remove the listener, run the debug `untrack`.
Debug channel accounting (`debug.sseOpen(channel)`, debug.mjs:32): increments a per-channel counter on connect and decrements (idempotently) on close; with `DASHBOARD_DEBUG=1` also logs `[debug] sse connect <channel> (<n> now)` and `[debug] sse disconnect <channel> (<n> now)`. Channels: `config`, `control`, `studio`, `extras`. `/api/server/stats.clients` = sum over all channels; `.studios` = the `studio` count.

**GET /events/config**: on connect writes `data: {"version":<configVersion>,"settingsRev":<settingsRev>}\n\n` (exactly this key order), then registers the response in `configListeners`; each `saveConfig` (POST or PATCH) writes the same shape with the updated numbers, **before** `control.configChanged()` and `alerts.configChanged()`. Channel `config`. Test: server.test.mjs "feeds a studio the Settings patches it missed" (first event has `settingsRev` = the value from `X-Settings-Rev`; after a PATCH the next event has `settingsRev` + 1). A listener write after the client vanished is not guarded.

**GET /events/control?profile=&page=&client=**:
Order on connect:
1. `writeHead(200, ...)`.
2. `shown = query.get("profile")` (empty string counts as absent). If set: `control.dispatch({type:"shown", profile: shown})` (error for an unknown profile is ignored).
3. If set: `kiosk = control.connect({profile: shown, page: query.get("page"), address: isLoopback(peer) ? peer : null})`, which registers an open kiosk in the control state (listed in `kiosks`; non-loopback kiosks have `address: null`, the state being public).
4. Write the current state: `data: <JSON control.get()>\n\n` (includes the kiosk just added).
5. Subscribe: every later change to the public state is written as the full state JSON (`data: {...}\n\n`).
6. Keep-alive timer.
7. Channel: `studio` when `!shown && query.get("client") === "studio" && isLoopback(peer)`, else `control` (so kiosk streams and unmarked or remote studio streams are `control`).
On close: clear timer, unsubscribe, untrack, `control.disconnect(kiosk)` (removes the kiosk from the state, which publishes to other subscribers). Tests: server.test.mjs "counts a studio's marked control stream" (`?client=studio` counts +1 in `studios`; `?profile=desk&client=studio` does not) and "lists a kiosk in the control state" (`kiosks` equals `[{profile:"desk", address:"127.0.0.1", ...}]` while open; empty after close; stream without profile is not a kiosk).

**GET /events/extras**: on connect `data: <JSON extras.state()>\n\n`, then each change (OBS state, calendar, agents; agent changes are throttled to 250 ms in part B) as the full state. Channel `extras`.

---

### 6. Environment variables (every read under server.mjs and server/)

| Variable | Read at | When | Parsing and default |
|---|---|---|---|
| `PORT` | server.mjs:62 | start | unset or `""` -> 3922; else `Number(value)`. `"0"` -> OS picks a free port (the start line shows the real one). Non-numeric -> NaN -> `listen` throws `ERR_SOCKET_BAD_PORT`, process exits non-zero. Out-of-range -> same kind of error. |
| `HOST` | server.mjs:63 | start | `process.env.HOST \|\| "127.0.0.1"` (empty -> loopback). Passed to `listen`; also feeds the Host allowlist (3.1). |
| `ALLOWED_HOSTS` | server.mjs:559 | start | comma separated; trimmed; empty entries dropped (`parseAllowedHosts`); each entry then `hostnameOf`-normalised (invalid ones dropped). |
| `DASHBOARD_DIST` | server.mjs:66 (env.mjs:7) | start | non-empty -> `path.resolve(value)`; else `<server.mjs dir>/dist`. |
| `DASHBOARD_DATA_DIR` | server.mjs:70 (env.mjs:10) | start | non-empty -> `path.resolve(value)`; else `<LOCAL>/InfoPanel/Dashboard` where `LOCAL = LOCALAPPDATA \|\| join(HOME \|\| ".", ".local", "share")`. Created with `mkdir -p` (server.mjs:111) before anything else. |
| `LOCALAPPDATA`, `HOME` | server.mjs:69 | start | only for the default data dir above. |
| `DASHBOARD_DEBUG` | server.mjs:68 | start | enabled only when exactly `"1"`. |
| `ALLOW_REMOTE_EDIT` | request-guard.mjs:110 | **per call** (`process.env` passed as default arg) | exactly `"1"` allows non-loopback config, settings and integrations writes. |
| `ALLOW_REMOTE_UPLOAD` | assets.mjs:302, canvases.mjs:186, library.mjs:200 | start of each module | exactly `"1"` lifts the loopback requirement of asset/library/canvas writes (the write headers are still required). |
| `ASSETS_MAX_BYTES` | assets.mjs:303 | start | `Number(value) > 0 ? Number(value) : 2 GiB` (2,147,483,648); fractional and exponent forms accepted. |
| `INFOPANEL_DATA_DIR` | infopanel-local.mjs:95 (via server.mjs:348) | start | non-empty -> as is (not `path.resolve`d); else `path.join(LOCALAPPDATA \|\| "", "InfoPanel")` (relative `InfoPanel` when `LOCALAPPDATA` is unset; note: no HOME fallback here, unlike DATA_DIR). |

`server/env.mjs` exports `resolveDist(env, fallback)`, `resolveDataDir(env, fallback)`, `readVersion(file)` (JSON `version` string of `<ROOT>/package.json`; "0.0.0" on any failure or non-string/empty). No other `process.env` reads exist under `server.mjs` or `server/` (verified by grep). `os.homedir()` (not env) is used by `agent-usage.mjs:156` and `claude-sessions.mjs:45` (part B). `os.hostname()` feeds the guard.

---

### 7. Process lifecycle

Start sequence (module top-level order): create `DATA_DIR` -> `configVersion = floor(mtimeMs of config.json)` or 0 -> `settingsRev = Date.now()` -> `createStudioPrefs` -> create control, alerts, agent usage, extras (`agentUsage.start()`), library/canvas stores, `createAssets` (deletes `.upload-*` temp files), `sweepCanvases()`, installed/font handlers -> `server = http.createServer(...)` -> `server.listen(PORT, HOST, cb)`.

**Start line** (server.mjs:605), printed with `console.log` (stdout) from the listen callback:
```
InfoPanel Studio on http://<HOST>:<actual port> (config: <absolute path of DATA_DIR/config.json>)
```
`<HOST>` is the literal `HOST` value used (e.g. `127.0.0.1`, `0.0.0.0`; not the resolved address); the port is `server.address().port` (so correct for `PORT=0`). Consumers: tests parse `/InfoPanel Studio on http:\/\/[^:]+:(\d+)/` (server.test.mjs:24, tools/perf/*); `tests/settings/model/logs.test.ts` parses the line for the Settings log view. With `DASHBOARD_DEBUG=1` a second line follows: `[debug] DASHBOARD_DEBUG=1: logging requests and SSE clients; stats at /api/debug/stats`.

Bind failures are not caught: Node's uncaught `listen` error prints `Error: listen EADDRINUSE: address already in use <host>:<port>` (or `listen EACCES`) on stderr and exits non-zero; `src-tauri/src/sidecar.rs:163` (`parse_bind_error`) scans server output lines for the substrings `listen EADDRINUSE` -> AddrInUse and `listen EACCES` -> Access. A port must emit lines containing exactly those substrings on a bind failure (other EACCES lines are not port errors).

Other stdout/stderr lines emitted (informational, logged by the app): `alerts muted until <ISO>`, `alerts unmuted` (control.mjs:339), `control.json save failed:`, `canvas sweep failed:`, `<METHOD> <pathname> failed:`, extras log lines (OBS, calendar; part B).

**Shutdown**: there is **no signal handling** in `server.mjs` or `server/` (grep for `SIGTERM`, `SIGINT`, `process.on` finds nothing). The process dies on the default signal behaviour; the desktop app kills the process (`probe.rs` `kill`). No graceful close of SSE streams, no flush: every persistent write is already atomic (tmp + rename), so none is needed. Timers `control` tick and agents sweep are `unref`'d; SSE keep-alive intervals are not (irrelevant once the server stops).

Implicit Node HTTP server defaults that a port may mirror: `requestTimeout` 300 s, `headersTimeout` 60 s, `keepAliveTimeout` 5 s, max header size 16 KiB, no `server.maxConnections`. Long-lived SSE and large uploads rely on these defaults (SSE requests are exempt from `requestTimeout` once headers are sent and the response is open).

---

### 8. Discrepancies and oddities

Keep exactly (a port that "fixes" these breaks behaviour or clients):

1. **No CORS and no preflight handling**: never add `Access-Control-*` or answer `OPTIONS` specially; the security model (custom `X-Dashboard-*` headers force a failing preflight; Origin / Sec-Fetch-Site checks on writes) depends on it. `OPTIONS` yields the route's 405.
2. **Guard order differs per family** (config/control/agent: content-type before header; asset/library/canvas: header, locality, then type; agent: locality first). The status a client sees for a doubly wrong request depends on it.
3. **`/api/control/<unknown>` is 404 before the 405 check**, and `/api/assets/<bad id>`, `/api/library/<bad id>`, `/api/canvases/<bad id>` are 404 for every method before any 405.
4. **Debug stats are 404 for non-GET when disabled**, 405 only when enabled.
5. **`/api/studio-prefs` locality check precedes the method check**: a remote client gets 403, not 405.
6. **`/api/server/stats` is available outside debug mode**; the desktop app depends on `clients` and `studios`.
7. **SSE routes ignore the method** (POST/HEAD also open a stream). Do not restrict to GET unless every client is verified; the app uses GET.
8. **The SPA fallback answers 200** `index.html` for any unknown path (including missing `.js`/`.css` files and anything that escapes DIST), not 404. Dotfile or `..` segments (checked after percent-decoding, split on `/`) are the only 404s. `Cache-Control` is `no-store` for html but `no-cache` (not `max-age`) for other static files; there is no ETag, so every request re-sends the file.
9. **Malformed percent-encoding in a static path gives 500** `internal error` (uncaught `URIError`), not 400/404.
10. **Backslash paths**: the traversal check only splits on `/`. On Windows `path.join` treats `\` as a separator, so `/..%5c..%5cfoo` is decoded to `..\..\foo`; it is not blocked by the segment check but the `startsWith(DIST + sep)` test sends any escape to the index fallback. A port on another path library must reproduce "escape -> index.html 200", not 404.
11. **`readBody` destroys the socket on overflow**, so the 413 / 400 the handler then sends is usually never seen; some handlers map an oversize body to 400 (`control`, `integrations`, `studio-prefs`, `agents`, `library`) and others to 413 (`config`, `settings`, `canvases`). Reproduce the per-route status/message in code even if the client rarely sees it. Uploads (assets) check `Content-Length` up front and answer 413 with `Connection: close` before reading.
12. **`X-Settings-Rev:` with an empty value reapplies the whole 50-entry log** (`Number("") === 0`). An absent or non-numeric header reapplies nothing.
13. **The posted config body is stored verbatim** (byte-for-byte, no re-serialisation) except when settings patches are reapplied, in which case it becomes compact `JSON.stringify` of the reapplied object. **PATCH always writes compact `JSON.stringify` of the merged config**, and `withKey` moves the changed top-level keys (`general`, `style`, `profiles` entries' `performance`) to the *end* of their object; `profiles` is also rebuilt at the end of the config object. JSON number formatting is JS's (`1.0` -> `1`, `1e21`, etc.). A Rust port needs order-preserving JSON (serde_json `preserve_order`) and the same relocation to keep saved files byte-identical; semantically the tests compare with `toEqual` (order-insensitive).
14. **PATCH with an empty or non-object `general`/`style` in the stored config**: merging `{}` into a missing/empty/non-object `general` deletes the `general` key; `patch.profiles = {}` on a config without a `profiles` array writes `"profiles": []` into the config.
15. **PATCH 404 `no config saved yet` precedes patch validation**, and the stored-config-not-an-object 409 precedes the patch-shape 400.
16. **PATCH has no downgrade guard and no canvas-ref check**, despite the comment "Same guards as POST /api/config". Neither can apply: a patch only merges Settings keys into the stored config and never changes its `version` or its canvas refs (decided at Gate 3A: keep).
17. **`locale` validity is runtime-defined** (`Intl.DateTimeFormat.supportedLocalesOf`); the port needs a BCP 47 validity check and should accept at least `""`, `en`, `en-US`, `nb-NO`, `de`. Anything that Node/ICU rejects is 400.
18. **Image proxy maps a blocked address to 504, not 403**, as it does DNS failure, TLS errors and timeouts (only a *redirect* to a disallowed scheme/loopback gives 502 `redirect refused`). 504 and 502 bodies are as stated (504 empty). A timeout after the headers arrived gives 502.
19. **Image proxy sends different upstream headers by scheme** (loopback http: library default headers, no `InfoPanel-Studio` UA; https: UA `InfoPanel-Studio` and `accept: image/*,*/*;q=0.8`), and the loopback path decompresses gzip transparently. An allowed image/* type is served as-declared even if the bytes are not that format (only octet-stream/empty is sniffed). `image/svg+xml` is refused (406), the response is never the upstream's `Content-Type` for sniffed cases.
20. **Hop limit semantics**: both proxies follow at most three redirects (four requests). Image proxy: the 4th response being a redirect -> 502 `redirect refused`. Font proxy: error text `<url>: too many redirects` -> 502.
21. **Font proxy has no address blocking** (hosts are an allowlist; DNS is not pinned) and applies `proxyAllowed` only to the initial URL's *hostname* (any port, any userinfo); `hopAllowed` (broader list) applies to the first fetch and to each hop. The catalogue path returns an empty 200 when it has neither a fresh fetch nor a stale cache (the page shows "throttled?"). Both servers give the whole fetch (hops and body) a 60 s deadline: **504** empty if it passes before the final response's headers, **502** empty after, as the image proxy answers (the catalogue falls back to its stale copy first).
22. **`url === CATALOGUE` is an exact string comparison**: `https://www.fontsquirrel.com/api/fontlist/all?x=1` is fetched uncached.
23. **`/api/integrations` GET and `/api/alerts/history`, `/api/control` GET, `/api/extras`, `/api/config` GET are open to the LAN** (kiosks read them). Only the writes are guarded; control writes only need the control header (any LAN host).
24. **Agent endpoints return 204 for ignored payloads** (unknown agent, non-object payload, missing ids); only malformed/empty JSON gives 400.
25. **`HOST` handling**: only the exact strings `0.0.0.0` and `::` enable the "any IP literal and machine name" Host allowance; `HOST=::1` (bare) is dropped from the name set but `[::1]` is already always allowed. `ALLOWED_HOSTS` entries with a port keep only the hostname.
26. **`INFOPANEL_DATA_DIR` default differs from the data dir default** (relative `InfoPanel` when `LOCALAPPDATA` is unset, no HOME fallback, and the env value is not `path.resolve`d).
27. **`/api/health` app id stays `infopanel-dashboard`** (legacy name; probe.rs matches on it); the start-line text uses the new name `InfoPanel Studio`. Do not unify.
28. **Library `GET` list order** uses `String.localeCompare` on ISO timestamps; any stable descending sort on the ISO string gives the same order. Item id suffix is random; clients treat it opaquely but it must match `^lib_[a-z0-9]{12}$`.
29. **`configVersion` after a save** is `max(Date.now(), previous + 1)` (monotonic ms clock, strictly increasing); the initial value is the integer-floored file mtime in ms. `/api/health.configVersion` and SSE `version` share it. `settingsRev` is independent (ms clock at start, +1 per PATCH).
30. **Debug request log** runs only for requests that passed the guard and fires on response `close` (also for SSE, at disconnect), so SSE lines appear late.

## Server contract, part B: data folder, timers, modules, agent hooks

Scope: persisted state, background work and module behaviour of `server.mjs` + `server/*.mjs`, plus `tools/agent-*.mjs`. HTTP routes, guards, headers and env vars are part A. Citations are `file:line` in `E:\GitHub\MyRepos\InfoPanel.Studio`. "JS" quirks are called out where a Rust port will differ by default (number formatting, URL serialisation, UTF-16 length, sort order).

General rules that apply to every file below:
- Data folder `DATA_DIR` = `DASHBOARD_DATA_DIR` (resolved to absolute, `server/env.mjs:9`), else `%LOCALAPPDATA%\InfoPanel\Dashboard` (`server.mjs:69-70`; non-Windows fallback `$HOME/.local/share/InfoPanel/Dashboard`). `mkdirSync(DATA_DIR, recursive)` at startup (`server.mjs:111`). Sub-folders (`assets`, `library`, `canvases`, `cache`) are created lazily on first write.
- Every JSON file is read with `readFileSync(utf8)` + `JSON.parse`; any exception means "absent/default" (nothing is ever repaired on disk at read time; the next write replaces the file).
- Unless stated, JSON is written compact (`JSON.stringify(x)`, no trailing newline, UTF-8 no BOM).
- Atomic writes are `write <name>.tmp` then `rename` over the target. The tmp name is fixed (`<file>.tmp`) except library/canvases (`<file>.<uuid>.tmp`) and assets (`.upload-<uuid>.tmp`). A crash leaves a stray tmp; it is only cleaned for assets (startup) and canvases (sweep).
- InfoPanel's own folder (`INFOPANEL_DATA_DIR`, else `%LOCALAPPDATA%\InfoPanel`, `infopanel-local.mjs:95`) is read-only. The user home (`~/.claude`, `~/.codex`) is read-only for the server; only `tools/agent-install.mjs` writes there.

---

### 1. Files in the data folder

| Path (under DATA_DIR) | Owner module | Written by | Format | Write strategy |
|---|---|---|---|---|
| `config.json` | server.mjs | `saveConfig` | the studio config (opaque JSON object) | tmp+rename, raw body |
| `control.json` | control.mjs | `commit` | durable control state | tmp+rename, compact |
| `alerts.json` | alerts.mjs | debounced `save` | `{history:[...]}` | tmp+rename, compact |
| `integrations.json` | integrations.mjs | `apply` | OBS + calendar settings (secrets) | tmp+rename, pretty, mode 0600 |
| `studio-prefs.json` | studio-prefs.mjs | `apply` | `{ "studio.previewData": ... }` | tmp+rename, compact |
| `assets/<sha256>.<ext>` | assets.mjs | upload route | raw media bytes | stream to tmp, rename |
| `library/lib_<12>.json` | library.mjs | library routes | one item per file | tmp+rename (uuid tmp), compact |
| `canvases/cnv_<32>.json` | canvases.mjs | canvas route | imported canvas, verbatim text | tmp+rename (uuid tmp), verbatim |
| `cache/fontsquirrel-list.json` | font-proxy.mjs | catalogue fetch | upstream bytes | direct `writeFile` |

No other file is created in DATA_DIR. (`grep` of `writeFileSync|renameSync|mkdirSync|rmSync|unlink|utimesSync|chmod` over `server.mjs` and `server/*.mjs` yields exactly the sites below; `agent-usage`, `claude-sessions`, `infopanel-local`, `calendar`, `obs`, `agents` write nothing.)

#### 1.1 `config.json`
- Write: `saveConfig(json)` writes `config.json.tmp` then renames (`server.mjs:128-131`). The body string is written **exactly as received** from `POST /api/config` (`server.mjs:390`): no re-serialisation, no trailing newline added. Only the Settings PATCH path re-serialises: `JSON.stringify(result.config)` compact (`server.mjs:430`), and the settings-rev replay `JSON.stringify(reapplySettings(parsed, settingsLog, knownRev))` (`server.mjs:385`). Key order is preserved (`withKey` removes then re-adds the key at the end; `config-settings.mjs:70-73`; `mergeKeys` drops a key whose object becomes empty, returning `undefined` => key removed, `config-settings.mjs:55-62`).
- Read: served as raw bytes on GET (`server.mjs:355`). Parsed (`readConfigFile`, `server.mjs:156-162`, null on error) by control, alerts, canvas sweep, settings patch, version guard. Cap 5 MiB (`server.mjs:81`).
- Side effects of a save (in order, `server.mjs:132-137`): `configVersion = max(Date.now(), configVersion+1)`; write `data: {"version":V,"settingsRev":R}\n\n` to every `/events/config` listener; `control.configChanged()`; `alerts.configChanged()`; `sweepCanvases()`.
- `configVersion` at start = `floor(mtimeMs)` of the file, or 0 when absent (`server.mjs:114`). `settingsRev` starts at `Date.now()` and `settingsLog` (max 50 `{rev,patch}`, oldest dropped) is memory only (`server.mjs:119-121, 427-429`).
- Downgrade guard `versionRefusal(storedText, incoming)`: 409 when stored `version` (number, else 0) > incoming `version` (number, else 0); unparsable stored text => accept (`config-guard.mjs:12-21`). Referenced-canvas check: every `canvasRef` (any depth) must exist in `canvases/` or 422 (`server.mjs:388-389`); skipped when body has no `profiles` array.
- Fields the server itself reads from the config: `profiles[].id`, `profiles[].pages[].id`, `profiles[].rotate{enabled,pages[],seconds}`, `profiles[].island.enabled`, `activeProfile` ("auto" or an id), `alerts{...}` (section 3.2), `dataApiUrl` (alerts.mjs:544), `general`, `style`, `profiles[].performance` (settings patch), `canvasRef` anywhere. Everything else is opaque and must round-trip untouched (the server never re-serialises the POSTed body).

#### 1.2 `control.json`  (control.mjs)
Durable part only (`control.mjs:295-298`), written whenever `JSON.stringify(durable)` differs between old and new state (`:335`), tmp+rename, compact:
```json
{"profile":null,"pages":{"desk":"stream"},"override":{"desk":"on"},"mutedUntil":1700000600000,
 "dim":{"desk":0.4},"dimLevel":{"desk":0.4},"islandOverride":{"desk":"off"}}
```
Key set asserted by `control.test.mjs:300-310` (`dim, dimLevel, islandOverride, mutedUntil, override, pages, profile`). Key order in file = order above.
Read normalisation (`control.mjs:300-321`):
| Field | Rule |
|---|---|
| `profile` | string else `null` (not checked against config) |
| `pages`, `override` | any plain object kept **as is**, values unchecked (non-objects/arrays => `{}`) |
| `mutedUntil` | number with `now < v <= now + 1440*60000` else `null` (an elapsed mute loads as null) |
| `dim`, `dimLevel` | entries kept only when number in [0.1, 0.9] |
| `islandOverride` | entries kept only when `"on"` or `"off"` |
| everything else | defaults from `emptyState()`; `reload` is set to `now()` at start (`:328`) |
Runtime only (never persisted): `shown`, `nextAt`, `alerts`, `kiosks`, `reload`, `reloads`, `reloadAt`. Parse failure or missing file => `emptyState()`. Write failure is logged (`control.json save failed:`), state still updates.

#### 1.3 `alerts.json`  (alerts.mjs)
`{"history":[ {id,ruleId,name,severity,text,startedAt,endedAt?,dismissed?,acknowledgedAt?,test?,quiet?} ... ]}` newest first, max 200 (`HISTORY_MAX`, `:16`). Active alerts are never persisted.
- Read (`loadHistory`, `:530-542`): `raw.history` must be an array; keep objects with string `id`; entries lacking `endedAt` get `endedAt = now` (they ended with the server); `slice(0,200)`; other fields trusted verbatim. Any error => `[]`.
- Write (`save`, `:572-581`): compact `{"history":...}` via `alerts.json.tmp`+rename. Debounced: when `state.history !== saved` and no timer is pending, `setTimeout(save, 1000)` (unref) after each `apply` (`:615-618`). `stop()` flushes if a timer is pending (`:688-691`). Last write within 1 s of a crash is lost.

#### 1.4 `integrations.json`  (integrations.mjs)
Pretty-printed (`JSON.stringify(state,null,2)`, 2-space, **no trailing newline**), `{mode:0o600}` then `chmodSync 0o600` (no-op semantics on Windows), `mkdirSync(dirname)` first, tmp `integrations.json.tmp` (`:129-134`).
```json
{
  "obs": { "host": "127.0.0.1", "port": 4455, "password": "hunter2" },
  "calendar": { "links": [ { "id": "id1", "label": "Work", "url": "https://calendar.example.com/private/abc/basic.ics" } ] }
}
```
(example from `integrations.test.mjs:18-25`). Defaults `emptyIntegrations()` = `{obs:{host:"",port:4455,password:""},calendar:{links:[]}}` (`:17`).
Read normalisation `normalizeIntegrations` (`:42-57`): non-object => defaults. `obs.host` = `cleanHost`; `obs.port` = `cleanPort(obs.port ?? 4455)`; `obs.password` = string as-is (no trim, no length cap on read), else `""`. Links: only object entries; `{id: trim(≤64), label: trim(≤40), url: cleanCalendarUrl(url)}`; dropped when id empty or url null; first 10 kept.
- `text(v,max)` = string ? `v.trim().slice(0,max)` : `""` (`:20`). Trim then truncate (UTF-16 units).
- `cleanHost`: `text(v,253)` must match `/^(\[[0-9a-f:.]+\]|[a-z0-9._-]+)$/i` else `""` (`:23-26`).
- `cleanPort`: `Number(v)` integer in 1..65535 else 4455 (`:28`). JS coercions: `null`,`""`,`false` -> 0 -> 4455; `true` -> 1 -> port 1; `"4455"` -> 4455.
- `cleanCalendarUrl`: `text(v)` (≤2048, trimmed), `^webcals?://` (case-insens) -> `https://`, then `new URL(raw)`; only `https:`/`http:`; returns `u.toString()` (WHATWG serialisation: lowercase host, default port stripped, path `/` added, percent-encoding normalised). A Rust port must reproduce WHATWG serialisation or the stored string differs from what Node would write (affects link ids matching nothing, but `lastGood` keys and display host). Prefer the `url` crate (WHATWG-conformant).
- `apply(patch)` (`:72-110`) described in section 3.7. Listeners get `(next, prev)` after the file is written (`:135`).

#### 1.5 `studio-prefs.json`  (studio-prefs.mjs)
`{"studio.previewData":"live"|"frozen"|"frozenWhenUnfocused"}`; only this one key is known (`:10-12`). Read: `normalizePrefs` keeps known keys with a valid value, drops everything else (`:17-20`); parse error => `{}`. Write: `applyPrefs` validates **every** patch key (`unknown preference <k>` / `<k> takes a, b, c` => 400 via route) then `{...normalizePrefs(prefs), ...patch}`; written compact to `studio-prefs.json.tmp`+rename (`:45-47`). An empty patch `{}` still writes the file (`{}` or the current prefs). A non-object patch => `expected a JSON object`. File never reaches kiosks (not in config). Cap on PUT body 4 KiB (`server.mjs:84`, route in part A).

#### 1.6 `assets/`  (assets.mjs)
Flat folder of content-addressed files `<64 hex>.<ext>`, `ID_RE = /^[a-f0-9]{64}\.(png|jpg|gif|webp|avif|bmp|ico|svg|mp4|webm|ttf|otf|ttc|woff|woff2)$/` (`:35`). Hash = SHA-256 of the stored bytes, lowercase hex; `ext` = the **sniffed** (and declared-agreeing) type. Same bytes => same file (upload dedupes: if target exists the tmp is deleted, `:387`). Files are immutable; the only mutations are create and `DELETE /api/assets/<id>`.
Upload pipeline (`handleUpload` `:344-395`, `receive` `:246-294`): declared `Content-Type` -> accepted type (else 415) -> per-type size limit -> `Content-Length` pre-check (413) -> quota (429/507) -> stream body into `.upload-<uuid>.tmp` (flags `wx`) hashing as it goes -> reject (413 over limit; 415 when the first 1024 bytes, or the whole body if shorter, do not sniff to the **same ext** as declared; 400 empty/aborted) -> rename to `<digest>.<ext>`. Response `{id,url:"/api/assets/<id>",type:<mime>,size}`.
Temp files `.upload-*` are removed at startup (`:307-312`, only if the folder exists) and count toward quota (`dirBytes` sums every regular entry's size, `:207-218`).
Size caps: image 25 MiB, video 300 MiB, font 30 MiB, SVG 256 KiB (`LIMITS`, `SVG_LIMIT`, `:38-41`); total store cap `ASSETS_MAX_BYTES` (>0) else 2 GiB (`:71, 303`), checked `used + (Content-Length>0 ? Content-Length : limit) > max` => 507; `inFlight >= 2` => 429 (`:225-229`).
Extension -> MIME/kind table (`TYPES`, `:44-60`): png image/png; jpg image/jpeg; gif image/gif; webp image/webp; avif image/avif; bmp image/bmp; ico image/x-icon; svg image/svg+xml (limit 256 KiB); mp4 video/mp4; webm video/webm; ttf font/ttf; otf font/otf; ttc font/collection; woff font/woff; woff2 font/woff2.
MIME aliases accepted for the declared type (`:141-151`): video/x-matroska, video/matroska -> webm; image/x-ms-bmp -> bmp; image/vnd.microsoft.icon -> ico; font/sfnt, application/x-font-ttf -> ttf; application/x-font-otf, application/vnd.ms-opentype -> otf; application/font-woff -> woff. Declared type: split on `;`, trim, lowercase. `image/jpg` is not accepted.
**Sniff table** (`sniffType`, `:117-138`; checked **in this order**, first match wins; `buf` = first <=1024 bytes):
| # | ext | Test |
|---|---|---|
| 1 | png | starts `89 50 4E 47 0D 0A 1A 0A` |
| 2 | jpg | starts `FF D8 FF` |
| 3 | gif | ascii[0..6] is `GIF87a` or `GIF89a` |
| 4 | webp | ascii[0..4]=`RIFF` and ascii[8..12]=`WEBP` |
| 5 | bmp | ascii[0..2]=`BM`, len>=18 and u32LE@14 in {12,40,52,56,64,108,124} |
| 6 | ico | starts `00 00 01 00`, len>=6 and u16LE@4 > 0 |
| 7 | webm | starts `1A 45 DF A3` (EBML; Matroska and WebM both stored as webm) |
| 8 | ttf | starts `00 01 00 00` or ascii[0..4]=`true` |
| 9 | otf | `OTTO` |
| 10 | ttc | `ttcf` |
| 11 | woff | `wOFF` |
| 12 | woff2 | `wOF2` |
| 13 | svg | `isSvgText(buf.toString("utf8"))` |
| 14 | avif / mp4 | `sniffFtyp` below, else null |
`sniffFtyp` (`:85-95`): need len>=16 and ascii[4..8]=`ftyp`; `boxEnd = min(u32BE@0, len)`; major=ascii[8..12]; compatible brands = 4-byte groups at offsets 16,20,... while `i+4 <= boxEnd`; if major or any compatible in {`avif`,`avis`} => avif; else mp4 iff major in {isom, iso2, iso4, iso5, iso6, mp41, mp42, avc1, dash, `M4V `, mmp4, MSNV} (compatible brands do not count for mp4; HEIC/QuickTime/audio => null).
`isSvgText` (`:102-111`): strip one leading U+FEFF; loop: strip leading whitespace, then strip one of `<?...?>`, `<!--...-->`, `<!DOCTYPE ... [ ... ]? >` (case-insens, DOCTYPE needs whitespace after it); stop when none; result must match `^<svg[\s>/]` (case-sensitive `svg`). A prologue not finished inside the 1024-byte window is NOT svg (so an SVG with >~1 KiB of leading comments is refused with 415). Note: `buf.toString("utf8")` of a window cut mid-character produces U+FFFD but only the tail is affected.
Serving (`serveAsset`, `:405-435`): `Content-Type` from extension, `Cache-Control: public, max-age=31536000, immutable`, `X-Content-Type-Options: nosniff`, svg adds CSP `default-src 'none'; style-src 'unsafe-inline'; img-src data:; sandbox`, `Accept-Ranges: bytes`; `Range` handling `parseRange` (`:184-198`): single `bytes=a-b|a-|-n`; suffix 0 or empty file => 416; `end<start` => ignore range (200 full); `start>=size` => 416; end clamped. Listing (`list`, `:321-332`): files matching `ID_RE`, each `{id,url,type,kind,size,mtime:floor(mtimeMs)}`, sorted by mtime descending (stable ties unspecified). `?unused=1` (`:334-342`): used set = every 64-hex run (regex `(?<![a-f0-9])[a-f0-9]{64}(?![a-f0-9])`) in `config.json` text + every library item file text + every canvas file text; list excludes assets whose first-64 hash is in the set.
Delete (`handleDelete`, `:397-403`): header + loopback, 404 if absent, `rmSync`, 204. **The server does not check whether the file is in use.**

#### 1.7 `library/`  (library.mjs)
One file per item `lib_<12 chars [a-z0-9]>.json`, `ITEM_ID_RE=/^lib_[a-z0-9]{12}$/` (`:24`). New id = `lib_` + `randomBytes(9)` as base64url, lowercased, any char outside [a-z0-9] -> `0`, first 12 chars (`:44`). There is no index file: `list()` reads every `lib_*.json`, drops unreadable/invalid ones (must be object, id matches, kind in KINDS), sorts by `createdAt` descending using `String(b).localeCompare(String(a))` (ISO strings, so lexicographic order is equivalent) (`:114-144`). Kinds: `image, video, font, svg, gauge, panel, style, canvas`.
Item shape (`normalizeItem`, `:65-100`), example from `library.test.mjs:15-35`:
```json
{"id":"lib_abcdefghijkl","kind":"image","name":"Nebula","createdAt":"2026-10-17T12:00:00.000Z","updatedAt":"2026-10-17T12:00:00.000Z",
 "files":["aaaa...64.png"],"meta":{"w":1920,"tags":["Dark"]},"copies":[{"profileId":"p","zoneId":"z"}],"data":{}}
```
Key order: `id, kind, name, createdAt, updatedAt, files, meta, copies, data?`. Rules: raw must be an object; kind (from existing on update, else raw) in KINDS, and `raw.kind` may not differ on update (`kind cannot change`); `name` = `slice(0,200)` then trim, required; for update each field is `raw[key]` if the key is present in raw else existing else default; `files` array <=4096 of strings each matching the **asset** `ID_RE`, de-duplicated preserving first occurrence; `meta` plain object with `JSON.stringify(meta).length <= 65536`; `copies` array <=1000, each normalised by `normalizeCopy` (object with non-empty `profileId` ≤100; optional `pageId`,`zoneId`,`itemPath` ≤100, `label` ≤200, `at` ≤40, each only when it is a string, order profileId,pageId,zoneId,itemPath,label,at; invalid entries dropped); `data` any JSON, kept when `!== undefined` (JSON `null` is kept; it cannot be removed by an update); whole item `JSON.stringify(item).length <= 8*1024*1024` (UTF-16 length, not bytes). Timestamps `now.toISOString()` (millisecond Z). Errors are the literal strings in the source (`name is required`, `files must be asset ids`, ...).
List response uses `summaryOf`: items whose `JSON.stringify(data).length > 262144` get `data` removed and `dataSize` added (`:103-109`). `GET /api/library/<id>` returns the whole item.
Write: `mkdir -p library`, `library/<id>.json.<uuid>.tmp` -> rename (`:126-132`). Delete: removes only the item JSON (`:161-166`). **"Never delete a used file" lives in the client**: `src/components/library/remove-item.ts:27-41` deletes the item, then fetches `GET /api/assets?unused=1`, and only calls `DELETE /api/assets/<id>` for held ids that are in the unused list and not named in the studio's unsaved config. The server side contributes (a) the `?unused=1` scan, which counts config + all library items + all canvas files, and (b) a library item that still lists a file keeps it "used". A port must keep `?unused=1` semantics exactly and must not add or remove any use-check on `DELETE /api/assets`.
`texts()` (used by `?unused=1`) = raw text of every `*.json` in `library/` (note: filter is `endsWith(".json")` only, no id check; unreadable => `""`).

#### 1.8 `canvases/`  (canvases.mjs)
One file per canvas `cnv_<32 lowercase hex>.json`, `CANVAS_ID_RE=/^cnv_[a-f0-9]{32}$/`. Id = `cnv_` + first 32 hex chars of SHA-256 of the **UTF-8 bytes of the request text** (`canvasIdOf`, `:45`). The file contains that text verbatim (no re-serialisation). Content never changes; an edit is a new id.
- `put(text)` (`:110-126`): `canvasRefusal`: `Buffer.byteLength(text) > 8 MiB` => `canvas is too large`; not JSON => `expected JSON`; not a plain object with `format === "infopanel-canvas"` => `expected a canvas (format "infopanel-canvas")`. If the file exists it is **touched** (`utimesSync(now, now)`) so it is young again, nothing rewritten; else `mkdir -p`, write `<file>.<uuid>.tmp`, rename. Returns `{id}`.
- `get` returns the file text. `has(id)` = file exists. No delete route.
- `referencedCanvasIds(configText)` (`:66-85`): `null` when the text is not JSON or is not an object with a `profiles` array (then nothing may be swept or checked); else the set of string values of every key literally named `canvasRef`, found at any depth in objects/arrays (once a `canvasRef` key matches, its value is not descended into).
- **Sweep** (`sweep`, `:132-151`; scheduled by `server.mjs:140-154`): for every entry in the folder: a tmp file matching `^cnv_[a-f0-9]{32}\.json\.<uuid>\.tmp$` or a canvas file whose id is not referenced. Skip anything else (including referenced canvases and foreign names). Delete when `now - mtimeMs > graceMs` (`SWEEP_GRACE_MS` = 1 h; an entry exactly 1 h old is kept: `<= graceMs` skips). Stat/remove errors are ignored.
- Scheduling: `SWEEP_EVERY_MS` = 10 min (`:38`). `sweepCanvases()` runs once at start (`server.mjs:347`) and after every config save (`:137`); it is rate-limited by `lastSweep` (initially `-Infinity`; set to `now` **before** the work is scheduled) so at most one per 10 min. The work runs in `setImmediate`, re-reads `config.json` from disk (not the in-memory body), and does nothing when the file does not exist. There is no timer: if no save happens, no sweep happens after startup.
- `texts()` for `?unused=1`: raw text of each `cnv_*.json`.

#### 1.9 `cache/`  (font-proxy.mjs)
`cache/fontsquirrel-list.json` = upstream bytes of `https://www.fontsquirrel.com/api/fontlist/all` (`:19`). Fresh when mtime age < 7 days (`:78-80`); otherwise refetch via `fetchBytes` (3 manual redirects, each hop must be https on one of `api.fontsource.org, cdn.jsdelivr.net, fonts.google.com, fonts.gstatic.com, www.fontsquirrel.com`, body cap 30 MiB, header `User-Agent: infopanel-studio`); only a body that `JSON.parse`s replaces the cache (written with `fs.writeFile`, no tmp, after `mkdir -p cache`); on any failure serves the stale file, or an empty body when none. Route behaviour is part A.

#### 1.10 InfoPanel's folder (read-only)  (infopanel-local.mjs)
Root = `INFOPANEL_DATA_DIR` else `%LOCALAPPDATA%\InfoPanel` (`:95`). Reads:
- `profiles.xml`: scanned with regex `<Profile>[\s\S]*?</Profile>` (non-greedy; a nested `</Profile>` ends the match). Inside each: `<Guid>` and `<Name>` via `<Tag>([^<]*)</Tag>` first match. Entries whose Guid is not `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$` (case-insens) are skipped. Name decoded for only `&lt; &gt; &amp; &quot; &apos;` in one pass (`:31-32`). Output `{guid,name,xml:<the matched <Profile>…</Profile> text>}`.
- `profiles/<guid>.xml`: only `stat().size` (list) or raw bytes (`DisplayItems.xml`).
- `assets/<guid>/`: `readdir`, filtered by `isAssetName` (`^[^\\/:*?"<>|\0]+$` and not all dots) and sorted with JS default sort (UTF-16 code-unit order, so uppercase before lowercase); bytes via `assets/<guid>/<name>`.
List item: `{guid,name,bytes:itemsFileSize|0,assets:[names]}`. Missing `profiles.xml` (ENOENT/ENOTDIR) => `[]`; other read errors propagate (500 from the route). Reads: `Profile.xml` = the stored `<Profile>` element text, `DisplayItems.xml`, `assets/<name>` — everything else null => 404. All paths built only from a validated guid + a plain name.

#### 1.11 Files outside the data folder the server reads
- `~/.claude/projects/**/*.jsonl` (depth<=4) and `~/.codex/sessions/**/rollout-*.jsonl` (any `*.jsonl`, depth<=4): token scan (section 3.12).
- `~/.claude/sessions/<anything>.json`: live Claude sessions (3.13).
- `package.json` in the server root for `/api/health` version (`env.mjs:14-20`, `"0.0.0"` fallback).
`tools/agent-install.mjs` writes `~/.claude/settings.json` and `~/.codex/hooks.json` (section 4).

---

### 2. Timers and background work

| # | What | Interval / trigger | Does | Publishes | Source |
|---|---|---|---|---|---|
| 1 | Control tick | `setInterval` 1000 ms from `createControl` (unref) | `dispatch({type:"tick"})`: expire mute, rotate due profiles | control SSE only when the *public* view or durable part changed (`nextAt` moves silently) | control.mjs:17, 363 |
| 2 | Alerts tick | `setInterval` 1000 ms (unref) | `evaluate()` with cached readings, even without new data (drives `forSeconds`, expiry, `missing`) | `control.setAlerts(list)` when the active list JSON changed; page-switch dispatches | alerts.mjs:20, 653 |
| 3 | Alerts history save | one-shot 1000 ms (unref) after history changes | write `alerts.json` | nothing | alerts.mjs:21, 615 |
| 4 | Data API SSE reader | one `fetch` stream per distinct prefix URL; opened at start and on each config save when keys changed | parse events, merge readings, `evaluate` on every event | as #2 | alerts.mjs:483-526, 640-651 |
| 5 | SSE reconnect backoff | after the stream ends/errors or HTTP !ok: `setTimeout(run, delay)` (unref), `delay` 1000 ms doubling to 30000 ms; reset to 1000 on a successful (2xx with body) response | reconnect | nothing | alerts.mjs:22-23, 487-516 |
| 6 | Agents sweep | `setInterval` 30000 ms (unref) | `refresh()`: merge Claude session files, expire stale sessions, Codex plan, attach usage totals | extras SSE if the *public* agents JSON changed (throttled 250 ms) | agents.mjs:309 |
| 7 | Agents publish throttle | `setTimeout` 250 ms (unref) coalescing bursts | calls `onChange` once | extras SSE | agents.mjs:285-295 |
| 8 | Agent usage scan | `start()`: immediate `scan()`, then `setInterval` 60000 ms (unref); a scan is skipped if one is still running | read new lines of changed `.jsonl` files (8 MiB chunks, `setImmediate` between chunks) | `onScan` => `extras.agents.refresh()` after every scan | agent-usage.mjs:25, 265-292; server.mjs:172 |
| 9 | Calendar refresh | `reconfigure()` at start and whenever `integrations.calendar` JSON changes: refresh now, then a self-rescheduling `setTimeout` of 600000 ms (10 min) after each refresh finishes (not unref'd) | fetch every link (parallel), expand to events | extras SSE `onChange` on every refresh | calendar.mjs:13, 164-218 |
| 10 | OBS reconnect | `connect()` on `reconfigure()`; on close/ctor error `setTimeout(connect, delay)`; `delay` 5000 ms doubling to 60000 ms; `delay` resets to 5000 when a Hello->Identified turns `connected` true, and on every `reconfigure()` | open `ws://host:port` | extras SSE on state change | obs.mjs:9-10, 91-136 |
| 11 | Canvas sweep | not a timer: at start and after config saves, rate limit 10 min, `setImmediate` | see 1.8 | nothing | server.mjs:140-154 |
| 12 | SSE keep-alives | `setInterval` 15000 ms per open `/events/config`, `/events/control`, `/events/extras` stream writing `: keep-alive\n\n` | comments | n/a | server.mjs:236, 257, 442 |
| 13 | Asset upload tmp cleanup | once at construction | delete `.upload-*` in assets/ | n/a | assets.mjs:307 |
| 14 | Proxy / fetch timeouts | image proxy 10 s (`PROXY_TIMEOUT_MS`), calendar fetch 15 s, agent-status post 1 s | abort | n/a | server.mjs:86; calendar.mjs:14 |

Notes: all timers except the calendar chain and keep-alives are `unref`'d (do not keep the process alive; irrelevant for a long-running Rust server). `agentUsage.start()` is called after `extras` exists (`server.mjs:172-174`) because a scan with no files completes synchronously and calls `extras.agents.refresh()`. `createAgents` calls `refresh()` once at construction (`agents.mjs:308`). `createExtras` calls `obs.reconfigure()` and `calendar.reconfigure()` synchronously at start (`extras.mjs:27-28`).

---

### 3. Module specifications

#### 3.1 control.mjs

**State** (`emptyState`, `:31-34`): `{profile:null, shown:null, pages:{}, override:{}, nextAt:{}, alerts:[], mutedUntil:null, dim:{}, dimLevel:{}, islandOverride:{}, reload:0, reloads:{}, reloadAt:null, kiosks:{}}`. Constants: `ROTATE_PAUSE_MS=30000`, `DIM_DEFAULT=0.6`, `DIM_MIN=0.1`, `DIM_MAX=0.9`, `MUTE_MAX_MINUTES=1440`, `RELOAD_COALESCE_MS=2000`, rotation clamp 3..3600 s default 15 (`rotateMs`, `:80-83`; `Number(rotate.seconds)` finite else 15).

**Helpers.**
- `targetProfile(state, config, id)`: first of `[id, state.profile, state.shown, pinned]` that names an existing profile (`pinned` = `config.activeProfile` unless falsy or `"auto"`); else first profile's id; else null (`:42-48`).
- `currentPage`: stored `pages[profile]` if it is still one of the profile's page ids, else its first page id, else null (`:51-55`).
- `rotationPages(profile)`: `rotate.pages` filtered to existing page ids; if that is empty, all page ids (`:65-69`).
- `isRotating`: false if `rotationPages.length < 2`; else `override[profile]==="on"` when an override exists (any truthy override: `"off"` => false), else `profile.rotate.enabled === true` (`:58-63`).
- `isIslandShown`: `islandOverride[p]` truthy ? `=== "on"` : `profile.island.enabled === true`.
- `step(ids, current, delta)`: empty => null; `i = indexOf(current)`; `ids[((( i<0 ? 0 : i+delta) % n) + n) % n]`. **Quirk**: a current page not in `ids` yields index 0 for both next and prev.
- `held(state,config,id,now)`: if rotating, `nextAt[id] = now + max(30000, rotateMs(profile))`; else same state object.
- `withKey(obj,key,value)`: copy, delete when `value===undefined`.

**`reduce(state, action, config, now)`** returns a new state, the **same object** when nothing changes, or `{error}`. Error strings are part of the API (`400` body):
| `type` | Inputs | Behaviour / errors |
|---|---|---|
| `page` | `profile?`, `page` = id / `"next"` / `"prev"` | target = `targetProfile`; none => `no profile`; resolved page must be in the profile's page ids else `unknown page`; sets `pages[id]`; then `held` (so a switch pauses rotation). Setting the same page still returns a new state (and re-holds). |
| `profile` | `profile` = id / `null` / `"auto"` | null/auto => `profile=null`; unknown id => `unknown profile`; same value => same state |
| `rotate` | `profile?`, `state` | want = `"toggle"` => opposite of current `isRotating`; `"saved"` => remove override; `"on"`/`"off"` as is; **`undefined` is treated as `saved`** (no error); anything else => `bad rotate state`. Sets/removes `override[id]`; `nextAt[id] = now + rotateMs` if now rotating else removed |
| `touch` | `profile?` | `held`; no profile => state unchanged (no error) |
| `shown` | `profile` | unknown profile or unchanged => same state; else `shown=profile` (runtime) |
| `mute` | `minutes` | must be integer 0..1440 else `bad mute minutes`; 0 => `mutedUntil=null`; else `now + m*60000`; unchanged => same |
| `kiosk` | `action`, `profile?`, `state?`, `level?` | named profile must exist (`unknown profile`); `reload`: ignored (same state) if `reloadAt !== null && now - reloadAt < 2000`; else `top = max(reload, ...reloads values) + 1`; named => `reloads[profile]=top`, else `reload=top`; both set `reloadAt=now`. `dim`: id = named or `targetProfile`, none => `no profile`; `state` default `"toggle"`, invalid => `bad dim state`; "was on" = `dim[id] !== undefined`; resulting off => remove `dim[id]` (no validation of `level`); on => `level = given ?? dimLevel[id] ?? 0.6` where `given = action.level ?? undefined` must be a number in [0.1,0.9] else `bad dim level`; sets both `dim[id]` and `dimLevel[id]` (same state if both already equal). `island`: `state` in on/off/toggle/saved else `bad island state`; saved => remove override; toggle uses the *effective* value (`isIslandShown`); same override => same state. Other `action` => `unknown kiosk action` |
| `connect` | internal: `id`, `profile`, `page?`, `address?` | `id` and `profile` strings, profile non-empty else `bad kiosk`; stores `{profile, page: non-empty string or null, address: string with a leading `::ffff:` removed or null, since: now}` (profile existence not checked) |
| `disconnect` | internal `id` | removes if present |
| `tick` | | (1) clear `mutedUntil` when `now >= mutedUntil`; (2) for each profile with an id: not rotating => drop its `nextAt`; rotating without `nextAt` => `nextAt = now + rotateMs`; rotating and `now >= nextAt` => `pages[id] = step(rotationPages, currentPage, +1)` and `nextAt = now + rotateMs` |
| `config` | `previous` (old config) | for each key in `override`: drop it when its profile's `rotate` JSON (stringify, `null` if absent) differs between previous and new config, or the profile no longer exists; same for `islandOverride` with `island`; drop `dim`/`dimLevel` of deleted profiles. `pages`, `profile`, `shown` are NOT cleaned (stale ids are tolerated by `currentPage`/`targetProfile`) |
| other / missing | | `unknown action` |
Allowed POST types are `page, profile, rotate, touch, alert, kiosk` only (`server.mjs:168`): `shown`, `tick`, `mute`, `config`, `connect`, `disconnect` are internal (mute is reached via `/api/control/alert {action:"mute"}`). POST body is spread: `dispatch({...body, type})`, so a body `type` cannot override the route type.

**Public state** (`publicState`, `:273-292`), JSON key order as listed:
```json
{"profile":null,"shown":"desk","profiles":{"desk":{"page":"stream","rotating":false,"override":null,"dim":0,"island":true,"islandOverride":null,"reload":1700000000000}},
 "alerts":[],"mutedUntil":null,"reload":1700000000000,
 "kiosks":[{"id":"k1","profile":"desk","page":"stream","address":"127.0.0.1","since":1700000001234}]}
```
`profiles` has one entry per config profile with an id (none when the config is unreadable => `{}`); `dim` is `0` when off; `reload` per profile = `reloads[id] ?? state.reload`. `kiosks` in insertion order (object key order of `k1,k2,...`, oldest first); a kiosk's `page` = its `?page=` pin if the profile has that page, else `currentPage`. Shape matches `control.test.mjs:271-281` (`profile, shown, profiles, alerts, mutedUntil, reload, kiosks`).

**Store behaviour** (`createControl`, `:327-399`):
- `reload` is initialised to `now()` at construction; `reloads` empty.
- `dispatch`: publish (`commit`) only when `JSON.stringify(publicState)` or `JSON.stringify(durable)` changed; otherwise silently replace `state` (this is how `nextAt`, `reloadAt` move). Returns `{state: publicState}` or `{error}`.
- `commit`: persists if durable JSON changed (see 1.2); logs `alerts muted until <ISO>` / `alerts unmuted` when `mutedUntil` changes; notifies listeners with the public state.
- `setAlerts(list)`: commits only if `JSON.stringify(list)` differs from the current list. Persists nothing.
- `configChanged()`: re-read config, reduce `config` action; if the state object changed commit, else still notify listeners with the current public view (pages may have been added/removed).
- `connect({profile,page,address})`: ids `k1, k2, ...` from a counter; returns null on error. `disconnect(id)`.
- Control SSE handler (`server.mjs:224-245`): `?profile=` triggers `shown` dispatch and `connect` (address recorded only when the peer is loopback: otherwise null); first event is the current state; `?client=studio` counts a studio only without `?profile=` and from loopback.

#### 3.2 alerts.mjs

**Config input** (`config.alerts`): `{enabled?:bool (false disables all), rules:[...], defaults:{style,position,backdrop,size,seconds}, quietHours:{from:"HH:MM",to:"HH:MM",minSeverity}}`. Rule (tests: `alerts.test.mjs:9-27`):
```json
{"id":"r1","name":"GPU temp","enabled":true,"severity":"critical",
 "source":{"kind":"sensor","key":"gpu.temp","op":">","value":80,"forSeconds":0,"clearBelow":70,
           "conditions":[{"key":"gpu.temp","op":">","value":80}]},
 "cooldownSeconds":0,"profiles":["desk"],
 "outputs":{"display":{"style":"toast","position":"top-right","backdrop":"none","size":"m","seconds":8,"text":"{value}{unit}"},
            "page":{"page":"alerts","profile":"desk","returnAfter":true},"highlight":{"zones":["z1"]}}}
{"id":"n1","name":"Notify","enabled":true,"severity":"info","source":{"kind":"notification","apps":["discord"],"exclude":[],"match":"hi"},"cooldownSeconds":0,"outputs":{"display":{"seconds":5}}}
```
- `conditionsOf(source)`: if `source.conditions` is an array => its object entries with string `key`; else if `source.key` is a string => `[source]` (the pre-v11 single form); else `[]` (`:38-43`).
- Usable rule (`rulesOf`): object with string `id` and object `source` and (`kind==="sensor"` with >=1 condition, or `kind==="notification"`). Other kinds are dropped silently.
- `keysOf(alerts)`: `[]` if alerts missing or `enabled === false`; for each usable rule with `enabled !== false`: notification rule adds `NOTIFICATION_KEY` = `plugins.InfoPanel.Notifications.windows.latest`; sensor rule adds each condition `key` whose `trim()` is non-empty. Set semantics, insertion order.
- Data API subscription URLs (`subscribe`, `:640-651`): `base` = `config.dataApiUrl` if it parses as http/https (`u.href` with trailing `/`s stripped), else `http://127.0.0.1:3921`. One stream per **distinct prefix** `prefixOf(key)` = key up to and including its last `.` (key itself if it has no dot, because `slice(0,0)` is `""` and `|| key`): `GET {base}/events?prefix=<encodeURIComponent(prefix)>&interval=1000`, `Accept: text/event-stream`. Streams whose URL is no longer wanted are closed; new ones opened; unchanged ones are kept (no reconnect). Called at start and on each `configChanged()`.
- SSE framing (`takeEvents`, `:468-477`): split on `\r?\n\r?\n`; the last piece is the unfinished remainder; for each complete event take lines starting `data:`, strip the first 5 chars and one optional leading space, join with `\n`; events with no `data:` lines are skipped (comments/keep-alives). Each payload `JSON.parse`d; malformed => skipped. Message handling (`onEvent`, `:629-637`): non-object ignored; `message.sensors` (object `key -> {value?,text?,unit?,name?}`) merged shallowly into `readings`; `message.removed` (array of keys) deleted from `readings`; then `run()`. Readings are never pruned when a stream is closed.

**Reading helpers.** `numeric(reading)`: finite `reading.value` number, else `Number(reading.text)` when the text is non-blank and finite, else undefined. `textOf(reading)`: `reading.text` if string, else `String(value)` for a numeric value, else undefined. `fmtNumber(v)` = `String(Math.round(v*10)/10)` (JS shortest-roundtrip; `80` -> `"80"`, `80.04` -> `"80"`, `1e21` formats exponent — values here are small).

**Condition `holds(cond, reading)`** (`:85-109`): `null` (unknown) when `reading` missing.
- `contains`: text of reading (undefined => null); `lowercase(text).includes(lowercase(String(value)))`.
- `=`, `!=`, `≠`: if `cond.value` is a JS number: `numeric(reading) === value` (undefined never equals); else case-insensitive equality of `textOf(reading) ?? ""` and `String(value)`. `!=`/`≠` negate.
- otherwise numeric ops: `n = numeric(reading)`, `limit = Number(value)`; either not finite => null; `>=`, `<`, `<=` as named, **any other op string (including unknown) means `>`**. Note `Number("")` and `Number(null)` are 0 (a blank value compares against 0).
**`changes`** and **`missing`** are handled before `holds` (below).
**Hysteresis `clears(cond, reading, holdsNow)`**: if `cond.clearBelow` is a number and the reading is numeric: `>`/`>=` clears when `n <= clearBelow`; `<`/`<=` clears when `n >= clearBelow`; otherwise (other ops, no level, non-numeric) clears when `!holdsNow`.

**Sensor rule pass `sensorPass`** (`:357-412`). Per condition `i` runtime state `rs.conds[i] = {seeded,last,seen,on,since}` (rebuilt each pass from the previous, then patched back; conditions are matched by **index**):
1. `changes` condition: `current = numeric(reading) ?? textOf(reading)` (undefined if no reading => condition skipped this pass). If `st.seeded && st.last !== undefined && current !== st.last` => hit in `changed`. Then `st.seeded = true; st.last = current`. First reading only seeds. Strict `!==` on numbers/strings (a `"5"` text reading and numeric 5 normalise to the number 5 first).
2. Level conditions (all others, including `missing`): `missing`: `if reading !== undefined: st.seen = true`; `holdsNow = reading === undefined ? st.seen === true : false` (never reports until the key has been seen; the `seen` flag is runtime-only so a restart forgets it). Other ops: `holdsNow = holds(...)`; `null` => `unknown = true`, skip the rest for this condition (its `since`/`on` unchanged).
   `st.on = st.on ? !clears(cond, reading, holdsNow) : holdsNow`. If `holdsNow`: `holding = true; st.since ??= now; if now - st.since >= forMs: met.push({cond,reading})`; else `st.since = undefined`.
   `forMs` = `source.forSeconds` (finite number else 0) * 1000, shared by all conditions of the rule.
3. After the loop: active instance = `rs.active` if still in `s.active`. If active: end it (reason `cleared`) when there is at least one level condition and none has `st.on`. If no active: when nothing `holding`: if `!unknown && rs.dismissed` reset `dismissed=false`; else if not dismissed, `met.length>0` and not `blocked`: `start(... hits: met, oneShot:false)`, store `rs.active = id`.
4. Independently: any `changed` hits and not `blocked` => `start(... hits: changed, oneShot:true)` (so a rule with a changes condition produces one-shots even while a level alert is active).
A dismissed alert therefore cannot refire until every condition stops holding (and none is unknown).

**Notification rules** (`evaluate`, `:334-343`): `n = parseNotification(readings[NOTIFICATION_KEY])`: JSON-parse `reading.text` -> object with `id !== undefined && !== null`. Fire when `n && rs.seeded && String(n.id) !== rs.lastId && passes(source, n) && !blocked`. Afterwards, if `n` exists **or** any reading exists at all: `rs = {seeded:true, lastId: String(n.id) if n}` (baseline: the first notification seen only seeds). `passes`: `apps` (lowercased strings) non-empty => app (lowercased `n.app`) must be in it; `exclude` contains app => reject; non-empty `match` string => `"{title} {body}"` lowercase must contain it. Always one-shot.

**`blocked(s, rule, now)`** (`:299-305`): `cooldown = rule.cooldownSeconds` finite ? *1000 : 0; `<=0` => never blocked. Blocked if a non-test one-shot of the rule is still active, or `clearedAt` exists and `now - clearedAt < cooldown`. Note the cooldown applies to level alerts via `clearedAt` set by `end`.

**Quiet** (`isQuiet(quietHours, severity, now)`): object with valid `HH:MM` (`^\d{2}:\d{2}$`, no range check) `from`/`to`, not equal; `at` = local-time minutes of `now` (server's local timezone!); window `from<to ? from<=at<to : at>=from || at<to`; quiet if inside and `RANK[severity] ?? 1` < `RANK[minSeverity] ?? 2` (info 0, warning 1, critical 2; unknown severity counts as 1; unknown min as critical). Precisely: `quiet = !test && (muted === true || isQuiet(...))`, so test alerts are never quiet. A quiet alert is still created, listed in active/history (`quiet:true`), and fires events, but its page output is suppressed.

**`start()`** builds the alert (`:195-269`):
- `display = {style:"toast",position:"top-right",backdrop:"none",size:"m",seconds:8}` overlaid by `alerts.defaults` then `rule.outputs.display`, string values only for style/position/backdrop/size; `seconds` = first finite of `[rule.outputs.display.seconds, alerts.defaults.seconds]`.
- `value` (sensor only) = `numeric(reading) ?? textOf(reading)` of the first hit's reading; `unit` = `reading.unit ?? ""`. Template variables: `{name}` (rule.name ?? rule.id), `{value}` (number via `fmtNumber`, else string, else ""), `{unit}`, `{sensor}` (reading.name if non-empty string else last `.` segment of the key), `{app}`, `{title}`, `{body}`; replaced by regex `\{(name|value|unit|sensor|app|title|body)\}`.
- Template: custom `outputs.display.text` if non-empty string; else sensor: several conditions => none (text becomes `"<sensor> <readout>, ..."` over the hits, where readout is `stopped reporting` for `missing`, else `fmtNumber(n)+unit` for numeric, else the text), `missing` single => `Stopped reporting`, else `{value}{unit}`; notification: `{title}\n{body}`. `text = (...).trim()`.
- Alert object, key order: `id` (`<now base36>-<seq>`, `seq` per process, not persisted), `ruleId`, `name`, `title` (notification: `app || name`; sensor: name), `severity` (invalid => `"warning"`), `text`, `value?`, `unit?` (sensor and non-empty), `app?` (notification), `startedAt`, `acknowledged:false`, `display`, `page?` (only when `outputs.page` is an object with string `page`: the whole object is copied), `highlight?` (when `outputs.highlight` is an object: `{zones? (non-empty array), key? (first hit's cond.key, sensor only)}`), `profiles?` (non-empty array), `test?:true`, `quiet?:true`.
- Active entry `{alert, oneShot, expiresAt}`; `expiresAt = now + display.seconds*1000` for one-shots with `seconds > 0` (0 => until acknowledged). Clients see only `alert`.
- History entry (prepended, then `slice(0,200)`): `{id, ruleId, name, severity, text, startedAt, test?, quiet?}`.
- Event `{type:"fire", alert}`.

**`end()`**: remove from active; history entry gets `endedAt` (+`dismissed:true` when dismissed); non-test: `rules[ruleId].clearedAt = now`, and when `rs.active === id` clear `active` and `pendingSince`, plus `dismissed:true` when dismissed; event `{type:"clear", alert, reason}` with reason `cleared`/`expired`/`dismissed`.

**`evaluate(state, alerts, readings, now, muted)`** order: (1) end every active non-test instance whose rule is no longer live (deleted/disabled, or `alerts.enabled===false`); (2) end instances with `expiresAt` reached (`now >= expiresAt`, reason `expired`); (3) run each live rule (sensor or notification). Test alerts survive step (1).
**`act(state, action, alerts, readings, now)`**: `test` (`ruleId`): unknown rule => `unknown rule`; fires a one-shot test alert (sensor: hits are the conditions with a reading, else the first condition with `reading` undefined; notification: fake `{app:"Test",title:"Test notification",body:""}`); `ack`/`dismiss` (`id`): unknown action => `unknown action`, unknown id => `unknown alert`. `dismiss` => `end(dismissed)`. `ack`: if not yet acknowledged set `acknowledged:true`, history `acknowledgedAt`, and if the alert is a one-shot with no `expiresAt` then end it (`cleared`).
**`quieten(state)`**: marks every non-test, non-quiet active alert and its history entry `quiet:true`.
**`createAlerts`** outputs (`runOutputs`, `:590-605`): on `fire` with `alert.page` and not `alert.quiet`: `profile = profileFor(alert.page.profile)` (candidates `[id, control.profile, control.shown, config.activeProfile (not "auto")]` that exist in `control.get().profiles`, else the first profile); `from` = that profile's current page; `dispatch({type:"page", profile, page})` (skip on error); if `page.returnAfter && from` remember `{profile, from, to}` keyed by alert id. On `clear` of a remembered alert: forget it and, only if the profile's current page still equals `to`, dispatch `page: from`. The `returns` map is memory only.
**Public API** (`server.mjs:212-216`): `GET /api/alerts/history` = `alerts.history()` (the array in 1.3). `POST /api/control/alert` => `alerts.act(body)`: `{action:"mute",minutes}` dispatches control `mute` (error strings from control), then if now muted `quieten`s, returns `{alerts, mutedUntil}`; otherwise `act` result `{alerts, mutedUntil: control.get().mutedUntil}`. `muted()` = `mutedUntil` number and `now() < it`. Active alerts reach kiosks through `control.alerts` (array of alert objects without `expiresAt`/`oneShot`).
`apply()` publishes to control only when `JSON.stringify(activeAlerts)` changed since the last publish.

#### 3.3 ical.mjs

Pure functions `parseIcs(text)` -> events, `occurrences(events, from, to)` -> list. Unreadable pieces are skipped, never fatal.
- **Lines** (`lines`, `:53-55`): unfold `\r\n`+space/tab and `\n`+space/tab (the fold char removed), split `\r?\n`, drop empty. `property(line)`: value starts at first `:` outside double quotes; name before first `;` uppercased; params `K=V` uppercased key, quotes stripped from value; no colon => ignored.
- `unescape`: `\n`/`\N` -> newline, `\\([,;\\])` -> char, then trim. Used for SUMMARY and LOCATION.
- **VEVENT**: only `BEGIN:VEVENT`..`END:VEVENT` at top level (no nesting); properties UID, SUMMARY, LOCATION, STATUS (uppercased; `CANCELLED` events dropped), DTSTART, DTEND, DURATION, RRULE, EXDATE (comma list, repeatable), RECURRENCE-ID. Event kept only if it has a parsable DTSTART. `end` = DTEND, else start+DURATION (when DURATION present, even 0), else start+1 day if all-day else start. `uid` default `<startWall>:<title>`. Output event `{uid,title,location,start,end,rule,exdates,recurrenceId}` where times are `{wall (ms, wall-clock as if UTC), zone (IANA string, "UTC", or null), allDay}`.
- **`parseTime(value, params)`**: regex `^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$` (seconds optional) -> `allDay = no time part || params.VALUE==="DATE"`; `wall = Date.UTC(...)` (if allDay with a time part, the time is still in `wall`); `zone = "UTC"` for trailing `Z`, `null` for all-day, else `zoneOf(params.TZID)` (null => floating = server local time).
- **Zones** (`zoneOf`, `:83-92`): `WINDOWS_TZ[tzid]` (table at `ical.mjs:10-45`, 35 entries; copied verbatim below) else `tzid` with a leading `/xxx/yyy/` (e.g. `/mozilla.org/20050126_1/`) prefix stripped; accepted only if `Intl.DateTimeFormat("en-US",{timeZone})` constructs, else `null` (floating). Windows names: UTC, Coordinated Universal Time -> UTC; GMT Standard Time -> Europe/London; Greenwich Standard Time -> Atlantic/Reykjavik; W. Europe Standard Time -> Europe/Berlin; Central Europe Standard Time -> Europe/Budapest; Central European Standard Time -> Europe/Warsaw; Romance Standard Time -> Europe/Paris; FLE Standard Time -> Europe/Kiev; GTB Standard Time -> Europe/Bucharest; E. Europe Standard Time -> Europe/Chisinau; Russian Standard Time -> Europe/Moscow; Turkey Standard Time -> Europe/Istanbul; Israel Standard Time -> Asia/Jerusalem; Arabian Standard Time -> Asia/Dubai; India Standard Time -> Asia/Kolkata; China Standard Time -> Asia/Shanghai; Singapore Standard Time -> Asia/Singapore; Tokyo Standard Time -> Asia/Tokyo; Korea Standard Time -> Asia/Seoul; AUS Eastern Standard Time -> Australia/Sydney; E. Australia Standard Time -> Australia/Brisbane; New Zealand Standard Time -> Pacific/Auckland; Eastern Standard Time -> America/New_York; Central Standard Time -> America/Chicago; Mountain Standard Time -> America/Denver; US Mountain Standard Time -> America/Phoenix; Pacific Standard Time -> America/Los_Angeles; Alaskan Standard Time -> America/Anchorage; Hawaiian Standard Time -> Pacific/Honolulu; Atlantic Standard Time -> America/Halifax; E. South America Standard Time -> America/Sao_Paulo; SA Pacific Standard Time -> America/Bogota; South Africa Standard Time -> Africa/Johannesburg. Lookup is exact, case-sensitive. (Note: `Europe/Kiev` is the legacy alias; a tz database lacking aliases must accept it.)
- **Instants** (`toInstant(wall, zone)`, `:109-119`): `"UTC"` => `wall`; `null` => interpret the wall fields in the server's **local** time zone (`new Date(y,m,d,h,mi,s)`); IANA zone: `t = wall - offset(zone, wall); t = wall - offset(zone, t)` (two passes; `offsetAt` = zone wall time of that instant minus the instant, to the second). DST gaps/overlaps therefore resolve as this two-pass formula does (gap: lands after the gap; overlap: first/earlier pass result). A port must use the same two-pass algorithm, not a library "earliest/latest" policy, to match. All-day uses `toInstant(wall, null)` (local midnight).
- **RRULE** `parseRule` (`:140-163`): split on `;`, each `K=V` (exactly one `=`; parts with more than one `=` dropped), key uppercased; `FREQ` must be DAILY/WEEKLY/MONTHLY/YEARLY (case-sensitive value) else rule = null (event treated as non-recurring); `INTERVAL` = `max(1, Number(v) || 1)`; `COUNT` = `Number(v)`; `UNTIL` = `parseTime(v)` (no params: a `Z` UNTIL is UTC, a date-only one is all-day, a floating one has zone null); `BYDAY` entries `^([+-]?\d+)?(SU|MO|TU|WE|TH|FR|SA)$` => `{n (0 if none), day (0=SU..6=SA)}`; `BYMONTHDAY`/`BYMONTH` numeric lists (non-finite dropped); `WKST` default `MO` (index via `WEEKDAYS.indexOf`, unknown value => -1). Not supported (silently ignored): BYSETPOS, BYWEEKNO, BYYEARDAY, BYHOUR/MINUTE/SECOND, BYEASTER, RDATE, EXRULE, SECONDLY/MINUTELY/HOURLY.
- **Expansion** `expand(ev, toWall)` (`:295-314`): up to `MAX_STEPS = 20000` periods; `until` = instant of UNTIL (+ one day minus 1 ms when UNTIL is a date) or infinity. For `period = 0,1,2...`: `starts = periodStarts(rule, start.wall, period)`; `first` = for DAILY `start + period*interval*DAY`, else `starts[0]`, or for a period with no match `periodBegin` (the 1st of the period's first month); stop when `first > toWall`. A period with no match (MONTHLY BYMONTHDAY=31 in November, YEARLY 29 February in a common year) is skipped and still counts as a step (fixed in #122); each candidate `t < start.wall` is skipped; stop when `t > toWall` or `instant(t) > until`; COUNT counts **every** emitted candidate from the series start, including those before the window and those later removed by EXDATE/override; stop when `n > count`.
  `periodStarts` (all arithmetic in wall time, UTC fields): DAILY -> `[start + period*interval*DAY]` filtered by BYDAY weekday membership (n ignored); WEEKLY -> week begins at WKST containing the start, moved `period*interval` weeks, days = BYDAY days or the start's weekday, sorted; MONTHLY -> month `startMonth + period*interval`; YEARLY -> months = BYMONTH (1-based) or the start's month, each `+12*period*interval`; within a month: with BYDAY: `n==0` => every such weekday, `n>0` => nth (1-based, skipped if missing), `n<0` => nth from the end; else BYMONTHDAY list (or the start's day-of-month): negative = from month end, days the month lacks are skipped; results sorted; time-of-day = the start's time-of-day.
- **`occurrences(events, from, to)`**: overrides set = `uid|instant(recurrenceId)` of every event carrying RECURRENCE-ID. Output rows `{id: "<uid>|<startMs>", title (title || "Event"), location? (only if non-empty), start, end, allDay (start.allDay)}`, pushed only when `end > from && start <= to`. Events with a recurrenceId are emitted as plain single events at their own start/end. Non-recurring: single row. Recurring: expand to `toWall = to + 2 days`, each start converted by `toInstant` with the event's zone; skip when the start instant is in the EXDATE instants (each EXDATE converted with **its own** zone/allDay) or in the overrides set; end = `instant({...end, wall: wall + length})` where `length = end.wall - start.wall`. Result sorted by start ascending (stable).
- Tests: `ical.test.mjs` (9 cases) — UTC/zoned/all-day, DST conversion, unfold, weekly BYDAY+EXDATE+override (feed example at `:50-62`), COUNT/UNTIL/INTERVAL, weekday-only daily, monthly `-1FR`. Not covered by tests: YEARLY, BYMONTH, BYMONTHDAY negatives, floating times, Windows names beyond one.

#### 3.4 calendar.mjs

- Constants: refresh 10 min, fetch timeout 15 s, max body 5 MiB, `AHEAD_MS` 36 h, `BEHIND_MS` 1 h, max events 50, max 3 redirects (`:13-21`).
- State (`emptyCalendar`): `{configured:false, events:[]}` ; after a refresh `{configured:true, events:[...], error?:"label: msg; label2: msg"}`; with no links => `{configured:false, events:[]}` and `lastGood` cleared.
- Event shape to kiosks: the `occurrences` row `{id,title,location?,start,end,allDay}` (ms). `upcoming(feeds, now)`: for each feed text `occurrences(parseIcs(text), now-1h, now+36h)` (a feed that throws contributes none), concatenated, sorted by start ascending, `slice(0,50)`.
- Refresh (`createCalendar.refresh`, `:170-197`): generation counter; for each link in parallel `fetchFeed(url)`; on success cache text in `lastGood[url]`; on failure push `"<label || host>: <message>"` and use the last good text or `""`. Entries of `lastGood` for URLs no longer configured are dropped. If a newer refresh started meanwhile, the result is discarded. `host` in the error = `new URL(url).host`. After refresh `onChange(state)` is called (extras publishes unconditionally, even if the state is identical).
- `fetchFeed(url)` (`:136-158`): up to `MAX_REDIRECTS=3` redirects followed manually: each hop `checkTarget` (protocol http/https; host stripped of `[ ]`; literal IP used directly, else `dns.lookup(host,{all:true})`; empty list or any address `blockedAddress` => `address not allowed`), then GET with `redirect:"manual"` and header `Accept: text/calendar, text/plain;q=0.8`; a 3xx with a `Location` header => `new URL(location, current)`; `hop >= 3` while still redirecting => `too many redirects` (i.e. 3 redirects allowed, the 4th is an error); non-2xx => `HTTP <status>`; body must contain `BEGIN:VCALENDAR` (case-insens) else `not a calendar`; `text.length > 5 MiB` => `too large`. A single `AbortController` timeout of 15 s covers the whole chain.
- **`guardedFetch`** (default transport, `:87-110`): `http`/`https.get` with a custom `lookup` (`guardedLookup`): resolves with `{all:true}`; fails `address not allowed` when the list is empty or **any** address is blocked; otherwise connects to the first address. This re-checks at connect time (anti DNS-rebinding). Stops reading at 5 MiB (`too large`, request destroyed). Redirects are not followed by the transport.
- **`blockedAddress(ip, blockLan=false)`** (`:29-64`) — complete list:
  - IPv4 (`blockedV4`): first octet `0` (this-network, includes 0.0.0.0); `127.0.0.0/8`; `169.254.0.0/16` (link-local, cloud metadata); first octet `>= 224` (multicast 224/4 and reserved/broadcast 240/4 up to 255). With `blockLan=true` also `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `100.64.0.0/10` (CGNAT).
  - IPv6: parsed to eight 16-bit words (`ipv6Words`: lowercase, zone `%…` stripped, must satisfy `net.isIPv6`, trailing dotted-quad converted to two words); **unparsable => blocked**. IPv4-embedded forms are decided by the embedded IPv4 via `blockedV4` (words 6,7): *mapped* `::ffff:0:0/96` (words 0-4 zero, word 5 `0xffff`), *IPv4-compatible* `::/96` with word 6 != 0 (words 0-5 zero), *NAT64* `64:ff9b::/96` (word0 `0x64`, word1 `0xff9b`, words 2-5 zero). Otherwise blocked when: unspecified/loopback (`::` and `::1`: words 0-6 zero and word 7 <= 1); link-local `fe80::/10` (`(w0 & 0xffc0) === 0xfe80`); multicast `ff00::/8` (`w0 >> 8 === 0xff`); and with `blockLan` unique-local `fc00::/7` (`(w0 & 0xfe00) === 0xfc00`). Not blocked (by design): other global/ULA (when `blockLan=false`), `fec0::/10` site-local, 6to4/Teredo.
  - Test vectors (`integrations.test.mjs:140-151`): blocked: `127.0.0.1, 0.0.0.0, 169.254.169.254, 224.0.0.1, ::1, ::, fe80::1, ::ffff:127.0.0.1, ::ffff:7f00:1, ::FFFF:A9FE:A9FE, 64:ff9b::7f00:1, ::127.0.0.1, 0:0:0:0:0:0:0:1, 0000::, FE80::1%eth0, febf::1, ff02::1, "not an ip"`; allowed: `192.168.1.10, 10.0.0.5, 93.184.216.34, 2606:4700::1, ::ffff:c0a8:10a, ::ffff:192.168.1.10, 64:ff9b::5db8:d822, 2001:db8::1, fec0::1`.
  - `blockLan=true` is passed by the image proxy (part A); the calendar always uses the default (LAN allowed).
- Tests: in `integrations.test.mjs` (calendar merge, refresh with failing link and last-good, fetch targets, rebinding, redirect hops).

#### 3.5 obs.mjs (obs-websocket v5)

- Connect: if `host === ""` (or no global WebSocket) => state `{configured:false,connected:false,streaming:false,recording:false}` and no connection. Otherwise `new WebSocket("ws://<host>:<port>", "obswebsocket.json")` (sub-protocol `obswebsocket.json`; JSON text frames; no TLS), state set to `{configured:true,connected:false,streaming:false,recording:false}` first (`:91-129`). A constructor exception logs `OBS: <message>` and schedules a retry.
- Pure `obsStep(state, message, password)` (`:26-56`), messages `{op, d}`:
  - `op 0` Hello: reply `{op:1,d:{rpcVersion:1,eventSubscriptions:64, [authentication]}}` where `eventSubscriptions = 1<<6` (Outputs) and `authentication` is present only if `d.authentication` (object with `salt`, `challenge`) exists: `obsAuth(password, salt, challenge)`.
  - `op 2` Identified: `connected=true`; send `{op:6,d:{requestType:"GetStreamStatus",requestId:"stream"}}` and `...{"GetRecordStatus","record"}`.
  - `op 5` Event: `StreamStateChanged` / `RecordStateChanged` => `streaming`/`recording = d.eventData.outputActive === true`; other events ignored.
  - `op 7` RequestResponse: ignored unless `d.requestStatus.result === true`; `requestId "stream"|"record"` => `streaming|recording = d.responseData.outputActive === true`.
  - others: no change.
- `obsAuth(password, salt, challenge) = base64(sha256( base64(sha256(password + salt)) + challenge ))` where the inner and outer digests are raw 32-byte SHA-256 base64-encoded (standard alphabet with padding), string concatenation of UTF-8 text. Vector (`integrations.test.mjs:80`): password `supersecretpassword`, salt `lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=`, challenge `+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=` => `1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4=`.
- Lifecycle: a `generation` counter invalidates callbacks from older sockets. `onclose` (current generation only): `socket=null`, state => `{configured:true,connected:false,streaming:false,recording:false}`, schedule retry in `delay` ms then `delay = min(60000, delay*2)`. `onerror` does nothing (close follows). `delay` resets to 5000 when a message makes `connected` go false->true and on `reconfigure()`. `reconfigure()` (called when `integrations.obs` JSON changed, and at start) closes the socket, resets the delay, reconnects immediately. A non-JSON message is ignored. `onChange` fires only when one of `configured, connected, streaming, recording` changed.
- State exposed: `extras.obs = {configured, connected, streaming, recording}`; never the host/port/password.

#### 3.6 extras.mjs

`state()` = `{obs: obs.state(), calendar: calendar.state(), agents: agents.state()}` where `agents.state()` is `publicAgents` (3.9). Example (from `integrations.test.mjs:124-135`): at rest `{"obs":{"configured":false,"connected":false,"streaming":false,"recording":false},"calendar":{"configured":false,"events":[]},"agents":{"sessions":[],"plan":{},"usage":{}}}`. `publish()` sends the full state to every listener; invoked by obs/calendar `onChange` and the agents throttle. Subscribes to `integrations`: on change of `JSON.stringify(obs)` => `obs.reconfigure()`; of `calendar` => `calendar.reconfigure()` (so a label-only edit refetches). `GET /api/extras` returns `state()`; `/events/extras` sends the state on connect then every change. No secrets: no URLs, host or password appear.

#### 3.7 integrations.mjs: apply

`applyIntegrations(state, patch)` (`:72-110`) — patch must be an object (`expected a JSON object`). `obs` (if not `undefined`): must be an object (`obs: expected an object`); `host` undefined => keep, else `cleanHost`; error `obs.host: a host name or IP address` when a non-empty (after `text`) host cleaned to empty; **a non-string `host` or `""` passes through `text()` to `""` and silently clears the host** (disables OBS); `port` undefined => keep else `cleanPort` (invalid => 4455, no error); `password` string => `slice(0,512)` (not trimmed), non-string/absent => keep, `""` clears. `calendar` (if not undefined): must be object with `links` array (`calendar.links: expected a list`), length <= 10 (`calendar.links: at most 10`); each item an object (`calendar.links: expected objects`); `label = text(label, 40)`; item whose string `id` matches a stored link keeps the stored link (url never changes; label replaced only if `item.label !== undefined`); otherwise `url = cleanCalendarUrl(item.url)` required (`calendar.links: an http(s) or webcal link`) and a new link `{id: randomUUID() (lowercase hyphenated v4), label, url}` is appended. The resulting list **is** the new full list (omitted links are deleted). Order follows the patch. Public form `{obs:{host,port,hasPassword},calendar:{links:[{id,label,host}]}}` (host = `new URL(url).host` incl. port). `PUT /api/integrations` returns the public form; body cap 16 KiB (`server.mjs:175`). Tests: `integrations.test.mjs` (17 cases incl. obs/calendar/extras).

#### 3.9 agents.mjs

State: `{sessions:{ "<agent>:<id>": session }, plan:{claude?,codex?}, usage:{}}`. Constants: `STALE_MS` 30 min (working/waiting sessions not heard from), `DONE_KEEP_MS` 15 min (other states), `MAX_SESSIONS` 12 (keep the 12 with greatest `lastSeen`). Strings are sliced: `str(v,max=80)`.
- `projectOf(cwd)`: `str(cwd,1000)`, strip trailing `/`/`\`, last segment after either slash kind, `slice(0,60)`; the path itself never leaves the server.
- `toolOf(v)`: `str(v,200)` with `^mcp__.*__` removed (greedy: everything up to the last `__`), then `slice(0,60)`.
- `reduceAgents(state, agent, event, now)` (`:37-111`): ignored (same state) unless `agent` in `["claude","codex"]` and `event` an object with non-empty `hook_event_name` (≤40) and `session_id` (≤100). `SessionEnd` deletes the session. Otherwise session = previous or `{agent,id,project:"",state:"idle",since:now,turnStart:null,tool:"",subagents:0,lastTurnMs:null}`; always `project = projectOf(cwd) || prev.project`, `lastSeen = now`, `hooked = true`. `to(s)` sets `since = now` only when the state changes. Events: `SessionStart` -> idle, tool ""; `UserPromptSubmit` -> working, `turnStart=now`, tool ""; `PreToolUse` -> working, `turnStart ??= now`, tool = toolOf; `PostToolUse`/`PostToolUseFailure` -> working, `turnStart ??= now`; `PermissionRequest` -> waiting, tool = toolOf || keep; `Notification` -> waiting only if `notification_type` in {permission_prompt, idle_prompt, elicitation_dialog, agent_needs_input}, else just refreshes; `SubagentStart` -> `subagents = min(prev+1, 50)`; `SubagentStop` -> `max(prev-1,0)`; `Stop` -> done, `lastTurnMs = turnStart !== null ? now - turnStart : null`, turnStart null, tool "", subagents 0; `Interrupt` (Codex) -> idle, turnStart null, tool "", subagents 0; `StopFailure` -> error, turnStart null, tool ""; unknown names just refresh. Then trimmed to 12.
- `mergeClaudeSessions(state, live, now)` (`:126-178`): for each live file `l` (`{id,project,state,updatedAt,alive}`): `alive === false` => delete session, skip. Else mark live; new session => created `{agent:"claude",id,project,state,since: updatedAt ?? now, turnStart: state==="working" ? (updatedAt ?? now) : null, tool:"",subagents:0,lastTurnMs:null,lastSeen:now}` (not `hooked`); existing session => `lastSeen = now`; if it is not `hooked` also follow the file: `project = l.project || prev.project`, and on a state change set `state`, `since=now`, `turnStart = working ? (prev.turnStart ?? now) : null`. Finally delete every claude session that is not `hooked` and not in the live set. Hooked sessions with no file are left to `expireAgents`.
- `expireAgents(state, now)`: keep a session if `quiet = now - (lastSeen ?? since)` is `< 30 min` for working/waiting, `< 15 min` otherwise.
- `reduceStatusline(state, payload, now)` (`:212-241`): ignores non-objects. `rate_limits.five_hour` / `seven_day` / any `seven_day_<name>` (name ≤30 chars): window = `{used: clamp(used_percentage ?? used_percent, 0, 100) (must be finite number else window dropped), resetsAt?: ms}` where `msOf`: number < 1e12 => seconds*1000, else ms; ISO string via `Date.parse`. `plan.claude = {fiveHour?, sevenDay?, extra?:[{name,used,resetsAt?}], version? (payload.version ≤20 or previous), at: now}` replaces the old claude plan **only when at least one window is present**; else if a new `version` differs from the stored one, `plan.claude = {...prev, version, at: prev.at ?? now}`. Session update only if `payload.session_id` (≤100) names an existing `claude:<id>` session: `context` = clamp(`context_window.used_percentage`), `cost` = `cost.total_cost_usd` (finite number, any sign), `model` = `str(model.display_name ?? model.id, 40)` — only set when valid.
- `codexPlan(state, limits, now)`: windows = `[primary, secondary]` that are objects; `short` = first with no numeric `window_minutes` or `window_minutes <= 360`; `long` = the first window that is not `short`; `fiveHour`/`sevenDay` from `{used_percent, resets_at}`; if neither => unchanged; else `plan.codex = {fiveHour?, sevenDay?, at: now}`. In `refresh`, `now` here is `codexLimitsAt() ?? t` (the time Codex reported them).
- `publicAgents(state)` (what kiosks get): `{sessions:[...], plan, usage}`; sessions sorted by `lastSeen` descending; each `{key: sha256("<agent>:<id>") hex first 12, agent, project, state, since, turnStart? (non-null), tool? (non-empty), subagents? (truthy), lastTurnMs? (non-null), context?, cost?, model?}`. Never: id, cwd, prompts, paths, tool input. Example hook payload used by tests (`agents.test.mjs:5`): `{hook_event_name,session_id,cwd,transcript_path,prompt,...}`; transcript and prompt are dropped.
- `refresh()` (sweep + after each usage scan): merge sessions, expire, codexPlan, `usage = agentUsage.totals()`; publishes (via throttle) only if `JSON.stringify(publicAgents)` changed versus the prior state. `event()`/`statusline()` publish when the reduced state object differs (reference inequality).
- HTTP entry: `POST /api/agents/event?agent=claude|codex` and `/api/agents/statusline`, 512 KiB cap, invalid JSON => 400, always 204 otherwise (even for an unknown agent) (`server.mjs:291-304`; guard in part A).
- Tests: `agents.test.mjs` (21 cases).

#### 3.10 agent-usage.mjs

Scans, parses, and what reaches kiosks (`usage` field of the agents state, via `totals()`):
- Files: Claude `~/.claude/projects/<project>/<session>.jsonl`; Codex `~/.codex/sessions/YYYY/MM/DD/rollout-*.jsonl`. Walk is recursive up to depth 4 below each root, any name ending `.jsonl`, `mtime >= now - 35 days` (`jsonlFiles`, `:114-132`). Incremental: per file `{offset, days, split, ...}` kept in memory; a file smaller than its offset restarts from zero; only complete lines (up to the last `\n`) are consumed, offset advances by UTF-8 bytes; reads at most 8 MiB per step, yielding between steps; read errors skip the file until the next scan. Nothing is persisted: each server start re-reads the last 35 days.
- Claude line (`claudeLine`): JSON; `type === "assistant"` with `message.usage` object; `timestamp` parsable; `id = requestId ?? message.id` (strings); tokens `input_tokens, output_tokens, cache_read_input_tokens, cache_creation_input_tokens` (finite and > 0, else 0); `project = projectOf(rootOf(cwd))` where `rootOf` strips `[\\/].claude[\\/]worktrees[\\/].*`; `model = modelOf(message.model)` (strip `claude-`, strip `-YYYYMMDD`, slice 40; `"<synthetic>"` or non-string => ""). Lines with an `id` already seen in that file are skipped (per-file `seen`). Day bucket = **local** day `YYYY-MM-DD` of the timestamp (`dayKey`). Per file the project is the first non-empty project seen (`f.project ||= u.project`), tokens added to `split[day].projects[project]` and `.models[model]`.
- Codex: lines containing `"session_meta"` or `"turn_context"` set `project ||= ctx.project` and `model = ctx.model || model` (`cwd` from `payload.cwd`, model from `turn_context.payload.model`); `event_msg` with `payload.type === "token_count"` and a valid timestamp: `total = info.total_token_usage` -> `{input: n(input_tokens) - n(cached_input_tokens), output, cacheRead: cached_input_tokens, cacheWrite: cache_write_input_tokens}`; the day gets `sub(total, last)` (component-wise clamp >= 0) and `last = total`. `rate_limits` with `at >= latestLimitsAt` become the global latest limits.
- Result (`summarize`, `:224-262`) per agent (`claude`, `codex`; key omitted when no data in the last 35 days): `{ today: <tokens today>, history: <sum of the days>, days:[{day,input,output,cacheRead,cacheWrite,total}] ascending by day, breakdown?: { today?: {projects:[{name,total}], models:[{name,total}]}, week?: {...} } }`. Days included: `Date.parse(day + "T12:00:00") >= now - 35d` (local noon). `total = input+output+cacheRead+cacheWrite`. Splits: `today` = today's key; `week` = the last 7 local days (`now - i*24h` keys for i=0..6); projects ranked by total desc then name `localeCompare`, top 5, entries with empty name or total <= 0 dropped; models likewise but all kept; a split object only if either list is non-empty; `breakdown` included only when the week split exists (and may then also hold `today`).
- Codex limits: `{primary:{used_percent,window_minutes,resets_at}, secondary:{...}}` passed to `codexPlan`.
- A scan sets `result` and calls `onScan()` (extras publishes). Overlapping scans are skipped.
- Tests: `agent-usage.test.mjs` (10 cases).

#### 3.11 claude-sessions.mjs

`~/.claude/sessions/*.json` (flat, only names ending `.json`; directory missing => `[]`). Each parsed (`parseClaudeSession`): object with integer `pid > 0` and non-empty string `sessionId` (`id = sessionId.slice(0,100)`), `project = projectOf(cwd)`, `state = {busy:"working", waiting:"waiting"}[status] ?? "idle"`, `updatedAt` finite number else null (treated as ms when used). Invalid files are skipped. `alive` = `process.kill(pid, 0)` succeeds, or throws with `code === "EPERM"`; any other error (ESRCH) => dead. On Windows `process.kill(pid,0)` throws `ESRCH` for a missing process and succeeds otherwise; the port can use `OpenProcess`+exit-code check (STILL_ACTIVE) or equivalent. Only `project`, `state` and times reach kiosks via the agents state (3.9); `cwd`/`pid` do not. No unit tests (not exercised in `tests/server`).

#### 3.12 infopanel-local.mjs
See 1.10. Routes: loopback only (403 otherwise), GET only; list returns JSON; files return `application/xml; charset=utf-8` (`Profile.xml`, `DisplayItems.xml`) or `application/octet-stream` (assets) with `Cache-Control: no-store` and `X-Content-Type-Options: nosniff`; path parts are `decodeURIComponent`d (bad escape => 404). Tests: `infopanel-local.test.mjs` (5).

#### 3.13 library.mjs / assets.mjs / canvases.mjs request rules (summary; files in section 1)
- Library writes: header `X-Dashboard-Library: 1`, loopback unless `ALLOW_REMOTE_UPLOAD=1`, JSON content type (not for DELETE); body cap `8 MiB + 1 KiB`; create returns 201 with the item; update 200/404; delete 204/404. Error order: header (403) -> remote (403) -> content type (415) -> body parse (400 `expected a JSON body under 8 MB`).
- Canvas writes: header `X-Dashboard-Canvas: 1`, loopback unless allow-remote, `application/json` (415), body cap 8 MiB (413), read open to everyone; no PUT/DELETE (405).
- Asset writes: header `X-Dashboard-Asset: 1`, loopback unless allow-remote (403 with the message text); detailed pipeline in 1.6.

---

### 4. Agent hooks

#### 4.1 `tools/agent-status.mjs` (forwarder)
Invocations: `agent-status.mjs hook claude|codex [--url=<base>]`, `agent-status.mjs statusline [--wrap=<base64url>] [--url=<base>]`.
- `BASE` = first `--url=` argument anywhere in argv, else `DASHBOARD_URL`, else `http://127.0.0.1:3922`; trailing `/` stripped (`:21-22`).
- stdin (`readStdin`, `:26-36`): empty string if stdin is a TTY; otherwise concatenated chunks, resolved at `end`/`error` or after **3000 ms** with whatever has arrived.
- `hook`: `agent = rest[0] === "codex" ? "codex" : "claude"` (anything else = claude). If `input.trim()` is non-empty: `POST {BASE}/api/agents/event?agent=<agent>` with the **raw stdin text** as body (no re-serialisation), headers `Content-Type: application/json`, `X-Agent-Event: 1`, timeout **1000 ms** (`AbortSignal.timeout`). Prints nothing to stdout or stderr.
- `statusline`: `wrapped` = `Buffer.from(arg.slice(7), "base64url").toString("utf8")` for `--wrap=` (empty if absent); runs concurrently (`Promise.all`): if stdin non-blank `POST {BASE}/api/agents/statusline` (same headers/timeout/raw body); and if `wrapped` non-empty: `spawn(wrapped, {shell:true, stdio:["pipe","inherit","inherit"]})` writing the **entire raw stdin** (even when blank) to the child's stdin; the child's stdout/stderr go straight to this process's stdout/stderr, so the user's statusline line is what Claude Code shows. Without `--wrap` stdout is empty. Spawn error / close both resolve; the wrapped command's exit code is ignored; there is no timeout on the wrapped command.
- Error paths: every fetch error is swallowed (dashboard down, timeout, non-2xx not inspected); unknown mode does nothing. `main().finally(() => process.exit(0))`: **always exit code 0**. Notably process exit follows immediately after the awaited post, so a hung wrapped child delays exit.
- Server side expects JSON (400 on invalid), caps 512 KiB.

#### 4.2 `tools/agent-install.mjs` (installer; node script run by the Rust app with the bundled node)
- `MARK = "agent-status.mjs"`; an entry is "ours" iff `typeof hook.command === "string"` and includes `MARK` (`:27, 45`). Same test identifies a wrapped statusline.
- Targets (`runInstall`, `:149-196`): Claude Code `~/.claude/settings.json` (created, with its folder, if missing); Codex `~/.codex/hooks.json` (skipped with status `skipped` when `~/.codex` does not exist). Invalid JSON => status `error`, file untouched. `readJson`: missing => `{found:false,data:{}}`, no BOM handling (a BOM makes `JSON.parse` fail => error).
- Command text: `forward = (node ? "\"<node>\"" : "node") + " \"" + script + "\""` with `script` = absolute path of `agent-status.mjs` using forward slashes; hook commands `"<forward> hook claude<suffix>"` / `"<forward> hook codex<suffix>"`, statusline `"<forward> statusline<suffix>"`, `suffix = " --url=<base>"` or `""` (`:85-88`).
- Claude events (12): SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PostToolUseFailure, PermissionRequest, Notification, Stop, StopFailure, SubagentStart, SubagentStop. Codex events (10): SessionStart, SessionEnd, UserPromptSubmit, PreToolUse, PostToolUse, PermissionRequest, Stop, SubagentStart, SubagentStop, Interrupt.
- Install (`withHooks`): for each event, if **any** existing group already has a hook that is ours the event is left alone (so an installation with a different node path or URL is **not** updated: the Rust app removes first, see 4.3). Otherwise append a new group `{"hooks":[{"type":"command","command":"…","timeout":5,"async":true}]}` (Codex: no `async`). Existing groups/hooks of the user, other events, and all other settings keys are preserved verbatim and in order (`{...settings, hooks, statusLine}` — `hooks`/`statusLine` appended at the end if they were absent).
- Statusline (Claude only, `installClaude`): absent or without a string `command` => `{"type":"command","command":"<forward> statusline<suffix>"}`; present and not ours => `{...line, command: "<forward> statusline --wrap=<base64url(old command, utf8)><suffix>"}` (other fields such as `padding` kept); already ours => untouched.
- Remove (`removeClaude`/`removeCodex`): drop every hook that is ours; groups whose `hooks` array became empty are dropped; groups without a `hooks` array are kept; events left empty are removed; `hooks` removed when empty (Codex deletes `hooks` even if it was never present, harmless). Claude statusline: `unwrapStatusline(command)` = `null` when not ours (untouched), `""` when ours with no `--wrap` (statusLine deleted — it was added by us), else the decoded original command restored with other fields kept (regex `--wrap=([A-Za-z0-9_-]+)`).
- Planning: `describe(before, after)` yields lines per changed `hooks.<event>` and for `statusLine`; no lines => status `unchanged`, nothing written (so install twice is a no-op; this is how the app detects "installed": a dry run reporting `unchanged`). Statuses: `installed | removed | skipped | unchanged | error` (without `--apply` the status is what would happen).
- Apply: if the file existed, copy to `<file>.dashboard-<ISO timestamp with ":" and "." replaced by "-">.bak` first (`2026-10-23T08-15-30-123Z`), then write `JSON.stringify(next, null, 2) + "\n"` directly (**not** atomic, 2-space indent, trailing newline). Backups accumulate; none are pruned. Write/copy failure => status `error` with message `<name>: could not write <file> (<msg>)`.
- CLI flags: `--apply`, `--remove`, `--node=<path>`, `--url=<base>`, `--json` (prints `{"apply":bool,"results":[{agent,status,file,backup,message}]}` one line, no `lines`). Agent names in results: `Claude Code`, `Codex`. Default (no `--apply`) prints what would change and "Nothing was changed. …".
- Tests: `agent-install.test.mjs` (9 cases; includes a spawn of the forwarder against a fake server).

#### 4.3 Rust side (`src-tauri/src/agents.rs`)

> **Since phase 3.5** the installer is ported to Rust (`src-tauri/crates/ips-agent/src/install.rs`, called in process by
> `agents.rs`), and the hooks run `ips-agent.exe hook claude|codex` / `statusline` instead of node and
> `agent-status.mjs`. Installing removes the old `agent-status.mjs` hooks; `needs_reinstall` keys on the ips-agent path;
> the NSIS uninstaller runs `ips-agent remove-hooks`. The rest of this section describes the Node path that it replaced,
> kept as the spec the port matches.
The app does not reimplement the installer: it runs `<bundled node.exe> <app>/tools/agent-install.mjs …` with `current_dir = app_dir` (`run_script`, `:100-133`) and parses stdout JSON (`parse_output`: whole stdout as an object, else the last line that parses to an object; `output_has_error` = any `results[].status == "error"`; a step fails on non-zero exit, no parsable output, or an error status; error text = trimmed stderr or `agent-install exited with <status>`).
- Install = two steps: `[--remove --apply --json]` then `[<script> --apply --node=<node> --url=<hook_url> --json]` (`agent_args`, `install_steps(true) = [false,true]`; disable = remove only). `hook_url` = `settings::server_origin(s)` (loopback origin `http://127.0.0.1:<port>`, test: LAN listen still gives `127.0.0.1`).
- Marker: after success, write `<config_dir>/agents-installed` containing the node path (enable) or delete it (disable) (`:146-153`).
- **`needs_reinstall(s, version, node)`** = `s.agents.enabled && s.agents.installed != Some(AgentInstall{version, url: hook_url(s), node})` — the key is the triple (app version, hook URL, node path) (`:49-51`). `statuses()` runs a dry run (same args minus `--apply`) only when enabled, not stale and at least one agent folder exists; `hook_state`: no folder => NotFound; not enabled => NotConnected; enabled, not stale and planned status `unchanged` => Installed; else NeedsRepair. `newest_backup`: files containing `.dashboard-` and ending `.bak` in the agent folders, newest mtime.
- A Rust server port must keep serving `POST /api/agents/event|statusline` (204/400) and the `X-Agent-Event` guard; the hook scripts stay Node.

---

### 5. Vitest files that become parity fixtures (`tests/server/`)

Case counts are `it(` at line start (approximate; `describe.each`/loops expand further).

| Module | File | ~Cases | Covers |
|---|---|---|---|
| control.mjs | `control.test.mjs` | 38 | reduce actions, rotation/tick, hold, dim/island/mute/reload, kiosks, persistence, bad control.json |
| alerts.mjs | `alerts.test.mjs` | 65 | thresholds (all ops), duration, hysteresis, cooldown, changes, missing, disabled, notifications, multi-condition, act, text, quiet hours, mute, history cap, `createAlerts` (fake stream, persistence, page outputs) |
| ical.mjs | `ical.test.mjs` | 9 | see 3.3 |
| calendar.mjs, obs.mjs, extras.mjs, integrations.mjs | `integrations.test.mjs` | 17 | integrations normalise/apply/public/disk, obs handshake + `obsAuth` vector, calendar merge/refresh/last-good, `blockedAddress` vectors, rebinding lookup, redirect hops |
| agents.mjs | `agents.test.mjs` | 21 | hook reducer, statusline, Codex plan, merge/expire, public form (no secrets) |
| agent-usage.mjs | `agent-usage.test.mjs` | 10 | transcript lines, project/model, scan to totals |
| claude-sessions.mjs | none | 0 | gap: add fixtures for `parseClaudeSession` and `isAlive` |
| infopanel-local.mjs | `infopanel-local.test.mjs` | 5 | `profilesFromXml`, path guards, listing/reading |
| library.mjs | `library.test.mjs` | 10 | normalise/summary/store/refusals |
| assets.mjs | `assets.test.mjs` | 27 | quota, sniff table, declared type, assetPath, referencedHashes, svg, range, loopback |
| canvases.mjs | `canvases.test.mjs` | 13 | refusal, store, referenced ids, sweep, write refusal, routes |
| studio-prefs.mjs | `studio-prefs.test.mjs` | 3 | |
| config-guard / config-settings | `config-guard.test.mjs` (9), `config-settings.test.mjs` (9) | | version refusal, settings patch |
| font-proxy.mjs | `font-proxy.test.mjs` | 7 | hosts, redirects, cache |
| tools/agent-install.mjs + agent-status.mjs | `agent-install.test.mjs` | 9 | install/remove/idempotency, runInstall on a temp home, forwarder against a local server |
| server.mjs end-to-end | `server.test.mjs` | 13 | routes over a spawned server (part A) |
Also relevant: Playwright specs in `tests/e2e/` (`control-page-switch`, `config-live-update`, `cross-origin-writes`) and `src-tauri/src/agents.rs` `#[cfg(test)]` (9 cases).

---

### Discrepancies and oddities

Keep exactly (looks accidental but is observable behaviour):
1. `rotate` with `state` omitted/`undefined` behaves as `"saved"` and returns success; any other unrecognised value errors (`control.mjs:140-142`).
2. `step()` from a page not in the (rotation) list goes to index 0 for **both** next and prev; rotation tick uses the rotation subset, so a manually chosen page outside it jumps to the first rotation page (`control.mjs:85-89`).
3. `held()` only pauses when the profile is rotating; the 30 s pause is `max(30000, rotateMs)` (so long intervals keep their length). A `page` action to the same page still re-holds.
4. `control.json` keeps `pages`/`override` values unvalidated and never prunes stale ids; `shown` is not persisted, `profile` override is, and a persisted `override` entry for a profile survives restarts until the saved `rotate` option changes.
5. Control `dispatch` publishes only on public-view or durable change; `touch`/`nextAt`/`reloadAt` moves are silent. `mute` is only reachable through `/api/control/alert`; `shown/tick/connect/disconnect/config` are not POST-able.
6. `reload` counter starts at the server start time in ms (so after a restart all kiosks see a higher number and reload).
7. Alerts: blank `value` compares against 0 (`Number("")`); unknown `op` means `>`; `=` against a numeric `value` only matches numeric readings, string `value` compares text case-insensitively; `≠` is an alias of `!=`.
8. `missing` never fires for a key it has not seen since the last server start (`seen` is runtime); `changes` first reading only seeds, also after restart.
9. A `changes` condition inside a multi-condition rule can fire a one-shot while a level alert of the same rule is active; `blocked()` for cooldown checks one-shots still showing as well as `clearedAt`.
10. Condition runtime state is indexed by position; reordering conditions in config misaligns `since/on/seen/last` until they settle.
11. Quiet hours use the server's local timezone (and `HH:MM` without range validation: `99:99` parses as minutes 6039).
12. Test alerts fire page outputs and are never quiet or cooldown-blocked, and survive rule deletion until they expire.
13. Alert ids use a per-process `seq`; `rs.pendingSince` is cleared but never set (dead field). History entries on reload that lack `endedAt` get `endedAt = load time`.
14. Alerts SSE: readings of unsubscribed prefixes linger in memory (no pruning on close). Reconnect backoff only resets after a *successful HTTP response*, not after data.
15. Calendar: `onChange` publishes even when events are unchanged; refresh timer is a `setTimeout` chain restarted by `reconfigure()`; `REFRESH_MS` fetches happen concurrently for all links; `text.length` (chars) is checked against 5 MiB after the transport already capped bytes at 5 MiB; `MAX_REDIRECTS` allows exactly 3 followed redirects.
16. iCal: COUNT includes occurrences before the window and those removed by EXDATE/override; a non-DAILY period with zero matches is skipped (fixed in #122; it used to end the series); unparsable `FREQ` silently makes the event single; floating times use the **server's** local zone.
17. Integrations: setting `obs.host` to a non-string or `""` clears the host without error; bad port silently becomes 4455 (and `true` becomes port 1); an id-matching calendar link ignores any `url` in the patch; the OBS password is truncated to 512 only on apply, not on read.
18. `integrations.json` is the only pretty-printed file and has no trailing newline; its URL strings are WHATWG-serialised.
19. Assets: `DELETE /api/assets/<id>` ignores usage; the "never delete a used file" rule is a client protocol over `?unused=1`. The unused scan counts any 64-hex run anywhere in the config, library and canvas texts (including inside unrelated strings) — over-retention is intentional.
20. SVG detection fails if the XML prologue/comments exceed the 1024-byte sniff window; a short file is sniffed in full at `end`. The mp4 brand list excludes `qt  `/HEIC deliberately.
21. Library `localeCompare` sort on ISO strings; `data` cannot be unset by update; item size check uses string length not bytes.
22. Canvas sweep runs only at start and after config saves (no timer), compares mtime strictly `> 1 h`; `put` of an existing id only touches mtime.
23. `config.json` is stored verbatim as POSTed (no normalisation, any whitespace preserved); the Settings PATCH path rewrites it compactly, which can change whitespace/key placement. `configVersion` is a ms clock value, not a counter; it is derived from the file mtime at start.
24. Font cache and agent-install's agent settings files are written atomically (`<file>.tmp` and `<file>.dashboard.tmp`, then rename; fixed in #122).
25. `tools/agent-install.mjs` leaves a hook with a different node path or URL untouched (not "ours but stale"): installs must be remove-then-apply, which `agents.rs` does; a port of the app logic must keep that two-step order.
26. `agent-status.mjs` exits 0 always and sends the raw stdin; the statusline wrapper does not time out the wrapped command.
27. `isLoopback` exists twice: `server/assets.mjs:201-204` (`::1` or `^(::ffff:)?127\.`, used by assets/library/canvases/infopanel routes) and `server/request-guard.mjs:115` (`^(127\.|::1$|::ffff:127\.)`, used elsewhere). They accept the same set; a port may share one function.
28. `claude-sessions.mjs` has no tests and `obs.mjs` `createObs` (reconnect/backoff) has none either; only the pure `obsStep`/`obsAuth` are covered.
