import { describe, expect, it } from "vitest";
import { renderModule } from "@/widgets/test-render";
import { TEMPLATE_MODULES } from "./registry";

describe("FpsMonitor", () => {
  const mod = TEMPLATE_MODULES.find((m) => m.id === "FpsMonitor")!;

  it("sets the frame-time caption above the graph, not over it", () => {
    const html = renderModule(mod, { layout: "standard", view: "numbers" });
    expect(html).toContain("self-end");
    expect(html).not.toMatch(/absolute right-0 top-0[^>]*>frame time/);
  });

  it("draws the Trend view's sparkline only while its toggle is on", () => {
    const html = (sparkline: boolean) => renderModule(mod, { layout: "standard", view: "trend", sparkline });
    expect(html(true)).toContain("h-6 w-full");
    expect(html(false)).not.toContain("h-6 w-full");
  });

  it("scales the gauge to the FPS target when one is set, else to the refresh rate", () => {
    const text = (target: number) => renderModule(mod, { layout: "standard", view: "gauge", target }).replace(/<!-- -->|<[^>]*>/g, "");
    expect(text(75)).toContain("RTSS · 75 fps target");
    expect(text(0)).not.toContain("fps target");
    expect(text(0)).toContain(" Hz");
  });
});
