/** The Import dialog's Mode, Review and Save steps (§4). */
import { useRef, useState } from "react";
import {
  Box,
  ChevronDown,
  ChevronUp,
  FileText,
  Images,
  Network,
  Shapes,
  Type,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { acceptOf, formatBytes } from "@/lib/assets";
import { cn } from "@/lib/utils";
import type { ImportReport } from "@/lib/infopanel/import/report";
import type { DefaultMode } from "@/lib/infopanel/import/stored";
import type { ImportState } from "./use-import";

export type Dest = "new" | "zone";

const CARD = "flex rounded-[10px] border text-left transition-colors";
const cardTone = (on: boolean) => (on ? "border-ui-accent bg-ui-accent-soft" : "border-ui-default bg-ui-tile hover:bg-ui-hover");

export function Radio({ on }: { on: boolean }) {
  return (
    <span className={cn("grid h-4 w-4 shrink-0 place-items-center rounded-full border-[1.5px]", on ? "border-ui-accent" : "border-[#3a3a42]")}>
      {on && <span className="h-2 w-2 rounded-full bg-ui-accent" />}
    </span>
  );
}

/* ---- Mode ---- */

const MODES: { value: DefaultMode; title: string; text: string; recommended?: boolean }[] = [
  { value: "infopanel", title: "Faithful", text: "Drawn exactly as InfoPanel draws it. The dashboard theme doesn’t touch it." },
  {
    value: "native",
    title: "Native where possible",
    text: "Items become dashboard widgets that follow your theme. The rest stay InfoPanel and say why.",
    recommended: true,
  },
  { value: "both", title: "Both", text: "One canvas; each item keeps both forms. Starts native, and you can flip any item or all and compare." },
];

export function ModeStep({ state }: { state: ImportState }) {
  const { items, native } = state.counts;
  const meta: Record<DefaultMode, string> = {
    infopanel: `${items} items as InfoPanel`,
    native: `${native} native · ${items - native} InfoPanel`,
    both: "Per-item toggle",
  };
  return (
    <div role="radiogroup" aria-label="Mode" className="flex flex-col gap-2.5">
      {MODES.map((m) => (
        <button
          key={m.value}
          type="button"
          role="radio"
          aria-checked={state.mode === m.value}
          onClick={() => state.setMode(m.value)}
          className={cn(CARD, "items-start gap-3.5 p-4", cardTone(state.mode === m.value))}
        >
          <span className="mt-0.5">
            <Radio on={state.mode === m.value} />
          </span>
          <span className="flex flex-1 flex-col gap-1">
            <span className="flex items-center gap-2 text-[13.5px] font-semibold text-ui-1">
              {m.title}
              {m.recommended && <span className="rounded bg-ui-accent-soft px-1.5 py-px text-[10.5px] font-medium text-ui-accent-text">Recommended</span>}
            </span>
            <span className="text-[12.5px] text-ui-3">{m.text}</span>
          </span>
          <span className="whitespace-nowrap font-ui-mono text-[11px] text-ui-4">{meta[m.value]}</span>
        </button>
      ))}
    </div>
  );
}

/* ---- Review ---- */

interface Tile {
  label: string;
  value: string;
  detail: string;
  tone?: "warn" | "bad";
}

interface Row {
  id: string;
  icon: LucideIcon;
  title: string;
  summary: string;
  rows: [string, string, string?][];
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The summary tiles and accordion rows of a report. */
export function reviewModel(r: ImportReport, extra: { unresolved: number; failed: { name: string; reason: string }[]; online: boolean }): { tiles: Tile[]; rows: Row[] } {
  const stay = r.items.total - (r.items.byKind.Group ?? 0) - r.native.possible;
  const findings = r.assets.unused + r.assets.duplicates + r.assets.missing.length + r.assets.urls + r.assets.absolute.length + extra.failed.length;
  const issues = Object.entries(r.issues);
  const tiles: Tile[] = [
    { label: "Items", value: String(r.items.total), detail: plural(Object.keys(r.items.byKind).length, "kind") },
    { label: "Native", value: String(r.native.possible), detail: `${stay} stay InfoPanel` },
    {
      label: "Sensors",
      value: String(r.sensors.attention),
      detail: `to fix · ${extra.unresolved} unresolved`,
      tone: extra.unresolved ? "bad" : r.sensors.attention ? "warn" : undefined,
    },
    { label: "Assets", value: formatBytes(r.assets.bytes), detail: `${plural(r.assets.files, "file")} · ${plural(findings, "finding")}`, tone: findings ? "warn" : undefined },
    { label: "Fonts", value: String(r.fonts.requests), detail: `${r.fonts.missing.length} missing`, tone: r.fonts.missing.length ? "warn" : undefined },
    { label: "Gauges", value: String(r.gauges.total), detail: `${r.gauges.vector} vector` },
  ];
  const api = r.dataApi;
  const rows: Row[] = [
    {
      id: "native",
      icon: Shapes,
      title: `Why ${plural(stay, "item")} stay InfoPanel`,
      summary: r.native.stays.slice(0, 3).map((s) => s.reason).join(" · ") || "Every item converts",
      rows: r.native.stays.map((s) => [s.reason, String(s.count)]),
    },
    {
      id: "needs",
      icon: Wrench,
      title: "App features native mode needs",
      summary: plural(r.native.needs.length, "feature"),
      rows: r.native.needs.map((n) => [n.need, plural(n.count, "item")]),
    },
    {
      id: "kinds",
      icon: Box,
      title: "Items by kind",
      summary: plural(r.items.total, "item"),
      rows: Object.entries(r.items.byKind)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => [k, String(n)]),
    },
    {
      id: "assets",
      icon: Images,
      title: "Assets",
      summary: `${formatBytes(r.assets.bytes)} · ${plural(findings, "finding")}`,
      rows: [
        ["Unused", String(r.assets.unused), "Kept; leave them out on export"],
        ["Identical files", String(r.assets.duplicates), "Stored once"],
        ["Missing", String(r.assets.missing.length), r.assets.missing.join(", ")],
        ["Images from URLs", String(r.assets.urls), "Loaded from the web"],
        ["Absolute paths", String(r.assets.absolute.length), "From the exporting PC; drawn as InfoPanel’s placeholder"],
        ...extra.failed.map((f): [string, string, string] => [f.name, "Not stored", f.reason]),
      ],
    },
    {
      id: "fonts",
      icon: Type,
      title: "Fonts",
      summary: `${r.fonts.requests} requested · ${r.fonts.missing.length} missing`,
      rows: [
        ...r.fonts.missing.map((f): [string, string, string] => [f, "Missing", "Drawn with the fallback face"]),
        ...(r.fonts.supplied ? [["Supplied faces", String(r.fonts.supplied), "Kept with the canvas"] as [string, string, string]] : []),
      ],
    },
    {
      id: "api",
      icon: Network,
      title: "Data API on this PC",
      summary: api ? api.url : extra.online ? "Answering" : "Not reachable",
      rows: api
        ? [
            ["Exact sensor refs", api.ref ? "Yes" : "No", api.ref ? "" : "Libre and HWiNFO match by name"],
            ["Structured tables", api.tables ? "Yes" : "No"],
            ["Font endpoint", api.fonts ? "Yes" : "No", api.fonts ? "Fonts drawn as InfoPanel does" : "Fonts from the reference list"],
          ]
        : [["Sensors", "Not reachable", "Every sensor stays unresolved until the Data API answers; remap it later"]],
    },
    {
      id: "issues",
      icon: FileText,
      title: "Parse notes",
      summary: issues.length ? issues.map(([k, n]) => `${n} ${k}`).join(" · ") : "None",
      rows: issues.map(([k, n]) => [k, String(n), k === "unknown-field" ? "Kept read-only and exported back" : ""]),
    },
  ];
  return { tiles, rows };
}

const TONE_DOT = { warn: "bg-ui-warning", bad: "bg-ui-danger" };
const TONE_TEXT = { warn: "text-ui-warning", bad: "text-ui-danger" };

export function ReviewStep({ state }: { state: ImportState }) {
  const { tiles, rows } = reviewModel(state.report, { unresolved: state.unresolved, failed: state.upload.failed, online: state.online });
  const [open, setOpen] = useState<string | null>(() => (Object.keys(state.report.issues).length ? "issues" : null));
  return (
    <div className="flex flex-col gap-3.5">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(120px,1fr))] gap-2">
        {tiles.map((t) => (
          <div key={t.label} className="flex flex-col gap-[3px] rounded-[9px] border border-ui-default bg-ui-chrome px-3 py-[11px]">
            <span className="flex items-center gap-1.5 text-[11px] text-ui-4">
              {t.label}
              {t.tone && <span className={cn("h-1.5 w-1.5 rounded-full", TONE_DOT[t.tone])} />}
            </span>
            <span className="font-ui-mono text-[18px] font-semibold text-ui-1">{t.value}</span>
            <span className={cn("truncate text-[11px]", t.tone ? TONE_TEXT[t.tone] : "text-ui-4")}>{t.detail}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col overflow-hidden rounded-[10px] border border-ui-default">
        {rows.map((row) => {
          const isOpen = open === row.id;
          const Icon = row.icon;
          return (
            <div key={row.id} className="border-b border-ui-subtle last:border-b-0">
              <button
                type="button"
                aria-expanded={isOpen}
                onClick={() => setOpen(isOpen ? null : row.id)}
                className="flex h-[42px] w-full items-center gap-2.5 px-3.5 text-left hover:bg-ui-tile"
              >
                <Icon className="h-4 w-4 shrink-0 text-ui-4" />
                <span className="flex-1 truncate text-[12.5px] font-medium text-ui-1">{row.title}</span>
                <span className="truncate text-[11.5px] text-ui-4">{row.summary}</span>
                {isOpen ? <ChevronUp className="h-4 w-4 text-ui-4" /> : <ChevronDown className="h-4 w-4 text-ui-4" />}
              </button>
              {isOpen && (
                <div className="flex flex-col gap-[5px] pb-3 pl-[41px] pr-3.5">
                  {row.rows.length === 0 && <span className="text-[12px] text-ui-4">Nothing here.</span>}
                  {row.rows.map(([a, b, c], i) => (
                    <div key={i} className="flex gap-3 text-[12px]">
                      <span className="flex-1 text-ui-2">{a}</span>
                      <span className="font-ui-mono text-[11.5px] text-ui-1">{b}</span>
                      <span className="w-[190px] truncate text-ui-4" title={c}>
                        {c}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Save ---- */

export interface SaveChoices {
  name: string;
  dest: Dest;
  toLibrary: boolean;
  /** Keep InfoPanel's screenshot for Compare (off by default). */
  keepShot: boolean;
  /** The screenshot chosen and stored: its file name and asset store id. */
  shot?: { name: string; id: string };
}

/** The screenshot's upload: running, or why it failed. */
export interface ShotState {
  busy: boolean;
  error?: string;
}

export function SaveStep({
  state,
  choices,
  onChoices,
  profileName,
  profileSize,
  shotState,
  onPickShot,
  lockDest,
}: {
  state: ImportState;
  choices: SaveChoices;
  onChoices: (next: SaveChoices) => void;
  profileName: string;
  profileSize: { width: number; height: number };
  shotState: ShotState;
  onPickShot: (file: File) => void;
  /** The Import door already chose where it lands: no "Lands in" choice. */
  lockDest?: boolean;
}) {
  const shotInput = useRef<HTMLInputElement>(null);
  const { profile } = state.source.parsed;
  const { items, native } = state.counts;
  const drawnNative = state.mode === "infopanel" ? 0 : native;
  const dests: { value: Dest; title: string; text: string }[] = [
    { value: "new", title: "New profile", text: `${profile.Width} × ${profile.Height}, the canvas fills it` },
    { value: "zone", title: `Canvas zone in “${profileName}”`, text: `Sits beside your widgets; ${profileSize.width} × ${profileSize.height}` },
  ];
  return (
    <div className="flex max-w-[560px] flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] text-ui-3">Name</span>
        <input
          value={choices.name}
          onChange={(e) => onChoices({ ...choices, name: e.target.value })}
          className="h-[34px] rounded-lg border border-ui-strong bg-ui-app px-2.5 text-[13px] text-ui-1 outline-none focus:border-ui-accent"
        />
      </label>
      {!lockDest && (
        <div role="radiogroup" aria-label="Lands in" className="flex flex-col gap-2">
          <span className="text-[12px] text-ui-3">Lands in</span>
          {dests.map((d) => (
            <button
              key={d.value}
              type="button"
              role="radio"
              aria-checked={choices.dest === d.value}
              onClick={() => onChoices({ ...choices, dest: d.value })}
              className={cn(CARD, "items-center gap-3 bg-ui-chrome px-3.5 py-3", choices.dest === d.value ? "border-ui-accent" : "border-ui-default hover:bg-ui-hover")}
            >
              <Radio on={choices.dest === d.value} />
              <span className="flex flex-col gap-0.5">
                <span className="text-[13px] font-medium text-ui-1">{d.title}</span>
                <span className="text-[12px] text-ui-4">{d.text}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-ui-2">
        <input
          type="checkbox"
          checked={choices.toLibrary}
          onChange={(e) => onChoices({ ...choices, toLibrary: e.target.checked })}
          className="h-4 w-4 accent-[var(--ui-accent)]"
        />
        Also save the stored form (.canvas.zip) to the Library
      </label>
      <label className="flex cursor-pointer items-center gap-2.5 text-[12.5px] text-ui-2">
        <input
          type="checkbox"
          checked={choices.keepShot}
          onChange={(e) => onChoices({ ...choices, keepShot: e.target.checked })}
          className="h-4 w-4 accent-[var(--ui-accent)]"
        />
        Keep InfoPanel&apos;s screenshot for Compare
      </label>
      {choices.keepShot && (
        <div className="flex items-center gap-2.5 pl-6 text-[12px] text-ui-3">
          <button
            type="button"
            disabled={shotState.busy}
            onClick={() => shotInput.current?.click()}
            className="h-7 rounded-[7px] border border-ui-default px-2.5 text-[12px] text-ui-2 hover:bg-ui-hover disabled:opacity-50"
          >
            {choices.shot ? "Change screenshot…" : "Choose screenshot…"}
          </button>
          <input
            ref={shotInput}
            type="file"
            accept={acceptOf("image")}
            aria-label="Screenshot file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onPickShot(f);
            }}
          />
          <span className={shotState.error ? "text-ui-danger" : undefined}>
            {shotState.busy ? "Uploading…" : (shotState.error ?? choices.shot?.name ?? "None chosen: the canvas keeps no screenshot")}
          </span>
        </div>
      )}
      <div className="rounded-[9px] border border-ui-default bg-ui-chrome px-3.5 py-3 text-[12px] leading-relaxed text-ui-3">
        {plural(items, "item")} · {drawnNative} native, {items - drawnNative} InfoPanel · {plural(state.source.assets.size, "asset")} ·{" "}
        {plural(state.report.fonts.requests, "font")} · {plural(state.groups.length, "sensor group")}. Import is one undo step.
      </div>
    </div>
  );
}
