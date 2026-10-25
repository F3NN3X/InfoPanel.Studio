// @vitest-environment happy-dom
import { fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it } from "vitest";
import { NativeExportStep } from "@/components/infopanel/native-export-step";
import { rowsOf, type Choices } from "@/lib/infopanel/export/native-choices";
import type { Placement } from "@/lib/layout";
import type { NativeChoice } from "@/lib/infopanel/native/tiers";

const zone = (id: string, module: string): Placement => ({ id, module, colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2, visible: true });
const titles: Record<string, string> = { CpuMonitor: "CPU Monitor", Fans: "Fans", Countdown: "Countdown" };
// Fans stands for a widget that can't be rebuilt yet: no module is in that state, so its row is made so here.
const rows = [zone("a", "CpuMonitor"), zone("b", "Fans"), zone("c", "Countdown")]
  .flatMap((p) => rowsOf(p, (id) => titles[id]))
  .map((r) => (r.zoneId === "b" ? { ...r, entry: { ...r.entry, built: false }, fallback: "snapshot" as const, options: ["snapshot", "leave"] as NativeChoice[] } : r));

function Harness({ stored = {} }: { stored?: Record<string, Choices> }) {
  const [choices, setChoices] = useState(stored);
  return (
    <NativeExportStep
      rows={rows}
      choices={choices}
      onChoose={(z, key, c) => setChoices((s) => ({ ...s, [z]: { ...s[z], [key]: c } }))}
      onSetAll={(c: NativeChoice) => setChoices(Object.fromEntries(rows.filter((r) => r.options.includes(c)).map((r) => [r.zoneId, { [r.key]: c }])))}
    />
  );
}

const checked = (group: string) => screen.getAllByRole("radio", { name: /./ }).filter((r) => r.closest(`[aria-label="${group}"]`) && r.getAttribute("aria-checked") === "true").map((r) => r.textContent);

describe("NativeExportStep", () => {
  it("tells the user the widgets are rebuilt and may look different, and names a widget that is left out", () => {
    render(<Harness />);
    expect(screen.getByText(/rebuilt from InfoPanel items/)).toBeTruthy();
    expect(screen.getByText("Countdown isn't compatible with InfoPanel and is left out")).toBeTruthy();
    // Left out by default; a snapshot can be picked instead, never a rebuild.
    expect(checked("Countdown in InfoPanel")).toEqual([" Leave out"]);
    const [recreate, snapshot] = screen.getByRole("radiogroup", { name: "Countdown in InfoPanel" }).querySelectorAll("button");
    expect((recreate as HTMLButtonElement).disabled).toBe(true);
    expect((snapshot as HTMLButtonElement).disabled).toBe(false);
  });

  it("defaults a rebuilt widget to Recreate and an unbuilt one to Static snapshot, with no live image anywhere", () => {
    render(<Harness />);
    expect(checked("CPU Monitor in InfoPanel")).toEqual([" Recreate"]);
    expect(checked("Fans in InfoPanel")).toEqual([" Static snapshot"]);
    expect(screen.queryByText(/live/i)).toBeNull();
    // Recreate is shown for Fans but can't be picked.
    const recreate = screen.getByRole("radiogroup", { name: "Fans in InfoPanel" }).querySelector("button")!;
    expect((recreate as HTMLButtonElement).disabled).toBe(true);
  });

  it("starts from the choices remembered on the zone", () => {
    render(<Harness stored={{ a: { zone: "leave" } }} />);
    expect(checked("CPU Monitor in InfoPanel")).toEqual([" Leave out"]);
  });

  it("changes one widget, and Set all changes every widget that offers the choice", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("radiogroup", { name: "CPU Monitor in InfoPanel" }).querySelectorAll("button")[1]);
    expect(checked("CPU Monitor in InfoPanel")).toEqual([" Static snapshot"]);
    fireEvent.click(screen.getByRole("button", { name: "Leave out" }));
    expect(checked("CPU Monitor in InfoPanel")).toEqual([" Leave out"]);
    expect(checked("Fans in InfoPanel")).toEqual([" Leave out"]);
  });
});
