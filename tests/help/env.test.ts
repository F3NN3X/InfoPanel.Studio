import { afterEach, describe, expect, it, vi } from "vitest";

const openSettings = vi.fn();
vi.mock("@/settings/ipc", () => ({
  errorText: (e: unknown) => (e instanceof Error ? e.message : String(e)),
  ipc: { openSettings: (s: string) => openSettings(s), openExternal: vi.fn() },
}));

const { desktopEnv, setFailureHandler } = await import("@/help/env");

afterEach(() => openSettings.mockReset());

describe("the desktop help environment", () => {
  it("reports a failed Open Settings instead of swallowing it", async () => {
    openSettings.mockRejectedValue(new Error("settings window did not open"));
    const seen: string[] = [];
    const off = setFailureHandler((m) => seen.push(m));
    desktopEnv.openSettings("general");
    await vi.waitFor(() => expect(seen).toEqual(["settings window did not open"]));
    off();
  });
});
