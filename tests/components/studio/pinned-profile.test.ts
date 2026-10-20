import { describe, expect, it } from "vitest";
import { defaultConfig, newProfile, type DashboardConfig } from "@/lib/layout";
import { editedProfileId, pinAfterAdd } from "@/components/studio/pinned-profile";

/** Three profiles: "wide" (1920×550), "tall" (1080×1920) and "main" (1920×1080). */
function config(activeProfile: string): DashboardConfig {
  const make = (id: string, w: number, h: number) => ({ ...newProfile(id, w, h), id });
  return { ...defaultConfig(), profiles: [make("wide", 1920, 550), make("tall", 1080, 1920), make("main", 1920, 1080)], activeProfile };
}

describe("editedProfileId", () => {
  it("is the pinned profile whatever displays show", () => {
    expect(editedProfileId(config("main"), "tall", 1920, 550)).toBe("tall");
    expect(editedProfileId(config("auto"), "tall", 1920, 550)).toBe("tall");
  });

  it("stays on the pin when displays are switched (activating while pinned leaves the pin alone)", () => {
    const pin = "tall";
    expect(editedProfileId({ ...config("main"), activeProfile: "wide" }, pin, 1920, 1080)).toBe("tall");
    expect(editedProfileId({ ...config("main"), activeProfile: "auto" }, pin, 1920, 1080)).toBe("tall");
  });

  it("ignores a pin to a profile that no longer exists", () => {
    expect(editedProfileId(config("main"), "gone", 1920, 550)).toBe("main");
    expect(editedProfileId(config("auto"), "gone", 1920, 550)).toBe("wide");
  });

  it("follows what displays show without a pin: the active profile, or Auto's pick for the window", () => {
    expect(editedProfileId(config("tall"), undefined, 1920, 550)).toBe("tall");
    expect(editedProfileId(config("auto"), undefined, 1920, 550)).toBe("wide");
    expect(editedProfileId(config("auto"), undefined, 1920, 1080)).toBe("main");
  });
});

describe("pinAfterAdd", () => {
  it("moves a pin to the added profile and does not create one", () => {
    expect(pinAfterAdd("tall", "new")).toBe("new");
    expect(pinAfterAdd(undefined, "new")).toBeUndefined();
  });
});
