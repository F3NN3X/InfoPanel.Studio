import { describe, expect, it } from "vitest";
import { cellLuminance, flashGuard, FLASH_STEP, planScript, type ScriptEnv, watchdog } from "@/looks/pack-script/gate";
import { SCRIPT_FPS, WATCHDOG } from "@/looks/pack-script/limits";
import { FLASH_MAX } from "@/looks/pack-json";

const ON: ScriptEnv = { level: "full", lite: false, reduceMotion: false, hidden: false, runs: true, supported: true };

describe("planScript: the start and stop matrix", () => {
  it("runs at Full at 30 fps and at Calm at 15, telling the script its level", () => {
    expect(planScript(ON)).toEqual({ level: "full", fps: SCRIPT_FPS.full });
    expect(planScript({ ...ON, level: "calm" })).toEqual({ level: "calm", fps: SCRIPT_FPS.calm });
  });

  it.each([
    ["Effects Off", { level: "off" }],
    ["lite mode", { lite: true }],
    ["reduced motion", { reduceMotion: true }],
    ["a hidden page", { hidden: true }],
    ["no word from the server", { runs: false }],
    ["a browser without the sandbox", { supported: false }],
  ] as const)("runs nothing on %s, at either level", (_, change) => {
    expect(planScript({ ...ON, ...change })).toBeUndefined();
    expect(planScript({ ...ON, level: "calm", ...change })).toBeUndefined();
  });
});

describe("watchdog", () => {
  it("ends the script at the third frame over budget inside ten seconds, and forgets older ones", () => {
    const dog = watchdog();
    expect(dog.over(0)).toBe(false);
    expect(dog.over(1000)).toBe(false);
    expect(dog.over(WATCHDOG.windowMs + 1)).toBe(false);
    expect(dog.over(WATCHDOG.windowMs + 2)).toBe(true);
  });
});

describe("flashGuard", () => {
  const dark = [0, 0];
  const lit = [0.5, 0];
  it(`lets at most ${FLASH_MAX} flashes through in a second, and any number of small changes`, () => {
    const guard = flashGuard();
    // a script that alternates every 50 ms: what is on show changes at most FLASH_MAX * 2 times in that second
    let on = dark;
    let changes = 0;
    for (let i = 0; i < 20; i++) {
      const next = i % 2 ? lit : dark;
      if (guard.allow(next, i * 50) && next !== on) {
        changes++;
        on = next;
      }
    }
    expect(changes).toBe(FLASH_MAX * 2);
    const calm = flashGuard();
    for (let i = 0; i < 60; i++) expect(calm.allow([((i % 2) * FLASH_STEP) / 2, 0], i * 16)).toBe(true);
  });

  it("lets transitions through again once the second has passed", () => {
    const guard = flashGuard();
    for (let i = 0; i < 7; i++) guard.allow(i % 2 ? dark : lit, i);
    expect(guard.allow(lit, 10)).toBe(false);
    expect(guard.allow(lit, 1100)).toBe(true);
  });
});

describe("cellLuminance", () => {
  it("reads relative luminance times alpha", () => {
    const l = cellLuminance([255, 255, 255, 255, 255, 255, 255, 0, 0, 0, 0, 255, 255, 255, 255, 128]);
    expect([...l].map((v) => Math.round(v * 100) / 100)).toEqual([1, 0, 0, 0.5]);
  });
});
