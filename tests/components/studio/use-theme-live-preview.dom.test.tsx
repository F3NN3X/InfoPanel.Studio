// @vitest-environment happy-dom
// Theme's live preview: a card is drawn without touching the config; Apply is one change, Cancel, Esc, leaving the view
// and another screen put everything back; the kiosks are told and untold; the options are remembered.
import { act, fireEvent, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { mainPage } from "@/lib/pages";
import { applyLookToLevel } from "@/lib/theme-apply";
import { lookPreset } from "@/components/studio/look-gallery-model";
import type { ThemeAt } from "@/components/studio/theme-cards";
import { PREVIEW_COMPARE_KEY, PREVIEW_HOVER_KEY, PREVIEW_KIOSKS_KEY, type PreviewItem } from "@/components/studio/theme-live-preview-model";
import { useThemeLivePreview } from "@/components/studio/use-theme-live-preview";

const posted = vi.fn(async (_body: object | null) => true);
vi.mock("@/lib/control", () => ({ postThemePreview: (body: object | null) => posted(body) }));

const screen = (id: string): MonitorProfile => ({ id, name: id, width: 800, height: 480, cols: 4, rows: 2, fit: "fill", pages: [mainPage([])] });
const CONFIG: DashboardConfig = { version: 21, activeProfile: "auto", profiles: [screen("p1"), screen("p2")] };
const item = (id: string): PreviewItem => ({ id, name: id, preset: lookPreset({ id, name: id, description: "" }), look: true });
const ORDER = [item("term"), item("nixie"), item("paper")];
const AT: ThemeAt = { level: "screen", profileId: "p1" };

function mount(at: ThemeAt = AT) {
  const onApply = vi.fn();
  const frozen = structuredClone(CONFIG);
  const hook = renderHook((props: { at: ThemeAt }) => useThemeLivePreview({ config: CONFIG, at: props.at, keepBackground: false, order: ORDER, onApply }), { initialProps: { at } });
  return { ...hook, onApply, frozen };
}

beforeEach(() => {
  localStorage.clear();
  posted.mockClear();
});
afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

describe("useThemeLivePreview", () => {
  it("draws a card without writing the config, and Cancel puts it back", () => {
    const { result, frozen } = mount();
    act(() => result.current.preview(ORDER[0]));
    expect(result.current.shown?.id).toBe("term");
    expect(result.current.config).toEqual(applyLookToLevel(CONFIG, ORDER[0].preset, { kind: "profile", profileId: "p1" }));
    expect(CONFIG).toEqual(frozen);
    act(() => result.current.cancel());
    expect(result.current.shown).toBeUndefined();
    expect(result.current.config).toBeUndefined();
    expect(CONFIG).toEqual(frozen);
  });

  it("applies once, at the scope picked, and then shows nothing", () => {
    const { result, onApply } = mount();
    act(() => result.current.preview(ORDER[1]));
    act(() => result.current.setChoice("all"));
    expect(result.current.config?.profiles.map((p) => p.widgetTheme?.values?.lookId)).toEqual(["nixie", "nixie"]);
    act(() => result.current.apply());
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(ORDER[1], { preset: ORDER[1].preset, look: true, scope: { kind: "all" }, keepBackground: false });
    expect(result.current.shown).toBeUndefined();
  });

  it("takes Esc, Enter and the arrows, but not inside a field", () => {
    const { result, onApply } = mount();
    act(() => result.current.preview(ORDER[0]));
    act(() => void fireEvent.keyDown(document.body, { key: "ArrowRight" }));
    expect(result.current.shown?.id).toBe("nixie");
    act(() => void fireEvent.keyDown(document.body, { key: "ArrowLeft" }));
    act(() => void fireEvent.keyDown(document.body, { key: "ArrowLeft" }));
    expect(result.current.shown?.id).toBe("paper");
    const input = document.body.appendChild(document.createElement("input"));
    act(() => void fireEvent.keyDown(input, { key: "ArrowRight" }));
    act(() => void fireEvent.keyDown(input, { key: "Enter" }));
    expect(result.current.shown?.id).toBe("paper");
    expect(onApply).not.toHaveBeenCalled();
    input.remove();
    act(() => void fireEvent.keyDown(document.body, { key: "Escape" }));
    expect(result.current.shown).toBeUndefined();
    act(() => result.current.preview(ORDER[0]));
    act(() => void fireEvent.keyDown(document.body, { key: "Enter" }));
    expect(onApply).toHaveBeenCalledWith(ORDER[0], expect.objectContaining({ scope: { kind: "profile", profileId: "p1" } }));
  });

  it("steps only through the cards Browse's filters leave", () => {
    const { result } = mount();
    act(() => result.current.setVisible(["term", "paper"]));
    act(() => result.current.preview(ORDER[0]));
    act(() => result.current.step(1));
    expect(result.current.shown?.id).toBe("paper");
  });

  it("ends when the view moves to another screen, not when it moves to a page of the same", () => {
    const { result, rerender } = mount();
    act(() => result.current.preview(ORDER[0]));
    rerender({ at: { level: "page", profileId: "p1", pageId: "main" } });
    expect(result.current.shown?.id).toBe("term");
    expect(result.current.choice).toBe("page");
    rerender({ at: { level: "screen", profileId: "p2" } });
    expect(result.current.shown).toBeUndefined();
  });

  it("previews on hover only when asked, and reverts when the pointer leaves", () => {
    vi.useFakeTimers();
    const { result } = mount();
    act(() => result.current.hover(ORDER[2]));
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current.shown).toBeUndefined();
    act(() => result.current.setOnHover(true));
    act(() => result.current.preview(ORDER[0]));
    act(() => result.current.hover(ORDER[2]));
    act(() => void vi.advanceTimersByTime(500));
    expect(result.current.shown?.id).toBe("paper");
    act(() => result.current.hover(undefined));
    expect(result.current.shown?.id).toBe("term");
  });

  it("shows the picked card on the kiosks, and takes it back on Cancel and when the view goes", async () => {
    const { result, unmount } = mount();
    act(() => result.current.setKiosks(true));
    expect(posted).not.toHaveBeenCalled();
    await act(async () => result.current.preview(ORDER[0]));
    expect(posted).toHaveBeenLastCalledWith(expect.objectContaining({ look: true, scope: { kind: "profile", profileId: "p1" } }));
    await vi.waitFor(() => expect(result.current.kioskUntil).toBeGreaterThan(Date.now()));
    await act(async () => result.current.cancel());
    await vi.waitFor(() => expect(posted).toHaveBeenLastCalledWith(null));
    expect(result.current.kioskUntil).toBeUndefined();

    await act(async () => result.current.preview(ORDER[1]));
    await vi.waitFor(() => expect(posted).toHaveBeenLastCalledWith(expect.objectContaining({ preset: expect.objectContaining({ id: ORDER[1].preset.id }) })));
    posted.mockClear();
    unmount();
    await vi.waitFor(() => expect(posted).toHaveBeenCalledWith(null));
  });

  it("never tells the kiosks when they are off", async () => {
    const { result, unmount } = mount();
    await act(async () => result.current.preview(ORDER[0]));
    await act(async () => result.current.cancel());
    unmount();
    expect(posted).not.toHaveBeenCalled();
  });

  it("remembers the options", () => {
    const first = mount();
    act(() => {
      first.result.current.setOnHover(true);
      first.result.current.setCompare(true);
      first.result.current.setKiosks(true);
    });
    expect([PREVIEW_HOVER_KEY, PREVIEW_COMPARE_KEY, PREVIEW_KIOSKS_KEY].map((k) => localStorage.getItem(k))).toEqual(["1", "1", "1"]);
    first.unmount();
    const again = mount();
    expect([again.result.current.onHover, again.result.current.compare, again.result.current.kiosks]).toEqual([true, true, true]);
  });

  it("starts with every option off", () => {
    const { result } = mount();
    expect([result.current.onHover, result.current.compare, result.current.kiosks]).toEqual([false, false, false]);
  });
});
