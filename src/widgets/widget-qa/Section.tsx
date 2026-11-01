import type { DashboardModule, ModuleSetting, ModuleSettings } from "@/modules/types";
import { withDemo } from "./demo-settings";
import { Frame } from "./Frame";
import { framePlan, placement, spanSize, viewPlans } from "./plan";

export interface View {
  spans: [number, number][];
  cell: number;
  gap: number;
  live: boolean;
  eager: boolean;
  settings: ModuleSettings;
  /** A widget's own links (`widgetLinks`). */
  links: (id: string) => { solo: string; skins: string };
}

function settingRow(s: ModuleSetting) {
  const opts = s.options?.map((o) => o.value).join(" | ");
  return (
    <li key={s.key} className="font-mono text-[10px]">
      <span className="opacity-90">{s.key}</span>{" "}
      <span className="opacity-50">
        {s.type} = {JSON.stringify(s.default)}
      </span>
      {opts && <span className="opacity-50"> [{opts}]</span>}
    </li>
  );
}

const LINK = "font-mono text-[10px] underline decoration-current/30 underline-offset-2 opacity-70 hover:opacity-100";

/** One frame at an exact span, with its caption. `attrs` say what the frame is to the probes. */
function Figure({ mod, c, r, settings, view, caption, attrs }: { mod: DashboardModule; c: number; r: number; settings: ModuleSettings; view: View; caption: string; attrs: Record<string, string> }) {
  const w = spanSize(c, view.cell, view.gap);
  const h = spanSize(r, view.cell, view.gap);
  return (
    <figure {...attrs} className="m-0 flex flex-col gap-1">
      <Frame p={{ ...placement(mod.id, c, r, withDemo(mod.id, settings, view.live)), id: `qa-${mod.id}-${attrs["data-qa-view"] ?? ""}${c}x${r}` }} w={w} h={h} live={view.live} eager={view.eager} />
      <figcaption className="font-mono text-[10px] opacity-60">
        {caption} · {w}x{h}px
      </figcaption>
    </figure>
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
        {mod.settings && mod.settings.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] opacity-70">{mod.settings.length} settings</summary>
            <ul className="mt-1 space-y-0.5">{mod.settings.map(settingRow)}</ul>
          </details>
        )}
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
              <Figure key={`${c}x${r}`} mod={mod} c={c} r={r} settings={view.settings} view={view} caption={`${c}x${r}`} attrs={{ "data-qa-module": mod.id, "data-qa-span": `${c}x${r}` }} />
            )
          )}
        </div>
        {views.length > 0 && (
          <div>
            <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider opacity-50">Views</p>
            <div className="flex min-w-0 flex-wrap items-start gap-6">
              {views.map((v) => (
                <Figure key={v.id} mod={mod} c={v.c} r={v.r} settings={{ ...view.settings, ...v.settings }} view={view} caption={`${v.name} · ${v.c}x${v.r}`} attrs={{ "data-qa-view": v.id, "data-qa-view-of": mod.id }} />
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
