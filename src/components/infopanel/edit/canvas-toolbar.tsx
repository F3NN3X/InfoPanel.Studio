/**
 * The canvas's view strip on an imported profile's page (spec §7), left to right: Draw all as, Show modes, the sensor
 * source, Compare; then Save to Library. Show modes and Compare open a strip below it. When the row does not fit, the
 * sensor source and Compare move into a "More" menu.
 */
import { useRef, useState, type ReactNode } from "react";
import { Check, Contrast, Layers, Library, MoreHorizontal, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { allMode, modeTally, type SensorMode } from "@/lib/infopanel/canvas-edit";
import { ContextMenu, type ContextMenuEntry } from "@/components/ui/context-menu";
import type { Compare } from "./edit-canvas";
import type { CanvasEditor } from "./use-canvas-editor";
import type { LibraryLink } from "./use-library-link";
import { useToolbarFit } from "./use-toolbar-fit";

function ToolButton({ icon: Icon, label, onClick, disabled, active }: { icon: LucideIcon; label: string; onClick: () => void; disabled?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[7px] text-ui-3 hover:bg-ui-hover hover:text-ui-1 disabled:pointer-events-none disabled:opacity-35",
        active && "bg-ui-active text-ui-1",
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={1.75} />
    </button>
  );
}

/** A small segmented choice ("Draw all as", "Sensors"). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T | null;
  options: { value: T; label: string; disabled?: boolean; title?: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="flex h-[30px] shrink-0 items-center gap-0.5 rounded-[8px] border border-ui-default p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          title={o.title}
          onClick={() => onChange(o.value)}
          className={cn(
            "h-full rounded-[6px] px-2.5 text-[12px] text-ui-3 hover:text-ui-1 disabled:cursor-not-allowed disabled:opacity-35",
            value === o.value && "bg-ui-active text-ui-1",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

const Sep = () => <span className="mx-1 h-5 w-px shrink-0 bg-ui-subtle" />;
/** Segment captions: only where there is room (the segments name themselves to assistive tech). */
const Label = ({ children }: { children: ReactNode }) => <span className="hidden shrink-0 text-[11.5px] text-ui-4 min-[1760px]:inline">{children}</span>;

export interface CanvasToolbarProps {
  editor: CanvasEditor;
  showModes: boolean;
  onShowModes: (on: boolean) => void;
  compare: boolean;
  onCompare: (on: boolean) => void;
  /** The Data API did not answer: the Live sensor source is off. */
  apiUnreachable: boolean;
  /** Save to Library, or Update in Library once the profile has an item. */
  library?: LibraryLink;
}

/**
 * The canvas's view strip on an imported profile's page: how its items draw (Draw all as, Show modes), where their
 * values come from (Sensors), Compare with InfoPanel's screenshot, and Save to Library for the profile. Undo, the layer
 * actions, Save as component, Remap and Delete live in the title bar, Layers, the layer menu, the keys and the page's
 * inspector (Edit v3 SPEC §8.3, decision Q10).
 */
export function CanvasToolbar({ editor, showModes, onShowModes, compare, onCompare, apiUnreachable, library }: CanvasToolbarProps) {
  const mode = allMode(editor.modes);
  const convertible = [...editor.modes.values()].some((m) => m.state !== "stuck");
  const { ref, collapsed } = useToolbarFit();
  const more = useRef<HTMLButtonElement>(null);
  const [menuAt, setMenuAt] = useState<{ x: number; y: number } | null>(null);
  const sensorOptions: { value: SensorMode; label: string; disabled?: boolean; title?: string }[] = [
    { value: "unbound", label: "Unbound", title: "As InfoPanel draws with no sensor" },
    { value: "live", label: "Live", disabled: apiUnreachable, title: apiUnreachable ? "Data API not reachable" : undefined },
    { value: "mock", label: "Mock", title: "A slider per sensor in the inspector" },
  ];
  const moreEntries: ContextMenuEntry[] = [
    {
      id: "sensors",
      label: "Sensors",
      submenu: sensorOptions.map((o) => ({
        id: `sensors-${o.value}`,
        label: o.label,
        icon: editor.sensorMode === o.value ? <Check /> : undefined,
        disabled: o.disabled,
        onSelect: () => editor.setSensorMode(o.value),
      })),
    },
    { id: "compare", label: "Compare", icon: compare ? <Check /> : <Contrast />, onSelect: () => onCompare(!compare) },
  ];
  return (
    <div ref={ref} role="toolbar" aria-label="Canvas items" className="flex h-12 shrink-0 items-center gap-1 overflow-x-auto border-b border-ui-subtle bg-ui-panel px-3 font-ui">
      <Label>Draw all as</Label>
      <Segmented
        label="Draw all as"
        value={mode}
        options={[
          { value: "infopanel", label: "InfoPanel", disabled: !convertible },
          { value: "native", label: "Native", disabled: !convertible },
        ]}
        onChange={(m) => editor.drawAll(m === "native")}
      />
      <ToolButton icon={Layers} label="Show modes" onClick={() => onShowModes(!showModes)} active={showModes} />
      <Sep />
      {!collapsed && (
        <>
          <Label>Sensors</Label>
          <Segmented<SensorMode> label="Sensors" value={editor.sensorMode} options={sensorOptions} onChange={editor.setSensorMode} />
        </>
      )}
      {!collapsed && (
        <button
          type="button"
          aria-pressed={compare}
          title="Lay InfoPanel’s screenshot over the render"
          onClick={() => onCompare(!compare)}
          className={cn(
            "flex h-[30px] shrink-0 items-center gap-1.5 rounded-[8px] border border-ui-default px-2.5 text-[12px] text-ui-2 hover:bg-ui-hover",
            compare && "border-ui-accent bg-ui-accent-soft text-ui-1",
          )}
        >
          <Contrast className="h-3.5 w-3.5" />
          Compare
        </button>
      )}
      {collapsed && (
        <button
          ref={more}
          type="button"
          aria-label="More"
          aria-haspopup="menu"
          aria-expanded={menuAt !== null}
          title="More"
          onClick={() => {
            const r = more.current!.getBoundingClientRect();
            setMenuAt({ x: r.left, y: r.bottom + 4 });
          }}
          className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[8px] border border-ui-default text-ui-2 hover:bg-ui-hover"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      )}
      {collapsed && menuAt && <ContextMenu x={menuAt.x} y={menuAt.y} entries={moreEntries} onClose={() => setMenuAt(null)} />}
      <span className="flex-1" />
      {library && (
        <button
          type="button"
          onClick={library.run}
          disabled={library.busy}
          title="Keep this profile in your Library, to start new profiles from"
          className="flex h-[30px] shrink-0 items-center gap-1.5 rounded-[8px] border border-ui-default px-2.5 text-[12px] text-ui-2 hover:bg-ui-hover disabled:opacity-50"
        >
          <Library className="h-3.5 w-3.5" />
          {library.label}
        </button>
      )}
    </div>
  );
}

/** Show modes: the legend with each mode's count. */
export function ModesStrip({ editor }: { editor: CanvasEditor }) {
  const t = modeTally(editor.modes);
  const row = (dot: string, label: string, n: number) => (
    <span className="flex items-center gap-1.5">
      <span className={cn("h-2.5 w-2.5 rounded-[3px]", dot)} />
      {label}
      <span className="font-ui-mono text-ui-4">{n}</span>
    </span>
  );
  return (
    <div className="flex h-9 shrink-0 items-center gap-5 border-b border-ui-subtle bg-ui-panel px-4 font-ui text-[12px] text-ui-2">
      {row("bg-ui-accent/60", "Native widget", t.native)}
      {row("bg-ui-warning/60", "InfoPanel", t.infopanel)}
      {row("bg-ui-danger/60", "Can’t convert yet", t.stuck)}
    </div>
  );
}

/** Compare: pick InfoPanel's screenshot, then its opacity; the blend is a difference. */
export function CompareStrip({ compare, onCompare }: { compare: Compare | null; onCompare: (next: Compare | null) => void }) {
  const file = useRef<HTMLInputElement>(null);
  return (
    <div className="flex h-10 shrink-0 items-center gap-3 border-b border-ui-subtle bg-ui-panel px-4 font-ui text-[12px] text-ui-2">
      <button
        type="button"
        onClick={() => file.current?.click()}
        className="h-7 rounded-[7px] border border-ui-default px-2.5 text-[12px] text-ui-2 hover:bg-ui-hover"
      >
        {compare ? "Change screenshot…" : "Choose InfoPanel screenshot…"}
      </button>
      <input
        ref={file}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          if (compare) URL.revokeObjectURL(compare.src);
          onCompare({ src: URL.createObjectURL(f), opacity: compare?.opacity ?? 0.5 });
        }}
      />
      {compare ? (
        <>
          <span className="text-ui-4">Opacity</span>
          <input
            type="range"
            aria-label="Screenshot opacity"
            min={0}
            max={100}
            value={Math.round(compare.opacity * 100)}
            onChange={(e) => onCompare({ ...compare, opacity: Number(e.target.value) / 100 })}
            className="w-40 accent-[var(--ui-accent)]"
          />
          <span className="font-ui-mono">{Math.round(compare.opacity * 100)} %</span>
          <span className="text-ui-4">· Difference blend</span>
        </>
      ) : (
        <span className="text-ui-4">A screenshot of the profile in InfoPanel, laid over the render: matching pixels go black.</span>
      )}
    </div>
  );
}
