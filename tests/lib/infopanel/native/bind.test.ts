import { describe, expect, it } from "vitest";
import { bindKey } from "../../../../src/lib/infopanel/native/bind.ts";
import type { DataApiValue } from "../../../../src/lib/infopanel/sensors.ts";

const sensors: Record<string, DataApiValue> = {
  "libre.cpu": { value: 5, unit: "%", name: "CPU Total", ref: "libre:/amdcpu/0/load/0" },
  "system.cpu.load": { value: 9, unit: "%", name: "CPU Load" },
  "system.bridge.status": { text: "running" },
  "spotify.track": { text: "idle" },
  "plugins.spotify-plugin.spotify.current-track": { text: "idle", name: "Spotify · Current Track", ref: "plugin:/spotify-plugin/spotify/current-track" },
  "hwinfo.x": { value: 1, ref: "bogus:1" },
};

describe("bindKey", () => {
  it("binds a key by its ref", () => {
    expect(bindKey("libre.cpu", sensors)).toMatchObject({ ok: true, via: "ref", binding: { SensorType: "Libre", LibreSensorId: "/amdcpu/0/load/0" } });
  });

  it("remaps a pushed system key to the reading for the same role", () => {
    expect(bindKey("system.cpu.load", sensors)).toMatchObject({ ok: true, via: "remap", binding: { SensorType: "Libre", LibreSensorId: "/amdcpu/0/load/0" } });
  });

  it("remaps a pushed Spotify key to the Spotify plugin's entry", () => {
    expect(bindKey("spotify.track", sensors)).toMatchObject({ ok: true, via: "remap", binding: { SensorType: "Plugin", PluginSensorId: "/spotify-plugin/spotify/current-track" } });
  });

  it.each([
    ["system.bridge.status", "no InfoPanel reference"],
    ["hwinfo.x", "no InfoPanel reference"],
    ["nope", "isn't in the Data API"],
  ])("gives a reason for %s", (key, reason) => {
    const r = bindKey(key, sensors);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toContain(reason);
  });

  it("explains a remap with no target", () => {
    expect(bindKey("spotify.album", { "spotify.album": { text: "-" } })).toEqual({ ok: false, reason: "the Spotify plugin isn't running" });
  });
});
