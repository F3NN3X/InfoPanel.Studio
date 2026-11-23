// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureSensors } from "@/widgets/__fixtures__";
import HourlyWeather from "@/widgets/hourly-weather/HourlyWeather";
import { firstPlace, hoursOf } from "@/widgets/hourly-weather/place";
import { toFlat } from "@/widgets/shared/data-adapter";

const DATA = toFlat(fixtureSensors());
const OSLO = { name: "Oslo", lat: 59.91, lon: 10.75 };

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const box = (w: number, h: number) =>
  class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(el: Element) {
      this.cb([{ target: el, contentRect: { width: w, height: h } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  };

/** Draws in a measured box. */
function drawIn(w: number, h: number, ui: React.ReactElement) {
  vi.stubGlobal("ResizeObserver", box(w, h));
  return render(ui);
}

describe("the place setting", () => {
  it("is the first place of the stored list, whatever the text around it", () => {
    expect(firstPlace(JSON.stringify([OSLO, { name: "Bergen", lat: 60.39, lon: 5.32 }]))).toEqual(OSLO);
    expect(firstPlace([OSLO])).toEqual(OSLO);
    expect(firstPlace(JSON.stringify([{ name: "Nowhere", lat: 91, lon: 0 }, OSLO]))).toEqual(OSLO);
  });

  it("is nothing for an empty, unreadable or wrong list", () => {
    for (const bad of ["[]", "", "not json", "{}", "null", undefined, 5, JSON.stringify([{ name: "x" }])]) expect(firstPlace(bad), String(bad)).toBeUndefined();
  });
});

describe("the hours", () => {
  it("are read from the server's keys for the place, up to the count asked", () => {
    const hours = hoursOf(DATA, OSLO, 5);
    expect(hours).toHaveLength(5);
    expect(hours[0]).toMatchObject({ time: "14:00", temp: 8.1, condition: "Partly cloudy", rain: 10, night: false });
    expect(hours[4].condition).toBe("Light rain");
  });

  it("stop at the first hour with no temperature, and are none for a place the server does not hold", () => {
    expect(hoursOf(DATA, OSLO, 24)).toHaveLength(12);
    expect(hoursOf(DATA, { name: "Elsewhere", lat: 1, lon: 1 }, 12)).toEqual([]);
  });

  it("mark the night hours from the provider's is_day", () => {
    const night = hoursOf(DATA, OSLO, 12).filter((h) => h.night).map((h) => h.time);
    expect(night).toEqual(["20:00", "21:00", "22:00", "23:00", "00:00", "01:00"]);
  });
});

describe("HourlyWeather", () => {
  it("lays the hours out as columns in a wide box, with the temperature and the rain chance", () => {
    const { container } = drawIn(420, 150, <HourlyWeather data={DATA} place={OSLO} hours={12} />);
    expect(container.textContent).toContain("14:00");
    expect(container.textContent).toContain("8°");
    expect(container.textContent).toContain("80%");
    expect(container.querySelectorAll('[data-part="num"]').length).toBe(Math.floor(420 / 58));
  });

  it("converts to Fahrenheit and leaves the rain line out when asked", () => {
    const { container } = drawIn(420, 150, <HourlyWeather data={DATA} place={OSLO} units="F" showRain={false} />);
    expect(container.textContent).toContain("47°");
    expect(container.textContent).not.toContain("%");
  });

  it("lists the hours as rows in a tall box and credits the provider", () => {
    const { container } = drawIn(180, 420, <HourlyWeather data={DATA} place={OSLO} />);
    expect(container.querySelectorAll("li").length).toBeGreaterThan(5);
    expect(container.querySelector('[data-part="credit"]')?.textContent).toContain("Weather data by Open-Meteo.com · CC BY 4.0");
  });

  it("names the provider in the header even where the full credit has no room", () => {
    const { container } = drawIn(420, 100, <HourlyWeather data={DATA} place={OSLO} />);
    expect(container.querySelector('[data-part="credit"]')).toBeNull();
    expect(container.textContent).toContain("Open-Meteo");
  });

  it("says no place is set, or that it waits for the server's first answer", () => {
    expect(render(<HourlyWeather data={DATA} />).container.textContent).toContain("No place set");
    cleanup();
    expect(render(<HourlyWeather data={{}} place={OSLO} />).container.textContent).toContain("Waiting for weather");
    cleanup();
    const errored = { "weather.place.n5991e1075.status": "error" };
    expect(render(<HourlyWeather data={errored} place={OSLO} />).container.textContent).toContain("Weather unavailable");
  });

  it("says how old stale data is", () => {
    const stale = { ...DATA, "weather.place.n5991e1075.status": "stale", "weather.place.n5991e1075.age": "47" };
    const { container } = drawIn(180, 420, <HourlyWeather data={stale} place={OSLO} />);
    expect(container.textContent).toContain("47 min old");
  });
});
