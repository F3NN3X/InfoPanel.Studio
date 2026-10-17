import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { belowQuery, useViewportBelow } from "./use-viewport-below";

function Probe({ px }: { px: number }) {
  return h("span", null, String(useViewportBelow(px)));
}

describe("useViewportBelow", () => {
  it("queries strictly below the width, so the width itself is not narrow", () => {
    expect(belowQuery(900)).toBe("(max-width: 899.98px)");
  });

  it("is false when rendered on the server", () => {
    expect(renderToString(h(Probe, { px: 900 }))).toContain("false");
  });
});
