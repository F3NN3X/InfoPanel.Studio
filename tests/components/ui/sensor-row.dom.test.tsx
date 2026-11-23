// @vitest-environment happy-dom
// The sparkline's geometry and its text for screen readers; one chart style at every size starts here.
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SensorRow, sparkPoints, sparkSummary } from "@/components/ui/sensor-row";

describe("the sparkline", () => {
  it("fills the box: the lowest sample at the bottom, the highest at the top", () => {
    expect(sparkPoints([10, 20], 72, 20)).toBe("0.0,20.0 72.0,0.0");
  });

  it("draws a flat line through the middle, and nothing under two samples", () => {
    expect(sparkPoints([5, 5, 5], 10, 20)).toBe("0.0,10.0 5.0,10.0 10.0,10.0");
    expect(sparkPoints([5], 10, 20)).toBe("");
  });

  it("says its range in words", () => {
    expect(sparkSummary("Package Temp", [58.8, 67.7, 60], "°C")).toBe("Package Temp, last 60 s, 58.8 to 67.7 °C");
    expect(sparkSummary("Fan", [])).toBe("Fan, last 60 s, no readings yet");
  });
});

describe("SensorRow", () => {
  it("names the chart, points it at the chart summary and shows the value with its unit", () => {
    render(<SensorRow icon={null} name="CPU Load" sensorKey="system.cpu.load" samples={[1, 2]} value="68.4" unit="%" />);
    const chart = screen.getByRole("img");
    expect(chart.getAttribute("aria-label")).toBe("CPU Load, last 60 s");
    expect(document.getElementById(chart.getAttribute("aria-describedby") ?? "")?.textContent).toBe("CPU Load, last 60 s: 1.0 to 2.0 %, latest 2.0 %, rising.");
    expect(screen.getByText("68.4").textContent).toBe("68.4 %");
  });
});
