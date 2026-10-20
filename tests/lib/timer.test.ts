import { describe, expect, it } from "vitest";
import { timerIsland } from "@/widgets/island/timer";
import { IDLE_TIMER, leftOf, reduce } from "@/lib/timer";

const MIN = 60_000;

describe("the timer", () => {
  it("counts down, pauses and resumes with the time left kept", () => {
    let s = reduce(IDLE_TIMER, { type: "start", minutes: 5, label: "Tea" }, 0);
    expect(leftOf(s, 60_000)).toBe(4 * MIN);
    s = reduce(s, { type: "pause" }, 60_000);
    expect(leftOf(s, 999_999)).toBe(4 * MIN);
    s = reduce(s, { type: "resume" }, 100_000);
    expect(s.endsAt).toBe(100_000 + 4 * MIN);
  });

  it("finishes once, counting each finish", () => {
    const s = reduce(IDLE_TIMER, { type: "start", minutes: 1 }, 0);
    expect(reduce(s, { type: "tick" }, 59_000).active).toBe(true);
    const done = reduce(s, { type: "tick" }, 60_000);
    expect(done).toMatchObject({ active: false, finished: { seq: 1, phase: "timer" } });
    expect(reduce(done, { type: "tick" }, 70_000).finished?.seq).toBe(1);
  });

  it("runs a pomodoro on: focus, break, focus", () => {
    let s = reduce(IDLE_TIMER, { type: "pomodoro", focusMin: 25, breakMin: 5 }, 0);
    s = reduce(s, { type: "tick" }, 25 * MIN);
    expect(s).toMatchObject({ active: true, phase: "break", finished: { seq: 1, phase: "focus" }, pomodoro: { round: 1 } });
    s = reduce(s, { type: "tick" }, 30 * MIN);
    expect(s).toMatchObject({ phase: "focus", finished: { seq: 2, phase: "break" } });
    expect(reduce(s, { type: "stop" }, 31 * MIN)).toMatchObject({ active: false, pomodoro: null });
  });

});

describe("the timer on the island", () => {

  it("raises a notice when a countdown runs out", () => {
    const running = reduce(IDLE_TIMER, { type: "start", minutes: 1, label: "Tea" }, 0);
    const done = reduce(running, { type: "tick" }, MIN);
    expect(timerIsland.derive(running, done, {}).notices).toEqual([{ id: "done", severity: "warning", title: "Timer done", body: "Tea", ttl: 10_000 }]);
    expect(timerIsland.derive(done, done, {}).notices).toEqual([]);
  });

});
