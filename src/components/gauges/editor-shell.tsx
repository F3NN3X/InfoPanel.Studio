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

/** Save as new: a new item under `name` instead of the one the gauge came from. */
export type WriteOptions = { asNew: true; name: string };

export interface EditorShell {
  asking: boolean;
  saving: boolean;
  requestBack: (then?: () => void) => void;
  save: () => Promise<boolean>;
  /** Save as new "<name> copy": the gauge is then linked to the new item. Null when there is no item to fork. */
  saveAsNew: (() => Promise<boolean>) | null;
  dialog: ReactNode;
}

export function useEditorShell(p: {
  ref?: Ref<EditorHandle>;
  edit: GaugeEdit;
  /** Writes the gauge to the library item it came from, or a new one. */
  write: (o?: WriteOptions) => Promise<LibraryItem & { updated?: boolean }>;
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

  const run = async (o?: WriteOptions): Promise<boolean> => {
    setSaving(true);
    try {
      const item = await p.write(o);
      if (o) edit.rename(o.name);
      edit.saved({ kind: "library", itemId: item.id });
      p.onSaved();
      toast((item.updated ?? !!edit.origin) ? `Saved ${edit.name}` : `Saved ${o?.name ?? edit.name} to your library`);
      return true;
    } catch (e) {
      toast(`Not saved: ${(e as Error).message}`);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const save = () => run();
  const saveAsNew = edit.origin || edit.saveTo ? () => run({ asNew: true, name: `${edit.name} copy` }) : null;

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
  return { asking: pending !== null, saving, requestBack, save, saveAsNew, dialog };
}
