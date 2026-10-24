# Phase 3 (the native server)

Same machine and method as [phase2.md](phase2.md). `npm run perf:compare phase3-node phase3-native` for the server
perf spec (medians of 3, range in brackets); the desktop numbers are from a release build in the tray (no WebView2)
with scratch settings and data, one run each unless noted. Every known behaviour difference is listed, with its
reason, in [server-native.md](../server-native.md#known-differences-from-servermjs-gate-3b).

## What changed

| Item | Result |
|---|---|
| 3.1–3.3 ips-server | Every route of `server.mjs` ported to Rust (`src-tauri/crates/ips-server`): config, control, assets, canvases, library, InfoPanel import, integrations, OBS, calendar and iCal, alerts, agents, the image and font proxies, debug |
| 3.4 in the app | **Server** setting (Diagnostics): `node` (default) or `native` (experimental). Native runs on Tauri's runtime with the same restart, error and health handling as the sidecar |
| 3.5 ips-agent | The agents' hook binary and the in-app hook installer, without Node |
| Parity | 270 Node-generated fixture cases (`parity:check`); 528 HTTP cases against both servers, 0 differences (`parity:servers`); the server suite on both (`test:server:native` 317; `test:server:node` 312, the 5 native-only cases skipped, the data round-trip among them); e2e 25/25 on both |
| Font proxy | A 60 s deadline in both servers (it had none) |

## Server footprint (Chromium kiosks; `server-idle`, two kiosks and a studio, 60 s)

| Metric | node | native | Δ |
|---|---|---|---|
| server RSS MB | 58.9 (57.9–63.9) | 12.0 (11.6–12.1) | −79.6% |
| server private MB | 61.7 (60.6–72.1) | 4.4 (4.2–4.7) | −92.9% |
| kiosk JS transferred (heavy) | 1,135,347 B | 1,135,065 B | −282 B (headers) |

The kiosk's own rendering is the same on both (every kiosk row within noise).

## In the app (release build, tray, `server-footprint`)

Private MB of the app's tree after 20 s settled, then with five SSE clients (three kiosks on the control stream, two
config streams):

| | node (app + sidecar) | native (app) | Δ |
|---|---|---|---|
| idle | 82.4 (11.1 + 71.3) | 40.8 | −41.6 MB (−50%) |
| 5 SSE clients | 84.4 (11.0 + 73.4) | 40.8 | −43.6 MB (−52%) |

One process instead of two: `node.exe` (and its 85 MB on disk) goes in 3.7.

## 30-minute soak (release build, tray, five SSE clients, sampled every minute; `server-soak`)

| | memory | mean CPU, cores | steady CPU (minutes 2–30, median) |
|---|---|---|---|
| node | 85.8 → 98.4 MB (app 10.7, sidecar 87.7) | 0.0067 | 0.0026 |
| native, first run | 41.7 → 41.7 MB | 0.0128 | 0.0062 |
| native, after the fix | 40.8 → 40.8 MB | 0.0098 | **0.0018** |

The means are dominated by the first minute (startup: node 0.12 cores, native 0.20).

The first native run idled at more than twice Node's CPU. The cause was the agents sweep's liveness check: it built
a `sysinfo` snapshot of every process on the machine for each Claude session file, three times a minute (118 files
here). It now asks with one `OpenProcess` per pid, as Node's `process.kill(pid, 0)` does. The server alone, outside
the app, idles at 0.0001 cores against Node's 0.0096 with 6,000 synthetic transcripts. The first minute of each run
is startup.

## Agent hooks (3.5)

| | node `tools/agent-status.mjs` | `ips-agent` |
|---|---|---|
| hook latency p50 | 50.2 ms | 6.0 ms |
| hook latency p95 | 54.3 ms | 7.4 ms |
| binary | Node (85 MB) | 370,688 B |

## Sizes

| | before | after | Δ |
|---|---|---|---|
| app exe (release) | 12,249,088 B | 16,898,048 B | +4.65 MB (ips-server; chrono-tz is 1.27 MB of it) |
| ips-agent.exe | – | 370,688 B | new |
| ips-server.exe (standalone, development only) | – | 5,663,232 B | not shipped |

## e2e wall time (`npm run test:e2e`, 25 specs, two runs each)

| node | native |
|---|---|
| 21.4 s, 18.2 s | 17.7 s, 17.8 s |

## Desktop specs on native (debug build)

`studio-idle-webview2`, `studio-in-browser` and `tray-close-releases-webview` pass with `DESKTOP_SERVER=native`.
Close to tray releases WebView2 with no sidecar left; the studio rebuilt in 262 ms.

## Proxy security tests (Rust, ips-server)

- `guarded_net`: both edges of every blocked range (0/8, 127/8, 169.254/16, 224/4 and above, 10/8, 172.16/12,
  192.168/16, 100.64/10, `::`, `::1`, fe80::/10, ff00::/8, fc00::/7), and the IPv4-mapped, IPv4-compatible and NAT64
  forms of each; IPv4-in-IPv6 spellings; connections only through the guarded resolver.
- DNS rebinding: a resolver answering public then private; the private listener sees no connection.
- Refused before connecting: 17 blocked literals, and names that resolve to blocked addresses.
- Redirects: to a private address refused (504 or 502), the http-hop rules, the 3-redirect limit.
- Bodies and types: oversize by `Content-Length` and while streaming (413); SVG and non-images 406; `nosniff`.
- Timeouts: 504 before the head, 502 after.
- Font proxy: the host allowlist, redirect rules, the 30 MiB cap, the exact catalogue URL check and its cache, the
  atomic cache write, the 60 s deadline.
- e2e: the cross-origin write spec covers `/api/studio-prefs` (403).
