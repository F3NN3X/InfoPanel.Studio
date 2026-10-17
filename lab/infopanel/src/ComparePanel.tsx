/**
 * The lab's editor (L1) and screenshot comparison (P0.7): the profile with an
 * editing layer (select, drag, resize), a toolbar, the item tree and the
 * inspector. A screenshot of InfoPanel's own render can be laid over it with an
 * opacity slider and a difference blend.
 */
import { useState } from "react";
import type { ParsedExport } from "@/lib/infopanel/archive.ts";
import { EditLayer } from "./editor/EditLayer.tsx";
import { Inspector } from "./editor/Inspector.tsx";
import { itemAt, setField, type Path } from "@/lib/infopanel/editor/ops.ts";
import { describeNative, isNative, type NativeLayer } from "@/components/infopanel/native.tsx";
import type { Editor } from "./editor/useEditor.ts";
import { walkItems } from "@/lib/infopanel/parse.ts";
import { ProfileView, type AssetSource } from "@/components/infopanel/ProfileView.tsx";
import type { FontCss } from "@/components/infopanel/Text.tsx";
import type { SensorState } from "@/lib/infopanel/render/scene.ts";
import type { DisplayItem } from "@/lib/infopanel/schema.ts";
import type { BoundItem } from "@/lib/infopanel/sensors.ts";

export interface ComparePanelProps {
  parsed: ParsedExport;
  editor: Editor;
  sensor(item: BoundItem): SensorState;
  now: Date;
  /** The corpus screenshot, if one matched the profile. */
  screenshot: string | null;
  /** The faces the canvas draws text with (the font plan). */
  font?: FontCss;
  /** Items drawn as dashboard widgets (native mode). */
  native?: NativeLayer;
  /** Paths that can be drawn natively, for "switch all". */
  convertible?(): Path[];
  /** The edited asset files (L6). */
  assets?: AssetSource;
}

/** Native mode of the selected item: the switch, and what converting keeps or loses (L5). */
function ModePanel({ item, path, editor, native }: { item: DisplayItem; path: Path; editor: Editor; native: NativeLayer }) {
  if (item.kind === "Group") return <p>Groups switch item by item (or use "All native" above).</p>;
  const on = isNative(item);
  const c = native.conversions.get(path);
  return (
    <div>
      <label>
        <input type="checkbox" checked={on} onChange={() => editor.set(path, "native", !on)} /> Draw as a dashboard widget
      </label>
      {on && c && !c.ok && <div style={{ color: "#fc6" }}>Stays InfoPanel: {c.reason}</div>}
      {on && c?.ok && (
        <div>
          {describeNative(c.native)}
          {c.native.widget.sensor && (
            <>
              {" "}
              reading <code>{c.native.widget.sensor}</code>
            </>
          )}
          {c.native.needs.length > 0 && <div>needs in the app: {c.native.needs.join(", ")}</div>}
          {c.native.lost.length > 0 && (
            <ul style={{ margin: "2px 0" }}>
              {c.native.lost.map((l) => (
                <li key={l}>loses {l}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** Tree order of every path, for Shift range selection. */
const flatPaths = (items: DisplayItem[], prefix = ""): Path[] =>
  items.flatMap((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    return [path, ...(item.kind === "Group" ? flatPaths(item.DisplayItems, path) : [])];
  });

function Tree({ items, prefix, editor, onSelect }: {
  items: DisplayItem[];
  prefix: string;
  editor: Editor;
  onSelect(path: Path, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }): void;
}) {
  return (
    <ul style={{ listStyle: "none", margin: 0, paddingLeft: prefix ? 16 : 0 }}>
      {items.map((item, i) => {
        const path = prefix ? `${prefix}.${i}` : String(i);
        return (
          <li key={path}>
            <label style={{ background: editor.selection.includes(path) ? "#523" : undefined, opacity: item.Hidden ? 0.5 : 1 }}>
              <input
                type="checkbox"
                title="Shown (InfoPanel's Hidden field)"
                checked={!item.Hidden}
                onChange={() => editor.set(path, "Hidden", !item.Hidden)}
              />{" "}
              <span onClick={(e) => (e.preventDefault(), onSelect(path, e))} style={{ cursor: "pointer" }}>
                <code>{path}</code> {item.kind} {item.Name}
                {item.IsLocked && " (locked)"}
              </span>
            </label>
            {item.kind === "Group" && <Tree items={item.DisplayItems} prefix={path} editor={editor} onSelect={onSelect} />}
          </li>
        );
      })}
    </ul>
  );
}

/** Sets the native flag on many items as one undo step. */
const setModes = (editor: Editor, paths: Path[], on: boolean) =>
  editor.apply(paths.reduce((items, p) => (isNative(itemAt(items, p)!) === on ? items : setField(items, p, "native", on)), editor.present));

function nativePaths(items: DisplayItem[], prefix = ""): Path[] {
  return items.flatMap((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    return [...(isNative(item) ? [path] : []), ...(item.kind === "Group" ? nativePaths(item.DisplayItems, path) : [])];
  });
}

function Toolbar({ editor, convertible }: { editor: Editor; convertible?(): Path[] }) {
  const n = editor.selection.length;
  const one = n === 1 ? itemAt(editor.present, editor.selection[0]) : undefined;
  return (
    <p>
      {convertible && (
        <>
          Mode: <button onClick={() => setModes(editor, convertible(), true)} title="Every item a dashboard widget can draw">All native where possible</button>{" "}
          <button onClick={() => setModes(editor, nativePaths(editor.present), false)}>All InfoPanel</button> ·{" "}
        </>
      )}
      <button disabled={!editor.canUndo} onClick={editor.undo} title="Ctrl+Z">Undo</button>{" "}
      <button disabled={!editor.canRedo} onClick={editor.redo} title="Ctrl+Y">Redo</button>{" "}
      · <button disabled={!n} onClick={editor.duplicate} title="Ctrl+D">Duplicate</button>{" "}
      <button disabled={n < 2} onClick={editor.group} title="Ctrl+G">Group</button>{" "}
      <button disabled={one?.kind !== "Group"} onClick={editor.ungroup} title="Ctrl+Shift+G">Ungroup</button>{" "}
      <button disabled={!one} onClick={() => editor.reorder(-1)} title="Draw earlier">Up</button>{" "}
      <button disabled={!one} onClick={() => editor.reorder(1)} title="Draw later">Down</button>{" "}
      <button disabled={!n} onClick={editor.remove} title="Delete">Delete</button>{" "}
      · {n ? `${n} selected` : "click an item to select; Shift or Ctrl adds; arrows nudge (Shift ×10)"}
    </p>
  );
}

export function ComparePanel({ parsed, editor, sensor, now, screenshot, font, native, convertible, assets }: ComparePanelProps) {
  const [zoom, setZoom] = useState(1);
  const [opacity, setOpacity] = useState(0.5);
  const [blend, setBlend] = useState<"normal" | "difference">("normal");
  const [upload, setUpload] = useState<string | null>(null);
  const [anchor, setAnchor] = useState<Path | null>(null);
  const shot = upload ?? screenshot;
  const single = editor.selection.length === 1 ? editor.selection[0] : null;
  const item = single ? itemAt(editor.items, single) : undefined;
  const fonts = [...new Set([...walkItems(editor.present)].flatMap(({ item: i }) => ("Font" in i ? [i.Font] : [])))].sort();

  const selectInTree = (path: Path, e: { shiftKey: boolean; ctrlKey: boolean; metaKey: boolean }) => {
    if (e.shiftKey && anchor) {
      const all = flatPaths(editor.present);
      const [a, b] = [all.indexOf(anchor), all.indexOf(path)].sort((x, y) => x - y);
      if (a >= 0) return editor.select(all.slice(a, b + 1));
    }
    editor.pick(path, e.ctrlKey || e.metaKey);
    setAnchor(path);
  };

  return (
    <section>
      <p>
        Zoom{" "}
        <select value={zoom} onChange={(e) => setZoom(Number(e.target.value))}>
          {[1, 0.75, 0.5, 0.25].map((z) => (
            <option key={z} value={z}>
              {z * 100}%
            </option>
          ))}
        </select>{" "}
        · InfoPanel screenshot{" "}
        {shot ? (
          <>
            <input type="range" min={0} max={1} step={0.05} value={opacity} onChange={(e) => setOpacity(Number(e.target.value))} /> {Math.round(opacity * 100)}%{" "}
            <label>
              <input type="checkbox" checked={blend === "difference"} onChange={(e) => setBlend(e.target.checked ? "difference" : "normal")} /> difference
            </label>
          </>
        ) : (
          <em>none for this profile</em>
        )}{" "}
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) setUpload(URL.createObjectURL(f));
          }}
        />
      </p>
      <Toolbar editor={editor} convertible={convertible} />
      <div style={{ overflow: "auto", maxWidth: "100%", zoom }}>
        <ProfileView
          profile={parsed.profile}
          items={editor.items}
          sensor={sensor}
          now={now}
          overlay={shot && opacity > 0 ? <img src={shot} alt="InfoPanel" style={{ display: "block", opacity, mixBlendMode: blend }} /> : null}
          controls={<EditLayer editor={editor} profileWidth={parsed.profile.Width} />}
          font={font}
          hidden={native?.hidden}
          native={native?.elements}
          assets={assets ?? parsed.assets}
        />
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <details open style={{ maxHeight: 480, overflow: "auto", minWidth: 380 }}>
          <summary>Items</summary>
          <Tree items={editor.present} prefix="" editor={editor} onSelect={selectInTree} />
        </details>
        {item && single && (
          <div>
            {native && <ModePanel item={item} path={single} editor={editor} native={native} />}
            <Inspector item={item} path={single} fonts={fonts} onChange={(field, v) => editor.set(single, field, v)} />
          </div>
        )}
      </div>
    </section>
  );
}
