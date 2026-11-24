// @vitest-environment happy-dom
// The kit's layouts added with Cyberspec v3 (src/widgets/layouts.ts): the friends crew roster, the weather quote slab, the notifications
// feed, the spectrum receiver and the power draw, and the card anatomy a Look's `card-style` asks for. Each draws the widget's own data
// its own way; with no layout named the widget draws its standard markup. Then the treatments two more widgets take from the Look: the
// default Custom gauge on a hexagon ring, and Wave Link's lying levels as cells or a ruler.
import { cleanup, fireEvent, render } from "@testing-library/react";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fixtureSensors } from "@/widgets/__fixtures__";
import { toFlat } from "@/widgets/shared/data-adapter";
import SteamFriends from "@/widgets/steam-friends/SteamFriends";
import { crewOf } from "@/widgets/steam-friends/FriendsCrew";
import { friendsOf } from "@/widgets/shared/friends-data";
import Weather from "@/widgets/weather/Weather";
import Notifications from "@/widgets/notifications/Notifications";
import { feedTabs } from "@/widgets/notifications/NotificationsFeed";
import SystemOverview from "@/widgets/system-overview/SystemOverview";
import { axisLabels } from "@/widgets/visualizer/VisualizerSpectrum";
import { initials } from "@/widgets/shared/layout-kit";
import { AnatomyHeader, anatomyFits, anatomyLabel, CardKindCtx } from "@/widgets/core/card-anatomy";
import { Widget } from "@/widgets/core/Widget";
import { t3Tokens } from "@/widgets/core/t3-tokens";
import CustomGauge, { DEFAULT_GAUGE_SPEC } from "@/widgets/CustomGauge";
import { MeterPair } from "@/widgets/wave-link/meters";
import { normalizeGauge } from "@/lib/infopanel/gauges/vector";

const data = toFlat(fixtureSensors());
const box = (w: number, h: number) =>
  class {
    constructor(private cb: ResizeObserverCallback) {}
    observe(el: Element) {
      this.cb([{ target: el, contentRect: { width: w, height: h }, borderBoxSize: [{ inlineSize: w, blockSize: h }] } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver);
    }
    unobserve() {}
    disconnect() {}
  };
const drawIn = (w: number, h: number, ui: React.ReactElement) => {
  vi.stubGlobal("ResizeObserver", box(w, h));
  return render(ui).container;
};
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const SLABS = { "slab-row": "current", "slab-current": "warn", "row-style": "ruled" };

describe("Steam Friends", () => {
  it("marks only the first friend in a game as the list's current row, in the standard list too", () => {
    const el = drawIn(320, 320, <SteamFriends data={data} t3={SLABS} />);
    const slabs = el.querySelectorAll("li[data-wp-slab]");
    expect(slabs).toHaveLength(1);
    expect(slabs[0].textContent).toContain("Friend A");
  });

  it("crew: tabs that filter, a hexagon badge with initials per row, one current row", () => {
    const el = drawIn(420, 420, <SteamFriends data={data} lookLayout="crew" t3={SLABS} />);
    const crew = el.querySelector("[data-layout=crew]")!;
    expect(crew).not.toBeNull();
    const tabs = [...crew.querySelectorAll("[role=tab]")];
    expect(tabs.map((t) => t.textContent)).toEqual(["In-game", "Online", "All"]);
    // the in-game tab is the first with anyone in it
    expect(tabs[0].getAttribute("aria-selected")).toBe("true");
    const rows = crew.querySelectorAll("li");
    expect(rows.length).toBeGreaterThan(1);
    expect(rows[0].querySelector("[data-avatar=hex]")?.textContent).toBe("FA");
    expect(crew.querySelectorAll("li[data-wp-slab]")).toHaveLength(1);
    fireEvent.click(tabs[2]);
    expect(tabs[2].getAttribute("aria-selected")).toBe("true");
    expect(crew.querySelectorAll("li").length).toBeGreaterThanOrEqual(rows.length);
  });

  it("crewOf lists the friends a tab names; initials take two letters", () => {
    const friends = friendsOf("A B, Online, Game, now\nC, Offline, , 2 days ago\nD, Online, , now");
    expect(crewOf(friends, "ingame").map((f) => f.name)).toEqual(["A B"]);
    expect(crewOf(friends, "online").map((f) => f.name)).toEqual(["A B", "D"]);
    expect(crewOf(friends, "all")).toHaveLength(3);
    expect([initials("Mara Voss"), initials("ilya"), initials("  ")]).toEqual(["MV", "IL", "?"]);
  });
});

describe("Weather's quote slab", () => {
  it("puts the weather now on a notched slab, then the humidity and clouds on rulers and the coming days in rows", () => {
    const el = drawIn(420, 460, <Weather data={data} lookLayout="quote" />);
    const quote = el.querySelector("[data-layout=quote]")!;
    const slab = quote.querySelector("[data-layout-part=quote]")!;
    expect(slab.hasAttribute("data-wp-slab")).toBe(true);
    expect(slab.hasAttribute("data-slab-notches")).toBe(true);
    expect(slab.textContent).toContain("Brevik, Norway");
    expect(slab.textContent).toContain("5°");
    expect(quote.querySelectorAll("[data-meter=ruler]")).toHaveLength(2);
    expect(quote.querySelectorAll("ol li").length).toBeGreaterThan(0);
  });

  it("leaves the glance and week views and the standard layout as they were", () => {
    expect(drawIn(420, 460, <Weather data={data} view="glance" lookLayout="quote" />).querySelector("[data-layout]")).toBeNull();
    cleanup();
    expect(drawIn(420, 460, <Weather data={data} />).querySelector("[data-layout]")).toBeNull();
  });
});

describe("Notifications' feed", () => {
  it("tabs the history by type and draws one feed row per line, the type in its colour", () => {
    const el = drawIn(420, 460, <Notifications data={data} lookLayout="feed" />);
    const feed = el.querySelector("[data-layout=feed]")!;
    const tabs = [...feed.querySelectorAll("[role=tab]")].map((t) => t.textContent);
    expect(tabs[0]).toBe("All");
    expect(tabs).toContain("Error");
    expect(feed.querySelectorAll("li").length).toBeGreaterThan(2);
    fireEvent.click([...feed.querySelectorAll("[role=tab]")].find((t) => t.textContent === "Error")!);
    const rows = [...feed.querySelectorAll("li")];
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Backup job failed");
  });

  it("feedTabs: All, then at most three types in the order they first appear", () => {
    const line = (type: string) => ({ time: "1", type, message: "m" });
    expect(feedTabs(["A", "B", "A", "C", "D", ""].map(line)).map((t) => t.id)).toEqual(["", "A", "B", "C"]);
  });
});

describe("System Overview's power draw and the spectrum receiver", () => {
  it("power: the CPU and GPU draw as one readout over a share bar, a ruler row per section", () => {
    const el = drawIn(460, 460, <SystemOverview data={data} lookLayout="power" />);
    const power = el.querySelector("[data-layout=power]")!;
    expect(power).not.toBeNull();
    expect(power.textContent).toContain("Power draw");
    expect(power.querySelectorAll("[data-meter=ruler]").length).toBeGreaterThanOrEqual(2);
    expect(power.textContent).toMatch(/CPU.*W/);
  });

  it("spectrum: the axis reads the plugin's band layout, 30 Hz to 16 kHz", () => {
    expect(axisLabels()).toEqual(["30", "140", "690", "3.3k", "16k"]);
    expect(axisLabels(3)).toEqual(["30", "690", "16k"]);
  });
});

describe("the card anatomy (`card-style: anatomy`)", () => {
  const kind = { name: "Steam Friends", category: "Gaming", layout: "Crew roster" };
  const card = (t3: Record<string, string> | undefined) =>
    renderToString(
      <CardKindCtx.Provider value={kind}>
        <Widget title="Friends" icon="group" t3={t3} size="lg">
          <i />
        </Widget>
      </CardKindCtx.Provider>,
    );

  it("is a token only `anatomy` sets", () => {
    expect(t3Tokens({ "card-style": "anatomy" }).anatomy).toBe(true);
    expect(t3Tokens({ "card-style": "dossier" }).anatomy).toBeUndefined();
  });

  it("needs a card with room for its head and footer; a card it does not ask for draws its own header", () => {
    expect(anatomyFits(280, 240)).toBe(true);
    expect(anatomyFits(279, 400)).toBe(false);
    // before the card is measured (server render: 0 x 0) it keeps the Look's header
    expect(card({ "card-style": "anatomy" })).not.toContain("data-anatomy");
    expect(card(undefined)).not.toContain("data-anatomy");
  });

  it("draws the category over the display title with the widget's icon, and the footer chips from the catalog", () => {
    const el = drawIn(400, 400, (
      <CardKindCtx.Provider value={kind}>
        <Widget title="Friends" icon="group" t3={{ "card-style": "anatomy" }}>
          <i />
        </Widget>
      </CardKindCtx.Provider>
    ));
    const head = el.querySelector("header[data-anatomy]")!;
    expect(head.textContent).toContain("Gaming");
    expect(head.textContent).toContain("Friends");
    expect([...el.querySelectorAll("footer[data-anatomy] [data-part=chip]")].map((c) => c.textContent)).toEqual(["Steam Friends", "Crew roster"]);
  });

  it("reads the widget's name where the category only repeats the title", () => {
    expect(anatomyLabel({ name: "System Overview", category: "System" }, "System")).toBe("System Overview");
    expect(anatomyLabel(kind, "Friends")).toBe("Gaming");
    expect(renderToString(<AnatomyHeader kind={kind} title="Friends" w={400} />)).toContain("Gaming");
  });
});

describe("the Look's ring on the default Custom gauge, and its meters on Wave Link's levels", () => {
  const HEX = { "ring-style": "hex" };
  it("draws the default gauge as the Look's hexagon with the reading in its tone, one decimal at least", () => {
    const el = drawIn(320, 320, <CustomGauge data={{ cpu: 93 }} sensor="cpu" label="CPU" t3={HEX} />);
    const ring = el.querySelector("[data-ring=hex]")!;
    expect(ring).not.toBeNull();
    expect(ring.querySelector("[data-part=num]")?.textContent).toContain("93.0");
    expect(ring.querySelector("[data-part=num]")?.getAttribute("style")).toContain("color");
  });

  it("keeps a gauge the user designed, and the default under a Look with round rings", () => {
    const mine = normalizeGauge({ ...DEFAULT_GAUGE_SPEC, thickness: 6 });
    expect(drawIn(320, 320, <CustomGauge data={{ cpu: 40 }} sensor="cpu" gauge={mine} t3={HEX} />).querySelector("[data-ring]")).toBeNull();
    cleanup();
    expect(drawIn(320, 320, <CustomGauge data={{ cpu: 40 }} sensor="cpu" />).querySelector("[data-part=ring]")).toBeNull();
  });

  it("draws a lying Wave Link level as the Look's cells or ruler; a standing one keeps its own bars", () => {
    const levels = { l: { v: 50 }, r: { v: 95 } };
    const pair = (t3: Record<string, string>, vertical = false) => (
      <Widget title="Wave Link" t3={t3}>
        <MeterPair levels={levels} vertical={vertical} variant="solid" color="var(--w-accent)" hot="red" />
      </Widget>
    );
    expect(drawIn(320, 200, pair({ "meter-style": "cells" })).querySelectorAll("[data-meter=cells]")).toHaveLength(2);
    cleanup();
    expect(drawIn(320, 200, pair({ "meter-style": "ruler" })).querySelectorAll("[data-meter=ruler]")).toHaveLength(2);
    cleanup();
    expect(drawIn(320, 200, pair({ "meter-style": "cells" }, true)).querySelectorAll("[data-meter]")).toHaveLength(0);
    cleanup();
    expect(drawIn(320, 200, pair({})).querySelectorAll("[data-meter]")).toHaveLength(0);
  });
});
