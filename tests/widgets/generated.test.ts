import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generate } from "../../tools/widgets/generate.mjs";

// The files tools/widgets/generate.mjs writes from the widget folders: a folder added, removed or changed (its meta.ts or
// README.md) without `npm run widgets:gen` fails here, and so does a hand edit of a generated file or block.
const generated = await generate();

describe("the generated widget files", () => {
  it.each([...generated.keys()])("%s is in sync with the widget folders", (file) => {
    const current = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
    expect(current).toBe(generated.get(file));
  });
});

describe("a README's Presets section", () => {
  it("names every preset of its folder's presets.ts, with its view and size", async () => {
    const { widgetFolders } = await import("../../tools/widgets/generate.mjs");
    let checked = 0;
    for (const folder of widgetFolders()) {
      const file = `src/widgets/${folder}/presets.ts`;
      let list: { name: string; view?: string; size: number[] | "rail"; default?: boolean }[];
      try {
        list = (await import(/* @vite-ignore */ `../../${file}`)).default;
      } catch {
        continue;
      }
      const readme = generated.get(`src/widgets/${folder}/README.md`)!;
      for (const p of list) {
        expect(readme, `${folder}: ${p.name}`).toContain(`**${p.name}**${p.default ? " (default)" : ""}`);
        expect(readme, `${folder}: ${p.name} size`).toContain(p.size === "rail" ? "| a rail slot |" : `${p.size[0]}×${p.size[1]}`);
      }
      checked++;
    }
    expect(checked).toBe(23);
  });
});
