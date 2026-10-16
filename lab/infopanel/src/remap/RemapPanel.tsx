/**
 * The remap step: binding groups the automatic mapping could not settle, each
 * with its current key and live value. One choice fixes every item in the
 * group. Clicking a group's item count selects those items on the canvas.
 */
import { useState } from "react";
import type { DataApiValue, Match } from "../sensors.ts";
import { needsAttention, search, statusOf, suggest, type CatalogIndex, type Group, type Overrides, type Status } from "./remap.ts";

export interface RemapPanelProps {
  groups: Group[];
  resolved: ReadonlyMap<string, Match | null>;
  index: CatalogIndex;
  overrides: Overrides;
  /** A key, `""` to leave unbound, or null to drop the choice. */
  onChoose(groupId: string, key: string | null): void;
  onSelect(paths: string[]): void;
}

export const valueText = (v: DataApiValue | undefined) => {
  if (!v) return "";
  if (v.value === undefined) return v.text?.split("\n")[0] ?? "";
  const n = Math.abs(v.value) >= 100 ? v.value.toFixed(0) : String(Math.round(v.value * 100) / 100);
  return `${n} ${v.unit ?? ""}`.trim();
};

const STATUS: Record<Status, [string, string]> = {
  exact: ["exact", "#6c6"],
  chosen: ["chosen", "#6c6"],
  unbound: ["left unbound", "#999"],
  name: ["by name, check", "#fc6"],
  suggested: ["suggested, check", "#fc6"],
  unresolved: ["unresolved", "#f66"],
};

function KeyPicker({ group, index, onPick, onClose }: { group: Group; index: CatalogIndex; onPick(key: string): void; onClose(): void }) {
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const rows: { key: string; score?: number }[] = query.trim()
    ? search(index, query, 50, group).map((key) => ({ key }))
    : suggest(group, index, 12);
  const at = Math.min(cursor, rows.length - 1);
  return (
    <div style={{ border: "1px solid #555", padding: 6, margin: "4px 0" }}>
      <input
        autoFocus
        placeholder="Search keys, names, refs…"
        value={query}
        style={{ width: 360 }}
        onChange={(e) => {
          setQuery(e.target.value);
          setCursor(0);
        }}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setCursor(Math.min(at + 1, rows.length - 1));
          else if (e.key === "ArrowUp") setCursor(Math.max(at - 1, 0));
          else if (e.key === "Enter" && rows[at]) onPick(rows[at].key);
          else if (e.key === "Escape") onClose();
          else return;
          e.preventDefault();
        }}
      />{" "}
      <button onClick={() => onPick("")}>Leave unbound</button> <button onClick={onClose}>Cancel</button>
      <div>{query.trim() ? `${rows.length} matching keys` : "Suggestions"}</div>
      <table>
        <tbody>
          {rows.map((r, i) => {
            const v = index.catalog.sensors[r.key];
            return (
              <tr key={r.key} onClick={() => onPick(r.key)} style={{ cursor: "pointer", background: i === at ? "#523" : undefined }}>
                <td>
                  <code>{r.key}</code>
                </td>
                <td>{v?.name}</td>
                <td style={{ textAlign: "right" }}>{valueText(v)}</td>
                <td>{r.score !== undefined && <small>{r.score}</small>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function RemapPanel({ groups, resolved, index, overrides, onChoose, onSelect }: RemapPanelProps) {
  const [all, setAll] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const rows = groups.map((g) => {
    const match = resolved.get(g.id) ?? null;
    return { g, match, status: statusOf(g, match, overrides) };
  });
  const pending = rows.filter((r) => needsAttention(r.status));
  const shown = all ? rows : pending;
  const withRef = index.entries.some((e) => index.catalog.sensors[e.key].ref);
  const confirmable = pending.filter((r) => r.match);

  return (
    <section>
      <h3>Sensor remap</h3>
      <p>
        {groups.length} sensors, {pending.length} to check. Data API {withRef ? "with" : <b>without</b>} <code>ref</code>
        {!withRef && " (Libre and HWiNFO bindings can only match by name)"}.{" "}
        <label>
          <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> show all
        </label>{" "}
        {confirmable.length > 0 && (
          <button onClick={() => confirmable.forEach((r) => onChoose(r.g.id, r.match!.key))}>
            Confirm {confirmable.length} name matches and suggestions
          </button>
        )}
      </p>
      <table>
        <thead>
          <tr>
            <th>Binding</th>
            <th>Items</th>
            <th>Status</th>
            <th>Data API key</th>
            <th>Value</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shown.map(({ g, match, status }) => (
            <tr key={g.id}>
              <td>
                {g.type} <b>{g.sensorName}</b>
                <br />
                <small>
                  <code>{g.ref ?? "no id"}</code>
                </small>
              </td>
              <td>
                <button title="Select these items" onClick={() => onSelect(g.paths)}>
                  {g.paths.length}
                </button>
              </td>
              <td style={{ color: STATUS[status][1] }}>{STATUS[status][0]}</td>
              <td>
                {match && <code>{match.key}</code>}
                {match && <div><small>{index.catalog.sensors[match.key]?.name}</small></div>}
                {open === g.id && (
                  <KeyPicker
                    group={g}
                    index={index}
                    onClose={() => setOpen(null)}
                    onPick={(key) => {
                      onChoose(g.id, key);
                      setOpen(null);
                    }}
                  />
                )}
              </td>
              <td style={{ textAlign: "right" }}>{match && valueText(index.catalog.sensors[match.key])}</td>
              <td style={{ whiteSpace: "nowrap" }}>
                <button onClick={() => setOpen(open === g.id ? null : g.id)}>Change…</button>{" "}
                {match && (status === "name" || status === "suggested") && <button onClick={() => onChoose(g.id, match.key)}>Confirm</button>}{" "}
                {overrides.has(g.id) && <button onClick={() => onChoose(g.id, null)}>Reset</button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {shown.length === 0 && <p>Every sensor is mapped.</p>}
    </section>
  );
}
