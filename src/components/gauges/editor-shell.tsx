/**
 * What every editor shares (spec §6, §10): leaving it asks first when a working copy has unsaved changes, and
 * Save to library writes the item. The page reaches `requestBack` through the editor's ref (the Gauges tab).
 */
import { useImperativeHandle, useState, type ReactNode, type Ref } from "react";
import { useToast } from "@/components/ui/toast";
import type { LibraryItem } from "@/lib/library";
import type { GaugeEdit } from "./use-gauge-edit";
import { UnsavedDialog } from "./unsaved-dialog";

/** What the page can ask of the editor: leave it (asking about unsaved changes). */
export interface EditorHandle {
  requestBack: () => void;
}

export interface EditorShell {
  asking: boolean;
  saving: boolean;
  requestBack: () => void;
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
  const [asking, setAsking] = useState(false);
  const [saving, setSaving] = useState(false);

  const requestBack = () => (edit.dirty ? setAsking(true) : onBack());
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
      open={asking}
      name={edit.name}
      saving={saving}
      onCancel={() => setAsking(false)}
      onDiscard={() => {
        setAsking(false);
        onBack();
      }}
      onSave={() =>
        void save().then((ok) => {
          if (!ok) return;
          setAsking(false);
          onBack();
        })
      }
    />
  );
  return { asking, saving, requestBack, save, dialog };
}
