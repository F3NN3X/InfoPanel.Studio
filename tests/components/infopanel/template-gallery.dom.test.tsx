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
});
