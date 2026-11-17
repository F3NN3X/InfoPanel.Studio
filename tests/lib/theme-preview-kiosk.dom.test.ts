// @vitest-environment happy-dom
// A kiosk draws a studio's theme preview over its config, and its own config again when the preview goes or is malformed.
// An applied one is kept until the kiosk's own config wears it, so the old theme never flashes before the save arrives.
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DashboardConfig } from "@/lib/layout";
import { mainPage } from "@/lib/pages";
import { applyPreview, parsePreview } from "@/lib/theme-preview";
import { APPLIED_HOLD_MS, useKioskThemePreview } from "@/lib/theme-preview-kiosk";
import { lookPreset } from "@/components/studio/look-gallery-model";

const CONFIG: DashboardConfig = {
  version: 21,
  activeProfile: "auto",
  profiles: [{ id: "p1", name: "P1", width: 800, height: 480, cols: 4, rows: 2, fit: "fill", pages: [mainPage([])] }],
};
const PREVIEW = { preset: lookPreset({ id: "term", name: "Term", description: "" }), look: true, scope: { kind: "profile", profileId: "p1" }, keepBackground: false, until: 1 };
const APPLIED = { ...PREVIEW, applied: true };
/** The config the studio saves on Apply: the preview applied. */
const SAVED = applyPreview(CONFIG, parsePreview(PREVIEW)!);
const lookOf = (c: DashboardConfig) => c.profiles[0].widgetTheme?.values?.lookId;

type Props = { config: DashboardConfig; preview?: Record<string, unknown> & { until: number } };
const mount = (preview: Props["preview"]) =>
  renderHook((props: Props) => useKioskThemePreview(props.config, props.preview), { initialProps: { config: CONFIG, preview } as Props });

afterEach(() => vi.useRealTimers());

describe("useKioskThemePreview", () => {
  it("draws the preview, then the saved config again at once when it is cancelled", async () => {
    const frozen = structuredClone(CONFIG);
    const { result, rerender } = mount(PREVIEW);
    await waitFor(() => expect(lookOf(result.current)).toBe("term"));
    expect(CONFIG).toEqual(frozen);
    rerender({ config: CONFIG, preview: undefined });
    expect(result.current).toBe(CONFIG);
  });

  it("keeps an applied preview after it goes until the config here wears it", async () => {
    const { result, rerender } = mount(APPLIED);
    await waitFor(() => expect(lookOf(result.current)).toBe("term"));
    // The channel drops it with the save; this kiosk has not pulled the save yet.
    rerender({ config: CONFIG, preview: undefined });
    expect(lookOf(result.current)).toBe("term");
    // An older config arriving first (a save in flight before the apply) still does not wear it.
    const older = { ...CONFIG, profiles: CONFIG.profiles.map((p) => ({ ...p, name: "Renamed" })) };
    rerender({ config: older, preview: undefined });
    expect(lookOf(result.current)).toBe("term");
    // The save with the theme: drawn as it is, the hold released.
    rerender({ config: SAVED, preview: undefined });
    expect(result.current).toBe(SAVED);
    rerender({ config: CONFIG, preview: undefined });
    expect(result.current).toBe(CONFIG);
  });

  it("lets an applied preview go after the hold time if the save never reaches it", async () => {
    const { result, rerender } = mount(APPLIED);
    await waitFor(() => expect(lookOf(result.current)).toBe("term"));
    vi.useFakeTimers();
    rerender({ config: CONFIG, preview: undefined });
    expect(lookOf(result.current)).toBe("term");
    act(() => void vi.advanceTimersByTime(APPLIED_HOLD_MS));
    expect(result.current).toBe(CONFIG);
  });

  it("draws the saved config for a preview it cannot read", async () => {
    const { result } = mount({ until: 1, preset: { name: "" }, scope: { kind: "all" } });
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBe(CONFIG);
  });
});
