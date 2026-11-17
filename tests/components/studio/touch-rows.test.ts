import { describe, expect, it } from "vitest";
import { actionOptions, GUARDED_OPTIONS, OBS_STREAM, pickAction, rowOptions, rowValue, withGesture } from "@/components/studio/touch-rows";
import { touchChoices } from "@/lib/pinned-edit";
import type { TouchAction } from "@/lib/pinned";

// The Touch rows of any widget and of a rail item (P6): a stored action the list doesn't hold now is kept, never lost.

const choices = touchChoices([{ id: "home", name: "Home" }], { outputs: [], inputs: [{ id: "mic", name: "Mic" }], scenes: [] });
const GONE: TouchAction = { op: "audio", body: { target: "windows", op: "mute", kind: "input", id: "usb-mic" } };
const RUN: TouchAction = { op: "run", command: "calc.exe" };

describe("the touch rows", () => {
  it("list a stored action the choices lack as kept, and give it back as stored when picked", () => {
    const opts = actionOptions(choices, "Nothing", GONE);
    expect(opts[0]).toEqual({ value: "", label: "Nothing" });
    expect(opts.at(-1)).toEqual({ value: "mute:input:usb-mic", label: "Mute or unmute a device not connected now" });
    expect(pickAction(choices, "mute:input:usb-mic", GONE)).toBe(GONE);
    expect(actionOptions(choices, "Nothing", RUN).at(-1)).toEqual({ value: "other", label: "Set in the config (kept)" });
    expect(pickAction(choices, "other", RUN)).toBe(RUN);
    // one the list holds is not listed twice
    expect(actionOptions(choices, "Nothing", { op: "page", to: "home" }).filter((o) => o.value === "page:home")).toHaveLength(1);
    expect(pickAction(choices, "media:next", RUN)).toEqual({ op: "media", key: "next" });
    expect(pickAction(choices, "", RUN)).toBeUndefined();
  });

  it("set and clear one gesture, and leave no empty map", () => {
    const tap = withGesture(undefined, "tap", { op: "page", to: "next" });
    expect(tap).toEqual({ tap: { op: "page", to: "next" } });
    const both = withGesture(tap, "hold", { op: "lock" });
    expect(both).toEqual({ tap: { op: "page", to: "next" }, hold: { op: "lock" } });
    expect(withGesture(both, "tap", undefined)).toEqual({ hold: { op: "lock" } });
    expect(withGesture({ hold: { op: "lock" } }, "hold", undefined)).toBeUndefined();
  });

  it("list a command and OBS's go live after the safe set, read each back as itself, and keep a kept action last (P7)", () => {
    const none = rowOptions(choices, "Nothing", undefined);
    expect(none.slice(-2)).toEqual([...GUARDED_OPTIONS]);
    expect(rowValue(RUN)).toBe("run");
    expect(rowValue({ ...RUN, confirm: true })).toBe("run");
    expect(rowValue(OBS_STREAM)).toBe("obs:stream");
    expect(rowValue({ op: "page", to: "home" })).toBe("page:home");
    // a command is no kept "other" any more: listed once, as Run a command
    expect(rowOptions(choices, "Nothing", RUN).filter((o) => o.value === "other")).toEqual([]);
    expect(rowOptions(choices, "Nothing", RUN)).toEqual(none);
    // an action the list lacks still comes last, after the guarded two
    expect(rowOptions(choices, "Nothing", GONE).slice(-3).map((o) => o.value)).toEqual(["run", "obs:stream", "mute:input:usb-mic"]);
  });
});
