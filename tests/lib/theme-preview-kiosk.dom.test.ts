// @vitest-environment happy-dom
// A kiosk draws a studio's theme preview over its config, and its own config again when the preview goes or is malformed.
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { DashboardConfig } from "@/lib/layout";
import { mainPage } from "@/lib/pages";
import { useKioskThemePreview } from "@/lib/theme-preview-kiosk";
import { lookPreset } from "@/components/studio/look-gallery-model";

const CONFIG: DashboardConfig = {
  version: 21,
  activeProfile: "auto",
  profiles: [{ id: "p1", name: "P1", width: 800, height: 480, cols: 4, rows: 2, fit: "fill", pages: [mainPage([])] }],
};
const PREVIEW = { preset: lookPreset({ id: "term", name: "Term", description: "" }), look: true, scope: { kind: "profile", profileId: "p1" }, keepBackground: false, until: 1 };

describe("useKioskThemePreview", () => {
  it("draws the preview, then the saved config again when it goes", async () => {
    const frozen = structuredClone(CONFIG);
    const { result, rerender } = renderHook((props: { preview?: typeof PREVIEW }) => useKioskThemePreview(CONFIG, props.preview), { initialProps: { preview: PREVIEW } as { preview?: typeof PREVIEW } });
    await waitFor(() => expect(result.current.profiles[0].widgetTheme?.values?.lookId).toBe("term"));
    expect(CONFIG).toEqual(frozen);
    rerender({ preview: undefined });
    expect(result.current).toBe(CONFIG);
  });

  it("draws the saved config for a preview it cannot read", async () => {
    const { result } = renderHook(() => useKioskThemePreview(CONFIG, { until: 1, preset: { name: "" }, scope: { kind: "all" } }));
    await new Promise((r) => setTimeout(r, 20));
    expect(result.current).toBe(CONFIG);
  });
});
