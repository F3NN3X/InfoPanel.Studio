// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import type { Placement, ProfileView } from "@/lib/layout";
import type { Appearance } from "@/lib/style-resolve";
import { FollowBar } from "./follow-bar";
import { MultiInspector } from "./multi-inspector";

const zone = (id: string, extra: Partial<Placement> = {}): Placement => ({
  id,
  module: "SystemOverview",
  colStart: 1,
  rowStart: 1,
  colSpan: 2,
  rowSpan: 1,
  visible: true,
  settings: { accent: "#ff0000" },
  ...extra,
});

const view = (placements: Placement[]): ProfileView =>
  ({ id: "p", name: "Desk", width: 1920, height: 1080, cols: 12, rows: 6, fit: "scroll", placements }) as ProfileView;

/** The multi-select inspector over two zones, its edits kept in state (`latest` reads them). */
function setup(appearance: Appearance, zones = [zone("a"), zone("b")]) {
  const latest: { profile: ProfileView } = { profile: view(zones) };
  function Host() {
    const [profile, setProfile] = useState(latest.profile);
    latest.profile = profile;
    return (
      <MultiInspector
        zones={profile.placements}
        appearance={appearance}
        updateProfile={(fn) => setProfile((p) => fn(p))}
        onDeselect={() => {}}
        onToggleVisible={() => {}}
        onDuplicate={() => {}}
        onRemove={() => {}}
        query=""
        onQuery={() => {}}
        changedOnly={false}
        onChangedOnly={() => {}}
      />
    );
  }
  render(<Host />);
  return latest;
}

const colorsSection = () => screen.getByRole("button", { name: /^Colors/ }).closest("section")!;
const accentRow = () => colorsSection().querySelector<HTMLFieldSetElement>('[data-setting-key="accent"]')!;

async function openColors() {
  await userEvent.click(screen.getByRole("button", { name: /^Colors/ }));
}

describe("Follow bar", () => {
  it("the theme name opens the theme it names (the page's, or the profile's)", async () => {
    const opened: string[] = [];
    const bar = { mode: "theme" as const, from: "the page theme · Gaming", level: "page" as const, onCustomize: () => {}, onUseTheme: () => {} };
    render(<FollowBar bar={bar} onTheme={(level) => opened.push(level)} />);
    await userEvent.click(screen.getByRole("button", { name: "the page theme · Gaming" }));
    expect(opened).toEqual(["page"]);
  });

  it("Customize unlocks the rows at the kept values; Use theme follows again and keeps them; Customize brings them back", async () => {
    const latest = setup({ profileName: "Desk", base: { accent: "#00ff00" } });
    await openColors();
    const section = within(colorsSection());
    expect(section.getByText("Follows the profile theme · Desk")).toBeTruthy();
    expect(accentRow().disabled).toBe(true);
    // The stored accent doesn't apply: no count, no reset.
    expect(section.queryByRole("button", { name: "Reset Colors" })).toBeNull();

    await userEvent.click(section.getByRole("button", { name: "Customize" }));
    expect(latest.profile.placements.every((z) => z.follow?.colors === false)).toBe(true);
    expect(within(colorsSection()).getByText("Custom for this widget")).toBeTruthy();
    expect(accentRow().disabled).toBe(false);
    expect(within(colorsSection()).getByRole("button", { name: "Reset Colors" })).toBeTruthy();

    await userEvent.click(within(colorsSection()).getByRole("button", { name: "Use theme" }));
    expect(latest.profile.placements.every((z) => z.follow === undefined)).toBe(true);
    expect(latest.profile.placements.every((z) => z.settings?.accent === "#ff0000")).toBe(true);

    await userEvent.click(within(colorsSection()).getByRole("button", { name: "Customize" }));
    expect(within(colorsSection()).getByRole("button", { name: "Reset Colors" })).toBeTruthy();
  });

  it("the section reset clears the own values of a custom section", async () => {
    const latest = setup({ profileName: "Desk" }, [zone("a", { follow: { colors: false } }), zone("b", { follow: { colors: false } })]);
    await openColors();
    await userEvent.click(within(colorsSection()).getByRole("button", { name: "Reset Colors" }));
    expect(latest.profile.placements.every((z) => z.settings?.accent === undefined)).toBe(true);
  });

  it("a section the profile locks reads Locked, read-only, with no way to customize it", async () => {
    setup({ profileName: "Desk", profile: { locks: { colors: true } } }, [zone("a", { follow: { colors: false } })]);
    await openColors();
    const section = within(colorsSection());
    expect(section.getAllByText("Locked").length).toBeGreaterThan(0);
    expect(section.queryByRole("button", { name: "Customize" })).toBeNull();
    expect(section.queryByRole("button", { name: "Use theme" })).toBeNull();
    expect(accentRow().disabled).toBe(true);
  });
});
