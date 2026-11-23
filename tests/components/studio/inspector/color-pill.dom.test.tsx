// @vitest-environment happy-dom
// The native picker sits invisible over the swatch, so the swatch has to show the keyboard focus the input can't.
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ColorPill } from "@/components/studio/inspector/color-pill";

afterEach(cleanup);

describe("ColorPill", () => {
  it("draws the focus ring on the swatch when the hidden picker is focused", () => {
    render(<ColorPill value="#336699" onChange={() => {}} label="Accent" />);
    const swatch = screen.getByLabelText("Accent").parentElement;
    expect(swatch?.className).toContain("has-[:focus-visible]:outline-ui-accent");
  });
});
