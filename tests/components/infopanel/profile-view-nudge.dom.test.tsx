// @vitest-environment happy-dom
// ProfileView nudges itself onto the device pixel grid, measuring only when its place can have changed.
import { render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProfileView } from "@/components/infopanel/ProfileView";
import { ZEROS } from "@/lib/infopanel/render/scene";
import { profile } from "@tests/lib/infopanel/elements/fixture";

const font = () => ({ fontFamily: "sans-serif" });
const sensor = () => ({ reading: null, history: ZEROS });

/** A view that sits at a fractional offset plus whatever margin it was given, on a 2x screen. */
function stubLayout() {
  vi.stubGlobal("devicePixelRatio", 2);
  vi.spyOn(HTMLElement.prototype, "offsetWidth", "get").mockReturnValue(100);
  return vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const left = 10.3 + (parseFloat(this.style.marginLeft) || 0);
    const top = 20.4 + (parseFloat(this.style.marginTop) || 0);
    return { left, top, right: left + 100, bottom: top + 100, width: 100, height: 100, x: left, y: top, toJSON: () => ({}) };
  });
}

const view = (now: Date) => <ProfileView profile={profile} items={[]} sensor={sensor} now={now} font={font} assets={new Map()} />;

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("ProfileView device pixel nudge", () => {
  it("pushes the view onto the device pixel grid", () => {
    stubLayout();
    const { container } = render(view(new Date(0)));
    const root = container.firstElementChild as HTMLElement;
    // 10.3px and 20.4px on a 2x screen: up to 10.5px and 20.5px.
    expect(parseFloat(root.style.marginLeft)).toBeCloseTo(0.2, 5);
    expect(parseFloat(root.style.marginTop)).toBeCloseTo(0.1, 5);
  });

  it("does not measure again on a re-render that moved nothing", () => {
    const rect = stubLayout();
    const { rerender } = render(view(new Date(0)));
    const settled = rect.mock.calls.length;
    rerender(view(new Date(1000)));
    rerender(view(new Date(2000)));
    expect(rect.mock.calls.length).toBe(settled);
  });
});
