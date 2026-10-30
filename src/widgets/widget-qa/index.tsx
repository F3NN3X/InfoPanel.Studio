import { useMemo, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import { modules } from "@/modules";
import { INSERT_CATEGORIES } from "@/components/studio/insert-panel";
import { THEME_PRESETS, themeVars } from "@/lib/theme";
import { SKIN_NAMES } from "@/widgets/core/theme";
import { TEMPLATE_MODULES } from "@/widgets/registry";
import { Gallery, GALLERIES } from "./Gallery";
import { Toolbar } from "./Toolbar";
import { WidgetSection } from "./Section";
import { forceMountAll } from "./Frame";
import { overflowReport, type Issue } from "./probe";
import { DEFAULT_STATE, parseParams, parseSpans, placementSettings, serializeParams, type QaState } from "./params";
import { filterModules, groupByCategory, pickModules } from "./plan";
import { installDemoStreams } from "./demo-streams";

/**
 * Dev-only oracle page for the widget library (`?widget-qa`): the template widgets (or exactly the
 * `module=` ids) at a set of spans, rendered through the kiosk's own `placementContent` from fixture
 * sensors, grouped by category. One toolbar drives every placement and mirrors itself to the URL
 * (params in `./params.ts`). `window.__qaOverflow()` lists what pokes out of its zone or overlaps
 * (see docs/redesign/phase9/qa.md).
 */

// `data=fixtures` also gives the streaming widgets their OBS, chat and mixer demo data.
if (new URLSearchParams(window.location.search).get("data") === "fixtures") installDemoStreams();

const CATEGORY_ORDER = INSERT_CATEGORIES.filter((c) => !["All", "Layouts", "My panels"].includes(c));

export default function WidgetQa() {
  const [state, setState] = useState(() => parseParams(window.location.search));
  const apply = (next: QaState) => {
    setState(next);
    window.history.replaceState(null, "", serializeParams(next) + window.location.hash);
  };
  const theme = THEME_PRESETS.find((p) => p.name === state.theme);
  const spans = useMemo(() => parseSpans(state.spans), [state.spans]);
  const settings = useMemo(() => placementSettings(state), [state]);
  const picked = useMemo(() => pickModules(modules, TEMPLATE_MODULES, state.module), [state.module]);
  const sections = useMemo(() => groupByCategory(filterModules(picked, state.q), CATEGORY_ORDER), [picked, state.q]);
  const shown = sections.reduce((n, s) => n + s.mods.length, 0);
  const live = state.data === "live";
  const view = { spans, cell: state.cell, gap: state.gap, live, eager: state.eager || !!state.module, settings };
  const bg = theme ? `hsl(${theme.tokens.background} / .92)` : "rgba(12,12,14,.92)";
  const style = theme ? ({ ...themeVars(theme.tokens), background: `hsl(${theme.tokens.background})`, color: `hsl(${theme.tokens.foreground})` } as CSSProperties) : undefined;
  return (
    <main className={`min-h-screen px-6 pb-10 ${theme ? "" : "bg-[#0c0c0e] text-zinc-100"}`} style={style}>
      <header className="sticky top-0 z-10 -mx-6 space-y-2 border-b border-current/15 px-6 py-3 backdrop-blur" style={{ background: bg }}>
        <div className="flex items-baseline gap-3">
          <h1 className="text-sm font-semibold">Widget QA</h1>
          <p className="font-mono text-[11px] opacity-60">
            {shown} modules · {SKIN_NAMES.length} skins · {spans.length} spans · {shown * spans.length} frames · cell {state.cell} · gap {state.gap} · {live ? "live data" : "fixtures"}
          </p>
        </div>
        <Toolbar state={state} onChange={(patch) => apply({ ...state, ...patch })} onReset={() => apply({ ...DEFAULT_STATE })} />
        <nav className="flex flex-wrap gap-x-3 gap-y-1 text-[11px]">
          {sections.map((s) => (
            <a key={s.id} href={`#${s.id}`} className="opacity-70 hover:opacity-100">
              {s.category} <span className="opacity-50">{s.mods.length}</span>
            </a>
          ))}
        </nav>
      </header>
      <div className="pt-4">
        {GALLERIES.map((g) => (
          <Gallery key={g.title} def={g} base={settings} cell={state.cell} gap={state.gap} live={live} />
        ))}
      </div>
      {sections.map((s) => (
        <div key={s.id}>
          <h2 id={s.id} className="mt-6 scroll-mt-32 text-xs font-semibold uppercase tracking-wider opacity-70">
            {s.category}
          </h2>
          {s.mods.map((m) => (
            <WidgetSection key={m.id} mod={m} view={view} />
          ))}
        </div>
      ))}
    </main>
  );
}

declare global {
  interface Window {
    __qaOverflow?: () => { module: string; span: string; issues: Issue[] }[];
    __qaMountAll?: () => Promise<void>;
  }
}

// Frames mount lazily. `__qaOverflow` mounts the rest itself so it always covers every figure, but
// widgets measure after mounting: `await __qaMountAll()` first (or load with `module=` / `eager=1`) to let them settle.
window.__qaMountAll = async () => {
  flushSync(forceMountAll);
  await document.fonts.ready;
  await new Promise((r) => setTimeout(r, 1500));
};
window.__qaOverflow = () => {
  flushSync(forceMountAll);
  return overflowReport();
};
