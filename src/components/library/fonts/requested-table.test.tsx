// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { declaredLicence } from "@/lib/infopanel/font-licence";
import type { RequestEntry } from "@/lib/infopanel/font-requests";
import { RequestedTable } from "./requested-table";

const entry = (font: string, extra: Partial<RequestEntry> = {}): RequestEntry => ({
  key: font,
  request: { font, style: "Regular", bold: false, italic: false },
  use: "infopanel",
  paths: ["0"],
  ...extra,
});
const answers = { ready: true, loader: null, resolved: new Map() };

function licenceCells(entries: RequestEntry[], declared: Map<string, ReturnType<typeof declaredLicence>>) {
  render(<RequestedTable zone={{ zoneId: "z", title: "Main", entries }} answers={answers} fonts={[]} declared={declared} onSelectItems={vi.fn()} onGet={vi.fn()} onUse={vi.fn()} />);
  return screen.getAllByRole("row").slice(1).map((row) => within(row).getAllByRole("cell")[4]);
}

describe("Fonts licence column", () => {
  it("shows what the font file declares, as declared, and a dash when it declares nothing", () => {
    const text = "Free for personal use only, ask us for anything else.";
    const cells = licenceCells(
      [entry("Open"), entry("Odd"), entry("Silent")],
      new Map([
        ["Open", declaredLicence({ licenseText: "SIL Open Font License, Version 1.1" })],
        ["Odd", declaredLicence({ licenseText: text })],
        ["Silent", null],
      ]),
    );
    expect(cells[0].textContent).toBe("OFL (declared)");
    expect(cells[1].textContent?.endsWith("(declared)")).toBe(true);
    expect(cells[1].textContent).not.toBe(text);
    expect(cells[1].querySelector("span")?.getAttribute("title")).toBe(text);
    expect(cells[2].textContent).toBe("—");
  });

  it("never turns a declaration into a review verdict", () => {
    const [cell] = licenceCells([entry("Open")], new Map([["Open", declaredLicence({ licenseText: "SIL Open Font License" })]]));
    expect(cell.textContent).not.toMatch(/May share|Check licence|Do not share/);
  });
});
