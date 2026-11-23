// @vitest-environment happy-dom
// Several selected zones get the knob row (L46): one knob edit goes to each zone and detaches that knob only.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MultiInspector } from "@/components/studio/inspector/multi-inspector";
import { defaultConfig, type Placement, type ProfileView } from "@/lib/layout";
import { profileWithPage } from "@/lib/pages";

const zone = (id: string, settings?: Placement["settings"]): Placement => ({
  id,
  module: "CpuMonitor",
  colStart: 1,
  rowStart: 1,
  colSpan: 2,
  rowSpan: 2,
  visible: true,
  ...(settings ? { settings } : {}),
});

describe("the multi-select inspector's knob row", () => {
  it("writes a knob to every selected zone, leaving the rest of its section following", async () => {
    const config = defaultConfig();
    // `a` keeps corners from before its spacing followed the page again: stored, inactive.
    const zones = [zone("a", { radius: "20" }), zone("b")];
    const profile: ProfileView = { ...profileWithPage(config.profiles[0]), placements: zones };
    let edited = profile;
    const updateProfile = vi.fn((fn: (p: ProfileView) => ProfileView) => {
      edited = fn(edited);
    });
    render(
      <MultiInspector
        zones={zones}
        appearance={{ profileName: "Desk" }}
        inherit={{ config, setConfig: () => {}, navigateTo: () => {} }}
        profileId={profile.id}
        pageId={profile.pageId ?? ""}
        updateProfile={updateProfile}
        onDeselect={() => {}}
        onToggleVisible={() => {}}
        onDuplicate={() => {}}
        onRemove={() => {}}
        query=""
        onQuery={() => {}}
      />
    );
    const density = await screen.findByRole("radiogroup", { name: "Density" });
    fireEvent.click(density.querySelector("[role=radio]:first-child")!);
    expect(updateProfile).toHaveBeenCalledTimes(1);
    for (const z of edited.placements) {
      // Density only: `a`'s old corners don't come back with the section.
      expect(z.settings).toEqual({ padding: "4", gap: "4" });
      expect(z.follow).toEqual({ spacing: false });
    }
    fireEvent.click(screen.getByRole("button", { name: "Teal" }));
    // Accent on each zone, Colors their own.
    expect(edited.placements.map((z) => z.settings?.accent)).toEqual(["#00c1b9", "#00c1b9"]);
    expect(edited.placements.map((z) => z.follow)).toEqual([
      { spacing: false, colors: false },
      { spacing: false, colors: false },
    ]);
  });
});
