// @vitest-environment happy-dom
// The Motion group (L117): a switch for each effect the pack declares and no other, and each control writes where the group says.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MotionKnobs } from "@/components/studio/motion-knobs";

const setup = (fx?: "full" | "calm" | "off") => {
  const onSet = vi.fn();
  const onClear = vi.fn();
  const onLevel = vi.fn();
  render(<MotionKnobs motion={{ decode: {}, sweep: { on: false } }} values={{}} from="Cyberspec" fx={fx} screen="Desk" onSet={onSet} onClear={onClear} onLevel={onLevel} />);
  return { onSet, onClear, onLevel };
};

describe("the Motion group", () => {
  it("has a switch per declared effect, on as the pack says", () => {
    setup();
    expect(screen.getByRole("switch", { name: "Decode labels" }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getByRole("switch", { name: "Sweep" }).getAttribute("aria-checked")).toBe("false");
    expect(screen.queryByRole("switch", { name: "Flicker" })).toBeNull();
  });

  it("lists the effects under their row, one per line with its switch, and the row counts those on (v3: no loose right-aligned stack)", () => {
    setup();
    const list = screen.getByRole("list", { name: "Effects" });
    expect(list.querySelectorAll("li")).toHaveLength(2);
    expect(list.querySelector("li")!.textContent).toBe("Decode labels");
    expect(screen.getByRole("group", { name: "Effects" }).textContent).toContain("1 of 2 on");
  });

  it("writes the level to the screen, and Intensity, Speed and the effects as Look values", () => {
    const { onSet, onClear, onLevel } = setup("calm");
    expect(screen.getByRole("radio", { name: "Calm" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Off" }));
    expect(onLevel).toHaveBeenCalledWith("off");
    fireEvent.click(screen.getByRole("radio", { name: "High" }));
    expect(onSet).toHaveBeenCalledWith({ motionIntensity: "high" });
    fireEvent.click(screen.getAllByRole("radio", { name: "Theme's" })[1]);
    expect(onClear).toHaveBeenCalledWith(["motionSpeed"]);
    fireEvent.click(screen.getByRole("switch", { name: "Sweep" }));
    expect(onSet).toHaveBeenCalledWith({ motionEffects: "decode,sweep" });
  });
});
