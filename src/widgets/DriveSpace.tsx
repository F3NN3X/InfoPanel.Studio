import { driveIconOf, type IconSource } from "@/lib/effects/icon";
import type { ModuleSettings } from "@/modules/types";
import { DriveIcon, DriveRows, type DriveRow } from "./DriveSpaceViews";
import { useFitRows, Widget, shell, get, num, fmt, fmtMB, Bar, BarRow, Ring, Num, tone, Pill, type ShellProps, type WidgetMeta, type Tone } from "./kit";

export const meta: WidgetMeta = {
  id: "DriveSpace",
  name: "Drive Space",
  category: "Storage",
  icon: "hard_drive",
  prefixes: ["plugins.drive-info-plugin."],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Used and free space per drive",
  tags: "disk volume ssd",
  description: "Used / free space per volume with label, type and file system.",
  views: [
    { id: "list", name: "List" },
    { id: "segments", name: "Segments", blurb: "Segmented fill bar per drive", defaultSize: [4, 3] },
    { id: "bars", name: "Bars", blurb: "Slim fill bar per drive", defaultSize: [4, 3] },
  ],
};

export interface DriveSpaceProps extends ShellProps {
  look?: ModuleSettings;
  /** The layout: the list, a segmented fill bar per drive or a slim one. */
  view?: "list" | "segments" | "bars";
  /** Pin one volume ("c", "d", …); omit to list all. */
  drive?: string;
  warn?: number;
  crit?: number;
  sort?: "usage" | "name";
  /** Neutral tone below the thresholds (default true). */
  neutral?: boolean;
  /** Your own icon per drive, by drive letter (else by name). */
  icons?: Record<string, IconSource>;
}

export default function DriveSpace(p: DriveSpaceProps) {
  const d = p.data;
  const ids = [...new Set(Object.keys(d || {}).map((k) => k.match(/^plugins\.drive-info-plugin\.([^.]+)\.name$/)?.[1]).filter((x): x is string => !!x))];
  const drives = ids.map((id) => {
    const k = (s: string) => get(d, `plugins.drive-info-plugin.${id}.${s}`);
    const total = num(k("total_size")),
      used = num(k("used_space"));
    return { id, name: k("name"), label: k("volume_label"), type: k("type"), format: k("format"), total, used, free: num(k("available_space")), pct: (used / total) * 100 };
  });
  const one = p.drive ? drives.find((x) => x.id === p.drive!.toLowerCase().replace(":", "")) : null;
  const warn = p.warn ?? 80,
    crit = p.crit ?? 92;
  const list = (one ? [one] : [...drives]).sort((a, b) => (p.sort === "name" ? a.id.localeCompare(b.id) : b.pct - a.pct));
  const neutral = p.neutral !== false;
  const tn = (pct: number): Tone | "muted" => (pct >= crit ? "crit" : pct >= warn ? "warn" : neutral ? "muted" : "ok");
  const critN = drives.filter((x) => x.pct >= crit).length;
  const first = one ?? drives[0];
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? (one ? `${one.name} ${one.label}` : "Drives")}
      icon="hard_drive"
      right={critN > 0 && <Pill state="crit" className="text-[11px]">{critN} critical</Pill>}
      studio={first && { label: "Drives", value: first.pct, unit: "%", sub: `${first.name} · ${fmtMB(first.free)} free`, pct: first.pct, rows: list.map((x) => ({ n: `${x.name} ${x.label}`, v: `${fmtMB(x.free)} free`, pct: x.pct })) }}
      compact={first && { label: `${first.name} ${first.label}`, value: first.pct, unit: "%", sub: `${fmtMB(first.free)} free`, pct: first.pct, t: tone(first.pct, warn, crit) }}
    >
      {({ size, h }) => {
        if (!first) return null;
        if (size === "xs")
          return (
            <div className="flex h-full flex-col justify-center gap-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold">{first.name}</span>
                <span className="text-[11px] text-[color:var(--w-muted)]">{fmtMB(first.free)} free</span>
              </div>
              <Bar value={first.pct} t={tone(first.pct, warn, crit)} className="h-2" />
            </div>
          );
        if (p.view === "segments" || p.view === "bars") {
          const rows: DriveRow[] = list.map((x) => ({ key: x.id, name: x.label ? `${x.label} (${x.name})` : x.name, text: `${fmtMB(x.used)} / ${fmtMB(x.total)}`, pct: x.pct, t: tone(x.pct, warn, crit), icon: driveIconOf(p.icons, x.id, x.name) }));
          return <DriveRows rows={rows} view={p.view} size={size} h={h} />;
        }
        if (one && size !== "sm")
          return (
            <div className="flex h-full items-center gap-5">
              <Ring value={one.pct} t={tone(one.pct, warn, crit)} className="h-full max-h-[170px]">
                <Num className="text-3xl font-semibold">
                  {fmt(one.pct, 0)}
                  <span className="text-sm text-[color:var(--w-muted)]">%</span>
                </Num>
                <span className="text-[11px] text-[color:var(--w-muted)]">used</span>
              </Ring>
              <div className="grid flex-1 gap-2 text-xs">
                {[["Free", fmtMB(one.free)], ["Used", fmtMB(one.used)], ["Total", fmtMB(one.total)], ["Type", `${one.type} · ${one.format}`]].map(([l, v]) => (
                  <div key={l} className="flex justify-between gap-2">
                    <span className="text-[color:var(--w-faint)]">{l}</span>
                    <span className="tabular-nums text-[color:var(--w-fg)]">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          );
        const n = useFitRows(h, size === "lg" ? 46 : 38);
        return (
          <div className="flex h-full flex-col gap-3 overflow-hidden">
            {list.slice(0, n).map((x) => {
              const own = driveIconOf(p.icons, x.id, x.name);
              return (
              <BarRow
                key={x.id}
                label={<>{own && <span className="mr-1.5 inline-flex align-middle"><DriveIcon source={own} px={16} /></span>}<span className="font-semibold">{x.name}</span> <span className="text-[color:var(--w-faint)]">{x.label}</span></>}
                hint={size === "lg" ? `${x.format} · ${fmtMB(x.total)}` : null}
                value={x.pct}
                t={tn(x.pct) as Tone}
                display={`${fmtMB(x.free)} free`}
              />
              );
            })}
          </div>
        );
      }}
    </Widget>
  );
}
