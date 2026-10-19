import type { SheetCard, SheetGroup } from "../category-sheet";
import type { PanelLayoutKind, SpecialSection } from "../inspector-model";

/**
 * How a panel's own cards (`usePanelSheet`) plug into the registry's
 * sections: each card id belongs to one special section. (A selected panel
 * widget has an inspector of its own, `item-model.ts`.)
 */
const CARD_SECTION: Record<string, SpecialSection> = {
  "panel:main": "panel",
  "panel:layout": "panelLayout",
  "panel:background": "panelBackground",
  "panel:widgets": "panelWidgets",
  "panel:code": "panelJson",
};

/** The cards of each special section, in sheet order. */
export function cardsBySection(groups: readonly SheetGroup[]): Map<SpecialSection, SheetCard[]> {
  const map = new Map<SpecialSection, SheetCard[]>();
  for (const card of groups.flatMap((g) => g.cards)) {
    const special = CARD_SECTION[card.id];
    if (special) map.set(special, [...(map.get(special) ?? []), card]);
  }
  return map;
}

/** What the panel's sections depend on, read off its cards. */
export function panelState(
  groups: readonly SheetGroup[],
  layout: string | undefined
): { layout: PanelLayoutKind; codeView: boolean } {
  const ids = new Set(groups.flatMap((g) => g.cards.map((c) => c.id)));
  return {
    layout: layout === "grid" || layout === "overlay" ? layout : "stack",
    codeView: ids.has("panel:code"),
  };
}
