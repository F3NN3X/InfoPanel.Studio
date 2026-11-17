import { describe, expect, it, vi } from "vitest";
import { type LayerEntriesOf, layerEntries } from "@/components/widgets-page/layer-entries";
import type { ContextMenuEntry } from "@/components/ui/context-menu";

// The layer menu shared by Layers and the stage: Lock and Unlock with their key, and with two or more free blocks of one container the
// Layer flyout's Align and Distribute (the free layout), which leave the menu's own rows as many as before.

const of = (extra: Partial<LayerEntriesOf> = {}): ContextMenuEntry[] =>
  layerEntries({ at: [0], many: 1, container: false, hidden: false, locked: false, canPaste: false, canPasteStyle: false, hasChildren: false, targets: [], onCommand: vi.fn(), onMoveTo: vi.fn(), onRename: vi.fn(), onFlag: vi.fn(), ...extra });
const row = (list: ContextMenuEntry[], id: string) => list.find((e) => e !== "separator" && e.id === id) as Exclude<ContextMenuEntry, "separator">;
const ids = (list: ContextMenuEntry[] | undefined) => (list ?? []).flatMap((e) => (e === "separator" ? [] : [e.id]));

describe("the layer menu", () => {
  it("locks and unlocks, Ctrl+Shift+L, on the stage as in Layers", () => {
    const onFlag = vi.fn();
    row(of({ onFlag }), "lock").onSelect!();
    expect(onFlag).toHaveBeenCalledWith("locked", [0], true);
    const unlock = row(of({ locked: true, onFlag }), "lock");
    expect([unlock.label, unlock.hint]).toEqual(["Unlock", "Ctrl+Shift+L"]);
  });

  it("adds Align to the Layer flyout for two free blocks and Distribute for three, never a row of its own", () => {
    const onArrange = vi.fn();
    const plain = of();
    const two = of({ many: 2, arrange: 2, onArrange });
    expect(ids(plain)).toEqual(ids(two));
    expect(ids(row(plain, "layer").submenu)).not.toContain("arrange:left");
    const flyout = row(two, "layer").submenu!;
    expect(ids(flyout).filter((id) => id.startsWith("arrange:"))).toEqual(["arrange:left", "arrange:centre", "arrange:right", "arrange:top", "arrange:middle", "arrange:bottom", "arrange:distribute-h", "arrange:distribute-v"]);
    expect(row(flyout, "arrange:distribute-h").disabled).toBe(true);
    expect(row(row(of({ many: 3, arrange: 3, onArrange }), "layer").submenu!, "arrange:distribute-h").disabled).toBe(false);
    row(flyout, "arrange:middle").onSelect!();
    expect(onArrange).toHaveBeenCalledWith("middle");
  });
});
