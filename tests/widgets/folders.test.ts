import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import { fixtureSensors } from "@/widgets/__fixtures__";
import { withDemo } from "@/widgets/widget-qa/demo-settings";
import { WIDGET_ORDER } from "@/widgets/order";
import { FOLDER_WIDGETS } from "@/widgets/registry.generated";
import { INSPECTOR_META } from "@/widgets/registry/inspector-meta";
import { kebab, README_SECTIONS, readmeSections, widgetFolders } from "../../tools/widgets/generate.mjs";

// Every widget folder (src/widgets/<kebab-id>/, one with a widget.ts) is complete, keeps the kiosk's laziness, and sits
// beside the registry groups without a second copy of its id.
const DIR = "src/widgets";
const read = (rel: string) => readFileSync(rel, "utf8").replace(/\r\n/g, "\n");
/** The `from "<spec>"` of each import line that brings in values (not `import type`). */
const valueImports = (text: string) => [...text.matchAll(/^import (?!type\b)[^;]*?from "([^"]+)";/gm)].map((m) => m[1]);
/** The source file a relative or `@/` import names (`.ts` or `.tsx`), if the repo has one. */
const sourceOf = (dir: string, spec: string) => {
  const base = spec.startsWith("@/") ? join("src", spec.slice(2)) : join(dir, spec);
  return [`${base}.ts`, `${base}.tsx`].find((f) => existsSync(f));
};
const folders = widgetFolders();

describe("the widget folders", () => {
  it("are the generated registry's widgets", () => {
    expect(folders.length).toBeGreaterThan(0);
    expect(FOLDER_WIDGETS.map((w) => kebab(w.meta.id)).sort()).toEqual(folders);
  });

  describe.each(FOLDER_WIDGETS.map((w) => [w.meta.id, w] as const))("%s", (id, w) => {
    const folder = `${DIR}/${kebab(id)}`;

    it("has meta, inspector, settings, render, migrations, a sample or an explicit none, and a README", () => {
      expect(w.meta.id).toBe(id);
      expect(w.inspector.header).toBeDefined();
      expect(w.inspector.compact).toBeDefined();
      expect(Array.isArray(w.settings)).toBe(true);
      expect(typeof w.render.load).toBe("function");
      expect(typeof w.render.toProps).toBe("function");
      // Absent = "central", the built-ins' default (define.ts).
      const migrations = w.migrations ?? "central";
      expect(migrations === "central" || (typeof migrations === "object" && Array.isArray(migrations.steps)), "migrations").toBe(true);
      const sample = w.sample ?? "central";
      expect(sample === "central" || typeof sample === "function" || (typeof sample === "object" && typeof sample.none === "string" && sample.none !== ""), "sample").toBe(true);
      const sections = readmeSections(read(`${folder}/README.md`));
      for (const title of README_SECTIONS) expect(sections[title], `README.md: ${title}`).toBeTruthy();
    });

    it("draws from its sample: a central one is the shared fixture sensors and demo settings (Widget QA's data)", () => {
      if ((w.sample ?? "central") !== "central") return;
      const mod = modules.find((m) => m.id === id)!;
      const html = renderToStaticMarkup(mod.render(fixtureSensors(), withDemo(id, {}, false)) as never);
      expect(html, "draws its own markup from the central sample").toMatch(/data-wp-/);
    });

    it("keeps its component out of the kiosk entry: meta.ts imports types only (or values from a module that does), widget.ts the component as a type only", () => {
      for (const spec of valueImports(read(`${folder}/meta.ts`))) {
        const file = sourceOf(folder, spec);
        expect(file, `meta.ts: ${spec} is a module of this repo`).toBeDefined();
        expect(valueImports(read(file!)), `meta.ts: ${spec} imports types only`).toEqual([]);
      }
      const component = `./${id}`;
      const widget = read(`${folder}/widget.ts`);
      expect(valueImports(widget)).not.toContain(component);
      for (const file of ["./controls", "./presets", "./README.md"]) expect(widget, file).not.toContain(`"${file}`);
    });

    it("has no INSPECTOR_META entry beside its own inspector", () => {
      expect(INSPECTOR_META[id]).toBeUndefined();
    });
  });
});

describe("the registry, groups and folders side by side", () => {
  it("lists every widget once, in order.ts's order", () => {
    expect(WIDGET_ORDER).toHaveLength(66);
    expect(modules.map((m) => m.id)).toEqual(WIDGET_ORDER);
  });

  it("carries each folder widget's inspector as INSPECTOR_META does for the group widgets", () => {
    for (const w of FOLDER_WIDGETS) {
      const mod = modules.find((m) => m.id === w.meta.id)!;
      expect({ header: mod.header, compact: mod.compact, fmt: mod.fmt, thr: mod.thr }).toEqual({ header: w.inspector.header, compact: w.inspector.compact, fmt: w.inspector.fmt, thr: w.inspector.thr });
    }
  });
});
