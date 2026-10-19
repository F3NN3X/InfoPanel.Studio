/**
 * What every editor shares (spec §6, §10): leaving it asks first when a working copy has unsaved changes, and
 * Save to library writes the item. The page reaches `requestBack` through the editor's ref (the Gauges tab).
 */
import { useImperativeHandle, useState, type ReactNode, type Ref } from "react";
import { useToast } from "@/components/ui/toast";
import type { LibraryItem } from "@/lib/library";
import type { GaugeEdit } from "./use-gauge-edit";
import { UnsavedDialog } from "./unsaved-dialog";

/** What the page can ask of the editor: leave it (asking about unsaved changes), or run `then` instead of closing it. */
export interface EditorHandle {
  requestBack: (then?: () => void) => void;
}

export interface EditorShell {
  asking: boolean;
  saving: boolean;
  requestBack: (then?: () => void) => void;
  save: () => Promise<boolean>;
  dialog: ReactNode;
}

export function useEditorShell(p: {
  ref?: Ref<EditorHandle>;
  edit: GaugeEdit;
  /** Writes the gauge to the library item it came from, or a new one. */
  write: () => Promise<LibraryItem>;
  onBack: () => void;
  onSaved: () => void;
}): EditorShell {
  const toast = useToast();
  const { edit, onBack } = p;
  // What happens once the user has settled the question: leaving, or the page's `then`.
  const [pending, setPending] = useState<{ go: () => void } | null>(null);
  const [saving, setSaving] = useState(false);

  const requestBack = (then?: () => void) => {
    const go = then ?? onBack;
    if (edit.dirty) setPending({ go });
    else go();
  };
  useImperativeHandle(p.ref, () => ({ requestBack }));

  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      const item = await p.write();
      if (!edit.writeThrough) edit.saved({ kind: "library", itemId: item.id });
      p.onSaved();
      toast(edit.origin ? `Saved ${edit.name}` : `Saved ${edit.name} to your library`);
      return true;
    } catch (e) {
      toast(`Not saved: ${(e as Error).message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const dialog = (
    <UnsavedDialog
      open={pending !== null}
      name={edit.name}
      saving={saving}
      onCancel={() => setPending(null)}
      onDiscard={() => {
        setPending(null);
        pending?.go();
      }}
      onSave={() =>
        void save().then((ok) => {
          if (!ok) return;
          setPending(null);
          pending?.go();
        })
      }
    />
  );
  return { asking: pending !== null, saving, requestBack, save, dialog };
}
