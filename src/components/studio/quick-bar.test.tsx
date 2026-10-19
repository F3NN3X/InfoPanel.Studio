import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Placement } from "@/lib/layout";
import { zoneDefs } from "./inspector/zone-fields";
import { QuickBar } from "./quick-bar";
import { defaultQuickKeys } from "./quick-sets";

const zone = (id: string, module: string, visible = true): Placement =>
  ({ id, module, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible }) as Placement;

const appearance = { base: { accent: "#ff0000" } };
const noop = () => {};

const render = (zones: Placement[], allSettings?: { open: boolean; onToggle: () => void }) =>
  renderToString(
    <QuickBar zones={zones} appearance={appearance} updateProfile={noop} onToggleVisible={noop} allSettings={allSettings} />
  );

describe("QuickBar", () => {
  it("names the zone and shows its default quick set as controls", () => {
    const z = zone("a", "NowPlaying");
    const out = render([z]);
    expect(out).toContain('aria-label="Quick settings"');
    expect(out).toContain("Now Playing");
    const labels = defaultQuickKeys(zoneDefs(z)).map((k) => zoneDefs(z).find((d) => d.key === k)!.label);
    for (const label of labels) expect(out).toContain(label);
    expect(out).toContain('aria-label="Hide"');
    // Docked: the inspector is already there, no "All settings".
    expect(out).not.toContain("All settings");
  });

  it("shows a pinned row of a following section as the theme's value, a way to its section (SPEC §5)", () => {
    const following = render([zone("a", "NowPlaying")]);
    expect(following).toContain('aria-label="Accent color: follows the theme"');
    expect(following).not.toContain('aria-label="Accent color colour"');
    const custom = render([{ ...zone("a", "NowPlaying"), follow: { colors: false } }]);
    expect(custom).toContain('aria-label="Accent color colour"');
    expect(custom).not.toContain("follows the theme");
  });

  it("says how many widgets a multi-selection has, and Show when all are hidden", () => {
    const out = render([zone("a", "Clock", false), zone("b", "NowPlaying", false)], { open: false, onToggle: noop });
    expect(out).toContain("2 widgets");
    expect(out).toContain('aria-label="Show"');
    expect(out).toContain("All settings");
  });

  it("with nothing selected names the dashboard and only offers All settings", () => {
    const out = render([], { open: true, onToggle: noop });
    expect(out).toContain("Dashboard");
    expect(out).toContain('aria-pressed="true"');
    expect(out).not.toContain('aria-label="Hide"');
    expect(out).not.toContain("Pin settings");
  });
});
