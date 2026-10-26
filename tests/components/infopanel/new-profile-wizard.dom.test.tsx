// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewProfileWizard } from "@/components/infopanel/new-profile-wizard";
import { readStored } from "@/lib/infopanel/import/stored";
import { TEMPLATES, templateById } from "@/lib/infopanel/templates/catalog";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

const wizard = (onCreate = vi.fn(), initial?: Parameters<typeof NewProfileWizard>[0]["initial"]) =>
  render(<NewProfileWizard onCreate={onCreate} onCancel={vi.fn()} onImport={vi.fn()} initial={initial} />);
const checked = (name: string) => screen.getByRole("radio", { name }).getAttribute("aria-checked");
const next = () => fireEvent.click(screen.getByRole("button", { name: "Next" }));
const back = () => fireEvent.click(screen.getByRole("button", { name: "Back" }));
const create = () => fireEvent.click(screen.getByRole("button", { name: "Create" }));

describe("the New InfoPanel profile page", () => {
  it("offers Blank first, then every template, and creates the chosen one with its colours", () => {
    const onCreate = vi.fn();
    wizard(onCreate);
    const gallery = screen.getByRole("radiogroup", { name: "Start from" });
    // The chip starts on the size's class; All lists every template once, in sections.
    expect(checked("Standard")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    const cards = within(gallery).getAllByRole("radio");
    expect(cards).toHaveLength(TEMPLATES.length + 1);
    expect(cards[0].textContent).toBe("Blank");
    expect(cards[0].getAttribute("aria-checked")).toBe("true");
    next();
    expect(screen.queryByRole("radiogroup", { name: "Colours" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Sensors" })).toBeNull();
    expect((screen.getByRole("checkbox", { name: "Also save to Library" }) as HTMLInputElement).checked).toBe(false);
    back();

    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Start from" })).getByRole("radio", { name: /Neon/ }));
    next();
    // One dropdown per role the template reads, each unbound here (the Data API is offline).
    expect(within(screen.getByRole("group", { name: "Sensors" })).getAllByRole("combobox").length).toBeGreaterThan(4);
    const colours = screen.getByRole("radiogroup", { name: "Colours" });
    expect(within(colours).getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(within(colours).getByRole("radio", { name: /Toxic/ }));
    create();

    const [made] = onCreate.mock.calls[0];
    const own = templateById("neon")?.size ?? { width: 800, height: 480 };
    expect(made).toMatchObject({ name: "New profile", ...own });
    const read = readStored(made.stored);
    expect(read.items.length).toBeGreaterThan(4);
    expect(read.stored.palette?.accent1).toBe("#FF7CFF4D");
    // The Data API is offline here: every sensor is listed for Remap.
    expect(made.unbound).toContain("CPU load");
    expect(made.toLibrary).toBe(false);
  });

  it("picks the size a template is made for", () => {
    const onCreate = vi.fn();
    wizard(onCreate);
    const gallery = screen.getByRole("radiogroup", { name: "Start from" });
    expect(within(gallery).queryByRole("radio", { name: /Ticker/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    fireEvent.click(within(gallery).getByRole("radio", { name: /Ticker/ }));
    next();
    expect(checked("1280 × 160")).toBe("true");
    create();
    expect(onCreate.mock.calls[0][0]).toMatchObject({ width: 1280, height: 160 });
  });

  it("at a tall size a strip template is not in the size's section, and a size set here stays when one is chosen", () => {
    wizard();
    next();
    expect(checked("800 × 480")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "480 × 1920" }));
    back();
    const gallery = screen.getByRole("radiogroup", { name: "Start from" });
    expect(checked("Tall")).toBe("true");
    expect(within(gallery).getByRole("radio", { name: /Tower/ })).toBeTruthy();
    expect(within(gallery).queryByRole("radio", { name: /Ticker/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(within(screen.getByRole("region", { name: "Tall" })).queryByRole("radio", { name: /Ticker/ })).toBeNull();
    fireEvent.click(within(screen.getByRole("region", { name: "Strip" })).getByRole("radio", { name: /Ticker/ }));
    next();
    expect(checked("480 × 1920")).toBe("true");
  });

  it("a home page Create card opens on step 2 at the template's size", () => {
    const deck = templateById("deck")!;
    wizard(vi.fn(), { template: deck.id, variant: deck.variants[0].id });
    expect(screen.getByRole("heading", { name: "Size and look" })).toBeTruthy();
    const own = deck.size ?? { width: 800, height: 480 };
    expect(checked(`${own.width} × ${own.height}`)).toBe("true");
  });
});
