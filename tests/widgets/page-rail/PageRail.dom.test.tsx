// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RailHostContext, RailItemContext, type RailHost, type RailProfiles } from "@/components/rail-host";
import type { MonitorProfile } from "@/lib/layout";
import { EMPTY_EXTRAS, type Extras } from "@/lib/extras";
import type { RailSlot, TouchAction } from "@/lib/pinned";

const mocks = vi.hoisted(() => ({ extras: null as Extras | null }));
vi.mock("@/lib/extras", async (original) => {
  const real = await original<typeof import("@/lib/extras")>();
  return { ...real, extras: { subscribe: () => () => {}, getState: () => mocks.extras ?? real.EMPTY_EXTRAS } };
});

import { templateModule } from "@/widgets/module";
import PageRail from "@/widgets/page-rail/PageRail";
import { meta } from "@/widgets/page-rail/meta";
import railWidget from "@/widgets/page-rail/widget";

const run = vi.fn<(a: TouchAction) => void>();
const host = (over: Partial<RailHost> = {}): RailHost => ({
  pages: [
    { id: "keys", name: "Keys", icon: "zap" },
    { id: "agents", name: "Agents", icon: "bot" },
  ],
  current: "agents",
  profile: { id: "main", name: "Main", index: 0 },
  lock: "auto",
  alerts: [],
  run,
  ...over,
});

const draw = (h: RailHost, slots?: RailSlot[], props: { chip?: boolean; pageLock?: boolean; clock?: boolean } = {}) =>
  render(
    <RailHostContext.Provider value={h}>
      <RailItemContext.Provider value={{ slots, edge: "left" }}>
        <PageRail data={{}} clock={false} {...props} />
      </RailItemContext.Provider>
    </RailHostContext.Provider>
  );

const tap = (el: HTMLElement) => {
  fireEvent.pointerDown(el, { clientX: 5, clientY: 5 });
  fireEvent.pointerUp(el, { clientX: 5, clientY: 5 });
};

beforeEach(() => {
  mocks.extras = null;
  run.mockReset();
});

afterEach(() => {
  cleanup();
});

describe("the page rail", () => {
  it("draws one slot per page with none stored, marks the page shown, and taps to a page", () => {
    draw(host());
    const keys = screen.getByRole("button", { name: "Keys" });
    expect(screen.getByRole("button", { name: "Agents" }).getAttribute("aria-current")).toBe("page");
    expect(keys.getAttribute("aria-current")).toBeNull();
    tap(keys);
    expect(run).toHaveBeenCalledWith({ op: "page", to: "keys" }, "tap");
  });

  it("acts on a keyboard click once, and not again on a pointer's click", () => {
    draw(host());
    const keys = screen.getByRole("button", { name: "Keys" });
    fireEvent.click(keys, { detail: 0 });
    expect(run).toHaveBeenCalledTimes(1);
    tap(keys);
    fireEvent.click(keys, { detail: 1 });
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("shows the profile chip and the page lock, which taps to the lock action; each can be turned off", () => {
    draw(host());
    expect(screen.getByRole("img", { name: "Profile: Main" })).toBeTruthy();
    tap(screen.getByRole("button", { name: /Pages rotate/ }));
    expect(run).toHaveBeenCalledWith({ op: "lock" });
    cleanup();
    draw(host({ lock: null }), undefined, { chip: false });
    expect(screen.queryByRole("img", { name: "Profile: Main" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Pages rotate|Stays on this page/ })).toBeNull();
  });

  it("draws stored slots with their badges, read from the same state as the Island", () => {
    mocks.extras = { ...EMPTY_EXTRAS, obs: { ...EMPTY_EXTRAS.obs, streaming: true }, agents: { ...EMPTY_EXTRAS.agents, sessions: [{ state: "waiting" }] as Extras["agents"]["sessions"] } };
    const slots: RailSlot[] = [
      { id: "a", group: "pages", target: { kind: "page", pageId: "agents" }, icon: { from: "set", name: "bot" }, badge: { when: "agents-waiting" } },
      { id: "s", group: "pages", target: { kind: "page", pageId: "keys" }, name: "Stream", badge: { when: "obs-live" } },
      { id: "h", group: "actions", target: { kind: "action", action: { op: "page", to: "next" } }, name: "Next page", touch: { hold: { op: "lock" } } },
    ];
    draw(host(), slots);
    expect(screen.getByRole("button", { name: "Agents, an agent needs you" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Stream, live on OBS" }).textContent).toContain("LIVE");
    expect(screen.queryByRole("button", { name: "Keys" })).toBeNull();
    tap(screen.getByRole("button", { name: "Next page" }));
    expect(run).toHaveBeenLastCalledWith({ op: "page", to: "next" }, "tap");
  });

  it("names an image slot by its alt text, the item's name and what a tap does (owner Q10)", () => {
    draw(host(), [{ id: "i", group: "pages", target: { kind: "page", pageId: "keys" }, name: "Home", icon: { from: "image", asset: "abc.png" }, shape: "rounded" }]);
    const img = screen.getByRole("img", { name: "Home, opens Keys" });
    expect(img.getAttribute("src")).toBe("/api/assets/abc.png");
    expect(screen.getByRole("button", { name: "Home, opens Keys" })).toBeTruthy();
  });

  it("draws its clock in the rail's own text colours, so it shows on a light Look (P-B10)", () => {
    const { container } = draw(host(), undefined, { clock: true });
    const card = container.querySelector('[data-rail-slot="clock"] [data-part="card"]') as HTMLElement;
    expect(card.style.getPropertyValue("--w-fg")).toBe("inherit");
    expect(card.style.getPropertyValue("--w-muted")).toBe("inherit");
  });

  it("draws a logo on the plate the user chose, with its action in its alt text (P5)", () => {
    const logo = (plate?: RailSlot["plate"]): RailSlot => ({ id: "logo", group: "top", target: { kind: "profile" }, name: "Hexmark logo", icon: { from: "image", asset: "logo.svg" }, ...(plate ? { plate } : {}) });
    draw(host(), [logo("contrast")], { chip: false });
    const button = screen.getByRole("button", { name: "Hexmark logo, opens profiles" });
    expect(button.getAttribute("data-plate")).toBe("contrast");
    expect(button.style.background).toBe("var(--w-fg)");
    tap(button);
    expect(run).toHaveBeenCalledWith({ op: "profile-picker" }, "tap");
    cleanup();
    draw(host(), [logo("none")], { chip: false });
    expect(screen.getByRole("button", { name: "Hexmark logo, opens profiles" }).style.background).toBe("");
    cleanup();
    // unset: the card plate until the image is read (no canvas here, so it stays)
    draw(host(), [logo()], { chip: false });
    expect(screen.getByRole("button", { name: "Hexmark logo, opens profiles" }).getAttribute("data-plate")).toBe("card");
  });
});

const profile = (id: string, name: string, w: number, pages: number, exe?: string[]): MonitorProfile =>
  ({ id, name, width: w, height: 600, pages: Array.from({ length: pages }, (_, i) => ({ id: `${id}-${i}`, name: "P", placements: [] })), ...(exe ? { autoSwitch: { exe } } : {}) }) as unknown as MonitorProfile;

describe("the profile chip and picker (P4)", () => {
  const pick = vi.fn<(id: string) => void>();
  const auto = vi.fn<(on: boolean, lock?: string) => void>();
  const close = vi.fn();
  const profiles = (over: Partial<RailProfiles> = {}): RailProfiles => ({
    open: true,
    close,
    all: [profile("main", "Main", 1024, 5), profile("coding", "Coding", 1024, 2, ["Code.exe", "WindowsTerminal.exe"]), profile("bar", "Bar", 1920, 1, ["Code.exe"])],
    defaultId: "main",
    front: "Code.exe",
    paused: false,
    pick,
    auto,
    ...over,
  });

  beforeEach(() => {
    pick.mockReset();
    auto.mockReset();
    close.mockReset();
  });

  it("makes the chip a button that opens the picker on a tap or a hold", () => {
    vi.useFakeTimers();
    try {
      draw(host({ profiles: profiles({ open: false }) }));
      const chip = screen.getByRole("button", { name: "Profile: Main" });
      expect(chip.getAttribute("aria-haspopup")).toBe("dialog");
      tap(chip);
      vi.advanceTimersByTime(400);
      expect(run).toHaveBeenLastCalledWith({ op: "profile-picker" });
      run.mockReset();
      fireEvent.pointerDown(chip, { clientX: 5, clientY: 5 });
      vi.advanceTimersByTime(650);
      expect(run).toHaveBeenCalledWith({ op: "profile-picker" });
      expect(screen.queryByRole("dialog")).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it("lists the profiles of this size with their rules, the current one and the one that matches the app in front", () => {
    draw(host({ profiles: profiles() }));
    const dialog = screen.getByRole("dialog", { name: "Profiles" });
    const rows = [...dialog.querySelectorAll("li button")].map((b) => b.textContent);
    expect(rows).toEqual(["MainDefault · 5 pagesCurrent", "CodingAuto: Code.exe, WindowsTerminal.exeMatches now"]);
    expect(dialog.textContent).toContain("In front: Code.exe");
    expect(screen.getByRole("switch", { name: "Switch with the app in front" }).getAttribute("aria-checked")).toBe("true");
  });

  it("picks a profile, pauses or resumes auto-switch, and locks to the current profile", () => {
    draw(host({ profiles: profiles() }));
    fireEvent.click(screen.getByRole("button", { name: /^Coding/ }));
    expect(pick).toHaveBeenCalledWith("coding");
    expect(close).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("switch", { name: "Switch with the app in front" }));
    expect(auto).toHaveBeenLastCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "Lock to Main" }));
    expect(auto).toHaveBeenLastCalledWith(false, "main");
    cleanup();
    draw(host({ profiles: profiles({ paused: true }) }));
    expect(screen.getByRole("switch").getAttribute("aria-checked")).toBe("false");
    const locked = screen.getByRole("button", { name: "Locked to Main" });
    expect(locked.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(locked);
    expect(auto).toHaveBeenLastCalledWith(true);
  });

  it("closes on Escape and on a tap outside", () => {
    draw(host({ profiles: profiles() }));
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(close).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Close profiles" }));
    expect(close).toHaveBeenCalledTimes(2);
  });
});

describe("the profile chip's own touch", () => {
  it("a run command on it goes to the host's runner, which holds it unless it is approved, as a slot's does; the rail starts nothing itself", () => {
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    vi.useFakeTimers();
    try {
      run.mockReset();
      const picker = { open: false, close: vi.fn(), all: [], defaultId: "main", front: "", paused: false, pick: vi.fn(), auto: vi.fn() } as unknown as RailProfiles;
      render(
        <RailHostContext.Provider value={host({ profiles: picker })}>
          <RailItemContext.Provider value={{ edge: "left" }}>
            <PageRail data={{}} clock={false} chipItem={JSON.stringify({ touch: { hold: { op: "run", command: "calc.exe" } } })} />
          </RailItemContext.Provider>
        </RailHostContext.Provider>
      );
      fireEvent.pointerDown(screen.getByLabelText("Profile: Main"), { clientX: 5, clientY: 5 });
      vi.advanceTimersByTime(650);
      expect(run).toHaveBeenCalledWith({ op: "run", command: "calc.exe" }, "hold");
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
      cleanup();
    }
  });

  it("an invalid or unknown override is not drawn: a chip with a bad shape and icon looks as it does by default", () => {
    const plain = render(<RailHostContext.Provider value={host()}><RailItemContext.Provider value={{ edge: "left" }}><PageRail data={{}} clock={false} /></RailItemContext.Provider></RailHostContext.Provider>).container.innerHTML;
    cleanup();
    const bad = render(<RailHostContext.Provider value={host()}><RailItemContext.Provider value={{ edge: "left" }}><PageRail data={{}} clock={false} chipItem={JSON.stringify({ shape: "star", icon: { from: "url" }, touch: { tap: { op: "format" } } })} /></RailItemContext.Provider></RailHostContext.Provider>).container.innerHTML;
    expect(bad).toBe(plain);
  });
});

describe("the profile chip's overrides through the module the screen draws", () => {
  const ID = `${"a".repeat(64)}.png`;
  // the studio and the kiosk draw `mod.render(sensors, savedSettings)`, whose resolved settings hold only the keys the widget lists
  const mod = templateModule({ meta, Component: PageRail, settings: railWidget.settings ?? [], toProps: railWidget.render.toProps });
  const drawSaved = (saved: Record<string, string | boolean>) =>
    render(
      <RailHostContext.Provider value={host()}>
        <RailItemContext.Provider value={{ edge: "left" }}>{mod.render({ x: { value: 1, unit: "" } }, saved)}</RailItemContext.Provider>
      </RailHostContext.Provider>
    );
  const chipOf = (c: HTMLElement) => c.querySelector(`[data-rail-slot="chip"], [aria-label^="Profile:"]`);

  it("an image icon in chipItem is drawn", () => {
    const view = drawSaved({ clock: false, chipItem: JSON.stringify({ icon: { from: "image", asset: ID } }) });
    expect(chipOf(view.container)?.querySelector("img")?.getAttribute("src")).toBe(`/api/assets/${ID}`);
  });

  it("label off hides the chip's text, and its own text replaces the profile's name", () => {
    const off = drawSaved({ clock: false, chipItem: JSON.stringify({ label: false }) });
    expect(chipOf(off.container)?.textContent).toBe("");
    cleanup();
    const own = drawSaved({ clock: false, chipItem: JSON.stringify({ name: "Studio PC" }) });
    expect(chipOf(own.container)?.textContent).toBe("Studio PC");
    cleanup();
    expect(chipOf(drawSaved({ clock: false }).container)?.textContent).toBe("Main");
  });
});
