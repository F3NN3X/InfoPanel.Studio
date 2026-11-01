import { useState } from "react";
import { categorize, tabOf } from "@/components/studio/inspector-categories";
import { STANDARD_KEYS } from "@/modules/standard-settings";
import type { DashboardModule, ModuleSetting, ModuleSettings } from "@/modules/types";
import { withDemo } from "./demo-settings";
import { Frame } from "./Frame";
import { notesFor } from "./notes";
import { frameId } from "./params";
import { framePlan, placement, spanSize, viewPlans } from "./plan";
import { probeBox, type Issue } from "./probe";

export interface View {
  spans: [number, number][];
  cell: number;
  gap: number;
  live: boolean;
  eager: boolean;
  settings: ModuleSettings;
  /** A widget's own links (`widgetLinks`). */
  links: (id: string) => { solo: string; skins: string };
  /** What a frame's caption copies (`frameRef`). */
  frameRef: (id: string, key: string) => { text: string; url: string };
  /** Draw the grid cells over every frame. */
  grid: boolean;
}

function settingRow(s: ModuleSetting) {
  const opts = s.options?.map((o) => o.value).join(" | ");
  return (
    // The widget's own rows bright, the general ones (the same on every widget) dim.
    <li key={s.key} className={`font-mono text-[10px] ${STANDARD_KEYS.has(s.key) ? "opacity-50" : ""}`}>
      <span className="opacity-90">{s.key}</span>{" "}
      <span className="opacity-50">
        {s.type} = {JSON.stringify(s.default)}
      </span>
      {opts && <span className="opacity-50"> [{opts}]</span>}
    </li>
  );
}

const TABS = [
  ["show", "Show"],
  ["style", "Style"],
  ["data", "Data"],
  ["behaviour", "Behaviour"],
] as const;

/**
 * The widget's settings as its inspector files them (`categorize`, `tabOf`): per tab, each section (a general one
 * marked) and its rows. The reference for where a setting lives and which of them are the widget's own.
 */
function SettingsByTab({ mod }: { mod: DashboardModule }) {
  const shown = (mod.settings ?? []).filter((d) => !d.hidden);
  const sections = categorize(shown).flatMap((c) =>
    TABS.flatMap(([tab]) => {
      const settings = c.defs.filter((d) => tabOf(d, c) === tab);
      return settings.length ? [{ id: `${c.id}-${tab}`, title: c.title, general: c.general, tab, settings }] : [];
    })
  );
  const own = shown.filter((d) => !STANDARD_KEYS.has(d.key)).length;
  const total = shown.length;
  return (
    <details className="mt-2">
      <summary className="cursor-pointer text-[11px] opacity-70">
        {total} settings · {own} its own
      </summary>
      <div className="mt-1 space-y-2">
        {TABS.map(([tab, label]) => {
          const inTab = sections.filter((s) => s.tab === tab);
          return inTab.length === 0 ? null : (
            <div key={tab}>
              <p className="text-[10px] font-semibold uppercase tracking-wider opacity-60">{label}</p>
              {inTab.map((sec) => (
                <div key={sec.id} className="mt-1">
                  <p className="text-[11px]">
                    {sec.title}
                    {sec.general && <span className="opacity-50"> · general</span>}
                  </p>
                  <ul className="space-y-0.5 pl-2">{sec.settings.map(settingRow)}</ul>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </details>
  );
}

const LINK = "font-mono text-[10px] underline decoration-current/30 underline-offset-2 opacity-70 hover:opacity-100";

/** Copies text, falling back to a hidden textarea where the Clipboard API is missing (a plain-http LAN address). */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const area = Object.assign(document.createElement("textarea"), { value: text });
    document.body.append(area);
    area.select();
    const ok = document.execCommand("copy");
    area.remove();
    return ok;
  }
}

/** The grid's cells and gaps over a frame (`grid=1`): the dashed squares are cells, the space between them the gap. */
function GridOverlay({ c, r, cell, gap }: { c: number; r: number; cell: number; gap: number }) {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10">
      {Array.from({ length: c * r }, (_, i) => (
        <div key={i} className="absolute border border-dashed border-sky-400/60" style={{ left: (i % c) * (cell + gap), top: Math.floor(i / c) * (cell + gap), width: cell, height: cell }} />
      ))}
    </div>
  );
}

interface FigureProps {
  mod: DashboardModule;
  /** The frame's key: its span (`2x1`) or view (`view:gauge`), as notes and references name it. */
  frameKey: string;
  c: number;
  r: number;
  settings: ModuleSettings;
  view: View;
  caption: string;
  /** What the frame is to the probes and sweeps. */
  attrs: Record<string, string>;
}

/**
 * One frame at an exact span. The caption copies a reference to the frame; a badge counts what overflows, overlaps or
 * is clipped once the widget has settled (the `__qaOverflow` probe, run on this frame alone); a note from `notes.json`
 * shows under it.
 */
function Figure({ mod, frameKey, c, r, settings, view, caption, attrs }: FigureProps) {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [copied, setCopied] = useState("");
  const w = spanSize(c, view.cell, view.gap);
  const h = spanSize(r, view.cell, view.gap);
  const note = notesFor(mod.id)?.[frameKey];
  const id = frameId(mod.id, frameKey);
  // The page renders after load, so CSS :target never matches; a copied frame link outlines its frame by the hash itself.
  const targeted = window.location.hash === `#${id}`;
  const copy = async () => {
    setCopied((await copyText(view.frameRef(mod.id, frameKey).text)) ? "copied" : "copy failed");
    setTimeout(() => setCopied(""), 1500);
  };
  return (
    <figure id={id} {...attrs} className={`m-0 flex scroll-mt-40 flex-col gap-1 rounded ${targeted ? "outline outline-2 outline-offset-4 outline-sky-400" : ""}`}>
      <div className={`relative rounded ${issues.length ? "outline outline-1 outline-offset-2 outline-red-500/70" : ""}`}>
        <Frame p={{ ...placement(mod.id, c, r, withDemo(mod.id, settings, view.live)), id: `qa-${mod.id}-${attrs["data-qa-view"] ?? ""}${c}x${r}` }} w={w} h={h} live={view.live} eager={view.eager} onSettled={(box) => setIssues(probeBox(box))} />
        {view.grid && <GridOverlay c={c} r={r} cell={view.cell} gap={view.gap} />}
      </div>
      <figcaption className="flex items-center gap-2 font-mono text-[10px]">
        <button type="button" title="Copy a reference to this frame" onClick={copy} className="opacity-60 hover:underline hover:opacity-100">
          {caption} · {w}x{h}px
        </button>
        {copied && <span className="opacity-80">{copied}</span>}
        {issues.length > 0 && (
          <span title={issues.map((x) => `${x.kind} ${x.dx}/${x.dy}  ${x.selector}`).join("\n")} className="rounded bg-red-500/20 px-1 text-red-400">
            {issues.length} {issues.length === 1 ? "issue" : "issues"}
          </span>
        )}
      </figcaption>
      {note && (
        <p className="text-[11px] text-amber-400" style={{ maxWidth: w }}>
          {note}
        </p>
      )}
    </figure>
  );
}

/** A widget's notes, the widget-wide one (`*`) first. */
function NoteList({ id }: { id: string }) {
  const notes = Object.entries(notesFor(id) ?? {}).sort(([a], [b]) => Number(b === "*") - Number(a === "*"));
  if (!notes.length) return null;
  return (
    <ul className="mt-2 space-y-0.5 text-[11px] text-amber-400">
      {notes.map(([key, text]) => (
        <li key={key}>
          <span className="font-mono opacity-70">{key === "*" ? "widget" : key}</span> {text}
        </li>
      ))}
    </ul>
  );
}

/** One widget: an info column (title, id, links, category, sizes, data, views, settings), its span frames and its views. */
export function WidgetSection({ mod, view }: { mod: DashboardModule; view: View }) {
  const prefixes = mod.prefixes.length + (mod.reads?.length ?? 0);
  const data = mod.readsAll ? "reads all sensors" : prefixes ? `${prefixes} data prefix${prefixes === 1 ? "" : "es"}` : "no data";
  const min = `${mod.minCols ?? 1}x${mod.minRows ?? 1}`;
  const size = mod.defaultSize ? ` · default ${mod.defaultSize[0]}x${mod.defaultSize[1]}` : "";
  const views = viewPlans(mod);
  const links = view.links(mod.id);
  return (
    <section id={mod.id} className="flex scroll-mt-32 gap-6 border-t border-current/10 py-5">
      <div className="w-60 shrink-0">
        <h3 className="text-sm font-semibold">{mod.title}</h3>
        <p className="font-mono text-[11px] opacity-60">{mod.id}</p>
        <p className="mt-0.5 flex gap-3">
          <a href={links.solo} className={LINK}>
            solo
          </a>
          <a href={links.skins} className={LINK}>
            skins &amp; surfaces
          </a>
          <a href={`#${mod.id}`} className={LINK}>
            #
          </a>
        </p>
        <p className="mt-1 font-mono text-[10px] opacity-60">
          {mod.category ?? "Generic"} · min {min}
          {size} · {data}
        </p>
        {mod.blurb && <p className="mt-1 text-xs opacity-90">{mod.blurb}</p>}
        {mod.description && <p className="mt-1 text-xs opacity-70">{mod.description}</p>}
        {views.length > 0 && <p className="mt-1 font-mono text-[10px] opacity-60">views: {views.map((v) => v.id).join(", ")}</p>}
        {mod.tags && <p className="mt-1 font-mono text-[10px] opacity-50">{mod.tags}</p>}
        <NoteList id={mod.id} />
        {mod.settings && mod.settings.length > 0 && <SettingsByTab mod={mod} />}
      </div>
      <div className="flex min-w-0 flex-col gap-4">
        <div className="flex min-w-0 flex-wrap items-start gap-6">
          {framePlan(mod, view.spans).map(({ c, r, below }) =>
            below ? (
              <div key={`${c}x${r}`} data-qa-below className="flex flex-col gap-1 opacity-40">
                <div className="flex items-center justify-center rounded border border-dashed border-current/40 font-mono text-[10px]" style={{ width: spanSize(c, view.cell, view.gap), height: spanSize(r, view.cell, view.gap) }}>
                  below min {min}
                </div>
                <span className="font-mono text-[10px]">{`${c}x${r}`}</span>
              </div>
            ) : (
              <Figure key={`${c}x${r}`} mod={mod} frameKey={`${c}x${r}`} c={c} r={r} settings={view.settings} view={view} caption={`${c}x${r}`} attrs={{ "data-qa-module": mod.id, "data-qa-span": `${c}x${r}` }} />
            )
          )}
        </div>
        {views.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-50">Views</p>
            <div className="flex min-w-0 flex-wrap items-start gap-6">
              {views.map((v) => (
                <Figure key={v.id} mod={mod} frameKey={`view:${v.id}`} c={v.c} r={v.r} settings={{ ...view.settings, ...v.settings }} view={view} caption={`${v.name} · ${v.c}x${v.r}`} attrs={{ "data-qa-view": v.id, "data-qa-view-of": mod.id }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
