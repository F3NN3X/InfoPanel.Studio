// @vitest-environment happy-dom
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NewProfileDialog } from "@/components/infopanel/new-profile-dialog";
import { readStored } from "@/lib/infopanel/import/stored";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("offline"))));
});

describe("the New InfoPanel profile gallery", () => {
  it("offers Blank first, then every template with its colours, and creates the chosen one", () => {
    const onCreate = vi.fn();
    render(<NewProfileDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    const gallery = screen.getByRole("radiogroup", { name: "Start from" });
    // The chip starts on the size's class; All lists every template once, in sections.
    expect(screen.getByRole("radio", { name: "Standard" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    const cards = within(gallery).getAllByRole("radio");
    expect(cards).toHaveLength(TEMPLATES.length + 1);
    expect(cards[0].textContent).toBe("Blank");
    expect(cards[0].getAttribute("aria-checked")).toBe("true");
    expect(screen.queryByRole("radiogroup", { name: "Colours" })).toBeNull();
    expect(screen.queryByRole("group", { name: "Sensors" })).toBeNull();
    expect((screen.getByRole("checkbox", { name: "Also save to Library" }) as HTMLInputElement).checked).toBe(false);

    fireEvent.click(within(gallery).getByRole("radio", { name: /Neon/ }));
    // One dropdown per role the template reads, each unbound here (the Data API is offline).
    expect(within(screen.getByRole("group", { name: "Sensors" })).getAllByRole("combobox").length).toBeGreaterThan(4);
    const colours = screen.getByRole("radiogroup", { name: "Colours" });
    expect(within(colours).getAllByRole("radio")).toHaveLength(3);
    fireEvent.click(within(colours).getByRole("radio", { name: /Toxic/ }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const [made] = onCreate.mock.calls[0];
    expect(made).toMatchObject({ name: "New profile", width: 800, height: 480 });
    const read = readStored(made.stored);
    expect(read.items.length).toBeGreaterThan(4);
    expect(read.stored.palette?.accent1).toBe("#FF7CFF4D");
    // The Data API is offline here: every sensor is listed for Remap.
    expect(made.unbound).toContain("CPU load");
    expect(made.toLibrary).toBe(false);
  });

  it("picks the size a template is made for", () => {
    const onCreate = vi.fn();
    render(<NewProfileDialog open onOpenChange={vi.fn()} onCreate={onCreate} />);
    const gallery = screen.getByRole("radiogroup", { name: "Start from" });
    expect(screen.getByRole("radio", { name: "800 × 480" }).getAttribute("aria-checked")).toBe("true");
    expect(within(gallery).queryByRole("radio", { name: /Ticker/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    fireEvent.click(within(gallery).getByRole("radio", { name: /Ticker/ }));
    expect(screen.getByRole("radio", { name: "1280 × 160" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Create" }));
    expect(onCreate.mock.calls[0][0]).toMatchObject({ width: 1280, height: 160 });
  });

  it("at a tall size a strip template is not in the size's section, and choosing it switches the size", () => {
    render(<NewProfileDialog open onOpenChange={vi.fn()} onCreate={vi.fn()} />);
    const gallery = screen.getByRole("radiogroup", { name: "Start from" });
    fireEvent.click(screen.getByRole("radio", { name: "480 × 1920" }));
    expect(screen.getByRole("radio", { name: "Tall" }).getAttribute("aria-checked")).toBe("true");
    expect(within(gallery).getByRole("radio", { name: /Tower/ })).toBeTruthy();
    expect(within(gallery).queryByRole("radio", { name: /Ticker/ })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "All" }));
    expect(within(screen.getByRole("region", { name: "Tall" })).queryByRole("radio", { name: /Ticker/ })).toBeNull();
    fireEvent.click(within(screen.getByRole("region", { name: "Strip" })).getByRole("radio", { name: /Ticker/ }));
    expect(screen.getByRole("radio", { name: "1280 × 160" }).getAttribute("aria-checked")).toBe("true");
  });
});
