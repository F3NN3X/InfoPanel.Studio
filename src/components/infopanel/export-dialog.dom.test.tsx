// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Placement } from "@/lib/layout";
import { buildFont } from "@/lib/infopanel/__fixtures__/builders";
import { ExportDialog } from "./export-dialog";

const SHUT = "b".repeat(64);
const PLAIN = "c".repeat(64);
const plainBytes = buildFont({ 1: "Plain", 2: "Regular", 13: "SIL Open Font License 1.1" }, { familyClass: 8 });

vi.mock("@/lib/desktop", () => ({ isTauri: () => false, saveBinaryFile: vi.fn() }));
vi.mock("@/lib/infopanel/canvas", async (importOriginal) => ({ ...(await importOriginal<object>()), readStoreFile: vi.fn(async () => plainBytes) }));
vi.mock("@/lib/library", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  listLibrary: vi.fn(async () => [{ id: "f1", kind: "font", name: "Plain", files: [`${"c".repeat(64)}.ttf`], meta: { hash: "c".repeat(64) }, copies: [] }]),
}));
vi.mock("@/lib/infopanel/import/session", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  openStored: vi.fn(async () => ({
    name: "Arc",
    origin: "installed",
    parsed: { profile: { Width: 800, Height: 480 }, items: [], assets: new Map(), issues: [] },
    assets: new Map(),
    restore: { fontFiles: new Map([["b".repeat(64), buildFont({ 1: "Shut", 2: "Regular" }, { familyClass: 8 })]]), missing: [], keys: new Map() },
  })),
}));

const zone = {
  id: "z",
  canvas: {
    source: { name: "Arc" },
    fonts: [
      {
        request: { font: "Shut", style: "Regular", bold: false, italic: false },
        use: "supplied",
        supplied: { hash: SHUT, file: "Shut.ttf", index: 0, family: "Shut", face: "Regular", license: "may not be redistributed" },
      },
    ],
  },
} as unknown as Placement;

const open = () => render(<ExportDialog open onOpenChange={vi.fn()} zone={zone} onBaked={vi.fn()} onDone={vi.fn()} />);

describe("Export dialog fonts", () => {
  it("tells the .infopanel export carries no fonts and InfoPanel uses the PC's", async () => {
    open();
    expect((await screen.findByText(/an \.infopanel carries no font files/)).textContent).toMatch(/fonts installed on its PC/);
    expect(screen.queryByText("Font licences")).toBeNull();
  });

  it("offers a same-category library font as the swap for a font that may not be shared", async () => {
    const user = userEvent.setup();
    open();
    await user.click(await screen.findByRole("radio", { name: /Stored form/ }));
    expect(await screen.findByText("Font licences")).toBeTruthy();
    // The restricted font starts left out; the swap control appears once the library's fonts are read.
    const group = screen.getByRole("radiogroup", { name: "Shut in the export" });
    expect(group.querySelector('[aria-checked="true"]')?.textContent).toBe("Leave out");
    const swap = await screen.findByRole("radio", { name: "Swap for…" });
    await user.click(swap);
    expect(swap.getAttribute("aria-checked")).toBe("true");
    const pick = screen.getByRole("combobox", { name: "Swap Shut for" }) as HTMLSelectElement;
    expect([...pick.options].map((o) => o.textContent)).toEqual(["Plain"]);
    expect(pick.value).toBe(PLAIN);
  });
});
