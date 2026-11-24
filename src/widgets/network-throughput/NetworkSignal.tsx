// Network Traffic's `signal` layout (look.json `layouts`, src/widgets/layouts.ts): the kit's signal graph. Under the standard header
// (the adapter and its utilisation), the download and upload as readouts (decimals and unit small, over the solid-and-dotted rule), the two
// series on one dashed 0 / 50 / 100 % grid with the download as an area and a marker on its last reading, and the session totals
// as a mono footer. The data and colours are the standard layout's: the adapter's readings and the theme's Series 1 and 2.
import { Widget, shell, get, num, fmt, fmtRate, gbStat, rateUnitOf, adapterOf, pretty, hue, seriesColour, useHistory, Empty, type RateUnit } from "../kit";
import { t3Tokens } from "../core/t3-tokens";
import { useSkin } from "../core/theme";
import { Reading, SignalGraph } from "../shared/layout-parts";
import type { NetworkThroughputProps } from "./NetworkThroughput";

const clamp = (lo: number, v: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A rate as a readout's number, decimals and unit (`fmtRate`'s scaling). */
export function rateReadout(bytesPerSec: number, unit: RateUnit | undefined): { value: number; decimals: number; unit: string } {
  const [u, div] = rateUnitOf(Number.isFinite(bytesPerSec) ? bytesPerSec : 0, unit);
  const value = bytesPerSec / div;
  return { value, decimals: u === "B/s" ? 0 : value >= 100 ? 0 : value >= 10 ? 1 : 2, unit: u };
}

export function NetworkSignal(p: NetworkThroughputProps) {
  const d = p.data;
  const id = adapterOf(d, p.adapter);
  const k = (s: string) => num(get(d, `libre.${id}_${s}`));
  const dn = k("download_speed"),
    up = k("upload_speed");
  const dH = useHistory(dn),
    uH = useHistory(up);
  const sk = useSkin();
  if (!id)
    return (
      <Widget {...shell(p)} title="Network" icon="swap_vert">
        <Empty />
      </Widget>
    );
  const marks = t3Tokens(p.t3);
  // the kit draws its signal in the info tone: a Look that draws slabs has one (`slab-info`), else the theme's Series 1
  const dlColor = p.downloadColor || (sk.slab ? "var(--wp-slab-info)" : seriesColour(marks, 1, "var(--w-accent)"));
  const ulColor = p.uploadColor || seriesColour(marks, 2, hue(70));
  const name = p.title ?? pretty(id).replace(/ {2,}/g, " ");
  const peak = Math.max(1, ...dH, ...uH);
  const totals = [gbStat(k("data_downloaded")), gbStat(k("data_uploaded"))].map((s) => `${s.value} ${s.unit}`);
  return (
    <Widget
      {...shell(p)}
      title={name}
      icon="swap_vert"
      // the standard layout's summary rule, so a small zone shows the same card
      compact={(box) => (box.shape === "tile" && box.w >= 200 ? undefined : { label: name, value: fmtRate(dn, p.rateUnit), sub: `↑ ${fmtRate(up, p.rateUnit)}`, hist: dH, min: 0, icon: "south" })}
      right={<span data-part="num" className="tabular-nums text-[color:var(--w-fg)]">{fmt(k("network_utilization"), 1)}%</span>}
    >
      {({ w, h }) => {
        const px = clamp(18, Math.min(w / 9, h * 0.2), 64);
        const foot = p.showTotals !== false && h >= 150;
        return (
          <div data-layout="signal" className="flex h-full min-w-0 flex-col gap-2">
            <div className="grid min-w-0 grid-cols-2 gap-3">
              {(
                [
                  ["Download", dn, dlColor, p.downloadColor],
                  ["Upload", up, ulColor, p.uploadColor],
                ] as const
              ).map(([label, v, color, own]) => {
                const r = rateReadout(v, p.rateUnit);
                return (
                  <div key={label} className="flex min-w-0 flex-col gap-1">
                    <span data-part="label" className="text-micro uppercase tracking-[0.08em] text-[color:var(--w-faint)]">{label}</span>
                    {/* a colour set on the widget tints its figure; else the figure is the theme's number colour, its rule the series' */}
                    <Reading value={r.value} decimals={r.decimals} unit={r.unit} px={px} color={own || undefined} ruleColor={color} />
                  </div>
                );
              })}
            </div>
            <SignalGraph
              series={[
                { values: dH, color: dlColor },
                { values: uH, color: ulColor, area: false },
              ]}
              min={0}
              max={peak}
              labels={[fmtRate(peak, p.rateUnit), "0"]}
              className="min-h-8 flex-1"
            />
            {foot && (
              <div data-part="mono" className="flex min-w-0 justify-between gap-3 truncate text-micro uppercase tracking-[0.06em] text-[color:var(--w-muted)]">
                <span className="truncate">{`↓ ${totals[0]} // ↑ ${totals[1]}`}</span>
                <span className="shrink-0">{w >= 260 ? "Session" : ""}</span>
              </div>
            )}
          </div>
        );
      }}
    </Widget>
  );
}
