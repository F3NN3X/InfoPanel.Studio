import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { modules } from "@/modules";
import { fixtureSensors } from "@/widgets/__fixtures__";

// Every module that declares views: its View control matches them, and each view renders.
const WITH_VIEWS = modules.filter((m) => m.views?.length);

describe("widget views", () => {
  it("are declared by the widgets with a layout switch", () => {
    expect(WITH_VIEWS.map((m) => m.id).sort()).toEqual(
      ["AudioMeter", "Bluetooth", "CodingAgents", "Countdown", "DriveSpace", "FpsMonitor", "GameSpotlight", "NowPlaying", "SensorGroup", "ServiceHealth", "StatusBar", "SteamFriends", "SystemOverview", "Thermals", "Weather"].sort()
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

  const countdown = modules.find((m) => m.id === "Countdown")!;
  it.each(countdown.views!.map((v) => v.id))("Countdown · %s renders with a date, a time and an event name, and with none", (view) => {
    const set = { view, eventName: "Launch", date: "2030-12-31", time: "13:24", breakdown: "live" };
    expect(() => renderToString(countdown.render(fixtureSensors(), set) as never)).not.toThrow();
    expect(renderToString(countdown.render(fixtureSensors(), set) as never)).toContain("Launch");
    expect(renderToString(countdown.render(fixtureSensors(), { view }) as never)).toContain("Pick a date");
  });

  const bar = modules.find((m) => m.id === "StatusBar")!;
  it.each(bar.views!.map((v) => v.id))("StatusBar · %s leaves out items with no data", (view) => {
    const html = renderToString(bar.render(fixtureSensors(), { view, left: "text,battery", center: "date", right: "" }) as never);
    expect(html).not.toContain("–");
    expect(html).not.toContain("NaN");
  });

  it("Countdown reads a malformed date as unset", () => {
    const html = (date: string, time = "") => renderToString(countdown.render(fixtureSensors(), { date, time }) as never);
    expect(html("2030-02-30")).toContain("Pick a date");
    expect(html("soon")).toContain("Pick a date");
    expect(html("2030-12-31", "99:99")).not.toContain("Pick a date");
  });

  it("Countdown shows Happening now at the moment of the event", () => {
    expect(renderToString(countdown.render(fixtureSensors(), { date: "2000-01-01", count: "until" }) as never)).toContain("Happening now");
  });
});
