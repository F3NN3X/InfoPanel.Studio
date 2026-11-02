# Batch 3b notes (FND-072, partial)

All four problems confirmed in the batch3 shots before the change.

- E-12 Calendar (`Calendar.tsx`, month grid): grid capped at `max-height: 21rem`, so week rows stay about 48px instead of stretching over the whole 4x4 card; the "Monday" column and month header are unchanged.
- E-14 StreamDeck (`StreamDeck.tsx`, `compact`): a ready deck at a 2x2 tile (w and h >= 200) now shows the key grid (with page row) instead of the "5x3 / 14 keys" summary; the summary stays for smaller tiles and for every not-ready state. Studio keeps the summary via `studio={summary}`.
- E-16 CoreHeatmap (`CoreHeatmap.tsx`): default title is "Cores" (metric dropped), summary is `54% · T2 80%` with the full wording in `title`.
- E-24 TextFile (`TextFile.tsx`): header meta removed; size and lines move to a footer line in the body at non-xs sizes; the default status "OK" is no longer shown (any other status is).
- Fixture: `v8-parity.json` re-recorded for exactly `txt-default`, `txt-own` (footer), and text-replaced for the three CoreHeatmap cases (title, summary) and two Calendar cases (`max-height:21rem`).

## Left (FND-072 stays partial)
- E-13 (BottleneckLens, StorageHealth, ThresholdTimeline, SessionStats, PlaytimeShare, Notifications, Timer, Uptime at 4x4): no single alignment rule or second row fits all eight; each needs its own content decision, not done.
- E-17 (sparklines at 4x4: KpiTiles, Vitals, CpuMonitor, PowerDraw, DiskIO, GpuMonitor): min/max or last-value markers on the spark not added.

## Check
`npm run verify` exit 0 (all checks ran, including cargo-app). Shots: `.cache/qa-shots/fnd072/default/` (StreamDeck, CoreHeatmap, TextFile 2x2; Calendar 4x4) looked right by eye.
- Controller review: Calendar 4x4 no longer runs its last week into the footer, but the week rows are still spread tall (about 58 px apart for 30 px cells). Left open under FND-072.
