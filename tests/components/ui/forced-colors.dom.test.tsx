// @vitest-environment happy-dom
// In Windows contrast themes (forced colors) backgrounds are dropped: the switches, selected segments and the active
// Settings page must carry their own system-colour classes, or on/off and the selected item cannot be told apart.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import { NavItem } from "@/settings/nav";
import { Segmented as SettingsSegmented, Switch } from "@/settings/ui";

const noop = () => {};

describe("forced colors", () => {
  it.each([
    ["studio Toggle", (on: boolean) => <Toggle checked={on} onChange={noop} label="t" />],
    ["settings Switch", (on: boolean) => <Switch checked={on} onChange={noop} label="t" />],
  ])("%s has a border and an on state of its own", (_name, make) => {
    const { unmount } = render(make(true));
    const on = screen.getByRole("switch");
    expect(on.className).toContain("forced-colors:border-[color:Highlight]");
    expect(on.className).toContain("forced-colors:bg-[color:Highlight]");
    expect(on.firstElementChild?.className).toContain("forced-colors:bg-[color:HighlightText]");
    unmount();
    render(make(false));
    const off = screen.getByRole("switch");
    expect(off.className).toContain("forced-colors:border-[color:ButtonText]");
    expect(off.className).not.toContain("forced-colors:bg-[color:Highlight]");
    expect(off.firstElementChild?.className).toContain("forced-colors:bg-[color:ButtonText]");
  });

  it("marks only the selected segment, in both Segmented controls", () => {
    const options = [
      { value: "a", label: "A" },
      { value: "b", label: "B" },
    ];
    render(
      <>
        <Segmented label="studio" value="a" onChange={noop} options={options} />
        <SettingsSegmented label="settings" value="a" onChange={noop} options={options} />
      </>
    );
    const radios = screen.getAllByRole("radio");
    expect(radios.map((r) => r.className.includes("forced-colors:bg-[color:Highlight]"))).toEqual([true, false, true, false]);
  });

  it("marks the active Settings page", () => {
    render(
      <>
        <NavItem id="general" on onClick={noop} />
        <NavItem id="server" on={false} onClick={noop} />
      </>
    );
    const [active, other] = screen.getAllByRole("button");
    expect(active.className).toContain("forced-colors:text-[color:HighlightText]");
    expect(other.className).not.toContain("forced-colors:bg-[color:Highlight]");
  });
});
