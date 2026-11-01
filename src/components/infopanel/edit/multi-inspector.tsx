/**
 * The InfoPanel editor's inspector for several selected items: align them on an edge or centre,
 * spread them evenly, and the fields they all have (position, then the colours and font the
 * kinds share), each change one undo step for the whole selection. A field the items differ in
 * shows "Mixed" until it is set.
 */
import { useState, type ReactNode } from "react";
import {
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignEndHorizontal,
  AlignEndVertical,
  AlignHorizontalDistributeCenter,
  AlignStartHorizontal,
  AlignStartVertical,
  AlignVerticalDistributeCenter,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { checkGeometry } from "@/lib/infopanel/canvas-edit";
import type { AlignEdge } from "@/lib/infopanel/editor/arrange";
import { itemAt, type Path } from "@/lib/infopanel/editor/ops";
import { checkValue, labelOf, valueOf } from "@/lib/infopanel/editor/registry";
import { SCHEMAS, type DisplayItem, type FieldSpec } from "@/lib/infopanel/schema";
import type { CanvasEditor } from "./use-canvas-editor";

/** The fields a selection can share, in the order they show. */
const SHARED = ["X", "Y", "Font", "FontSize", "Color", "BackgroundColor", "FillColor", "FrameColor"] as const;

const ALIGN: { edge: AlignEdge; label: string; icon: LucideIcon }[] = [
  { edge: "left", label: "Align left", icon: AlignStartVertical },
  { edge: "centre", label: "Align centers", icon: AlignCenterVertical },
  { edge: "right", label: "Align right", icon: AlignEndVertical },
  { edge: "top", label: "Align top", icon: AlignStartHorizontal },
  { edge: "middle", label: "Align middles", icon: AlignCenterHorizontal },
  { edge: "bottom", label: "Align bottom", icon: AlignEndHorizontal },
];

const INPUT = "h-7 w-full min-w-0 rounded-[6px] border bg-ui-raised px-2 font-ui-mono text-[12px] text-ui-1 outline-none placeholder:text-ui-hint focus:border-ui-accent";

function IconButton({ icon: Icon, label, onClick, disabled }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="grid h-[30px] w-[30px] place-items-center rounded-[7px] border border-ui-default text-ui-3 hover:bg-ui-hover hover:text-ui-1 disabled:pointer-events-none disabled:opacity-35"
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}

const Heading = ({ children }: { children: ReactNode }) => <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ui-4">{children}</div>;

/** The shared fields: present on every item; position only when no group is selected (a group's X and Y move nothing). */
export function sharedFields(items: readonly DisplayItem[]): string[] {
  const groups = items.some((i) => i.kind === "Group");
  return SHARED.filter((f) => !(groups && (f === "X" || f === "Y")) && items.every((i) => f in i));
}

/** A typed value checked for every item as InfoPanel would take it: the values by path, or the first reason it is refused. */
function checkAll(paths: readonly Path[], items: readonly DisplayItem[], field: string, raw: string): { ok: true; values: Map<Path, unknown> } | { ok: false; reason: string } {
  const values = new Map<Path, unknown>();
  for (const [i, item] of items.entries()) {
    if (field === "X" || field === "Y") {
      const r = checkGeometry(item.kind, field, raw);
      if (!r.ok) return { ok: false, reason: r.message };
      values.set(paths[i], r.value);
      continue;
    }
    const spec = (SCHEMAS[item.kind] as Record<string, FieldSpec<unknown>>)[field];
    const r = checkValue(spec, raw);
    if (!r.ok) return { ok: false, reason: `InfoPanel needs ${labelOf(field)} as ${r.reason}. The value isn’t stored.` };
    values.set(paths[i], r.value);
  }
  return { ok: true, values };
}

function SharedField({ editor, paths, items, field }: { editor: CanvasEditor; paths: Path[]; items: DisplayItem[]; field: string }) {
  const values = items.map((i) => valueOf(i, field));
  const same = values.every((v) => v === values[0]);
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setDraft(null);
    if (draft.trim() === "" && !same) return setError(null);
    const r = checkAll(paths, items, field, draft);
    setError(r.ok ? null : r.reason);
    if (r.ok) editor.setFields(r.values, field);
  };
  const isColor = field.endsWith("Color");
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] text-ui-4">{labelOf(field)}</span>
      <span className="flex items-center gap-1.5">
        {isColor && same && <span aria-hidden className="h-5 w-5 shrink-0 rounded-[5px] border border-ui-default" style={{ background: argbCss(String(values[0])) }} />}
        <input
          aria-label={labelOf(field)}
          aria-invalid={error !== null}
          value={draft ?? (same ? String(values[0] ?? "") : "")}
          placeholder={same ? undefined : "Mixed"}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") {
              setDraft(null);
              setError(null);
            }
          }}
          className={cn(INPUT, error ? "border-ui-danger" : "border-ui-default")}
        />
      </span>
      {error && <p className="mt-1.5 text-[11.5px] leading-snug text-ui-danger">{error}</p>}
    </label>
  );
}

/** #AARRGGBB (InfoPanel's order) as a CSS colour for the swatch. */
function argbCss(c: string): string {
  const h = c.replace(/^#/, "");
  return h.length === 8 ? `#${h.slice(2)}${h.slice(0, 2)}` : `#${h}`;
}

export function MultiInspector({ editor }: { editor: CanvasEditor }) {
  const paths = editor.selection;
  const items = paths.map((p) => itemAt(editor.committed, p)).filter((i): i is DisplayItem => i !== undefined);
  const movable = paths.filter((p) => editor.boxes[p] && !itemAt(editor.committed, p)?.IsLocked).length;
  const fields = sharedFields(items);
  return (
    <div className="space-y-4 px-4 py-5 font-ui">
      <div>
        <div className="text-[13px] font-semibold text-ui-1">{paths.length} items selected</div>
        <p className="mt-1 text-[12px] leading-snug text-ui-4">Drag, nudge, duplicate or delete them together. Locked items stay where they are.</p>
      </div>
      <div>
        <Heading>Align</Heading>
        <div className="flex flex-wrap gap-1">
          {ALIGN.map((a) => (
            <IconButton key={a.edge} icon={a.icon} label={a.label} disabled={movable < 2} onClick={() => editor.align(a.edge)} />
          ))}
        </div>
      </div>
      <div>
        <Heading>Distribute</Heading>
        <div className="flex gap-1">
          <IconButton icon={AlignHorizontalDistributeCenter} label="Distribute across" disabled={movable < 3} onClick={() => editor.distribute("horizontal")} />
          <IconButton icon={AlignVerticalDistributeCenter} label="Distribute down" disabled={movable < 3} onClick={() => editor.distribute("vertical")} />
        </div>
      </div>
      {fields.length > 0 ? (
        <div>
          <Heading>Shared fields</Heading>
          {/* Keyed by the selection: a draft never carries over to another set of items. */}
          <div key={paths.join("\n")} className="grid grid-cols-2 gap-2">
            {fields.map((f) => (
              <SharedField key={f} editor={editor} paths={paths} items={items} field={f} />
            ))}
          </div>
        </div>
      ) : (
        <p className="text-[12px] leading-snug text-ui-4">These items share no fields. Select one item to edit its fields.</p>
      )}
    </div>
  );
}
