/**
 * Edits the selected item's InfoPanel fields, one control per schema field,
 * grouped by the registry. Every change goes through the setter checks; a
 * value InfoPanel would ignore is shown as an error and not stored. Text
 * fields commit on Enter or leaving the field, so each change is one undo step.
 */
import { useState } from "react";
import { cssColor } from "../render/color.ts";
import type { DisplayItem } from "../schema.ts";
import type { Path } from "./ops.ts";
import { checkValue, fieldsOf, valueOf, type FieldDef } from "./registry.ts";

export interface InspectorProps {
  item: DisplayItem;
  path: Path;
  onChange(field: string, value: unknown): void;
  /** Families for the Font field's suggestions. */
  fonts?: readonly string[];
}

/** `#AARRGGBB` → `#RRGGBB` for the colour picker, which has no alpha. */
const toPicker = (c: string) => {
  const css = cssColor(c);
  const m = css && /rgb\((\d+) (\d+) (\d+)/.exec(css);
  return m ? "#" + m.slice(1, 4).map((n) => Number(n).toString(16).padStart(2, "0")).join("") : "#000000";
};
/** Keeps the colour's alpha when the picker changes the RGB. */
const fromPicker = (rgb: string, old: string) => {
  const hex = old.replace("#", "");
  const alpha = hex.length === 8 ? hex.slice(0, 2) : "FF";
  return ("#" + alpha + rgb.slice(1)).toUpperCase();
};

function Field({ def, value, onCommit, fonts }: { def: FieldDef; value: unknown; onCommit(v: unknown): string | null; fonts?: readonly string[] }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const shown = draft ?? (value === null || value === undefined ? "" : String(value));
  const commit = (v: unknown) => {
    const reason = onCommit(v);
    setError(reason);
    if (!reason) setDraft(null);
  };
  const text = (extra: object = {}) => (
    <input
      value={shown}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => draft !== null && commit(draft)}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(null);
          setError(null);
        }
      }}
      style={{ width: 160, borderColor: error ? "#f66" : undefined }}
      {...extra}
    />
  );

  let control;
  switch (def.spec.kind) {
    case "bool":
      control = <input type="checkbox" checked={value === true} onChange={(e) => commit(e.target.checked)} />;
      break;
    case "enum":
      control = (
        <select value={String(value)} onChange={(e) => commit(e.target.value)}>
          {def.spec.values!.map((v) => (
            <option key={v}>{v}</option>
          ))}
        </select>
      );
      break;
    case "color":
      control = (
        <>
          <input type="color" value={toPicker(String(value))} onChange={(e) => commit(fromPicker(e.target.value, String(value)))} />{" "}
          {text()}
        </>
      );
      break;
    default:
      control = def.name === "Font" && fonts ? text({ list: "ip-font-families" }) : text();
  }
  return (
    <tr>
      <td title={def.name}>{def.label}</td>
      <td>
        {control}
        {error && <div style={{ color: "#f66" }}>Needs {error}</div>}
      </td>
    </tr>
  );
}

export function Inspector({ item, path, onChange, fonts }: InspectorProps) {
  const defs = fieldsOf(item.kind);
  const groups = [...new Set(defs.map((d) => d.group))];
  return (
    <div style={{ minWidth: 340 }}>
      <div>
        <b>{item.kind}</b> <code>{path}</code>
      </div>
      {fonts && (
        <datalist id="ip-font-families">
          {fonts.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      )}
      {groups.map((g) => (
        <details key={g} open={g === "Item" || g === "Position" || g === "Text"}>
          <summary>{g}</summary>
          <table>
            <tbody>
              {defs
                .filter((d) => d.group === g)
                .map((d) => (
                  // Keyed by item too, so a draft never carries over to another item.
                  <Field
                    key={`${path}:${d.name}`}
                    def={d}
                    value={valueOf(item, d.name)}
                    fonts={fonts}
                    onCommit={(v) => {
                      const r = checkValue(d.spec, v);
                      if (!r.ok) return r.reason;
                      if (r.value !== valueOf(item, d.name)) onChange(d.name, r.value);
                      return null;
                    }}
                  />
                ))}
            </tbody>
          </table>
        </details>
      ))}
      {Object.keys(item.unknown).length > 0 && (
        <details>
          <summary>Unknown fields (kept as is)</summary>
          <pre>{JSON.stringify(item.unknown, null, 1)}</pre>
        </details>
      )}
    </div>
  );
}
