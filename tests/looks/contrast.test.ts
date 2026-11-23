// The D13 contrast test: every Look, in every mode it supports, on every card it draws, keeps fg, muted, ok, warn, crit and
// the axis label at 4.5:1 on the card (the pairs a widget draws as text or a thin line). A failure fails the test unless it
// is listed in KNOWN_GAPS with the ledger row (_docs/look-system/progress.md) that owns it.
import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { loadLook, LOOK_IDS } from "@/looks";
import { resolveT1, type Look, type LookMode } from "@/looks/look";
import { registerSampleCards, SAMPLE_MATERIALS } from "@/looks/sample-materials";
import { SAMPLE_THEMES, sampleStyle } from "@/looks/sample-themes";
import { accentInk, contrastOf, LIGHT_FILL, STATUS_MODE } from "@/looks/status";
import { DEFAULT_ACCENT } from "@/looks/palette";
import { RAMP_START } from "@/looks/data-viz";
import { STANDARD_DEFAULTS } from "@/modules/standard-settings";
import { TEXT_VARS } from "@/widgets/core/theme";
import { Widget } from "@/widgets/core/Widget";

/** Failures a Look knows and a ledger row owns: `<look>/<mode>/<card>/<pair>`. None today: P10 darkened Field Kit and Tape '86's accents to hold 4.5:1 on their cream (L51). */
const KNOWN_GAPS: Record<string, string> = {};

const MIN = 4.5;
type Pair = "fg" | "muted" | "ok" | "warn" | "crit" | "axis-label";

/** The cards a Look draws in a mode, with the flat colour text sits on. */
function cards(look: Look, mode: LookMode): Record<string, string> {
  if (look.id === "classic") return mode === "light" ? { "matte-light": LIGHT_FILL } : { glass: RAMP_START, "matte-dark": "#18181b" };
  const theme = SAMPLE_THEMES.find((t) => t.id === look.id);
  const card = theme && SAMPLE_MATERIALS[`look-${theme.id}`];
  // A skin's own card has no flat hex here (gradients, patterns): its text is the shell's tone colours, checked on the tone's default fill.
  return card?.export?.startsWith("#") ? { [card.id]: card.export } : { card: mode === "light" ? LIGHT_FILL : RAMP_START };
}

/** The text colours a widget on this Look's card draws, as the shell sets them (`textVars`, the Look's layer over it). */
function colours(look: Look, mode: LookMode, fill: string): Record<Pair, string> {
  const vars = TEXT_VARS[mode];
  const theme = SAMPLE_THEMES.find((t) => t.id === look.id);
  const style = theme ? sampleStyle(theme) : {};
  const t1 = resolveT1(look, mode);
  const accent = String(style.accent ?? (look.id === "classic" ? DEFAULT_ACCENT : t1.accent));
  const status = STATUS_MODE[mode];
  return {
    fg: String(style.textColor ?? vars["--w-fg"]),
    muted: String(style.mutedColor ?? vars["--w-muted"]),
    // Only Classic's default accent darkens on a light card (`accentInk`); an accent a Look sets is its own.
    ok: look.id === "classic" && mode === "light" ? accentInk(accent, fill) : accent,
    warn: String(style.warn ?? vars["--w-warn"] ?? status.warn),
    crit: String(style.crit ?? vars["--w-crit"] ?? status.crit),
    "axis-label": vars["--w-faint"],
  };
}

describe("Look contrast (D13)", () => {
  it("every Look, mode and card holds its text pairs at 4.5:1, bar the known gaps", async () => {
    const failures: string[] = [];
    let checked = 0;
    for (const id of LOOK_IDS) {
      const look = await loadLook(id);
      if (!look) continue;
      for (const mode of look.modes.supported) {
        for (const [card, fill] of Object.entries(cards(look, mode))) {
          for (const [pair, colour] of Object.entries(colours(look, mode, fill))) {
            const ratio = contrastOf(colour, fill);
            if (ratio === undefined) continue;
            checked++;
            const key = `${id}/${mode}/${card}/${pair}`;
            if (ratio < MIN && !(key in KNOWN_GAPS)) failures.push(`${key} ${ratio.toFixed(2)}`);
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(150);
    expect(failures).toEqual([]);
  });

  it("darkens an accent that fails on a light card, and keeps one that holds", () => {
    expect(contrastOf(accentInk(DEFAULT_ACCENT), LIGHT_FILL)).toBeGreaterThanOrEqual(MIN);
    expect(accentInk("#5B3FD4")).toBe("#5B3FD4");
    expect(accentInk("var(--x)")).toBe("var(--x)");
  });
});

// P10 (L59): the pack Looks again, this time from what the shell renders (`--w-*` on a card of the pack's own surface), on
// the pack's card colour, so a change to the shell's colour logic or to a pack's text colours shows here and not only in the table above.
describe("pack Looks, from the rendered card (L59)", () => {
  const PACKS = ["field-kit", "tape-86", "term", "neon-stripe", "overdrive", "swiss-mono", "holo", "night-glow", "paper", "classy-black", "liquid-glass", "black-and-gold", "cyberspec"];
  const vars = (id: string): Record<string, string> => {
    registerSampleCards();
    const theme = SAMPLE_THEMES.find((t) => t.id === id)!;
    // biome-ignore lint/correctness/noChildrenProp: the Widget takes a render function as children.
    const html = renderToString(h(Widget, { title: "T", icon: "memory", size: "lg", children: () => h("i"), look: { ...STANDARD_DEFAULTS, ...sampleStyle(theme), lookId: id } }));
    return Object.fromEntries([...html.matchAll(/(--w-[\w-]+):([^;"]+)/g)].map((m) => [m[1], m[2].trim()]));
  };

  it.each(PACKS)("%s: text, muted, status and the accent as ok text hold 4.5:1 on the pack's card", async (id) => {
    const look = (await loadLook(id))!;
    const mode = look.modes.supported[0];
    const fill = Object.values(cards(look, mode))[0];
    const rendered = vars(id);
    const failures: string[] = [];
    for (const name of ["--w-fg", "--w-muted", "--w-ok", "--w-warn", "--w-crit", "--w-accent"]) {
      // A dark card leaves status to the shell's literals (only a light card writes `--w-ok` and the rest, M1).
      const ratio = contrastOf(rendered[name] ?? STATUS_MODE[mode][name.slice(4) as "ok" | "warn" | "crit"] ?? "", fill);
      if (ratio === undefined) failures.push(`${name} is ${rendered[name]}, not a colour to check`);
      else if (ratio < MIN) failures.push(`${name} ${ratio.toFixed(2)}`);
    }
    expect(failures).toEqual([]);
  });

  it("Field Kit's yellow stays off text: it is 1.37:1 on the cream, so only chips and strips carry it", () => {
    expect(contrastOf("#F2C230", "#EFE8D8")).toBeLessThan(1.5);
    for (const name of ["--w-fg", "--w-muted", "--w-ok", "--w-warn", "--w-crit", "--w-accent"]) expect(vars("field-kit")[name]?.toLowerCase()).not.toBe("#f2c230");
  });
});
