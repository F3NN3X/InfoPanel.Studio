/**
 * P0.7: lays a screenshot of InfoPanel's own render over the lab's, with an
 * opacity slider and a difference blend. Click an item (or pick it in the tree)
 * to outline it and see its parsed fields; items and groups can be hidden.
 */
import { useState } from "react";
import type { ParsedExport } from "./archive.ts";
import { ProfileView } from "./render/ProfileView.tsx";
import type { SensorState } from "./render/scene.ts";
import type { DisplayItem } from "./schema.ts";
import type { BoundItem } from "./sensors.ts";

export interface ComparePanelProps {
  parsed: ParsedExport;
  sensor(item: BoundItem): SensorState;
  now: Date;
  /** The corpus screenshot, if one matched the profile. */
  screenshot: string | null;
}

/** The item at a scene path ("2.0" = first child of the third item). */
export function itemAt(items: DisplayItem[], path: string): DisplayItem | undefined {
  let list = items;
  let found: DisplayItem | undefined;
  for (const i of path.split(".").map(Number)) {
    found = list[i];
    if (!found) return undefined;
    list = found.kind === "Group" ? found.DisplayItems : [];
  }
  return found;
}

function Tree({ items, prefix, hidden, selected, onToggle, onSelect }: {
  items: DisplayItem[];
  prefix: string;
  hidden: ReadonlySet<string>;
  selected: string | null;
  onToggle(path: string): void;
  onSelect(path: string): void;
}) {
  return (
    <ul style={{ listStyle: "none", margin: 0, paddingLeft: prefix ? 16 : 0 }}>
      {items.map((item, i) => {
        const path = prefix ? `${prefix}.${i}` : String(i);
        return (
          <li key={path}>
            <label style={{ background: selected === path ? "#523" : undefined, opacity: item.Hidden ? 0.5 : 1 }}>
              <input type="checkbox" checked={!hidden.has(path)} onChange={() => onToggle(path)} />{" "}
              <span onClick={(e) => (e.preventDefault(), onSelect(path))} style={{ cursor: "pointer" }}>
                <code>{path}</code> {item.kind} {item.Name}
                {item.Hidden && " (hidden in InfoPanel)"}
              </span>
            </label>
            {item.kind === "Group" && (
              <Tree items={item.DisplayItems} prefix={path} hidden={hidden} selected={selected} onToggle={onToggle} onSelect={onSelect} />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function Fields({ item, path }: { item: DisplayItem; path: string }) {
  const rows = Object.entries(item).map(([k, v]): [string, string] => [
    k,
    Array.isArray(v) ? `${v.length} items` : k === "unknown" ? JSON.stringify(v) : String(v),
  ]);
  return (
    <table>
      <caption style={{ textAlign: "left" }}>
        <code>{path}</code>
      </caption>
      <tbody>
        {rows.map(([k, v]) => (
          <tr key={k}>
            <td>{k}</td>
            <td>
              <code>{v}</code>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ComparePanel({ parsed, sensor, now, screenshot }: ComparePanelProps) {
  const [zoom, setZoom] = useState(1);
  const [opacity, setOpacity] = useState(0.5);
  const [blend, setBlend] = useState<"normal" | "difference">("normal");
  const [upload, setUpload] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set());
  const [selected, setSelected] = useState<string | null>(null);
  const shot = upload ?? screenshot;
  const item = selected ? itemAt(parsed.items, selected) : undefined;
  const toggle = (path: string) =>
    setHidden((h) => {
      const next = new Set(h);
      if (!next.delete(path)) next.add(path);
      return next;
    });

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
        />{" "}
        {hidden.size > 0 && <button onClick={() => setHidden(new Set())}>Show all</button>}
      </p>
      <div style={{ overflow: "auto", maxWidth: "100%", zoom }}>
        <ProfileView
          parsed={parsed}
          sensor={sensor}
          now={now}
          hidden={hidden}
          selected={selected}
          onPick={setSelected}
          overlay={
            shot && opacity > 0 ? (
              <img src={shot} alt="InfoPanel" style={{ display: "block", opacity, mixBlendMode: blend }} />
            ) : null
          }
        />
      </div>
      <div style={{ display: "flex", gap: 24, alignItems: "flex-start" }}>
        <details open style={{ maxHeight: 480, overflow: "auto", minWidth: 380 }}>
          <summary>Items</summary>
          <Tree items={parsed.items} prefix="" hidden={hidden} selected={selected} onToggle={toggle} onSelect={setSelected} />
        </details>
        {item && selected && <Fields item={item} path={selected} />}
      </div>
    </section>
  );
}
