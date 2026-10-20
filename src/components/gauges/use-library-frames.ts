/**
 * A library image-sequence gauge in the editor (spec §6): a working copy of its frames, frame rate and,
 * once converted, a vector spec, with its own undo stack. New or recoloured frames are uploaded to the asset
 * store as they are made; Save writes the item (`data.frames` and `files`). Seen by the vector editor as a
 * `GaugeEdit` once it has a spec.
 */
import { useEffect, useRef, useState } from "react";
import { ASSETS_URL } from "@/lib/assets";
import { convertSpec } from "@/lib/gauge-studio/convert";
import { replaceAt } from "@/lib/gauge-studio/frame-select";
import {
  canRedoFrames, canUndoFrames, editFrames, isFramesDirty, markFramesSaved, openFramesCopy, redoFrames, renameFrames, undoFrames,
  withFrames, withOrder, withSpeed, withVectorSpec, type FramesCopy,
} from "@/lib/gauge-studio/frames-copy";
import type { EditorOpen } from "@/lib/gauge-studio/open";
import { keepCopy, sessionCopy } from "@/lib/gauge-studio/session";
import { recolourFrames } from "@/lib/infopanel/gauges/raster";
import type { LibraryItem } from "@/lib/library";
import type { GaugeLibraryData } from "@/lib/gauge-studio/model";
import { fetchFrameFile, imageSize, readFrameFiles, uploadFrame } from "./frame-files";
import type { FramesTools } from "./frames-tools";
import type { WriteOptions } from "./editor-shell";
import { saveGauge } from "./save-gauge";
import type { GaugeEdit } from "./use-gauge-edit";

type FramesOpen = Extract<EditorOpen, { kind: "frames" }>;

export interface LibraryFramesEdit {
  edit: GaugeEdit;
  tools: FramesTools;
  save: () => Promise<LibraryItem<GaugeLibraryData>>;
}

export function useLibraryFrames(open: FramesOpen, editorId: number): LibraryFramesEdit {
  const [fc, setFc] = useState<FramesCopy>(() => sessionCopy<FramesCopy>(editorId) ?? openFramesCopy(open.name, open.origin, open.frames, open.animationSpeed));
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const latest = useRef(fc);
  latest.current = fc;
  useEffect(() => keepCopy(editorId, fc), [editorId, fc]);

  const change = (state: (s: FramesCopy["state"]) => FramesCopy["state"], key?: string) => setFc((c) => editFrames(c, state(c.state), key));

  /** Runs `work` while the tools wait; a failure is the note. */
  const run = async (what: string, work: () => Promise<void>): Promise<boolean> => {
    if (busy) return false;
    setBusy(what);
    setNote(`${what}…`);
    try {
      await work();
      setNote(null);
      return true;
    } catch (e) {
      setNote(`${what} failed: ${e instanceof Error ? e.message : String(e)}`);
      return false;
    } finally {
      setBusy(null);
    }
  };

  const { state } = fc;
  const tools: FramesTools = {
    frames: state.frames.map((f) => `${ASSETS_URL}/${f.id}`),
    animationSpeed: state.animationSpeed,
    busy,
    note,
    ready: true,
    reorder: (_what, order) => change((s) => withOrder(s, order)),
    replace: async (indexes, picked) => {
      await run("Replacing frames", async () => {
        const files = await readFrameFiles(picked.slice(0, indexes.length));
        const uploaded = await Promise.all(files.map(uploadFrame));
        change((s) => withFrames(s, replaceAt(s.frames, indexes, uploaded)));
      });
    },
    recolour: (r) =>
      run("Recolouring", async () => {
        const frames = latest.current.state.frames;
        const files = await Promise.all(frames.map(fetchFrameFile));
        const done = await recolourFrames(files, r);
        // A frame used twice came back as one file: it is uploaded once.
        const uploaded = new Map<string, Awaited<ReturnType<typeof uploadFrame>>>();
        const next = await Promise.all(
          done.map(async (f) => {
            const known = uploaded.get(f.hash) ?? (await uploadFrame(f));
            uploaded.set(f.hash, known);
            return known;
          }),
        );
        change((s) => withFrames(s, next));
      }),
    setSpeed: (fps) => change((s) => withSpeed(s, fps), "fps"),
    convert: async () => {
      await run("Converting", async () => {
        const first = latest.current.state.frames[0];
        const spec = convertSpec(await imageSize(first ? `${ASSETS_URL}/${first.id}` : null));
        change((s) => withVectorSpec(s, spec));
      });
    },
  };

  const edit: GaugeEdit = {
    name: fc.name,
    gauge: state.vector,
    entry: null,
    writeThrough: false,
    origin: fc.origin,
    saveTo: null,
    link: null,
    dirty: isFramesDirty(fc),
    history: {
      undo: () => setFc(undoFrames),
      redo: () => setFc(redoFrames),
      canUndo: canUndoFrames(fc),
      canRedo: canRedoFrames(fc),
    },
    commit: (next, key) => change((s) => withVectorSpec(s, next), key),
    rename: (name) => setFc((c) => renameFrames(c, name)),
    saved: (origin) => setFc((c) => markFramesSaved(c, origin)),
  };

  const save = (o?: WriteOptions) =>
    saveGauge({ name: fc.name, gauge: state.vector, frames: state.frames, animationSpeed: state.animationSpeed, itemId: fc.origin.itemId, ...o });

  return { edit, tools, save };
}
