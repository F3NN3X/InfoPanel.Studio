// @vitest-environment happy-dom
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import NewPage, { type NewChoice } from "@/components/templates/new-page";
import { recentKey, type WizardKind } from "@/components/templates/recent-templates";
import { readStored } from "@/lib/infopanel/import/stored";
import { templateById } from "@/lib/infopanel/templates/catalog";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

/** The page as the studio holds it: the kind switch changes the kind it is given. */
function Studio({ start = "screen", initial, calls }: { start?: WizardKind; initial?: NewChoice; calls: Calls }) {
  const [kind, setKind] = useState<WizardKind>(start);
  return (
    <NewPage
      kind={kind}
      onKind={setKind}
      screen={{ width: 1024, height: 600 }}
      initial={initial}
      onCreateScreen={calls.screen}
      onCreateProfile={calls.profile}
      onCancel={calls.cancel}
      onSample={vi.fn()}
      onImport={vi.fn()}
    />
  );
}
type Calls = ReturnType<typeof spies>;
const spies = () => ({ screen: vi.fn(), profile: vi.fn(), cancel: vi.fn() });

/** Open the page and wait for its templates. */
async function open(start: WizardKind = "screen", initial?: NewChoice) {
  const calls = spies();
  render(<Studio start={start} initial={initial} calls={calls} />);
  // The first import of a kit is slow under test.
  await screen.findAllByRole("radio", { name: start === "ip" ? "Graphite" : "General" }, { timeout: 10000 });
  return calls;
}
const card = (name: string, group?: string) => (group ? within(screen.getByRole("radiogroup", { name: group })) : screen).getAllByRole("radio", { name })[0];
const chip = (w: number, h: number) => screen.getByRole("button", { name: `${w} × ${h}` });
const pressed = () => screen.queryAllByRole("button", { pressed: true }).map((b) => b.getAttribute("aria-label"));
const createButton = (kind: WizardKind = "screen") => screen.getByRole("button", { name: kind === "ip" ? "Create profile" : "Create screen" }) as HTMLButtonElement;

describe("the New page's size", () => {
  it("follows the card picked, at the size it shows, until a size is set here", async () => {
    const calls = await open();
    fireEvent.click(card("Ticker"));
    expect(pressed()).toEqual(["1280 × 160"]);
    expect(screen.getByText("Follows Ticker")).toBeTruthy();
    fireEvent.click(card("General", "Standard"));
    expect(pressed()).toEqual(["1024 × 600"]);

    // Set here: a later pick keeps it, and a template that doesn't fit its shape says so.
    fireEvent.click(chip(1920, 480));
    fireEvent.click(card("Gaming"));
    expect(pressed()).toEqual(["1920 × 480"]);
    expect(screen.getByText("Set by you")).toBeTruthy();
    fireEvent.click(card("Tower"));
    expect(pressed()).toEqual(["1920 × 480"]);
    fireEvent.click(screen.getByRole("button", { name: "Use its own size, 480 × 1920" }));
    expect(pressed()).toEqual(["480 × 1920"]);
    expect(screen.getByText("Follows Tower")).toBeTruthy();

    fireEvent.click(createButton());
    expect(calls.screen.mock.calls[0][0].profile).toMatchObject({ name: "Tower", width: 480, height: 1920 });
  });

  it("takes a typed size only when it is whole pixels from 1 to 8192", async () => {
    const calls = await open();
    const width = screen.getByRole("textbox", { name: "Width" });
    fireEvent.change(width, { target: { value: "0" } });
    expect(createButton().disabled).toBe(true);
    expect(screen.getByText("Whole numbers, 1 to 8192")).toBeTruthy();
    // Enter doesn't make it either.
    fireEvent.submit(width.closest("form")!);
    expect(calls.screen).not.toHaveBeenCalled();

    fireEvent.change(width, { target: { value: "1366" } });
    fireEvent.change(screen.getByRole("textbox", { name: "Height" }), { target: { value: "768" } });
    expect(pressed()).toEqual([]);
    expect(createButton().disabled).toBe(false);
    fireEvent.click(createButton());
    expect(calls.screen.mock.calls[0][0].profile).toMatchObject({ name: "General", width: 1366, height: 768 });
  });
});

describe("making it from the gallery", () => {
  it("Enter on a card and a double-click create it, the double-clicked one at the size its card shows", async () => {
    const calls = await open();
    const ticker = card("Ticker");
    ticker.focus();
    fireEvent.keyDown(ticker, { key: "Enter" });
    expect(calls.screen.mock.calls[0][0].profile).toMatchObject({ name: "Ticker", width: 1280, height: 160 });

    // Under the Strip chip every card is drawn at a strip size, General too.
    fireEvent.click(screen.getByRole("radio", { name: /^Strip/ }));
    fireEvent.doubleClick(card("General", "Strip"));
    expect(calls.screen.mock.calls[1][0].profile).toMatchObject({ name: "General", width: 1920, height: 480 });
  });

  it("Escape closes the expanded preview alone, then cancels", async () => {
    const calls = await open();
    fireEvent.click(screen.getByRole("button", { name: "Expand the preview" }));
    fireEvent.keyDown(screen.getByRole("button", { name: "Collapse" }), { key: "Escape" });
    expect(screen.queryByRole("button", { name: "Collapse" })).toBeNull();
    expect(calls.cancel).not.toHaveBeenCalled();
    fireEvent.keyDown(screen.getByRole("heading", { name: "General" }), { key: "Escape" });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(calls.cancel).toHaveBeenCalledTimes(2);
    expect(calls.screen).not.toHaveBeenCalled();
  });

  it("Blank makes an empty grid at Blank's size", async () => {
    const calls = await open();
    fireEvent.click(screen.getByRole("radio", { name: /Blank grid/ }));
    fireEvent.click(createButton());
    const [made] = calls.screen.mock.calls[0];
    expect(made.profile).toMatchObject({ name: "Blank", width: 1024, height: 600 });
    expect(made.profile.pages[0].placements).toEqual([]);
  });
});

describe("the kind switch", () => {
  it("makes a profile once switched, and a screen again after", async () => {
    const calls = await open();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "What to make" })).getByRole("radio", { name: "InfoPanel profile" }));
    expect(screen.getByRole("form", { name: "New InfoPanel profile" })).toBeTruthy();
    // General isn't a profile template: the usual one is selected.
    await screen.findAllByRole("radio", { name: "Graphite" }, { timeout: 10000 });
    expect(card("Graphite").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(createButton("ip"));
    expect(calls.screen).not.toHaveBeenCalled();
    expect(readStored(calls.profile.mock.calls[0][0].stored).items.length).toBeGreaterThan(4);

    // Meters is in both: it comes along.
    fireEvent.click(card("Meters"));
    fireEvent.click(screen.getByRole("button", { name: /A screen instead/ }));
    expect(screen.getByRole("form", { name: "New screen" })).toBeTruthy();
    await screen.findAllByRole("radio", { name: "General" }, { timeout: 10000 });
    expect(card("Meters").getAttribute("aria-checked")).toBe("true");
    fireEvent.click(createButton());
    expect(calls.screen.mock.calls[0][0].profile).toMatchObject({ name: "Meters", width: 1600, height: 300 });
  });
});

describe("a profile", () => {
  it("is made with the palette picked on its card, the sensors not found left for Remap", async () => {
    const calls = await open("ip");
    fireEvent.click(screen.getByRole("button", { name: "Neon · Toxic" }));
    expect(card("Neon").getAttribute("aria-checked")).toBe("true");
    expect(within(screen.getByRole("radiogroup", { name: "Colours" })).getByRole("radio", { name: /Toxic/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(createButton("ip"));
    const [made] = calls.profile.mock.calls[0];
    expect(made).toMatchObject({ name: "Neon", toLibrary: false });
    expect(readStored(made.stored).stored.palette?.accent1).toBe("#FF7CFF4D");
    expect(made.unbound).toContain("CPU load");
  });

  it("opens on the InfoPanel home's card at that template's size", async () => {
    const deck = templateById("deck")!;
    await open("ip", { template: deck.id, variant: deck.variants[1].id });
    expect(card("Deck").getAttribute("aria-checked")).toBe("true");
    expect(pressed()).toEqual([`${deck.size!.width} × ${deck.size!.height}`]);
  });
});

describe("Recently used", () => {
  it("survives storage it can't read, and lists what was made", async () => {
    localStorage.setItem(recentKey("screen"), "{not json");
    const calls = await open();
    expect(screen.queryByRole("radiogroup", { name: "Recently used" })).toBeNull();
    fireEvent.click(card("Ticker"));
    fireEvent.click(createButton());
    expect(calls.screen).toHaveBeenCalledTimes(1);
    expect(JSON.parse(localStorage.getItem(recentKey("screen"))!)).toEqual(["ticker"]);
    expect(within(screen.getByRole("radiogroup", { name: "Recently used" })).getByRole("radio", { name: "Ticker" })).toBeTruthy();
  });

  it("is empty when storage throws", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const calls = await open();
    expect(screen.queryByRole("radiogroup", { name: "Recently used" })).toBeNull();
    fireEvent.click(createButton());
    expect(calls.screen).toHaveBeenCalledTimes(1);
    vi.restoreAllMocks();
  });
});
