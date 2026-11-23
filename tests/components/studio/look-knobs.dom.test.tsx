// @vitest-environment happy-dom
// The knob row draws Variant for a theme that has variants (L46), and a panel widget's row is Accent only.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ItemLookKnobs, LookKnobs } from "@/components/studio/look-knobs";
import { CLASSIC } from "@/looks";
import type { Look } from "@/looks/look";

const loadLook = vi.fn<(id: string) => Promise<Look | undefined>>();
vi.mock("@/looks", async (actual) => ({ ...(await actual<object>()), loadLook: (id: string) => loadLook(id) }));

const NIGHT: Look = {
  ...CLASSIC,
  id: "night-test",
  variants: [
    { id: "night", name: "Night", values: { accent: "#5fa7ff", surface: "matte-dark" } },
    { id: "dusk", name: "Dusk", values: { accent: "#da950b" } },
  ],
};

describe("the Variant knob", () => {
  it("draws for a theme with variants; a pick writes its values and replaces the other's keys, the theme's own clears them", async () => {
    loadLook.mockResolvedValue(NIGHT);
    const onSet = vi.fn();
    const onClear = vi.fn();
    render(<LookKnobs values={{ own: { accent: "#5fa7ff", surface: "matte-dark" }, inherited: { lookId: "night-test" } }} from="Desk" onSet={onSet} onClear={onClear} />);
    const group = await screen.findByRole("radiogroup", { name: "Variant" });
    expect(screen.getByRole("radio", { name: "Night" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Dusk" }));
    expect(onClear).toHaveBeenLastCalledWith(["surface"]);
    expect(onSet).toHaveBeenLastCalledWith({ accent: "#da950b" });
    fireEvent.click(screen.getByRole("radio", { name: "Theme's own" }));
    expect(onClear).toHaveBeenLastCalledWith(["accent", "surface"]);
    expect(group).toBeTruthy();
  });

  it("is not drawn for a theme without variants", async () => {
    loadLook.mockResolvedValue({ ...CLASSIC, modes: { supported: ["dark", "light"] } });
    render(<LookKnobs values={{ own: {}, inherited: { lookId: "classic" } }} from="Desk" onSet={() => {}} onClear={() => {}} />);
    // Mode draws once the theme has loaded: by then Variant would too.
    await screen.findByRole("radiogroup", { name: "Mode" });
    expect(screen.queryByRole("radiogroup", { name: "Variant" })).toBeNull();
  });
});

describe("a panel widget's knob row", () => {
  it("is Accent only, read-only while the screen locks Colors", async () => {
    loadLook.mockResolvedValue(NIGHT);
    const onSet = vi.fn();
    const { rerender } = render(
      <ItemLookKnobs values={{ own: {}, inherited: { accent: "#00ff00", lookId: "night-test" } }} panelName="Rig" appearance={{}} onSet={onSet} onClear={() => {}} />
    );
    expect(screen.getByRole("group", { name: "Accent" })).toBeTruthy();
    for (const name of ["Cards", "Corners", "Density"]) expect(screen.queryByRole("group", { name })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Amber" }));
    expect(onSet).toHaveBeenCalledWith({ accent: "#da950b" });
    // No Variant on a panel widget, even for a theme that has some (once it has loaded).
    await act(async () => {
      await loadLook.mock.results.at(-1)?.value;
    });
    expect(screen.queryByRole("radiogroup", { name: "Variant" })).toBeNull();
    rerender(
      <ItemLookKnobs
        values={{ own: {}, inherited: { lookId: "night-test" } }}
        panelName="Rig"
        appearance={{ profile: { locks: { colors: true } }, profileName: "Desk" }}
        onSet={onSet}
        onClear={() => {}}
      />
    );
    expect(screen.getByText("Locked by Desk")).toBeTruthy();
  });
});
