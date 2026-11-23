import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CLASSIC, CLASSIC_LOOK, isLookId, LOOK_IDS, loadLook, SAMPLE_LOOK_IDS, SKIN_LOOK_IDS } from "@/looks";
import { resolveT1, T1_NAMES, type Look } from "@/looks/look";
import { MATERIALS } from "@/looks/materials";
import { DEFAULT_ACCENT, DARK_TEXT } from "@/looks/palette";
import { SAMPLE_MATERIALS } from "@/looks/sample-materials";
import { SAMPLE_THEMES } from "@/looks/sample-themes";
import { STATUS } from "@/looks/status";
import { CLASSIC_T3 } from "@/looks/t3";
import { SKIN_PACKS } from "@/widgets/core/theme";
import { DEFAULT_RADIUS } from "@/lib/theme";
import { CLASSIC_LOOK_ID } from "@/lib/theme-model";
import studio from "@/looks/studio/look.json";
import schema from "@/looks/look.schema.json";
import { schemaErrors } from "@/looks/schema-check";
import UI_TOKENS_P4 from "./__fixtures__/ui-tokens-p4.json";

// The Look files (D5), the registry and the Studio Look (D1). The schema is checked by the small validator in
// src/looks/schema-check.ts, which knows the keywords look.schema.json uses, so the repo needs no JSON Schema dependency.

type Schema = Record<string, unknown>;
const errors = (value: unknown, s: Schema): string[] => schemaErrors(value, s, schema as Schema);

const read = (rel: string): Look => JSON.parse(readFileSync(new URL(`../../src/looks/${rel}`, import.meta.url), "utf8")) as Look;

describe("look.schema.json", () => {
  it.each(["classic/look.json", "studio/look.json"])("%s is valid", (rel) => {
    expect(errors(read(rel), schema as Schema)).toEqual([]);
  });

  it("every sample Look is valid", async () => {
    for (const id of SAMPLE_LOOK_IDS) expect(errors(await loadLook(id), schema as Schema), id).toEqual([]);
  });

  it("every skin Look is valid", async () => {
    for (const id of SKIN_LOOK_IDS) expect(errors(await loadLook(id), schema as Schema), id).toEqual([]);
  });

  it("refuses a studio block on a panel Look, a missing T1 name and an unknown key", () => {
    expect(errors({ ...CLASSIC, studio: {} }, schema as Schema)).toContain("$: matches a schema it must not");
    const { info: _info, ...t1 } = CLASSIC.t1.dark!;
    expect(errors({ ...CLASSIC, t1: { dark: t1 } }, schema as Schema)).toContain("$.t1.dark: info is required");
    expect(errors({ ...CLASSIC, palette: {} }, schema as Schema)).toContain("$: palette is not allowed");
  });
});

describe("the registry", () => {
  it("lists Classic first, every skin but Default and every sample theme as a Look, Studio not among them", () => {
    expect(LOOK_IDS[0]).toBe(CLASSIC_LOOK);
    expect(CLASSIC_LOOK).toBe(CLASSIC_LOOK_ID);
    expect(SKIN_LOOK_IDS).toEqual(SKIN_PACKS.map((p) => p.name).filter((name) => name !== "default"));
    expect(SAMPLE_LOOK_IDS).toEqual(SAMPLE_THEMES.map((t) => t.id));
    expect(new Set(LOOK_IDS).size).toBe(LOOK_IDS.length);
    expect(LOOK_IDS).not.toContain("studio");
    expect(isLookId("field-kit")).toBe(true);
    expect(isLookId("studio")).toBe(false);
    expect(isLookId(undefined)).toBe(false);
  });

  it("loads Classic as is, a skin or sample Look from its chunk, nothing for an unknown id", async () => {
    expect(await loadLook("classic")).toBe(CLASSIC);
    expect((await loadLook("term"))?.t2?.default).toBe("look-term");
    expect((await loadLook("hud"))?.t2?.default).toBe("hud");
    expect(await loadLook("default")).toBe(CLASSIC);
    expect(await loadLook("nope")).toBeUndefined();
  });

  it("a skin Look carries its skin's card, accent, fonts and corners, the rest Classic's", async () => {
    for (const pack of SKIN_PACKS.filter((p) => p.name !== "default")) {
      const look = (await loadLook(pack.name))!;
      const t1 = resolveT1(look);
      const s = pack.skin;
      expect(look.ext?.skin, pack.name).toBe(pack.name);
      expect(t1.accent).toBe(s.accent ?? DEFAULT_ACCENT);
      expect([look.fonts.body, look.fonts.mono]).toEqual([s.font ?? CLASSIC.fonts.body, s.num ?? CLASSIC.fonts.mono]);
      expect(look.radius).toBe(s.radius !== undefined ? `${s.radius}px` : CLASSIC.radius);
      expect(look.t2?.default).toBe(s.surface ?? CLASSIC.t2?.default);
      if (s.surface) expect(look.t2?.materials?.[s.surface]).toMatchObject({ kind: MATERIALS[s.surface].kind, tone: MATERIALS[s.surface].tone });
      expect(look.t3).toEqual(CLASSIC_T3);
    }
  });

  it("a sample Look carries its theme's card, accent, text, font and corners", async () => {
    for (const t of SAMPLE_THEMES) {
      const look = (await loadLook(t.id))!;
      const t1 = resolveT1(look);
      const card = SAMPLE_MATERIALS[`look-${t.id}`];
      expect(look.t2?.materials?.[card.id]).toMatchObject({ kind: card.kind, tone: card.tone });
      expect(look.modes.supported).toEqual([card.tone === "light" ? "light" : "dark"]);
      expect([t1.accent, t1.fg, t1.muted, t1.surface]).toEqual([t.accent, t.text ?? t.colours.fg, t.muted ?? t.colours.sub, t.colours.card]);
      expect([look.fonts.body, look.radius]).toEqual([t.font, `${t.radius}rem`]);
    }
  });
});

describe("Classic pins today's values (D12)", () => {
  const t1 = resolveT1(CLASSIC);

  it("resolves every T1 name, with the code's accent and status colours", () => {
    expect(Object.keys(t1)).toEqual([...T1_NAMES]);
    expect([t1.accent, t1.ok, t1.warn, t1.crit, t1.info]).toEqual([DEFAULT_ACCENT, STATUS.ok, STATUS.warn, STATUS.crit, DEFAULT_ACCENT]);
    expect(CLASSIC.radius).toBe(`${DEFAULT_RADIUS}rem`);
  });

  it("its T3 is the contract's Classic set", () => {
    expect(CLASSIC.t3).toEqual(CLASSIC_T3);
  });

  it("its default material is glass and each material it names is the registry's kind and tone", () => {
    expect(CLASSIC.t2?.default).toBe("glass");
    for (const [id, mat] of Object.entries(CLASSIC.t2?.materials ?? {})) {
      expect([mat.kind, mat.tone], id).toEqual([MATERIALS[id].kind, MATERIALS[id].tone]);
      if (mat.export !== undefined) expect(mat.export, id).toBe(MATERIALS[id].export);
    }
    expect(CLASSIC.t2?.tones?.dark).toMatchObject({ fg: DARK_TEXT.fg, muted: DARK_TEXT.muted });
  });

  it("an alias cycle or an unknown alias throws", () => {
    const dark = { ...CLASSIC.t1.dark!, bg: { value: "{surface}" } };
    expect(() => resolveT1({ t1: { dark } })).toThrow(/cycle/);
    expect(() => resolveT1({ t1: { dark: { ...CLASSIC.t1.dark!, bg: { value: "{nope}" } } } })).toThrow(/unknown/);
  });
});

describe("the Studio Look (D1)", () => {
  /** Every `--ui-*` declaration the app's CSS holds now. */
  const uiNow = (): Record<string, string> => {
    const out: Record<string, string> = {};
    for (const file of ["../../src/index.css", "../../src/components/ui/tokens.css", "../../src/settings/ui/studio.css"]) {
      for (const m of readFileSync(new URL(file, import.meta.url), "utf8").matchAll(/^\s*--ui-([\w-]+):\s*([^;]+);/gm)) out[m[1]] = m[2].trim();
    }
    return out;
  };

  it("the ui-* tokens generated from it equal today's values (P4), none lost or added", () => {
    expect(uiNow()).toEqual(UI_TOKENS_P4);
  });

  it("is the only Look with a studio block, and its T1 is the shared chrome's", () => {
    const t1 = resolveT1(studio as Look);
    expect(CLASSIC.studio).toBeUndefined();
    expect([t1.bg, t1.fg, t1.accent]).toEqual([UI_TOKENS_P4["bg-app"], UI_TOKENS_P4["text-1"], UI_TOKENS_P4.accent]);
  });
});
