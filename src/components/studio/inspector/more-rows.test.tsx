import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MoreRows, moreKey, setMoreOpen } from "./more-rows";

const render = (storeKey: string, count = 2) =>
  renderToString(
    <MoreRows storeKey={storeKey} count={count}>
      <span>hidden row</span>
    </MoreRows>
  );

describe("MoreRows", () => {
  it("keeps the rows behind a More (n) link until it is opened", () => {
    const out = render(moreKey("Weather", "skin"));
    expect(out).toContain("More (2)");
    expect(out).not.toContain("hidden row");
  });

  it("opens per section per zone type, then offers Less", () => {
    setMoreOpen(moreKey("Weather", "colors"), true);
    const open = render(moreKey("Weather", "colors"));
    expect(open).toContain("hidden row");
    expect(open).toContain("Less");
    expect(render(moreKey("Clock", "colors"))).not.toContain("hidden row");
    setMoreOpen(moreKey("Weather", "colors"), false);
    expect(render(moreKey("Weather", "colors"))).not.toContain("hidden row");
  });

  it("draws nothing for a section without More rows", () => {
    expect(render(moreKey("Weather", "type"), 0)).toBe("");
  });
});
