// @vitest-environment happy-dom
// The rail's profile chip is an item of the rail editor (Top group): the list shows it, a press on it in the preview or the
// list selects it, the slot inspector edits it, the change is stored beside it in the rail's settings, and one undo step
// puts the rail back exactly as it was.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RailEditor } from "@/components/studio/pinned/rail-editor";
import { RailSlotInspector } from "@/components/studio/pinned/rail-slot-inspector";
import type { MonitorProfile, ProfileView } from "@/lib/layout";
import type { PinnedEdgeItem, PinnedItem } from "@/lib/pinned";
import { newPinnedItem, PIN_KINDS, withChipItem, withChipShown } from "@/lib/pinned-edit";
import { CHIP_SLOT_ID, chipSlot } from "@/lib/rail";

vi.stubGlobal("EventSource", class { addEventListener() {} close() {} onerror = null; onmessage = null; });
vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}"))));
afterEach(cleanup);

const pages = [{ id: "a", name: "A", placements: [] }, { id: "b", name: "B", placements: [] }];
const stored = { id: "s", name: "Stream", width: 1024, height: 600, cols: 4, rows: 3, fit: "fill", pages } as unknown as MonitorProfile;
const rail0: PinnedEdgeItem = { ...newPinnedItem(PIN_KINDS.find((k) => k.id === "rail")!), id: "rail" };

/** The editor and the inspector of the selected item over one rail item, with an undo stack as the studio's history is. */
function Harness({ log }: { log: PinnedEdgeItem[] }) {
  const [item, setItem] = useState(rail0);
  const [slot, setSlot] = useState<string | null>(null);
  const set = (next: PinnedItem) => {
    log.push(item);
    // the rail editor's changes keep the rail on its edge
    setItem(next as PinnedEdgeItem);
  };
  return (
    <>
      <button onClick={() => setItem(log.pop() ?? item)}>Undo</button>
      <RailEditor
        stored={stored}
        profile={stored as unknown as ProfileView}
        index={0}
        pageId="a"
        item={item}
        appearance={{} as never}
        themeScope={{}}
        selectedSlot={slot}
        onSelectSlot={setSlot}
        update={(fn) => set(fn(item))}
        onBack={() => {}}
        onCopy={() => {}}
        canCopy={false}
        widgets={[]}
      />
      {slot === CHIP_SLOT_ID && (
        <RailSlotInspector
          slot={chipSlot(item.placement.settings)}
          pages={pages}
          widgets={[]}
          onChange={(fn) => set(withChipItem(item, fn))}
          onRemove={() => {}}
          chip={{ shown: item.placement.settings?.chip !== false, onShown: (on) => set(withChipShown(item, on)), profileName: stored.name }}
        />
      )}
      <output data-testid="settings">{JSON.stringify(item.placement.settings ?? null)}</output>
    </>
  );
}

describe("the profile chip as a rail item", () => {
  it("is listed first in Top, selects, is edited into the rail's settings, and one undo restores the rail", () => {
    const log: PinnedEdgeItem[] = [];
    render(<Harness log={log} />);
    const row = screen.getByRole("button", { name: /The profile chip/ });
    expect(screen.getByRole("heading", { name: "Top" })).toBeTruthy();
    fireEvent.click(row);
    expect(row.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { name: "Stream" })).toBeTruthy();

    // hide its name: only that is stored, as text, beside the rail's own settings
    fireEvent.click(screen.getByRole("switch", { name: "Label under the icon" }));
    expect(JSON.parse(screen.getByTestId("settings").textContent!)).toEqual({ chipItem: JSON.stringify({ label: false }) });
    expect(chipSlot(JSON.parse(screen.getByTestId("settings").textContent!)).label).toBe(false);

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByTestId("settings").textContent).toBe("null");
  });

  it("shows the picker as its tap and hold, and stores no touch until one is chosen", () => {
    render(<Harness log={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /The profile chip/ }));
    for (const gesture of ["Tap", "Hold"]) {
      const select = screen.getByRole("combobox", { name: gesture }) as HTMLSelectElement;
      expect(select.value).toBe("");
      expect(select.selectedOptions[0].textContent).toBe("Open profiles");
    }
    // other changes never store a page action
    fireEvent.click(screen.getByRole("switch", { name: "Label under the icon" }));
    expect(screen.getByTestId("settings").textContent).not.toContain("touch");
    fireEvent.change(screen.getByRole("combobox", { name: "Tap" }), { target: { value: "page:a" } });
    expect(chipSlot(JSON.parse(screen.getByTestId("settings").textContent!)).touch).toEqual({ tap: { op: "page", to: "a" } });
  });

  it("has one text field: the profile's name until it has its own, stored as the chip's name, empty again drops it", () => {
    render(<Harness log={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /The profile chip/ }));
    const text = screen.getByRole("textbox", { name: "Text" }) as HTMLInputElement;
    expect(text.value).toBe("");
    expect(text.placeholder).toBe("Stream");
    expect(screen.queryByRole("textbox", { name: "Name" })).toBeNull();
    fireEvent.change(text, { target: { value: "Studio PC" } });
    expect(JSON.parse(screen.getByTestId("settings").textContent!)).toEqual({ chipItem: JSON.stringify({ name: "Studio PC" }) });
    expect(screen.getByRole("heading", { name: "Studio PC" })).toBeTruthy();
    fireEvent.change(text, { target: { value: "" } });
    expect(screen.getByTestId("settings").textContent).toBe("null");
  });

  it("is shown or hidden from its inspector, and the row says it is hidden", () => {
    render(<Harness log={[]} />);
    fireEvent.click(screen.getByRole("button", { name: /The profile chip/ }));
    fireEvent.click(screen.getByRole("switch", { name: "Show the profile chip" }));
    expect(screen.getByTestId("settings").textContent).toBe('{"chip":false}');
    expect(screen.getByText(/hidden/)).toBeTruthy();
  });
});
