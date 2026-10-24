/**
 * The canvas item inspector (spec §7), through the studio's InspectorView and its registry: the
 * `infopanel` context gives Draw as, Position, Sensor, the kind's field groups (from the InfoPanel
 * schema, no panel per kind), Colours and the unknown fields. A value InfoPanel would refuse is
 * shown with its message and not stored.
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { checkGeometry, editKeyOf, importOf, MOCK_DEFAULT, type GeoField } from "@/lib/infopanel/canvas-edit";
import { itemAt, setField, type Path } from "@/lib/infopanel/editor/ops";
import { valueOf } from "@/lib/infopanel/editor/registry";
import { groupId } from "@/lib/infopanel/remap/remap";
import type { DisplayItem, ItemKind } from "@/lib/infopanel/schema";
import { bindingFromRef, bindingRef, isBound, type DataApiValue } from "@/lib/infopanel/sensors";
import type { InspectorContext, InspectorSection } from "@/components/studio/inspector-model";
import { InspectorView, type SectionParts } from "@/components/studio/inspector/inspector-view";
import { ipDefault, ipGroups, ipOwn, ipShown, ipValue } from "@/components/studio/inspector/infopanel-defs";
import type { FieldsApi } from "@/components/studio/settings-panel";
import { HeaderIcon } from "@/components/studio/zone-inspector-parts";
import { describeNative } from "../native";
import { valueText } from "../remap-panel";
import { Segmented } from "./canvas-toolbar";
import { kindIcon } from "./items-tree";
import { MultiInspector } from "./multi-inspector";
import { NOT_EXPORTABLE } from "./sensor-picker";
import type { CanvasEditor } from "./use-canvas-editor";

interface ItemInspectorProps {
  editor: CanvasEditor;
  /** Live values by Data API key (the Sensor button's reading). */
  live: Readonly<Record<string, DataApiValue>>;
  onRemap: () => void;
  /** Choose a sensor for the selected item (the sensor picker). */
  onPickSensor?: () => void;
  /** The Data API's sensors by key (whether a key binds natively). */
  sensors?: Readonly<Record<string, DataApiValue>>;
  /** A Gauge item's "Edit gauge…" (opens it in Gauges). */
  onEditGauge?: (path: Path) => void;
}

const INPUT = "h-7 w-full min-w-0 rounded-[6px] border bg-ui-raised px-2 font-ui-mono text-[12px] text-ui-1 outline-none focus:border-ui-accent";
const Message = ({ children }: { children: ReactNode }) => <p className="mt-1.5 text-[11.5px] leading-snug text-ui-danger">{children}</p>;

/** The panel shell for no selection or several items. */
function Placeholder({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="px-5 py-6 font-ui">
      <div className="text-[13px] font-semibold text-ui-1">{title}</div>
      <p className="mt-1.5 text-[12px] leading-snug text-ui-4">{children}</p>
    </div>
  );
}

export function ItemInspector({ editor, live, onRemap, onPickSensor, sensors, onEditGauge }: ItemInspectorProps) {
  const { selection } = editor;
  if (selection.length === 0) {
    return (
      <Placeholder title="No item selected">
        Click an item on the canvas or in Layers. Shift or Ctrl adds to the selection; arrows nudge it, Shift+arrows by 10 px.
      </Placeholder>
    );
  }
  if (selection.length > 1) return <MultiInspector editor={editor} />;
  const path = selection[0];
  const item = itemAt(editor.committed, path);
  // Keyed by path: a draft or an error never carries over to another item.
  return item ? (
    <ItemFields key={path} editor={editor} path={path} item={item} live={live} onRemap={onRemap} onPickSensor={onPickSensor} sensors={sensors} onEditGauge={onEditGauge} />
  ) : null;
}

function ItemFields({ editor, path, item, live, onRemap, onPickSensor, sensors, onEditGauge }: ItemInspectorProps & { path: Path; item: DisplayItem }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [query, setQuery] = useState("");
  const kind = item.kind as ItemKind;
  const groups = ipGroups(kind);
  const context: InspectorContext = {
    kind: "infopanel",
    groups,
    group: item.kind === "Group",
    bound: isBound(item),
    unknown: Object.keys(item.unknown).length > 0,
  };
  const editKey = (field: string) => `canvas-field:${editor.zone.id}:${path}:${field}`;
  const setError = (field: string, reason: string | null) =>
    setErrors((e) => {
      const { [field]: _old, ...rest } = e;
      return reason ? { ...rest, [field]: reason } : rest;
    });

  const own = ipOwn(item, groups);
  const fields: FieldsApi = {
    values: { own },
    shown: (_key, def) => ipShown(item, def),
    onChange: (key, value) => {
      const r = ipValue(item, key, value);
      setError(key, r.ok ? null : r.reason);
      if (r.ok && r.value !== valueOf(item, key)) editor.setField(path, key, r.value, editKey(key));
    },
    onPatch: (patch) => {
      let next = editor.committed;
      for (const [key, value] of Object.entries(patch)) {
        const r = ipValue(item, key, value);
        setError(key, r.ok ? null : r.reason);
        if (r.ok) next = setField(next, path, key, r.value);
      }
      editor.commit(next);
    },
    onClear: (keys) => {
      keys.forEach((k) => setError(k, null));
      editor.commit(keys.reduce((next, k) => setField(next, path, k, ipDefault(item, k)), editor.committed));
    },
  };

  const errorsOf = (s: InspectorSection) => {
    const list = s.settings.filter((d) => errors[d.key]).map((d) => errors[d.key]);
    return list.length ? list.map((m) => <Message key={m}>{m}</Message>) : undefined;
  };

  const parts = (s: InspectorSection): SectionParts => {
    switch (s.special) {
      case "ipMode":
        return { body: <DrawAs editor={editor} path={path} /> };
      case "ipPosition":
        return { top: <PositionGrid editor={editor} path={path} item={item} />, bottom: errorsOf(s) };
      case "ipSensor":
        return {
          body: (
            <>
              <SensorCard editor={editor} item={item} live={live} onRemap={onRemap} onPickSensor={onPickSensor} sensors={sensors} />
              {item.kind === "Gauge" && onEditGauge && (
                <>
                  {item.Images.length === 0 && !("vector" in item) && <p className="px-4 pb-1.5 text-[11.5px] leading-snug text-ui-4">No frames yet: InfoPanel draws a gauge from its images. Edit gauge to build them.</p>}
                  <EditGaugeButton onClick={() => onEditGauge(path)} />
                </>
              )}
            </>
          ),
        };
      case "ipUnknown":
        return {
          body: (
            <div className="px-4 pb-3">
              <p className="mb-1.5 text-[11.5px] text-ui-4">Exported as they came.</p>
              <pre className="max-h-48 overflow-auto rounded-md bg-ui-raised p-2 font-ui-mono text-[11px] leading-snug text-ui-3">
                {Object.entries(item.unknown)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join("\n")}
              </pre>
            </div>
          ),
        };
      default:
        return { bottom: errorsOf(s) };
    }
  };

  const Icon = kindIcon(item.kind);
  const name = item.Name || item.kind;
  return (
    <InspectorView
      context={context}
      contextKey="infopanel"
      header={
        <div className="flex items-center gap-2.5">
          <HeaderIcon>
            <Icon />
          </HeaderIcon>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[14px] font-semibold leading-4 text-ui-1">{name}</div>
            <div className="truncate text-[11px] text-ui-4">InfoPanel · {item.kind}</div>
          </div>
        </div>
      }
      fields={fields}
      parts={parts}
      query={query}
      onQuery={setQuery}
      identity={{ icon: <Icon />, name, meta: () => `InfoPanel · ${item.kind}` }}
    />
  );
}

/** Draw as [InfoPanel | Native], then what that means for this item. */
function DrawAs({ editor, path }: { editor: CanvasEditor; path: Path }) {
  const m = editor.modes.get(path);
  if (!m) return null;
  const c = m.conversion;
  return (
    <div className="space-y-2.5 px-4 pb-3">
      <Segmented
        label="Draw as"
        value={m.state === "native" ? "native" : "infopanel"}
        options={[
          { value: "infopanel", label: "InfoPanel" },
          { value: "native", label: "Native", disabled: !c.ok, title: c.ok ? undefined : "This item can’t convert yet" },
        ]}
        onChange={(v) => editor.setField(path, "native", v === "native")}
      />
      {!c.ok ? (
        <div className="rounded-lg border border-ui-danger/40 bg-ui-danger/10 px-3 py-2 text-[12px] leading-snug text-ui-2">
          <span className="font-medium text-ui-danger">Can’t convert yet.</span> {c.reason}
        </div>
      ) : m.state === "native" ? (
        <div className="space-y-2">
          <div className="rounded-lg border border-ui-default bg-ui-raised px-3 py-2 text-[12px] leading-snug text-ui-2">
            Dashboard <span className="font-medium text-ui-1">{c.native.widget.kind}</span>: {describeNative(c.native)}
          </div>
          {c.native.lost.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ui-4">Lost while native</div>
              <ul className="space-y-0.5 text-[12px] text-ui-warning">
                {c.native.lost.map((l) => (
                  <li key={l}>· {l}</li>
                ))}
              </ul>
            </div>
          )}
          {c.native.needs.length > 0 && (
            <div>
              <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-ui-4">Uses app feature</div>
              <div className="flex flex-wrap gap-1">
                {c.native.needs.map((n) => (
                  <span key={n} className="rounded-full border border-ui-default px-2 py-0.5 text-[11px] text-ui-3">
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-[12px] leading-snug text-ui-4">Drawn as InfoPanel draws it; the dashboard theme doesn’t apply.</p>
      )}
    </div>
  );
}

/** One typed number of the position grid: a draft while typing, stored on Enter or leaving. */
function GeoInput({ label, value, onCommit }: { label: string; value: number; onCommit: (raw: string) => string | null }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    setError(onCommit(draft));
    setDraft(null);
  };
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] text-ui-4">{label}</span>
      <input
        inputMode="numeric"
        aria-label={label}
        aria-invalid={error !== null}
        value={draft ?? String(value)}
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
      {error && <Message>{error}</Message>}
    </label>
  );
}

const GRID: GeoField[] = ["X", "Y", "Width", "Height"];
const GRID_LABEL: Record<GeoField, string> = { X: "X", Y: "Y", Width: "W", Height: "H" };

function PositionGrid({ editor, path, item }: { editor: CanvasEditor; path: Path; item: DisplayItem }) {
  const has = (f: string) => valueOf(item, f) !== null;
  const set = (field: string, value: unknown) => editor.setField(path, field, value, `canvas-field:${editor.zone.id}:${path}:${field}`);
  return (
    <div className="space-y-2.5 px-4 pb-2">
      <div className="grid grid-cols-4 gap-2">
        {GRID.filter(has).map((f) => (
          <GeoInput
            key={f}
            label={GRID_LABEL[f]}
            value={Number(valueOf(item, f))}
            onCommit={(raw) => {
              const r = checkGeometry(item.kind, f, raw);
              if (!r.ok) return r.message;
              if (r.value !== valueOf(item, f)) set(f, r.value);
              return null;
            }}
          />
        ))}
      </div>
      <div className="grid grid-cols-4 items-end gap-2">
        {has("Rotation") && (
          <GeoInput
            label="Rotation"
            value={Number(valueOf(item, "Rotation"))}
            onCommit={(raw) => {
              const r = ipValue(item, "Rotation", raw.trim() === "" ? NaN : Number(raw));
              if (!r.ok) return r.reason;
              if (r.value !== valueOf(item, "Rotation")) set("Rotation", r.value);
              return null;
            }}
          />
        )}
        {has("FlipX") && (
          <label className="col-span-2 flex h-7 items-center gap-2 text-[12px] text-ui-2">
            <input
              type="checkbox"
              checked={valueOf(item, "FlipX") === true}
              onChange={(e) => set("FlipX", e.target.checked)}
              className="h-3.5 w-3.5 accent-[var(--ui-accent)]"
            />
            Flip horizontally
          </label>
        )}
      </div>
    </div>
  );
}

/** Where a bound table's column format comes from: its plugin, or InfoPanel's default when the Data API doesn't say. */
export function tableFormatNote(entry: DataApiValue | undefined): string {
  return entry?.table?.format
    ? "Table format is the plugin’s own column format."
    : "This InfoPanel build doesn’t report the plugin’s column format, so Table format keeps InfoPanel’s default.";
}

/** A Gauge item's way into Gauges, styled as the Sensor button. */
function EditGaugeButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="px-4 pb-3">
      <button
        type="button"
        onClick={onClick}
        title="Open this gauge in Gauges"
        className="flex w-full items-center gap-2.5 rounded-lg border border-ui-default bg-ui-raised px-3 py-2 text-left text-[12px] text-ui-1 hover:border-ui-strong"
      >
        Edit gauge…
      </button>
    </div>
  );
}

/**
 * The Sensor button (status, key, what InfoPanel named it, the live value; opens Remap), Choose
 * sensor, what the `.infopanel` export reads, then the mock slider.
 */
function SensorCard({
  editor,
  item,
  live,
  onRemap,
  onPickSensor,
  sensors = {},
}: {
  editor: CanvasEditor;
  item: DisplayItem;
  live: Readonly<Record<string, DataApiValue>>;
  onRemap: () => void;
  onPickSensor?: () => void;
  sensors?: Readonly<Record<string, DataApiValue>>;
}) {
  if (!isBound(item)) return null;
  const key = editKeyOf(item);
  const via = importOf(item)?.via;
  const value = key ? live[key] : undefined;
  const dot = !key ? "bg-ui-5" : via === "name" || via === "suggested" ? "bg-ui-warning" : "bg-ui-success";
  const status = !key ? (via === "unbound" ? "Left unbound" : "Not mapped") : via === "name" || via === "suggested" ? "Check the match" : "Mapped";
  const id = groupId(item);
  const min = Number(valueOf(item, "MinValue") ?? 0);
  const rawMax = Number(valueOf(item, "MaxValue") ?? 100);
  const max = rawMax > min ? rawMax : min + 100;
  const mock = editor.mock.get(id) ?? MOCK_DEFAULT;
  const native = bindingRef(item);
  const entry = key ? sensors[key] : undefined;
  // The key reads a sensor the Data API has no native id for: the export can't carry it.
  const previewOnly = entry !== undefined && !(entry.ref && bindingFromRef(entry.ref));
  return (
    <div className="space-y-3 px-4 pb-3">
      <button
        type="button"
        onClick={onRemap}
        title="Open Remap"
        className="flex w-full items-start gap-2.5 rounded-lg border border-ui-default bg-ui-raised px-3 py-2 text-left hover:border-ui-strong"
      >
        <span className={cn("mt-1.5 h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-ui-mono text-[12px] text-ui-1">{key ?? status}</span>
          <span className="block truncate text-[11px] text-ui-4">
            {key ? [status, value?.source].filter(Boolean).join(" · ") : "Remap to choose a sensor"}
          </span>
          <span className="block truncate text-[11px] text-ui-4">was {item.SensorName || "unnamed"}</span>
        </span>
        {value && <span className="shrink-0 font-ui-mono text-[12px] text-ui-2">{valueText(value)}</span>}
      </button>
      {onPickSensor && (
        <button
          type="button"
          onClick={onPickSensor}
          className="flex h-7 w-full items-center justify-center rounded-[7px] border border-ui-default bg-ui-raised text-[12px] text-ui-1 hover:border-ui-strong"
        >
          Choose sensor…
        </button>
      )}
      <p className="truncate text-[11px] text-ui-4" title={native ?? undefined}>
        InfoPanel reads <span className="font-ui-mono text-ui-3">{native ?? "no sensor"}</span>
      </p>
      {previewOnly && <p className="text-[11.5px] leading-snug text-ui-warning">{NOT_EXPORTABLE}.</p>}
      {item.kind === "TableSensor" && key && <p className="text-[11px] leading-snug text-ui-4">{tableFormatNote(entry)}</p>}
      {editor.sensorMode === "mock" && (
        <label className="block">
          <span className="mb-1 flex justify-between text-[11px] text-ui-4">
            Mock value <span className="font-ui-mono text-ui-2">{mock}</span>
          </span>
          <input
            type="range"
            aria-label="Mock value"
            min={min}
            max={max}
            value={mock}
            onChange={(e) => editor.setMock(id, Number(e.target.value))}
            className="w-full accent-[var(--ui-accent)]"
          />
        </label>
      )}
    </div>
  );
}
