// @vitest-environment happy-dom
// A chart's text for screen readers: what, range, latest and trend, in one sentence.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ChartSummary, chartSummary } from "@/components/ui/chart-summary";
import { AreaChart } from "@/components/studio/explorer/area-chart";

describe("chartSummary", () => {
  it("says the range, the latest reading and the trend", () => {
    expect(chartSummary({ name: "Package Temp", span: "last 60 s", samples: [58.8, 62, 67.7], unit: "°C" })).toBe(
      "Package Temp, last 60 s: 58.8 to 67.7 °C, latest 67.7 °C, rising.",
    );
    expect(chartSummary({ name: "Fan", span: "last 5 min", samples: [90, 50, 10] })).toBe("Fan, last 5 min: 10.0 to 90.0, latest 10.0, falling.");
  });

  it("calls a small change steady, and copes with no or one reading", () => {
    expect(chartSummary({ name: "Fan", span: "last 60 s", samples: [10, 20, 10.5] })).toContain("steady");
    expect(chartSummary({ name: "Fan", span: "last 60 s", samples: [] })).toBe("Fan, last 60 s: no readings yet.");
    expect(chartSummary({ name: "Fan", span: "last 60 s", samples: [5] })).toBe("Fan, last 60 s: 5.0 to 5.0, latest 5.0.");
  });
});

describe("ChartSummary", () => {
  it("renders the text for screen readers only", () => {
    render(<ChartSummary id="s" text="Fan, last 60 s: no readings yet." />);
    const el = screen.getByText("Fan, last 60 s: no readings yet.");
    expect(el.id).toBe("s");
    expect(el.className).toContain("sr-only");
  });
});

describe("AreaChart", () => {
  it("points the chart at its summary", () => {
    render(<AreaChart name="Package Temp" samples={[1, 2, 3]} unit="°C" />);
    const chart = screen.getByRole("img");
    const summary = document.getElementById(chart.getAttribute("aria-describedby") ?? "");
    expect(chart.getAttribute("aria-label")).toBe("Package Temp, last 60 s");
    expect(summary?.textContent).toBe("Package Temp, last 60 s: 1.0 to 3.0 °C, latest 3.0 °C, rising.");
  });
});
