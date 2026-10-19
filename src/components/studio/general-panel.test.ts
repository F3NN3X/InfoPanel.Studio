import { describe, expect, it } from "vitest";
import { generalCards, type GeneralClock } from "./general-panel";

const noClock: GeneralClock = { value: undefined, onChange: () => {} };

describe("generalCards", () => {
  const card = (id: string, general?: Parameters<typeof generalCards>[0], hours = noClock) =>
    generalCards(general, () => {}, hours).find((c) => c.id === id)!;
  const display = (general?: Parameters<typeof generalCards>[0]) => card("doc:display", general);

  it("lists Page dots and swipe in the Display card", () => {
    expect(display().terms).toContain("Page dots");
  });

  it("counts the key as changed once it is set, and resets it", () => {
    expect(display().changed).toBe(0);
    expect(display({ kioskPageNav: true }).changed).toBe(1);
    const reset: string[] = [];
    generalCards({ kioskPageNav: true }, (key) => reset.push(key), noClock).find((c) => c.id === "doc:display")!.onReset?.();
    expect(reset).toContain("kioskPageNav");
  });

  it("counts and resets the clocks' 12 / 24 h, the all-profiles style's themed clock (config v7)", () => {
    expect(card("doc:clock").changed).toBe(0);
    const set: (string | undefined)[] = [];
    const hours: GeneralClock = { value: "12", onChange: (v) => set.push(v) };
    const clock = card("doc:clock", undefined, hours);
    expect(clock.changed).toBe(1);
    clock.onReset?.();
    expect(set).toEqual([undefined]);
  });
});
