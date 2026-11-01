import { describe, expect, it } from "vitest";
import { stressSensors } from "@/widgets/widget-qa/stress";

describe("widget-qa stress data", () => {
  it("tops out percentages, grows other readings and prose, and leaves the tokens widgets parse alone", () => {
    const out = stressSensors({
      load: { value: 54, unit: "%", max: 80 },
      temp: { value: 62.5, unit: "°C", max: 70, name: "CPU Package" },
      track: { text: "Song title", unit: "" },
      status: { text: "up", unit: "" },
      state: { text: '{"mixes":[]}', unit: "" },
      art: { text: "/assets/qa/cover with space.svg", unit: "" },
      "plugins.clock-plugin.clock.24-hour": { value: 20, unit: "", max: 23 },
    });
    expect(out["plugins.clock-plugin.clock.24-hour"]).toMatchObject({ value: 20, max: 23 });
    expect(out.load).toMatchObject({ value: 100, max: 100 });
    expect(out.temp).toMatchObject({ value: 625, max: 625, name: "CPU Package (extended label)" });
    expect(out.track.text!.length).toBeGreaterThanOrEqual(48);
    expect(out.track.text!.startsWith("Song title · Song title")).toBe(true);
    expect([out.status.text, out.state.text, out.art.text]).toEqual(["up", '{"mixes":[]}', "/assets/qa/cover with space.svg"]);
  });
});
