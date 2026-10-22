import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import { fixtureSensors } from "@/widgets/__fixtures__";

// Every module that declares views: its View control matches them, and each view renders.
const WITH_VIEWS = modules.filter((m) => m.views?.length);

describe("widget views", () => {
  it("are declared by the widgets with a layout switch", () => {
    expect(WITH_VIEWS.map((m) => m.id).sort()).toEqual(
      ["AudioMeter", "Bluetooth", "DriveSpace", "FpsMonitor", "GameSpotlight", "NowPlaying", "SensorGroup", "ServiceHealth", "SteamFriends", "SystemOverview", "Thermals", "Weather"].sort()
    );
  });

  it.each(WITH_VIEWS.filter((m) => m.views!.length > 1).map((m) => [m.id, m] as const))("%s: its View setting is its views", (_id, m) => {
    const def = m.settings?.find((d) => d.key === (m.viewKey ?? "view"));
    expect(def).toBeDefined();
    expect(def!.default).toBe(m.views![0].id);
    expect(def!.options?.map((o) => o.value)).toEqual(m.views!.map((v) => v.id));
  });

  const cases = WITH_VIEWS.flatMap((m) => m.views!.map((v) => [`${m.id} · ${v.id}`, m, v] as const));
  it.each(cases)("%s renders", (_name, m, v) => {
    const saved = { [m.viewKey ?? "view"]: v.id, ...v.applies };
    expect(() => renderToString(m.render(fixtureSensors(), saved) as never)).not.toThrow();
  });
});
