// @vitest-environment happy-dom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureSensors } from "@/widgets/__fixtures__";
import DeviceBatteries, { batteryDevices, type DeviceBatteriesProps } from "@/widgets/device-batteries/DeviceBatteries";
import { STATE } from "@/widgets/kit";
import { toFlat } from "@/widgets/shared/data-adapter";

// The widget's own fixture data: the shared sensors plus extra.json's two devices (a mouse charging at 93 %, a keyboard
// asleep and low at 12 %, not connected), run through the same adapter the app uses.
const DATA = toFlat(fixtureSensors());
const MOUSE = "1837410529";
const KEYBOARD = "2078156601";

const draw = (props: Partial<DeviceBatteriesProps> = {}) => render(<DeviceBatteries data={DATA} {...props} />);
const rowOf = (c: HTMLElement, id: string) => c.querySelector(`[data-device="${id}"]`) as HTMLElement | null;
/** A row's charge number (the only data-part="num" in it). */
const numOf = (c: HTMLElement, id: string) => (rowOf(c, id) as HTMLElement).querySelector('[data-part="num"]') as HTMLElement;
/** A CSS colour as the DOM keeps it (happy-dom may keep the hex or write it as rgb()). */
const kept = (colour: string) => {
  const probe = document.createElement("div");
  probe.style.color = colour;
  return probe.style.color;
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** A box of `w` × `h` once the widget measures itself (an unmeasured one reads its `size` tier only). */
const box = (w: number, h: number) =>
  class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(el: Element) {
      this.cb([{ target: el, contentRect: { width: w, height: h } } as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  };

describe("the battery keys", () => {
  it("group into one device each, and battery.status is the source's line, not a device", () => {
    const devices = batteryDevices(DATA);
    expect(devices.map((d) => d.id)).toEqual([MOUSE, KEYBOARD]);
    expect(devices[0]).toMatchObject({ name: "MX Master 3S", percent: 93, charging: true, kind: "mouse", low: false, connected: true, asleep: false });
    expect(devices[1]).toMatchObject({ name: "Keychron K3", percent: 12, charging: false, kind: "keyboard", low: true, connected: false, asleep: true });
  });

  it("leave percent undefined for a device that never reported a level", () => {
    const [device] = batteryDevices({ "battery.42.name": "Pad", "battery.42.kind": "controller" });
    expect(device.percent).toBeUndefined();
    expect(device.connected).toBe(true);
  });
});

describe("the list view", () => {
  it("draws a row per device with its name, charge and the charging bolt", () => {
    const { container } = draw();
    const mouse = rowOf(container, MOUSE);
    const keyboard = rowOf(container, KEYBOARD);
    expect(mouse?.textContent).toContain("MX Master 3S");
    expect(mouse?.textContent).toContain("93%");
    expect(mouse?.hasAttribute("data-charging")).toBe(true);
    // the kind's glyph and the bolt
    expect(mouse?.querySelectorAll('[data-part="icon"]')).toHaveLength(2);
    expect(keyboard?.textContent).toContain("Keychron K3");
    expect(keyboard?.textContent).toContain("12%");
    expect(keyboard?.querySelectorAll('[data-part="icon"]')).toHaveLength(1);
    expect(container.textContent).not.toContain("2 devices · updated");
  });

  it("fades an asleep device's row and keeps its last charge", () => {
    const { container } = draw();
    const keyboard = rowOf(container, KEYBOARD) as HTMLElement;
    expect(keyboard.hasAttribute("data-asleep")).toBe(true);
    expect(keyboard.className).toContain("opacity-60");
    expect(keyboard.querySelector('[data-part="name"]')?.className).toContain("--w-faint");
    expect(keyboard.textContent).toContain("12%");
  });

  it("colours a low device with the Critical role, and the rest with the accent", () => {
    const { container } = draw();
    const low = numOf(container, KEYBOARD);
    const rest = numOf(container, MOUSE);
    expect(low.style.color).toBe(kept(STATE.crit));
    expect(rest.style.color).not.toBe(kept(STATE.crit));
    cleanup();
    // an own colour wins over the role
    const own = draw({ batteryLowColor: "#123456" });
    expect(numOf(own.container, KEYBOARD).style.color).toBe(kept("#123456"));
  });

  it("leaves a disconnected device out unless Options show them, and keeps asleep ones either way", () => {
    const data = { ...DATA, "battery.333.name": "Pad", "battery.333.percent": "55 %", "battery.333.kind": "controller", "battery.333.connected": "no", "battery.333.asleep": "no" };
    const off = render(<DeviceBatteries data={data} />);
    expect(rowOf(off.container, "333")).toBeNull();
    expect(rowOf(off.container, KEYBOARD)).not.toBeNull();
    cleanup();
    const on = render(<DeviceBatteries data={data} showDisconnected />);
    expect(rowOf(on.container, "333")?.textContent).toContain("55%");
  });

  it("draws the charging bolt only while Options ask for it", () => {
    const { container } = draw({ showCharging: false });
    expect(rowOf(container, MOUSE)?.querySelectorAll('[data-part="icon"]')).toHaveLength(1);
  });
});

describe("the tiles view", () => {
  it("draws a ring per device with its charge in the centre and its name under it", () => {
    const { container } = draw({ view: "tiles" });
    expect(container.querySelectorAll('[data-part="ring"]')).toHaveLength(2);
    const mouse = rowOf(container, MOUSE);
    expect(mouse?.textContent).toContain("MX Master 3S");
    expect(mouse?.textContent).toContain("93");
    expect(rowOf(container, KEYBOARD)?.hasAttribute("data-asleep")).toBe(true);
  });
});

describe("the single view", () => {
  it("draws the device Options picked, and the lowest charge when nothing is picked", () => {
    const picked = draw({ view: "single", singleDevice: MOUSE });
    expect(picked.container.textContent).toContain("MX Master 3S");
    expect(picked.container.textContent).toContain("93");
    expect(picked.container.textContent).not.toContain("Keychron K3");
    cleanup();
    const fallback = draw({ view: "single" });
    expect(fallback.container.textContent).toContain("Keychron K3");
    expect(fallback.container.textContent).toContain("Low — charge it");
  });

  it("keeps a picked device drawn when it is out of range, marked Not connected", () => {
    const data = { ...DATA, "battery.333.name": "Pad", "battery.333.percent": "55 %", "battery.333.kind": "controller", "battery.333.connected": "no", "battery.333.asleep": "no" };
    const { container } = render(<DeviceBatteries data={data} view="single" singleDevice="333" />);
    expect(container.textContent).toContain("Pad");
    expect(container.textContent).toContain("55");
    expect(container.textContent).toContain("Not connected");
  });
});

describe("the lowest view", () => {
  it("lists the devices by charge, lowest first", () => {
    const { container } = draw({ view: "lowest" });
    expect([...container.querySelectorAll("[data-device]")].map((el) => el.getAttribute("data-device"))).toEqual([KEYBOARD, MOUSE]);
  });
});

describe("the rail presets", () => {
  it("a short card under 360 px gives the rows its width, without the side summary", () => {
    // The summary repeats the lowest row; beside it the names cut to a letter.
    vi.stubGlobal("ResizeObserver", box(270, 110));
    const { container } = draw({ view: "list", size: "xs" });
    expect(container.querySelectorAll("[data-device]")).toHaveLength(2);
    expect(container.textContent).not.toContain("Lowest of 2 devices");
  });

  // The rail's slot as the PageRail draws it (72 px wide, the widget row's height).
  const RAIL = box(72, 76);

  it("the list preset draws up to three icon-and-charge rows, without the names", () => {
    vi.stubGlobal("ResizeObserver", RAIL);
    const { container } = draw({ view: "list", size: "xs" });
    const rows = [...container.querySelectorAll("[data-device]")];
    expect(rows.map((el) => el.getAttribute("data-device"))).toEqual([MOUSE, KEYBOARD]);
    expect(container.textContent).toContain("93%");
    expect(container.textContent).not.toContain("MX Master 3S");
    expect(container.querySelectorAll('[data-part="icon"]').length).toBeGreaterThan(0);
  });

  it("the list preset gives each row a charge bar in the charge's colour", () => {
    vi.stubGlobal("ResizeObserver", RAIL);
    const { container } = draw({ view: "list", size: "xs" });
    const barOf = (id: string) => rowOf(container, id)?.querySelector('[data-part="charge-bar"]') as HTMLElement | null;
    expect(barOf(MOUSE)?.style.background).toBe(kept("var(--w-accent)"));
    expect(barOf(KEYBOARD)?.style.background).toBe(kept(STATE.crit));
  });

  it("the list preset with the charge hidden draws every device as icon and glyph, two columns past five", () => {
    // Three rows of charge and bar left the fourth device off the rail; icon and glyph alone fit them all.
    const extra = Object.fromEntries(
      [1, 2, 3, 4, 5].flatMap((i) => [
        [`battery.90${i}.name`, `Pad ${i}`],
        [`battery.90${i}.percent`, `${i * 15} %`],
        [`battery.90${i}.kind`, "controller"],
      ]),
    );
    vi.stubGlobal("ResizeObserver", RAIL);
    const { container } = render(<DeviceBatteries data={{ ...DATA, ...extra }} view="list" size="xs" show="bar" />);
    const rows = [...container.querySelectorAll("[data-device]")];
    expect(rows).toHaveLength(7);
    for (const row of rows) expect(row.querySelector('[data-part="battery-glyph"]')).not.toBeNull();
    expect(container.textContent).not.toContain("%");
    expect(rowOf(container, MOUSE)?.getAttribute("title")).toContain("93%");
    expect((rows[0].parentElement as HTMLElement).style.gridTemplateColumns).toBe("repeat(2, auto)");
  });

  it("a short, wide card keeps its device names: only a narrow slot is the rail's", () => {
    // 4x2 is under the xs height tier, but has the width for names; the rail body there drew bare icons and charges.
    vi.stubGlobal("ResizeObserver", box(460, 110));
    const { container } = draw({ view: "list", size: "xs" });
    expect(container.textContent).toContain("MX Master 3S");
    expect(container.textContent).toContain("Keychron K3");
  });

  it("the lowest preset draws one ring of the lowest charge", () => {
    vi.stubGlobal("ResizeObserver", RAIL);
    const { container } = draw({ view: "lowest", size: "xs" });
    expect(container.querySelectorAll('[data-part="ring"]')).toHaveLength(1);
    expect(container.textContent).toContain("12");
    expect(container.querySelectorAll("[data-device]")).toHaveLength(0);
  });
});

describe("the device filter", () => {
  it("draws only the ticked devices", () => {
    const { container } = draw({ devices: MOUSE });
    expect(rowOf(container, MOUSE)).not.toBeNull();
    expect(rowOf(container, KEYBOARD)).toBeNull();
  });

  it("drops the ticked devices in exclude mode", () => {
    const { container } = draw({ devices: MOUSE, devicesMode: "exclude", showDisconnected: true });
    expect(rowOf(container, MOUSE)).toBeNull();
    expect(rowOf(container, KEYBOARD)).not.toBeNull();
  });

  it("draws every device when none is ticked, and says so when the filter leaves none", () => {
    expect(draw({ devices: "", devicesMode: "exclude" }).container.querySelectorAll("[data-device]")).toHaveLength(2);
    cleanup();
    expect(draw({ devices: "gone" }).container.textContent).toContain("No device matches");
  });
});

describe("the kind icon", () => {
  it("starts a row with the kind glyph, and with it off a row starts with the name", () => {
    const glyphs = (c: HTMLElement) => rowOf(c, MOUSE)?.querySelectorAll('[data-part="icon"]').length;
    expect(glyphs(draw({ showCharging: false }).container)).toBe(1);
    cleanup();
    const off = draw({ showCharging: false, showIcon: false }).container;
    expect(glyphs(off)).toBe(0);
    expect(rowOf(off, MOUSE)?.textContent).toContain("MX Master 3S");
  });
});
