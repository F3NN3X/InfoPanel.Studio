import type { ModuleSettings } from "@/modules/types";
import { DriveIcon, DriveRows, type DriveRow } from "./DriveSpaceViews";
import { fillRows, roomy, useFitRows, Widget, shell, get, num, fmt, fmtMB, Bar, BarRow, Ring, Num, tone, Chip, Pill, type ShellProps, type Tone } from "../kit";
import { meta } from "./meta";

export { meta };

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
  /** Your own icon per drive, by drive letter (else by name): the setting's JSON, read when a drive has one. */
  icons?: string;
}

/** A 4x4 row: the name line, the 6px bar and the used / total line with their gaps. */
export const ROW_H = 58;

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
  // "Neutral below thresholds" (off by default, like the other views): on draws an ok bar grey, off in the accent. A widget that saved it on keeps grey.
  const tn = (pct: number): Tone | "muted" => (pct >= crit ? "crit" : pct >= warn ? "warn" : p.neutral === true ? "muted" : "ok");
  const critN = drives.filter((x) => x.pct >= crit).length;
  const first = one ?? drives[0];
  return (
    <Widget
      {...shell(p)}
      title={p.title ?? "Drive space"}
      icon="hard_drive"
      right={
        (one || critN > 0) && (
          <>
            {one && <Chip>{`${one.name} ${one.label}`.trim()}</Chip>}
            {critN > 0 && <Pill state="crit" className="text-micro">{critN} critical</Pill>}
          </>
        )
      }
      studio={first && { label: "Drives", value: first.pct, unit: "%", sub: `${first.name} · ${fmtMB(first.free)} free`, pct: first.pct, rows: list.map((x) => ({ n: `${x.name} ${x.label}`, v: `${fmtMB(x.free)} free`, pct: x.pct })) }}
      compact={first && { label: `${first.name} ${first.label}`, value: first.pct, unit: "%", sub: `${fmtMB(first.free)} free`, pct: first.pct, t: tone(first.pct, warn, crit) }}
    >
      {({ size, w, h, outerW, outerH }) => {
        if (!first) return null;
        if (size === "xs")
          return (
            <div className="flex h-full flex-col justify-center gap-1.5">
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-semibold">{first.name}</span>
                <span className="text-micro text-[color:var(--w-muted)]">{fmtMB(first.free)} free</span>
              </div>
              <Bar value={first.pct} t={tone(first.pct, warn, crit)} className="h-2" />
            </div>
          );
        if (p.view === "segments" || p.view === "bars") {
          const rows: DriveRow[] = list.map((x) => ({ key: x.id, name: x.label ? `${x.label} (${x.name})` : x.name, text: `${fmtMB(x.used)} / ${fmtMB(x.total)}`, pct: x.pct, t: tone(x.pct, warn, crit), id: x.id }));
          return <DriveRows rows={rows} view={p.view} size={size} w={w} h={h} icons={p.icons} />;
        }
        if (one && size !== "sm")
          return (
            <div className="flex h-full items-center gap-5">
              <Ring value={one.pct} t={tone(one.pct, warn, crit)} className="h-full max-h-42.5">
                <Num className="text-3xl font-semibold">
                  {fmt(one.pct, 0)}
                  <span className="text-sm text-[color:var(--w-muted)]">%</span>
                </Num>
                <span className="text-micro text-[color:var(--w-muted)]">used</span>
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
        // 4x4: two-line rows (name and free, used / total and format) with a 6px bar, spread over the height
        if (roomy(outerW, outerH)) {
          const shown = list.slice(0, useFitRows(h, ROW_H, 12));
          const { rowH } = fillRows(h, shown.length, ROW_H, 12, true);
          return (
            <div className="flex h-full flex-col overflow-hidden" style={{ gap: 12 }}>
              {shown.map((x) => (
                <div key={x.id} className="flex min-w-0 flex-col justify-center gap-1.5" style={{ minHeight: rowH }}>
                  <div className="flex min-w-0 items-baseline gap-2 text-body">
                    {p.icons && <span className="inline-flex shrink-0 self-center"><DriveIcon icons={p.icons} id={x.id} name={x.name} px={16} fallback={null} /></span>}
                    <span className="truncate"><span className="font-semibold">{x.name}</span> <span className="text-[color:var(--w-faint)]">{x.label}</span></span>
                    <span className="ml-auto shrink-0 text-title font-semibold tabular-nums">{fmtMB(x.free)} free</span>
                  </div>
                  <Bar value={x.pct} t={tn(x.pct) as Tone} className="h-1.5" />
                  <span className="truncate font-mono text-micro tabular-nums text-[color:var(--w-faint)]">{fmtMB(x.used)} / {fmtMB(x.total)} · {x.format}</span>
                </div>
              ))}
            </div>
          );
        }
        return (
          <div className="flex h-full flex-col gap-3 overflow-hidden">
            {list.slice(0, n).map((x) => (
              <BarRow
                key={x.id}
                label={<>{p.icons && <span className="mr-1.5 inline-flex align-middle"><DriveIcon icons={p.icons} id={x.id} name={x.name} px={16} fallback={null} /></span>}<span className="font-semibold">{x.name}</span> <span className="text-[color:var(--w-faint)]">{x.label}</span></>}
                hint={size === "lg" ? `${x.format} · ${fmtMB(x.total)}` : null}
                value={x.pct}
                t={tn(x.pct) as Tone}
                display={`${fmtMB(x.free)} free`}
              />
            ))}
          </div>
        );
      }}
    </Widget>
  );
}
