import { describe, expect, it } from "vitest";
import { choiceFor, IP_EXPORT_KEY, notices, ON_INFOPANEL_KEY, readChoices, rowsOf, startChoices, writeChoices } from "../../../../src/lib/infopanel/export/native-choices.ts";
import { CONFIG_VERSION, mergeConfig, type DashboardConfig, type Placement } from "../../../../src/lib/layout.ts";

const title = (id: string) => id;
const zone = (module: string, rest: Partial<Placement> = {}): Placement => ({ id: "z1", module, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2, visible: true, ...rest });

describe("choices storage", () => {
  it("round-trips through the settings string, pruning a widget that is gone", () => {
    const written = writeChoices({ accent: "#fff" }, { zone: "snapshot", w1: "leave", gone: "recreate" }, ["zone", "w1"]);
    expect(written.accent).toBe("#fff");
    expect(readChoices(written)).toEqual({ zone: "snapshot", w1: "leave" });
  });

  it("removes the key when nothing is left, and reads nothing from a bad value", () => {
    expect(IP_EXPORT_KEY in writeChoices({ [IP_EXPORT_KEY]: '{"zone":"leave"}' }, {}, ["zone"])).toBe(false);
    expect(readChoices({ [IP_EXPORT_KEY]: "{not json" })).toEqual({});
    expect(readChoices({ [IP_EXPORT_KEY]: '["leave"]' })).toEqual({});
    expect(readChoices({ [IP_EXPORT_KEY]: '{"zone":"live","w":"snapshot"}' })).toEqual({ w: "snapshot" });
  });

  it("starts the Convert dialog from a grid widget's On InfoPanel rule (one-editor SPEC §7.4)", () => {
    const remembered = writeChoices(undefined, { zone: "snapshot", w1: "leave" }, ["zone", "w1"]);
    expect(startChoices({ ...remembered, [ON_INFOPANEL_KEY]: "recreate" })).toEqual({ zone: "recreate", w1: "leave" });
    expect(startChoices(remembered)).toEqual({ zone: "snapshot", w1: "leave" });
    expect(startChoices({ [ON_INFOPANEL_KEY]: "live" })).toEqual({});
  });

  // Saved data: the choices live in the config the user saves and loads, across versions.
  it("keeps the key through a config load, from the current shape and from an older one", () => {
    const placement = zone("CpuMonitor", { settings: writeChoices(undefined, { zone: "snapshot" }, ["zone"]) });
    const stored = (version: number) => ({
      version,
      profiles: [{ id: "p", name: "P", width: 1920, height: 1080, cols: 12, rows: 6, fit: "fill", pages: [{ id: "pg", name: "Main", placements: [placement] }] }],
    });
    for (const version of [CONFIG_VERSION, 12, 9]) {
      const loaded: DashboardConfig = mergeConfig(JSON.parse(JSON.stringify(stored(version))));
      const kept = loaded.profiles[0].pages[0].placements.find((p) => p.id === "z1");
      expect(readChoices(kept?.settings), `v${version}`).toEqual({ zone: "snapshot" });
    }
  });
});

describe("rowsOf", () => {
  it("is one row for a module, with the module's default", () => {
    const [r] = rowsOf(zone("CpuMonitor"), title);
    expect(r).toMatchObject({ key: "zone", fallback: "recreate", options: ["recreate", "snapshot", "leave"] });
    expect(rowsOf(zone("Fans"), title)[0]).toMatchObject({ fallback: "recreate" });
  });

  it("says a widget that isn't InfoPanel data is left out unless a snapshot of it is picked", () => {
    const rows = rowsOf(zone("Countdown"), (id) => id);
    expect(rows[0]).toMatchObject({ fallback: "leave", options: ["leave", "snapshot"] });
    expect(notices(rows)).toEqual(["Countdown isn't compatible with InfoPanel and is left out"]);
  });

  it("is a row per visible widget of a panel, and none for a canvas zone", () => {
    const panel = { id: "p", title: "Stats", titleVisible: true, visible: true, background: "none", widgets: [{ id: "a", kind: "stat", visible: true }, { id: "b", kind: "bar", visible: false }] } as Placement["panel"];
    expect(rowsOf(zone("panel", { panel }), title).map((r) => r.key)).toEqual(["a"]);
    expect(rowsOf(zone("infopanel"), title)).toEqual([]);
  });

  it("uses a stored choice only while the row still offers it", () => {
    const [r] = rowsOf(zone("Countdown"), title);
    expect(choiceFor(r, { zone: "recreate" })).toBe("leave");
    const [cpu] = rowsOf(zone("CpuMonitor"), title);
    expect(choiceFor(cpu, { zone: "snapshot" })).toBe("snapshot");
  });
});
