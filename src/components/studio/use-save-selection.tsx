/**
 * Save to Library on a screen's page (decision Q10): the layer menu, the Group inspector and Ctrl+Shift+S open the
 * name dialog an imported profile's page uses, and the selection goes to the Library as a component
 * (`page-model/save-selection.ts`, loaded on save).
 */
import { lazy, Suspense, useState } from "react";
import { createLibraryItem } from "@/lib/library";
import { componentItem } from "@/lib/my-library/canvas-link";
import { findNode, type PageModel } from "@/lib/page-model/model";
import type { MonitorProfile, Placement, ProfilePage } from "@/lib/layout";

const SaveComponentDialog = lazy(() => import("@/components/infopanel/edit/save-component-dialog").then((m) => ({ default: m.SaveComponentDialog })));

interface SaveSelectionDeps {
  profile: MonitorProfile;
  page: ProfilePage;
  model: PageModel;
  /** The selected nodes (the primary last). */
  selection: readonly string[];
  nameOf: (p: Placement) => string;
  toast: (message: string) => void;
}

/** The selected nodes with none inside another: what the component holds at its top. */
function topOf(model: PageModel, ids: readonly string[]): string[] {
  const inside = (id: string) => {
    for (let at = findNode(model.root, id)?.parentId ?? null; at !== null; at = findNode(model.root, at)?.parentId ?? null) if (ids.includes(at)) return true;
    return false;
  };
  return ids.filter((id) => findNode(model.root, id) && !inside(id));
}

export function useSaveSelection({ profile, page, model, selection, nameOf, toast }: SaveSelectionDeps) {
  const [open, setOpen] = useState(false);
  const top = topOf(model, selection);
  const save = (name: string) => {
    void import("@/lib/page-model/save-selection").then(({ saveSelection }) => {
      const made = saveSelection({ profile, page, model, selection, name, nameOf });
      if (!made) return toast("Select something to save as a component");
      createLibraryItem(componentItem(made.stored, name, made.roles)).then(
        () => toast(`Saved ${name} as a component in the Library`),
        (e: Error) => toast(`Not saved as a component: ${e.message}`),
      );
    });
  };
  const only = top.length === 1 ? findNode(model.root, top[0])?.node : undefined;
  const dialog = open ? (
    <Suspense fallback={null}>
      <SaveComponentDialog open onOpenChange={setOpen} count={top.length} initialName={only?.name || "Component"} onSave={save} helpArticle="library" />
    </Suspense>
  ) : null;
  return {
    /** Open the name dialog; unset with nothing selected. */
    open: top.length ? () => setOpen(true) : undefined,
    dialog,
  };
}
