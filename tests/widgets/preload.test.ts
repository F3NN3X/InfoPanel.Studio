import { describe, expect, it, vi } from "vitest";
import type { MonitorProfile, Placement } from "@/lib/layout";
import type { DashboardModule } from "@/modules/types";
import { TEMPLATE_MODULES } from "@/widgets/registry";
import { pageKinds, preloadKinds, profileKinds } from "@/widgets/preload";

const zone = (module: string): Placement => ({ id: module, module }) as Placement;
const profile: Pick<MonitorProfile, "pages"> = {
  pages: [
    { id: "main", name: "Main", placements: [zone("Clock"), zone("SystemOverview")] },
    { id: "media", name: "Media", placements: [zone("NowPlaying"), zone("Clock"), zone("__canvas__")] },
  ],
};

describe("pageKinds and profileKinds", () => {
  it("lists the shown page's kinds first, then every page's, each once", () => {
    expect(pageKinds(profile, "media")).toEqual(["NowPlaying", "Clock", "__canvas__"]);
    expect(pageKinds(profile, "gone")).toEqual(["Clock", "SystemOverview"]);
    const other = { pages: [{ id: "p", name: "P", placements: [zone("Weather"), zone("Clock")] }] };
    expect(profileKinds([profile, other])).toEqual(["Clock", "SystemOverview", "NowPlaying", "__canvas__", "Weather"]);
  });
});

describe("preloadKinds", () => {
  const mod = (id: string, preload?: () => Promise<void>) => ({ id, preload }) as DashboardModule;

  it("fetches the chunk of every listed kind at once, and skips kinds without one", async () => {
    const clock = vi.fn(() => Promise.resolve());
    const weather = vi.fn(() => Promise.resolve());
    await preloadKinds(["Clock", "SensorValue", "__canvas__"], [mod("Clock", clock), mod("Weather", weather), mod("SensorValue")]);
    expect(clock).toHaveBeenCalledOnce();
    expect(weather).not.toHaveBeenCalled();
  });

  it("does not fail when a chunk does not load (the zone asks again)", async () => {
    await expect(preloadKinds(["Clock"], [mod("Clock", () => Promise.reject(new Error("offline")))])).resolves.toBeDefined();
  });

  it("finds a chunk for the kinds a sample profile places", () => {
    const byId = new Map(TEMPLATE_MODULES.map((m) => [m.id, m]));
    for (const id of profileKinds([profile]).filter((k) => byId.has(k))) expect(byId.get(id)?.preload, id).toBeTypeOf("function");
  });
});
