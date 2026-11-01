import type { DashboardModule, ModuleSetting, ModuleSettings } from "@/modules/types";
import { withDemo } from "./demo-settings";
import { Frame } from "./Frame";
import { framePlan, placement, spanSize } from "./plan";

export interface View {
  spans: [number, number][];
  cell: number;
  gap: number;
  live: boolean;
  eager: boolean;
  settings: ModuleSettings;
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

/** One widget: an info column (title, id, category, min size, data, settings) and its span frames. */
export function WidgetSection({ mod, view }: { mod: DashboardModule; view: View }) {
  const prefixes = mod.prefixes.length + (mod.reads?.length ?? 0);
  const data = mod.readsAll ? "reads all sensors" : prefixes ? `${prefixes} data prefix${prefixes === 1 ? "" : "es"}` : "no data";
  const min = `${mod.minCols ?? 1}x${mod.minRows ?? 1}`;
  return (
    <section id={mod.id} className="flex scroll-mt-32 gap-6 border-t border-current/10 py-5">
      <div className="w-60 shrink-0">
        <h3 className="text-sm font-semibold">{mod.title}</h3>
        <p className="font-mono text-[11px] opacity-60">{mod.id}</p>
        <p className="mt-1 font-mono text-[10px] opacity-60">
          {mod.category ?? "Generic"} · min {min} · {data}
        </p>
        {mod.description && <p className="mt-1 text-xs opacity-80">{mod.description}</p>}
        {mod.settings && mod.settings.length > 0 && (
          <details className="mt-2">
            <summary className="cursor-pointer text-[11px] opacity-70">{mod.settings.length} settings</summary>
            <ul className="mt-1 space-y-0.5">{mod.settings.map(settingRow)}</ul>
          </details>
        )}
      </div>
      <div className="flex min-w-0 flex-wrap items-start gap-6">
        {framePlan(mod, view.spans).map(({ c, r, below }) => {
          const w = spanSize(c, view.cell, view.gap);
          const h = spanSize(r, view.cell, view.gap);
          const caption = `${c}x${r} · ${w}x${h}px`;
          return below ? (
            <div key={`${c}x${r}`} data-qa-below className="flex flex-col gap-1 opacity-40">
              <div className="flex items-center justify-center rounded border border-dashed border-current/40 font-mono text-[10px]" style={{ width: w, height: h }}>
                below min {min}
              </div>
              <span className="font-mono text-[10px]">{caption}</span>
            </div>
          ) : (
            <figure key={`${c}x${r}`} data-qa-module={mod.id} data-qa-span={`${c}x${r}`} className="m-0 flex flex-col gap-1">
              <Frame p={placement(mod.id, c, r, withDemo(mod.id, view.settings, view.live))} w={w} h={h} live={view.live} eager={view.eager} />
              <figcaption className="font-mono text-[10px] opacity-60">{caption}</figcaption>
            </figure>
          );
        })}
      </div>
    </section>
  );
}
