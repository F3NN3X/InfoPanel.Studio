// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RailHostContext, RailItemContext, type RailHost } from "@/components/rail-host";
import { EMPTY_EXTRAS, type Extras } from "@/lib/extras";
import type { RailSlot, TouchAction } from "@/lib/pinned";

const mocks = vi.hoisted(() => ({ extras: null as Extras | null }));
vi.mock("@/lib/extras", async (original) => {
  const real = await original<typeof import("@/lib/extras")>();
  return { ...real, extras: { subscribe: () => () => {}, getState: () => mocks.extras ?? real.EMPTY_EXTRAS } };
});

import PageRail from "@/widgets/page-rail/PageRail";

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
    expect(run).toHaveBeenCalledWith({ op: "page", to: "keys" });
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
    expect(run).toHaveBeenLastCalledWith({ op: "page", to: "next" });
  });

  it("names an image slot by its alt text, the item's name", () => {
    draw(host(), [{ id: "i", group: "pages", target: { kind: "page", pageId: "keys" }, name: "Home", icon: { from: "image", asset: "abc.png" }, shape: "rounded" }]);
    const img = screen.getByRole("img", { name: "Home" });
    expect(img.getAttribute("src")).toBe("/api/assets/abc.png");
    expect(screen.getByRole("button", { name: "Home" })).toBeTruthy();
  });
});
