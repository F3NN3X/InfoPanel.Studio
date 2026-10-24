import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { SHORTCUT_GROUPS } from "@/components/studio/use-studio-shortcuts";
import { layoutStarters } from "@/lib/panel-starters";
import { SKIN_PACKS } from "@/widgets/core/theme";
import { GENERATED_KEYS, GENERATORS, generate } from "@/help/generated";
import type { Block } from "@/help/types";

const only = (key: string) => {
  const [block] = generate(key);
  if (block?.type !== "table") throw new Error(`${key} is not a table`);
  return block;
};

describe("the generated blocks", () => {
  it("has the keys the article contract names", () => {
    expect([...GENERATED_KEYS].sort()).toEqual(["defaults.table", "panel-widgets.table", "presets.appearance", "presets.layouts", "presets.panels", "profiles.table", "shortcuts.keys", "widgets.table"]);
  });

  it("gives every key some content, in cells the article renderer can show", () => {
    for (const key of GENERATED_KEYS) {
      const blocks: Block[] = GENERATORS[key]();
      expect(blocks.length, key).toBeGreaterThan(0);
      for (const b of blocks) {
        if (b.type === "table") {
          expect(b.rows.length, key).toBeGreaterThan(0);
          for (const row of b.rows) expect(row, key).toHaveLength(b.head.length);
        }
      }
    }
  });

  it("lists every placeable widget with its minimum size", () => {
    const t = only("widgets.table");
    expect(t.head).toEqual(["Widget", "Minimum size", "Shows"]);
    expect(t.rows.map((r) => r[0])).toContain("**Other sensors**");
    expect(t.rows.find((r) => r[0] === "**Other sensors**")?.[1]).toBe("4×2");
  });

  it("lists the panel widget kinds in menu order", () => {
    expect(only("panel-widgets.table").rows.map((r) => r[0])).toEqual(["**Stat**", "**Value**", "**Bar**", "**Gauge**", "**Custom gauge**", "**Sparkline**", "**Table**", "**Text**", "**Image**", "**Clock**", "**Shape**"]);
  });

  it("lists the layout starters and skins from their registries", () => {
    expect(only("presets.layouts").rows).toHaveLength(layoutStarters.length);
    expect(only("presets.layouts").rows[0]).toEqual(["**Row of stats**", "4×1", layoutStarters[0].description]);
    expect(only("presets.appearance").rows).toHaveLength(SKIN_PACKS.length);
  });

  it("lists the profiles a fresh install has", () => {
    expect(only("profiles.table").rows[0]).toEqual(["**Main display**", "1920×1080", "12×6", "Scroll"]);
  });

  it("lists every cheat-sheet shortcut under its group", () => {
    const blocks = generate("shortcuts.keys");
    const rows = blocks.flatMap((b) => (b.type === "keys" ? b.rows : []));
    expect(rows).toHaveLength(SHORTCUT_GROUPS.flatMap((g) => g.items).length);
    expect(blocks[0]).toEqual({ type: "p", text: `**${SHORTCUT_GROUPS[0].title}**` });
  });

  it("gives an unknown key no blocks", () => {
    expect(generate("nope")).toEqual([]);
  });
});

describe("the defaults table", () => {
  it("shows the ports and the kiosk URL a fresh install uses", () => {
    expect(only("defaults.table").rows).toEqual([
      ["Server port", "`3922`"],
      ["Kiosk URL", "`http://127.0.0.1:3922/?kiosk=1`"],
      ["Data API port", "`3921`"],
    ]);
  });

  it("agrees with the server and the app on the default port", () => {
    expect(fs.readFileSync("src-tauri/crates/ips-server/src/env.rs", "utf8")).toMatch(/return Ok\(3922\)/);
    expect(fs.readFileSync("src-tauri/src/settings.rs", "utf8")).toMatch(/DEFAULT_PORT: u16 = 3922;/);
  });
});
