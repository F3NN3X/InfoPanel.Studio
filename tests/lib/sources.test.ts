import { describe, expect, it } from "vitest";
import type { ApiSources } from "@/lib/catalog";
import { cleanName, groupSources, pickerOptions, sourceOptions } from "@/lib/sources";
import { YR_FORECAST_KEY } from "@/lib/sensors";

// Shapes taken from a live `/api/sources`, trimmed. Note the volume
// plugin's container id contains dots — key splitting cannot recover it.
const VOL = "{0.0.0.00000000}.{3c6e1f}";
const sources: ApiSources = {
  plugins: [
    {
      id: "volume-plugin",
      name: "Volume Info",
      containers: [
        {
          id: VOL,
          name: "Headphones",
          entries: [{ id: "volume", name: "Volume", type: "sensor", key: `plugins.volume-plugin.${VOL}.volume` }],
        },
      ],
    },
    {
      id: "audio-level-meter",
      name: "Audio Level Meter",
      containers: [
        { id: "dev-b", name: "🎵 Speakers", entries: [] },
        { id: "default-audio", name: "Audio Level Meter", entries: [] },
        { id: "dev-a", name: "🎵 Music", entries: [] },
      ],
    },
    {
      id: "yr-weather-plugin",
      name: "Weather Info - MET/Yr",
      containers: [
        {
          id: "brevik-norway",
          name: "Brevik, Norway",
          entries: [
            { id: "forecast", name: "Forecast", type: "table", key: "plugins.yr-weather-plugin.brevik-norway.forecast" },
          ],
        },
      ],
    },
  ],
};

const sensors = {
  [`plugins.volume-plugin.${VOL}.volume`]: { value: 40, unit: "%" },
  "plugins.yr-weather-plugin.brevik-norway.forecast": { text: "Mon, Sun\nTue, Rain", unit: "" },
  "libre.cpu_load": { value: 12, unit: "%", name: "CPU Load" },
  "system.cpu.load": { value: 16, unit: "%", name: "CPU Load" },
  "spotify.track": { text: "Sehnsucht", unit: "" },
};

describe("cleanName", () => {
  it("drops a leading decorative glyph", () => {
    expect(cleanName("🎵 Speakers (Focusrite)")).toBe("Speakers (Focusrite)");
    expect(cleanName("Plain")).toBe("Plain");
  });
});

describe("groupSources", () => {
  const groups = groupSources(sources, sensors);

  it("uses the API's plugin, container and entry names and types", () => {
    const vol = groups.find((g) => g.id === "volume-plugin")!;
    expect(vol.name).toBe("Volume Info");
    expect(vol.sources[0]).toMatchObject({ id: VOL, label: "Headphones", pluginId: "volume-plugin" });
    expect(vol.sources[0].entries[0]).toMatchObject({ label: "Volume", type: "sensor", value: 40, unit: "%" });
  });

});

describe("sourceOptions", () => {
  it("lists the plugin's containers after 'all sources'", () => {
    expect(sourceOptions(sources, "plugins.audio-level-meter.")).toEqual([
      { value: "", label: "All sources" },
      { value: "default-audio", label: "Audio Level Meter" },
      { value: "dev-a", label: "Music" },
      { value: "dev-b", label: "Speakers" },
    ]);
  });

});

describe("pickerOptions", () => {
  const options = pickerOptions(sources, sensors);

  it("leads with the yr forecast placeholder when a location exists", () => {
    expect(options[0]).toMatchObject({ key: YR_FORECAST_KEY, type: "table" });
    expect(pickerOptions(null, { "libre.x": { value: 1, unit: "" } }).some((o) => o.key === YR_FORECAST_KEY)).toBe(false);
  });

  it("describes where each key lives and makes it searchable", () => {
    const vol = options.find((o) => o.key.endsWith(".volume"))!;
    expect(vol.where).toBe("Volume Info › Headphones");
    expect(vol.search).toContain("headphones");
    expect(options.find((o) => o.key === "libre.cpu_load")?.where).toBe("LibreHardwareMonitor");
  });
});
