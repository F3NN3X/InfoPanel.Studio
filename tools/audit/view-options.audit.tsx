import { mkdirSync, writeFileSync } from "node:fs";
import { renderToString } from "react-dom/server";
import { afterAll, it, vi } from "vitest";
import { modules } from "@/modules";
import { STANDARD_SETTINGS } from "@/modules/standard-settings";
import { effectiveSettings, type ModuleSetting, type ModuleSettings, type ModuleSettingValue } from "@/modules/types";
import { fixtureSensors } from "@/widgets/__fixtures__";

/*
 * Which options the inspector shows for a widget's view that change nothing it draws.
 * For every widget and view, each own setting the inspector shows (its `visibleIf` holds) is set to other
 * values, from the defaults and from every single change of another option (an event name only shows once a
 * date is set); when no value changes the rendered markup from any of those, the option is listed as dead.
 * Island options (`island*`) are left out: they change what the island shows, not the widget.
 * Run: npm run audit:views  →  .cache/view-options.md
 * Limits: it renders the server markup with the fixture data, so an option that only matters for data the
 * fixture lacks (a battery, a second disk), over time (animation, ticks), on a canvas (visualizers, weather
 * effects) or once a lazy asset loads (Meteocons) shows up too: read the list, don't trust it blind.
 */

const STANDARD = new Set(STANDARD_SETTINGS.map((d) => d.key));
const UNCHECKED_TYPES = new Set<ModuleSetting["type"]>(["icon", "image", "thresholds", "status", "align"]);
const sensors = fixtureSensors();
const aSensor = Object.keys(sensors).find((k) => typeof sensors[k] === "number") ?? "";

/** Values other than the current one worth trying for a setting. */
function alternatives(def: ModuleSetting, current: ModuleSettingValue): ModuleSettingValue[] {
  switch (def.type) {
    case "boolean":
      return [!current];
    case "select":
    case "preset": {
      const values = (def.options ?? []).map((o) => o.value);
      if (def.multiple) return [values[0] ?? "", values.slice(-1)[0] ?? "", ""].filter((v) => v !== current);
      return values.filter((v) => v !== current);
    }
    case "number": {
      const n = Number(current) || 0;
      return [def.min, def.max, n + (def.step ?? 1) * 3, n / 2].filter((v): v is number => v !== undefined && v !== n);
    }
    case "text":
      return ["Audit text"];
    case "date":
      return ["2030-12-31"];
    case "time":
      return ["13:24"];
    case "color":
      return ["#ff0044"];
    case "sensor":
      return [aSensor];
    default:
      return [];
  }
}

const html = (render: (s: typeof sensors, v: ModuleSettings) => unknown, values: ModuleSettings): string => {
  try {
    return renderToString(render(sensors, values) as never);
  } catch (e) {
    return `THROWS ${(e as Error).message}`;
  }
};

const shown = (def: ModuleSetting, values: ModuleSettings) => def.visibleIf?.(values) ?? true;

interface Finding {
  widget: string;
  view: string;
  /** The options shown in this view that change its markup, and those that change nothing. */
  live: string[];
  dead: string[];
  unstable: boolean;
}
const findings: Finding[] = [];

it("audits every widget view's options", () => {
  vi.useFakeTimers({ now: new Date("2026-06-15T12:00:00"), toFake: ["Date"] });
  for (const m of modules) {
    const key = m.viewKey ?? "view";
    const views = m.views?.length ? m.views : [{ id: "", name: "(one view)" }];
    const own = (m.settings ?? []).filter((d) => !STANDARD.has(d.key) && d.key !== key && !d.key.startsWith("island"));
    for (const v of views) {
      const base = effectiveSettings(m, v.id ? { [key]: v.id, ...("applies" in v ? v.applies : {}) } : {});
      const ref = html(m.render, base);
      const finding: Finding = { widget: m.id, view: v.name, live: [], dead: [], unstable: ref !== html(m.render, base) };
      for (const def of own) {
        // A row hidden by default may show once another option is on (an effect's knobs under its switch):
        // check it from the first single change of another option that reveals it.
        let from = shown(def, base) ? base : undefined;
        for (const other of own) {
          if (from) break;
          if (!shown(other, base)) continue;
          for (const alt of other === def ? [] : alternatives(other, base[other.key])) {
            const next = { ...base, [other.key]: alt };
            if (shown(def, next)) {
              from = next;
              break;
            }
          }
        }
        if (!from) continue;
        if (UNCHECKED_TYPES.has(def.type) || alternatives(def, from[def.key]).length === 0) continue;
        const label = `${def.label} (\`${def.key}\`)`;
        // Live when some value changes the markup from the defaults or from one change of another option.
        const changes = (at: ModuleSettings) => {
          if (!shown(def, at)) return false;
          const before = html(m.render, at);
          return alternatives(def, at[def.key]).some((alt) => html(m.render, { ...at, [def.key]: alt }) !== before);
        };
        const neighbours = own.filter((o) => o !== def).flatMap((o) => alternatives(o, from[o.key]).map((alt) => ({ ...from, [o.key]: alt })));
        (changes(from) || neighbours.some(changes) ? finding.live : finding.dead).push(label);
      }
      findings.push(finding);
    }
  }
  vi.useRealTimers();
  // About 30 s: tens of thousands of renders.
}, 120_000);

afterAll(() => {
  // An option dead in one view but live in another of the same widget wants a view gate (`viewOnly`); one dead
  // in every view it shows in is more likely data, a canvas or a lazy asset the audit cannot see.
  const gate: string[] = [];
  const everywhere: string[] = [];
  for (const id of new Set(findings.map((f) => f.widget))) {
    const views = findings.filter((f) => f.widget === id);
    const live = new Set(views.flatMap((f) => f.live));
    for (const f of views) {
      const misplaced = f.dead.filter((o) => live.has(o));
      if (misplaced.length) gate.push(`| ${id} | ${f.view} | ${misplaced.join(", ")} |`);
    }
    const dead = [...new Set(views.flatMap((f) => f.dead))].filter((o) => !live.has(o));
    if (dead.length) everywhere.push(`| ${id} | ${dead.join(", ")} |`);
  }
  const unstable = findings.filter((f) => f.unstable).map((f) => `${f.widget} · ${f.view}`);
  const lines = [
    "# Options that change nothing in a view",
    "",
    `Generated by \`npm run audit:views\` from ${findings.length} widget views, rendered with the fixture data.`,
    "",
    `## Works in another view, does nothing here (${gate.length}): gate it to its views`,
    "",
    "| Widget | View | Options |",
    "| --- | --- | --- |",
    ...gate,
    "",
    `## Does nothing in any view (${everywhere.length}): check by hand (data, canvas, time, lazy assets)`,
    "",
    "| Widget | Options |",
    "| --- | --- |",
    ...everywhere,
    "",
    ...(unstable.length ? [`Renders differ run to run (results there are unreliable): ${unstable.join(", ")}`, ""] : []),
  ];
  mkdirSync(".cache", { recursive: true });
  writeFileSync(".cache/view-options.md", lines.join("\n"));
  console.info(`view-options audit: ${gate.length} views show options of other views, ${everywhere.length} widgets have options dead everywhere → .cache/view-options.md`);
});
