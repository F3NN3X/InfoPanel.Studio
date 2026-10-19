import { createElement as h } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { BackgroundPanel } from "./background-panel";

const props = {
  target: "all" as const,
  onTarget: () => {},
  dashboard: { type: "image" as const, src: "/a.webp" },
  profileName: "Main",
  profileId: "p1",
  onChange: () => {},
};

describe("BackgroundPanel (All profiles)", () => {
  it("warns when the active profile's own background hides the dashboard's", () => {
    const html = renderToString(h(BackgroundPanel, { ...props, profileBackground: { type: "video", src: "/v.webm" } }));
    expect(html).toContain("has its own background");
    expect(html).toContain("a video");
    expect(html).toContain("Use this one");
  });

  it("says nothing while the profile inherits", () => {
    expect(renderToString(h(BackgroundPanel, { ...props, profileBackground: undefined }))).not.toContain("has its own background");
  });
});
