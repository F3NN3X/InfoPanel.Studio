import { upgradeConfig } from "@/lib/config-upgrade";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyHistory, recordChange, undoChange } from "@/hooks/config-history";
import { withoutProfile } from "@/components/studio/profile-actions";
import { inlineCanvases, liftCanvases, refOf, resetWriteRefusal } from "@/lib/canvas-store";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { CANVAS_ID, CONFIG_VERSION, defaultConfig, newProfile, type DashboardConfig, type StoredConfig } from "@/lib/layout";
import { stampEdited } from "@/lib/screens/edited";

const at = new Date("2026-10-25T12:00:00Z");
const two = (): DashboardConfig => ({ ...defaultConfig(), profiles: [newProfile("A", 800, 480), newProfile("B", 800, 480)] });

describe("stampEdited", () => {
  it("stamps only the screens an edit changed, by identity", () => {
    const prev = two();
    const next = { ...prev, profiles: [{ ...prev.profiles[0], name: "A2" }, prev.profiles[1]] };
    const out = stampEdited(prev, next, at);
    expect(out.profiles[0].updatedAt).toBe(at.toISOString());
    expect(out.profiles[1]).toBe(prev.profiles[1]);
  });
  it("stamps a new screen, and leaves a config without profile changes alone", () => {
    const prev = two();
    const added = { ...prev, profiles: [...prev.profiles, newProfile("C", 800, 480)] };
    expect(stampEdited(prev, added, at).profiles[2].updatedAt).toBe(at.toISOString());
    const theme = { ...prev, radius: 1 };
    expect(stampEdited(prev, theme, at)).toBe(theme);
  });
  it("keeps an updatedAt the change itself set", () => {
    const prev = two();
    const next = { ...prev, profiles: [{ ...prev.profiles[0], updatedAt: "2020-01-01T00:00:00.000Z" }, prev.profiles[1]] };
    expect(stampEdited(prev, next, at).profiles[0].updatedAt).toBe("2020-01-01T00:00:00.000Z");
  });
});

describe("updatedAt in saved data", () => {
  const stored = (extra: Record<string, unknown>): StoredConfig =>
    ({ version: CONFIG_VERSION, activeProfile: "auto", profiles: [{ ...newProfile("A", 800, 480), id: "p", ...extra }] }) as unknown as StoredConfig;
  it("round-trips through a load, and an older config without it loads as before", () => {
    const once = upgradeConfig(stored({ updatedAt: "2026-10-01T10:00:00.000Z" }));
    expect(once.profiles[0].updatedAt).toBe("2026-10-01T10:00:00.000Z");
    expect(upgradeConfig(JSON.parse(JSON.stringify(once)) as StoredConfig)).toEqual(once);
    expect(upgradeConfig({ ...stored({}), version: 12 }).profiles[0].updatedAt).toBeUndefined();
  });
  it("drops a value that is not a time", () => {
    expect(upgradeConfig(stored({ updatedAt: "last tuesday" })).profiles[0].updatedAt).toBeUndefined();
    expect(upgradeConfig(stored({ updatedAt: 5 })).profiles[0].updatedAt).toBeUndefined();
  });
});

const canvas = (name: string): StoredCanvas =>
  ({ format: "infopanel-canvas", version: 1, source: { name, origin: "file", importedAt: "" }, items: [], assets: [], fonts: [] }) as unknown as StoredCanvas;

describe("delete then undo", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url === "/api/canvases") {
          const text = String(init?.body);
          const id = `cnv_${String(text.length).padStart(32, "0")}`;
          store.set(id, text);
          return new Response(JSON.stringify({ id }), { status: 200 });
        }
        const text = store.get(url.slice("/api/canvases/".length));
        return text === undefined ? new Response(null, { status: 404 }) : new Response(text);
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    resetWriteRefusal();
  });

  it("brings back the screen with its canvas, and the push after the undo names the same stored canvas", async () => {
    const base = { ...newProfile("Readout", 1920, 480), id: "ip" };
    const placed = { id: "z", module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 12, rowSpan: 4, visible: true, canvas: canvas("Readout") };
    const start: DashboardConfig = { ...defaultConfig(), profiles: [defaultConfig().profiles[0], { ...base, pages: [{ ...base.pages[0], placements: [placed] }] }] };
    // The config was pushed: the server holds the canvas by ref.
    await liftCanvases(start);
    const ref = refOf(placed.canvas);
    expect(ref).toMatch(/^cnv_/);

    // Delete (one step), then Undo: the very same screen and canvas come back.
    const deleted = stampEdited(start, withoutProfile(start, "ip"), at);
    expect(deleted.profiles.map((p) => p.id)).not.toContain("ip");
    const undone = undoChange(recordChange(emptyHistory<DashboardConfig>(), start, undefined, 1000), deleted);
    expect(undone?.value).toBe(start);
    expect(undone!.value.profiles[1].pages[0].placements[0].canvas).toBe(placed.canvas);

    // What the undo pushes names the same canvas, and a config read back from the server has it inline again.
    const pushed = await liftCanvases(undone!.value);
    expect(pushed.profiles[1].pages[0].placements[0].canvasRef).toBe(ref);
    const back = await inlineCanvases(pushed);
    expect(back.profiles[1].pages[0].placements[0].canvas).toMatchObject({ source: { name: "Readout" } });
  });
});
