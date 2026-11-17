import { describe, expect, it } from "vitest";
import type { ControlDisplay, ControlKiosk } from "@/lib/control";
import type { MonitorProfile } from "@/lib/layout";
import type { TouchPanelEntry } from "@/settings/types";
import {
  connectedFor,
  displayEntries,
  displaySubtitle,
  displayTitle,
  offersTouch,
  onNoDisplay,
  pinnedScreen,
  rotationButton,
  screenPlaces,
  screenSummary,
  screensCountLine,
  seenAgo,
  showOnTargets,
} from "@/components/studio/screens/display-model";

const kiosk = (over: Partial<ControlKiosk>): ControlKiosk => ({ id: "k1", profile: "a", page: "p1", address: "192.168.1.24", since: 0, ...over });
const display = (over: Partial<ControlDisplay>): ControlDisplay => ({ name: "desk", screen: "a", firstSeen: 0, lastSeen: 0, online: true, address: null, shows: "a", ...over });
const screen = (over: Partial<MonitorProfile> = {}) =>
  ({ id: "a", name: "Main", width: 1600, height: 900, pages: [{ id: "p1", name: "Page 1", placements: [{}, {}] }], ...over }) as unknown as MonitorProfile;

const panel = (id: string, name: string): TouchPanelEntry => ({
  id,
  name,
  device: { vid: null, pid: null, port: null },
  monitor: null,
  panel: { width_px: 1920, height_px: 550, rotation: "0", flip_x: false, flip_y: false, calibration: null },
});

describe("displayEntries", () => {
  it("is one card per display: kiosks connected now, a named display once however many tabs, then the offline ones", () => {
    const cards = displayEntries(
      [kiosk({ display: "desk" }), kiosk({ id: "k2", display: "desk" }), kiosk({ id: "k3", profile: "gone", address: "127.0.0.1" })],
      [display({}), display({ name: "hall", online: false, address: null, shows: null, screen: "a" })],
      [screen()],
    );
    expect(cards.map((c) => [c.key, c.online])).toEqual([
      ["desk", true],
      ["kiosk:k3", true],
      ["hall", false],
    ]);
    expect(cards[0].display?.name).toBe("desk");
    expect(cards[0].screen?.id).toBe("a");
    expect(cards[1].display).toBeUndefined();
    expect(cards[1].screen).toBeUndefined();
    expect(cards[1].thisPc).toBe(true);
    expect(cards[2].screen?.id).toBe("a");
  });

  it("ties a touch panel to the display named after it, online or not", () => {
    const panels = [panel("panel-1", "Panel 1"), panel("panel-2", "Panel 2")];
    const cards = displayEntries([kiosk({ display: "panel-1", address: "127.0.0.1" })], [display({ name: "panel-1" }), display({ name: "panel-2", online: false })], [screen()], panels);
    expect(cards.map((c) => c.panel?.name)).toEqual(["Panel 1", "Panel 2"]);
  });
});

describe("a card's words", () => {
  it("names the kiosk here with no name This PC, a panel by its name, else the display, else the address", () => {
    const [here] = displayEntries([kiosk({ address: "127.0.0.1" })], [], []);
    expect(displayTitle(here)).toBe("This PC");
    expect(displayTitle({ ...here, kiosk: kiosk({ address: "::ffff:127.0.0.1" }), thisPc: true })).toBe("This PC");
    expect(displayTitle({ kiosk: kiosk({ display: "desk" }), thisPc: false })).toBe("desk");
    expect(displayTitle({ kiosk: kiosk({}), thisPc: false })).toBe("Kiosk · 192.168.1.24");
    expect(displayTitle({ kiosk: kiosk({ address: null }), thisPc: false })).toBe("Kiosk");
    expect(displayTitle({ kiosk: kiosk({ display: "panel-1" }), thisPc: true, panel: panel("panel-1", "Left bar") })).toBe("Left bar");
  });

  it("says Live with the address and how long, or Offline with when it was last seen", () => {
    const live = { online: true, thisPc: false };
    expect(displaySubtitle({ ...live, kiosk: kiosk({ since: 0 }) }, 2 * 3_600_000)).toBe("Live · connected 2 h");
    expect(displaySubtitle({ ...live, kiosk: kiosk({ display: "desk", since: 0 }) }, 30_000)).toBe("Live · 192.168.1.24 · connected just now");
    expect(displaySubtitle({ online: false, thisPc: false, display: display({ online: false, lastSeen: 0 }) }, 3 * 3_600_000)).toBe("Offline · seen 3 h ago");
  });

  it("offers touch on this PC and on a display not seen anywhere else, never on a kiosk on another device", () => {
    expect(offersTouch({ kiosk: kiosk({ address: "127.0.0.1" }) })).toBe(true);
    expect(offersTouch({})).toBe(true);
    expect(offersTouch({ kiosk: kiosk({}) })).toBe(false);
  });

  it("says when a link's pin beats the screen chosen here", () => {
    const other = screen({ id: "b", name: "Other" });
    expect(pinnedScreen(display({ screen: "a", shows: "b" }), [screen(), other])?.name).toBe("Other");
    expect(pinnedScreen(display({ screen: "follow", shows: "b" }), [screen(), other])).toBeUndefined();
    expect(pinnedScreen(display({}), [screen()])).toBeUndefined();
  });

  it("counts how long a kiosk has been connected, and when a display was last seen", () => {
    expect([0, 59_000, 5 * 60_000, 3 * 3_600_000, 2 * 86_400_000].map((ms) => connectedFor(0, ms))).toEqual(["now", "now", "5 min", "3 h", "2 d"]);
    expect([0, 5 * 60_000, 2 * 3_600_000, 3 * 86_400_000].map((ms) => seenAgo(1000, 1000 + ms))).toEqual(["just now", "5 min ago", "2 h ago", "3 d ago"]);
  });

  it("summarises a screen and the header's count", () => {
    expect(screenSummary(screen())).toBe("1600 × 900 · 1 page · 2 widgets");
    expect(screensCountLine(4, 2)).toBe("4 screens · 2 displays live");
    expect(screensCountLine(1, 0)).toBe("1 screen");
  });
});

describe("where a screen shows", () => {
  const panels = [panel("panel-1", "Panel 1")];
  it("says On Panel 1 (touch) for one touch panel, else the count, and leads to the first display's card", () => {
    const one = displayEntries([kiosk({ display: "panel-1" })], [display({ name: "panel-1" })], [screen()], panels);
    expect(screenPlaces("a", one)).toEqual({ text: "On Panel 1 (touch)", key: "panel-1" });
    const two = displayEntries([kiosk({ display: "panel-1" }), kiosk({ id: "k2" })], [display({ name: "panel-1" })], [screen()], panels);
    expect(screenPlaces("a", two)).toEqual({ text: "On 2 displays", key: "panel-1" });
    expect(screenPlaces("b", two)).toBeNull();
  });

  it("hints only for a screen no display shows or is set to", () => {
    const entries = displayEntries([], [display({ online: false, screen: "b", shows: null })], [screen(), screen({ id: "b" })]);
    expect(onNoDisplay("a", entries)).toBe(true);
    expect(onNoDisplay("b", entries)).toBe(false);
  });

  it("can show on every named display, and on a touch panel only once its kiosk has opened", () => {
    const targets = showOnTargets([display({ name: "hall" }), display({ name: "panel-1", screen: "a" })], [...panels, panel("panel-2", "Panel 2"), panel("Not a name!", "Odd")]);
    expect(targets).toEqual([
      { name: "hall", label: "hall", touch: false, known: true, screen: "a" },
      { name: "panel-1", label: "Panel 1 (touch)", touch: true, known: true, screen: "a" },
      { name: "panel-2", label: "Panel 2 (touch)", touch: true, known: false },
    ]);
  });
});

describe("rotationButton", () => {
  const two = screen({ pages: [{ id: "p1", name: "A", placements: [] }, { id: "p2", name: "B", placements: [] }], rotate: { enabled: false, seconds: 30 } } as Partial<MonitorProfile>);
  it("follows the server's state, else the saved setting, and names the screen", () => {
    expect(rotationButton(two, { rotating: true })).toMatchObject({ label: "Cycling pages: every 30 s", running: true, toggles: true });
    expect(rotationButton(two, undefined)).toMatchObject({ label: "Cycling pages: paused", running: false });
    expect(rotationButton(two, undefined).title).toContain("Main");
  });
  it("states no interval for a screen with no saved rotation, never 0 s", () => {
    const unsaved = { ...two, rotate: undefined } as typeof two;
    const button = rotationButton(unsaved, { rotating: true });
    expect(button).toMatchObject({ label: "Cycling pages: on", running: true });
    expect(button.title).not.toContain("0 s");
    expect(button.title).not.toContain("pages every");
  });
  it("cannot be toggled on a one-page screen", () => {
    expect(rotationButton(screen(), undefined)).toMatchObject({ label: "One page", toggles: false });
  });
});
