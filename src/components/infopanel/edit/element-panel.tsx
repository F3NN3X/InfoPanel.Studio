/**
 * The inspector's Element section for a studio element: its spec's settings, each change checked
 * by the spec's own normalizer and committed as one step (typing coalesces). Colours are inks: a
 * palette slot, or a fixed colour from the swatch.
 */
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { coreBars } from "@/lib/infopanel/elements/create";
import { detectCores } from "@/lib/infopanel/elements/cores";
import { isSlot, SLOT_LABEL, SLOTS, slotInk, type Ink } from "@/lib/infopanel/elements/palette";
import { normalizeElement, type ElementSpec } from "@/lib/infopanel/elements/spec";
import { iconMarkupOf, iconNames, iconsLoaded, loadIcons } from "@/lib/infopanel/elements/icons";
import { updateAt, type Path } from "@/lib/infopanel/editor/ops";
import type { DisplayItem } from "@/lib/infopanel/schema";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { Toggle } from "@/components/ui/toggle";
import { fromCss, toCss } from "@/components/studio/inspector/infopanel-defs";
import { Segmented } from "./canvas-toolbar";
import type { CanvasEditor } from "./use-canvas-editor";

const INPUT = "h-7 w-full min-w-0 rounded-[6px] border border-ui-default bg-ui-raised px-2 font-ui-mono text-[12px] text-ui-1 outline-none focus:border-ui-accent";

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3 text-[12px] text-ui-2">
      <span className="shrink-0">{label}</span>
      <div className="flex min-w-0 justify-end">{children}</div>
    </div>
  );
}

/** A number, stored on Enter or leaving; the spec's normalizer keeps it in range. */
function NumberField({ label, value, onCommit }: { label: string; value: number; onCommit: (n: number) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft.trim());
    if (draft.trim() !== "" && Number.isFinite(n)) onCommit(n);
    setDraft(null);
  };
  return (
    <Row label={label}>
      <input
        aria-label={label}
        inputMode="decimal"
        value={draft ?? String(Math.round(value * 100) / 100)}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") setDraft(null);
        }}
        className={cn(INPUT, "w-[84px]")}
      />
    </Row>
  );
}

/** A palette slot or a fixed colour; the swatch picks a fixed one and keeps the colour's alpha. */
export function InkField({ label, ink, palette, onChange }: { label: string; ink: Ink; palette: CanvasEditor["palette"]; onChange: (ink: Ink) => void }) {
  return (
    <Row label={label}>
      <div className="flex items-center gap-1.5">
        <select
          aria-label={`${label} colour`}
          value={ink.slot ?? ""}
          onChange={(e) => onChange(isSlot(e.target.value) ? slotInk(palette, e.target.value) : { color: ink.color })}
          className={cn(INPUT, "w-[112px] font-ui")}
        >
          <option value="">Fixed</option>
          {SLOTS.map((s) => (
            <option key={s} value={s}>
              {SLOT_LABEL[s]}
            </option>
          ))}
        </select>
        <label className="relative h-[22px] w-[22px] shrink-0 cursor-pointer overflow-hidden rounded-md border border-ui-strong" style={{ backgroundColor: toCss(ink.color) }}>
          <input
            type="color"
            aria-label={`${label} swatch`}
            value={toCss(ink.color) || "#000000"}
            onChange={(e) => onChange({ color: fromCss(e.currentTarget.value, ink.color) })}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
    </Row>
  );
}

/** One to `max` colours: a solid fill, or the stops of a gradient. */
function InksField({ label, inks, max, palette, onChange }: { label: string; inks: Ink[]; max: number; palette: CanvasEditor["palette"]; onChange: (inks: Ink[]) => void }) {
  return (
    <div className="space-y-1">
      {inks.map((ink, i) => (
        <InkField key={i} label={inks.length > 1 ? `${label} ${i + 1}` : label} ink={ink} palette={palette} onChange={(next) => onChange(inks.map((x, k) => (k === i ? next : x)))} />
      ))}
      <div className="flex justify-end gap-2 text-[11.5px]">
        {inks.length < max && (
          <button type="button" onClick={() => onChange([...inks, inks.at(-1)!])} className="text-ui-3 hover:text-ui-1">
            {inks.length === 1 ? "Make a gradient" : "Add a stop"}
          </button>
        )}
        {inks.length > 1 && (
          <button type="button" onClick={() => onChange(inks.slice(0, -1))} className="text-ui-3 hover:text-ui-1">
            {inks.length === 2 ? "Solid" : "Remove a stop"}
          </button>
        )}
      </div>
    </div>
  );
}

function SwitchRow({ label, on, onChange }: { label: string; on: boolean; onChange: (on: boolean) => void }) {
  return (
    <Row label={label}>
      <Toggle checked={on} onChange={onChange} label={label} />
    </Row>
  );
}

/** The Icon element's searchable icon list. */
function IconPicker({ value, onPick }: { value: string; onPick: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const [ready, setReady] = useState(iconsLoaded);
  useEffect(() => {
    let live = true;
    void loadIcons().then(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  const names = useMemo(() => {
    const all = ready ? iconNames() : [];
    const q = query.trim().toLowerCase().replace(/\s+/g, "-");
    return q ? all.filter((n) => n.includes(q)) : all;
  }, [query, ready]);
  return (
    <div className="space-y-1.5">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-2 top-1.5 h-4 w-4 text-ui-4" />
        <input aria-label="Search icons" placeholder="Search icons" value={query} onChange={(e) => setQuery(e.target.value)} className={cn(INPUT, "pl-7 font-ui")} />
      </label>
      <div role="listbox" aria-label="Icons" className="grid max-h-44 grid-cols-8 gap-1 overflow-y-auto">
        {names.map((n) => (
          <button
            key={n}
            type="button"
            role="option"
            aria-selected={n === value}
            title={n}
            aria-label={n}
            onClick={() => onPick(n)}
            className={cn("grid h-7 place-items-center rounded-[6px] text-ui-2 hover:bg-ui-hover", n === value && "bg-ui-active text-ui-1")}
          >
            <svg
              viewBox="0 0 24 24"
              width={16}
              height={16}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: the icon set's own generated markup, never user text.
              dangerouslySetInnerHTML={{ __html: iconMarkupOf(n) }}
            />
          </button>
        ))}
        {names.length === 0 && <p className="col-span-8 py-1 text-[11.5px] text-ui-4">{ready ? "No icon matches." : "Loading icons…"}</p>}
      </div>
    </div>
  );
}

interface ElementPanelProps {
  editor: CanvasEditor;
  path: Path;
  item: DisplayItem;
  spec: ElementSpec;
  /** The Data API's sensors by key (Cores finds the machine's cores there). */
  sensors: Readonly<Record<string, DataApiValue>>;
}

export function ElementPanel({ editor, path, item, spec, sensors }: ElementPanelProps) {
  const { palette } = editor;
  const key = (field: string) => `canvas-element:${editor.zone.id}:${path}:${field}`;
  const set = (patch: Record<string, unknown>, field = Object.keys(patch)[0]) => {
    const next = normalizeElement({ ...spec, ...patch });
    if (next) editor.setElement(path, next, key(field));
  };
  const num = (label: string, field: string, value: number) => <NumberField key={field} label={label} value={value} onCommit={(n) => set({ [field]: n })} />;
  const ink = (label: string, field: string, value: Ink) => <InkField key={field} label={label} ink={value} palette={palette} onChange={(v) => set({ [field]: v })} />;
  const direction = (value: "horizontal" | "vertical") => (
    <Row label="Direction">
      <Segmented
        label="Direction"
        value={value}
        options={[
          { value: "horizontal", label: "Across" },
          { value: "vertical", label: "Down" },
        ]}
        onChange={(v) => set({ orientation: v })}
      />
    </Row>
  );

  let body: ReactNode;
  switch (spec.type) {
    case "ring":
      body = (
        <>
          {num("Start (°)", "start", spec.start)}
          {num("Sweep (°)", "sweep", spec.sweep)}
          {num("Thickness", "thickness", spec.thickness)}
          {ink("Track", "track", spec.track)}
          <InksField label="Fill" inks={spec.fill} max={3} palette={palette} onChange={(fill) => set({ fill })} />
          <SwitchRow label="Round caps" on={spec.rounded} onChange={(rounded) => set({ rounded })} />
          <SwitchRow label="End dot" on={spec.dot} onChange={(dot) => set({ dot })} />
          {num("Ticks", "ticks", spec.ticks)}
          {num("LED segments", "segments", spec.segments)}
          {spec.segments > 0 && num("Gap (°)", "gap", spec.gap)}
          {num("Glow", "glow", spec.glow)}
        </>
      );
      break;
    case "ledbar":
      body = (
        <>
          {direction(spec.orientation)}
          {num("Segments", "segments", spec.segments)}
          {num("Gap", "gap", spec.gap)}
          {num("Corner radius", "radius", spec.radius)}
          {ink("Track", "track", spec.track)}
          <InksField label="Fill" inks={spec.fill} max={3} palette={palette} onChange={(fill) => set({ fill })} />
          {num("Glow", "glow", spec.glow)}
        </>
      );
      break;
    case "card":
      body = (
        <>
          {num("Corner radius", "radius", spec.radius)}
          <InksField label="Fill" inks={spec.fill} max={2} palette={palette} onChange={(fill) => set({ fill })} />
          {spec.fill.length > 1 && num("Gradient angle (°)", "angle", spec.angle)}
          <SwitchRow label="Stroke" on={spec.stroke !== null} onChange={(on) => set({ stroke: on ? slotInk(palette, "track") : null })} />
          {spec.stroke && ink("Stroke colour", "stroke", spec.stroke)}
          <SwitchRow label="Drop shadow" on={spec.shadow !== null} onChange={(on) => set({ shadow: on ? { blur: 12, dx: 0, dy: 4, color: { color: "#80000000" } } : null })} />
          {spec.shadow && (
            <>
              <NumberField label="Shadow blur" value={spec.shadow.blur} onCommit={(blur) => set({ shadow: { ...spec.shadow, blur } }, "shadow-blur")} />
              <NumberField label="Shadow X" value={spec.shadow.dx} onCommit={(dx) => set({ shadow: { ...spec.shadow, dx } }, "shadow-dx")} />
              <NumberField label="Shadow Y" value={spec.shadow.dy} onCommit={(dy) => set({ shadow: { ...spec.shadow, dy } }, "shadow-dy")} />
              <InkField label="Shadow colour" ink={spec.shadow.color} palette={palette} onChange={(color) => set({ shadow: { ...spec.shadow, color } }, "shadow-color")} />
            </>
          )}
          <SwitchRow label="Outer glow" on={spec.glow !== null} onChange={(on) => set({ glow: on ? { blur: 16, color: slotInk(palette, "accent1") } : null })} />
          {spec.glow && (
            <>
              <NumberField label="Glow blur" value={spec.glow.blur} onCommit={(blur) => set({ glow: { ...spec.glow, blur } }, "glow-blur")} />
              <InkField label="Glow colour" ink={spec.glow.color} palette={palette} onChange={(color) => set({ glow: { ...spec.glow, color } }, "glow-color")} />
            </>
          )}
        </>
      );
      break;
    case "glow":
      body = (
        <>
          {ink("Colour", "color", spec.color)}
          <NumberField label="Strength (%)" value={spec.alpha * 100} onCommit={(n) => set({ alpha: n / 100 })} />
          {num("Radius", "radius", spec.radius)}
        </>
      );
      break;
    case "divider":
      body = (
        <>
          {direction(spec.orientation)}
          <Row label="Thickness">
            <Segmented
              label="Thickness"
              value={String(spec.thickness) as "1" | "2"}
              options={[
                { value: "1", label: "1 px" },
                { value: "2", label: "2 px" },
              ]}
              onChange={(v) => set({ thickness: Number(v) })}
            />
          </Row>
          <InksField label="Colour" inks={spec.fill} max={2} palette={palette} onChange={(fill) => set({ fill })} />
        </>
      );
      break;
    case "icon":
      body = (
        <>
          {ink("Colour", "color", spec.color)}
          <p className="text-[11.5px] text-ui-4">Its size is the item’s W and H.</p>
          <IconPicker value={spec.name} onPick={(name) => set({ name })} />
        </>
      );
      break;
    case "cores": {
      const found = detectCores(sensors);
      body = (
        <>
          {direction(spec.orientation)}
          {num("Width", "width", spec.width)}
          {num("Height", "height", spec.height)}
          {num("Gap", "gap", spec.gap)}
          {num("Corner radius", "radius", spec.radius)}
          {ink("Track", "track", spec.track)}
          {ink("Fill", "fill", spec.fill)}
          {found.length === 0 ? (
            <p className="text-[11.5px] leading-snug text-ui-warning">
              This machine’s cores weren’t found: the Data API reports no per-core CPU load (LibreHardwareMonitor’s Core loads). The bars are placeholders and export unbound.
            </p>
          ) : (
            <p className="text-[11.5px] leading-snug text-ui-4">{found.length} cores found in the Data API.</p>
          )}
          <button
            type="button"
            disabled={found.length === 0}
            onClick={() => editor.commit(updateAt(editor.committed, path, (g) => (g.kind === "Group" ? { ...g, DisplayItems: coreBars(editor.open.profile, palette, found) } : g)))}
            className="flex h-7 w-full items-center justify-center rounded-[7px] border border-ui-default bg-ui-raised text-[12px] text-ui-1 hover:border-ui-strong disabled:opacity-50"
          >
            Find the cores again
          </button>
        </>
      );
      break;
    }
    case "sparkline":
      body = (
        <>
          <Row label="Style">
            <Segmented
              label="Style"
              value={spec.style}
              options={[
                { value: "line", label: "Line" },
                { value: "area", label: "Area" },
              ]}
              onChange={(style) => set({ style })}
            />
          </Row>
          {ink("Colour", "color", spec.color)}
          <SwitchRow label="End dot" on={spec.dot} onChange={(dot) => set({ dot })} />
          {spec.style === "area" && <SwitchRow label="Gradient fill" on={spec.gradient} onChange={(gradient) => set({ gradient })} />}
          <p className="text-[11.5px] leading-snug text-ui-4">InfoPanel draws its own Graph: the end dot and a gradient fill show only in the studio.</p>
        </>
      );
      break;
  }
  return (
    <div className="space-y-1.5 px-4 pb-3" data-element={spec.type} data-kind={item.kind}>
      {body}
    </div>
  );
}
