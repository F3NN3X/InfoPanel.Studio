import { describe, expect, it } from "vitest";
import type { Role } from "@/lib/infopanel/templates/roles";
import { placePage } from "@/lib/screen-templates/fallback";
import { zone, type At } from "@/lib/screen-templates/kit";

const spare = (at: At, role: Role, label = "x") => ({ ...zone("SensorValue", at, { label }, { sensor: role }), spare: true });
/** The sensors found on a made-up machine: each role found has the key "k:<role>". */
const found = (...roles: Role[]) => (role: Role) => (roles.includes(role) ? `k:${role}` : undefined);
const boxes = (zones: ReturnType<typeof placePage>) => zones.map((p) => [...p.at]);

describe("placePage", () => {
  it("binds the sensors it finds and keeps every zone", () => {
    const placed = placePage([spare([1, 1, 1, 1], "cpu.temp"), spare([2, 1, 1, 1], "gpu.temp")], found("cpu.temp", "gpu.temp"));
    expect(placed.map((p) => p.bound)).toEqual([{ sensor: "k:cpu.temp" }, { sensor: "k:gpu.temp" }]);
  });

  it("fills a missing reading from the first similar role that is found, with its label", () => {
    const [p] = placePage([spare([1, 1, 1, 1], "gpu.hotspot", "Hot spot")], found("vram.temp", "gpu.temp"));
    expect(p.bound).toEqual({ sensor: "k:vram.temp" });
    expect(p.label).toBe("VRAM temp");
  });

  it("skips a similar role the page reads already, and takes the next", () => {
    const placed = placePage([spare([1, 1, 1, 1], "gpu.hotspot"), spare([2, 1, 1, 1], "vram.temp")], found("vram.temp", "gpu.temp"));
    expect(placed.map((p) => p.bound.sensor)).toEqual(["k:gpu.temp", "k:vram.temp"]);
  });

  it("does not give two empty slots the same stand-in", () => {
    const placed = placePage([spare([1, 1, 1, 1], "cpu.ccd1"), spare([2, 1, 1, 1], "cpu.ccd2")], found("cpu.maxcore", "cpu.temp"));
    expect(placed.map((p) => p.bound.sensor)).toEqual(["k:cpu.maxcore", "k:cpu.temp"]);
  });

  it("leaves a zone out when nothing similar is found, and the neighbour beside it takes its room", () => {
    const placed = placePage([spare([1, 1, 1, 1], "fps.low1"), spare([2, 1, 1, 1], "fps.low01"), spare([1, 2, 2, 1], "frametime")], found("fps.low1", "frametime"));
    expect(boxes(placed)).toEqual([[1, 1, 2, 1], [1, 2, 2, 1]]);
  });

  it("gives the room to the neighbours that cover the side together", () => {
    const placed = placePage(
      [spare([1, 1, 1, 1], "cpu.temp"), spare([2, 1, 1, 1], "gpu.temp"), spare([1, 2, 2, 1], "ups.power")],
      found("cpu.temp", "gpu.temp"),
    );
    expect(boxes(placed)).toEqual([[1, 1, 1, 2], [2, 1, 1, 2]]);
  });

  it("takes a run of left-out zones in turn", () => {
    const placed = placePage(
      [spare([1, 1, 1, 1], "cpu.ccd1"), spare([1, 2, 1, 1], "cpu.ccd2"), spare([1, 3, 1, 1], "cpu.clock")],
      found("cpu.clock"),
    );
    expect(boxes(placed)).toEqual([[1, 1, 1, 3]]);
  });

  it("leaves the room empty rather than overlap when no side is covered exactly", () => {
    const placed = placePage([spare([1, 1, 1, 1], "cpu.temp"), spare([2, 1, 1, 2], "ups.power")], found("cpu.temp"));
    expect(boxes(placed)).toEqual([[1, 1, 1, 1]]);
  });

  it("never drops or fills a zone that isn't spare, or one with no role", () => {
    const fixed = zone("SensorValue", [1, 1, 1, 1], { label: "x" }, { sensor: "ups.power" });
    const clock = zone("Clock", [2, 1, 1, 1]);
    const placed = placePage([fixed, clock], found());
    expect(placed.map((p) => p.zone)).toEqual([fixed, clock]);
    expect(placed[0].bound).toEqual({});
  });
});
