/**
 * The inspector with nothing selected on an imported profile's page (Edit v3 SPEC §10.1): the page header, GRID with
 * Snap items to grid, then Name, Size, Columns × rows, Background, Palette and Fonts, and Remap sensors (decision
 * Q10); under them the rest of the profile's own settings, every field InfoPanel's export carries. A typed value goes
 * through the same setter checks as an item field (`checkValue` over `PROFILE`): a refused one is shown with its
 * message and not stored. Resizing keeps every item where it is.
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { checkValue } from "@/lib/infopanel/editor/registry";
import { PROFILE, type Profile } from "@/lib/infopanel/schema";
import { Toggle } from "@/components/ui/toggle";
import { fromCss, toCss } from "@/components/studio/inspector/infopanel-defs";
import type { CanvasEditor } from "./use-canvas-editor";
import { dotnetFloat } from "@/lib/infopanel/export/write";
import { argbOf, SLOT_LABEL, SLOTS, type Slot } from "@/lib/infopanel/elements/palette";
import { ColsRows, PageHeader, PageRow, SnapSection } from "@/components/studio/page-settings-parts";
import { Cable } from "lucide-react";
import type { DisplayItem } from "@/lib/infopanel/schema";

type Field = keyof typeof PROFILE;

const INPUT = "h-7 w-full min-w-0 rounded-[6px] border bg-ui-raised px-2 font-ui-mono text-[12px] text-ui-1 outline-none focus:border-ui-accent";

const LABEL: Partial<Record<Field, string>> = {
  BackgroundColor: "Background",
  FontSize: "Font size",
  Color: "Text colour",
  FontScale: "Font scale",
  ShowFps: "Show FPS",
  OpenGL: "OpenGL",
  WebViewEnabled: "Show a web page",
  WebViewUrl: "URL",
  WebViewInteractive: "Interactive",
  WebViewDisableCache: "Disable cache",
  WebViewAutoRefreshSeconds: "Refresh every (s)",
  WebViewMaxFps: "Max FPS",
};

const SECTIONS: { title: string; fields: Field[]; note?: string }[] = [
  { title: "Text and colour", fields: ["Font", "FontSize", "Color", "FontScale"], note: "New text items take the font, size and colour." },
  { title: "Display", fields: ["ShowFps", "OpenGL"] },
  {
    title: "Web view",
    fields: ["WebViewEnabled", "WebViewUrl", "WebViewInteractive", "WebViewDisableCache", "WebViewAutoRefreshSeconds", "WebViewMaxFps"],
    note: "InfoPanel shows the page instead of the items. Refresh 0 is off; Max FPS 0 follows the display and needs a newer InfoPanel.",
  },
];

const Message = ({ children }: { children: ReactNode }) => <p className="mt-1 text-[11.5px] leading-snug text-ui-danger">{children}</p>;

/** A typed text or number, stored on Enter or leaving; `inline` puts the label beside it, as a page row. */
function TypedField({ field, value, onCommit, inline = false }: { field: Field; value: unknown; onCommit: (raw: string) => string | null; inline?: boolean }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = LABEL[field] ?? field;
  const commit = () => {
    if (draft === null) return;
    setError(onCommit(draft));
    setDraft(null);
  };
  return (
    <label className={inline ? "flex min-w-0 flex-wrap items-center justify-between gap-x-2 text-[12px]" : "block min-w-0"}>
      <span className={inline ? "shrink-0 text-ui-4" : "mb-1 block text-[11px] text-ui-4"}>{label}</span>
      <input
        aria-label={label}
        aria-invalid={error !== null}
        inputMode={PROFILE[field].kind === "string" ? undefined : "decimal"}
        value={draft ?? (PROFILE[field].kind === "float" && typeof value === "number" ? dotnetFloat(value) : String(value ?? ""))}
        placeholder={field === "Font" ? "InfoPanel’s default" : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") commit();
          if (e.key === "Escape") {
            setDraft(null);
            setError(null);
          }
        }}
        className={cn(INPUT, inline && "w-[150px] text-right", error ? "border-ui-danger" : "border-ui-default")}
      />
      {error && <Message>{error}</Message>}
    </label>
  );
}

/** An #AARRGGBB colour: typed, or picked with the swatch (which keeps the alpha). */
function ColourField({ field, value, onSet, onCommit, inline = false }: { field: Field; value: string; onSet: (v: string) => void; onCommit: (raw: string) => string | null; inline?: boolean }) {
  const label = LABEL[field] ?? field;
  return (
    <div className={cn("flex gap-2", inline ? "items-center" : "items-end")}>
      <div className="min-w-0 flex-1">
        <TypedField field={field} value={value} onCommit={onCommit} inline={inline} />
      </div>
      <label className="relative mb-[3px] h-[22px] w-[22px] shrink-0 cursor-pointer overflow-hidden rounded-md border border-ui-strong" style={{ backgroundColor: toCss(value) }}>
        <input
          type="color"
          aria-label={`${label} swatch`}
          value={toCss(value) || "#000000"}
          onChange={(e) => onSet(fromCss(e.currentTarget.value, value))}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

/** One palette slot: typed as #AARRGGBB (or #RRGGBB), or picked with the swatch (which keeps the alpha). */
function PaletteRow({ slot, value, onSet }: { slot: Slot; value: string; onSet: (v: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commit = () => {
    if (draft === null) return;
    const c = argbOf(draft);
    setError(c ? null : "A colour is #RRGGBB or #AARRGGBB. The value isn’t stored.");
    if (c) onSet(c);
    setDraft(null);
  };
  return (
    <div>
      <div className="flex items-center gap-2">
        <span className="w-[72px] shrink-0 text-[12px] text-ui-2">{SLOT_LABEL[slot]}</span>
        <input
          aria-label={`Palette ${SLOT_LABEL[slot]}`}
          value={draft ?? value}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") commit();
            if (e.key === "Escape") setDraft(null);
          }}
          className={cn(INPUT, error ? "border-ui-danger" : "border-ui-default")}
        />
        <label className="relative h-[22px] w-[22px] shrink-0 cursor-pointer overflow-hidden rounded-md border border-ui-strong" style={{ backgroundColor: toCss(value) }}>
          <input
            type="color"
            aria-label={`Palette ${SLOT_LABEL[slot]} swatch`}
            value={toCss(value) || "#000000"}
            onChange={(e) => onSet(fromCss(e.currentTarget.value, value))}
            className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          />
        </label>
      </div>
      {error && <Message>{error}</Message>}
    </div>
  );
}

interface ProfileSettingsProps {
  editor: CanvasEditor;
  /** The page it is (its name, Snap items to grid, the screen's Columns × rows); none on a canvas shown alone. */
  page?: {
    name: string;
    snapItems: boolean;
    onSnapItems: (on: boolean) => void;
    cols: number;
    rows: number;
    onGrid: (cols: number, rows: number) => void;
  };
  /** Remap sensors (decision Q10), and how many binding groups still need a look. */
  onRemap?: () => void;
  remapCount?: number;
}

/** The fonts the profile's items use, as InfoPanel names them, each once. */
export function fontsOf(items: readonly DisplayItem[]): string[] {
  const out = new Set<string>();
  const walk = (list: readonly DisplayItem[]) => {
    for (const it of list) {
      if (it.kind === "Group") walk(it.DisplayItems);
      const font = (it as { Font?: unknown }).Font;
      if (typeof font === "string" && font.trim()) out.add(font.trim());
    }
  };
  walk(items);
  return [...out];
}

export function ProfileSettings({ editor, page, onRemap, remapCount = 0 }: ProfileSettingsProps) {
  const { profile } = editor.open;
  const key = (f: Field) => `canvas-profile:${editor.zone.id}:${f}`;
  const commit = (f: Field, raw: unknown): string | null => {
    const r = checkValue(PROFILE[f], raw);
    if (!r.ok) return `InfoPanel needs ${LABEL[f] ?? f} as ${r.reason}. The value isn’t stored.`;
    editor.setProfile(f as keyof Profile, r.value, key(f));
    return null;
  };
  const row = (f: Field) => {
    const spec = PROFILE[f];
    const value = profile[f as keyof Profile];
    if (spec.kind === "bool") {
      return (
        <div key={f} className="flex h-7 items-center justify-between gap-2 text-[12px] text-ui-2">
          {LABEL[f] ?? f}
          <Toggle checked={value === true} onChange={(on) => commit(f, on)} label={LABEL[f] ?? f} />
        </div>
      );
    }
    if (spec.kind === "color") return <ColourField key={f} field={f} value={String(value)} onSet={(v) => commit(f, v)} onCommit={(raw) => commit(f, raw)} />;
    return <TypedField key={f} field={f} value={value} onCommit={(raw) => commit(f, spec.kind === "string" ? raw : raw.trim() === "" ? NaN : raw)} />;
  };
  const fonts = fontsOf(editor.committed);
  return (
    <div className="font-ui" data-help-article="infopanel-editor">
      <PageHeader name={page?.name ?? (profile.Name || "Profile")} />
      {page && <SnapSection snapItems={page.snapItems} onSnapItems={page.onSnapItems} />}
      <section aria-label="Page" className="flex flex-col gap-1.5 border-b border-ui-subtle px-3.5 py-3">
        <TypedField inline field="Name" value={profile.Name} onCommit={(raw) => commit("Name", raw)} />
        <PageRow label="Size">
          <span className="w-[62px]">
            <TypedField field="Width" value={profile.Width} onCommit={(raw) => commit("Width", raw.trim() === "" ? NaN : raw)} />
          </span>
          <span className="pt-4 text-ui-4">×</span>
          <span className="w-[62px]">
            <TypedField field="Height" value={profile.Height} onCommit={(raw) => commit("Height", raw.trim() === "" ? NaN : raw)} />
          </span>
        </PageRow>
        {page && <ColsRows cols={page.cols} rows={page.rows} onGrid={page.onGrid} />}
        <ColourField inline field="BackgroundColor" value={String(profile.BackgroundColor)} onSet={(v) => commit("BackgroundColor", v)} onCommit={(raw) => commit("BackgroundColor", raw)} />
        <PageRow label="Palette">
          {SLOTS.map((slot) => (
            <span key={slot} title={SLOT_LABEL[slot]} className="h-3 w-3 rounded-[3px] border border-white/15" style={{ background: toCss(editor.palette[slot]) }} />
          ))}
        </PageRow>
        <PageRow label="Fonts">
          <span className="truncate" title={fonts.join(", ")}>
            {fonts.length ? fonts.join(", ") : "InfoPanel’s default"}
          </span>
        </PageRow>
        {onRemap && (
          <button
            type="button"
            onClick={onRemap}
            disabled={editor.groups.length === 0}
            className="mt-1 flex h-7 items-center justify-center gap-1.5 rounded-[7px] border border-ui-strong bg-ui-raised text-[12px] text-ui-1 hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40"
          >
            <Cable className="h-3.5 w-3.5" />
            Remap sensors
            {remapCount > 0 && <span className="rounded-full bg-ui-warning/20 px-1.5 font-ui-mono text-[10px] text-ui-warning">{remapCount}</span>}
          </button>
        )}
        <p className="text-[11px] leading-snug text-ui-4">Resizing keeps every item where it is.</p>
      </section>
      {SECTIONS.map((s) => (
        <section key={s.title} aria-label={s.title} className="border-b border-ui-subtle px-4 py-3">
          <div className="mb-2 text-[12px] font-semibold text-ui-1">{s.title}</div>
          <div className="flex flex-col gap-2">{s.fields.map(row)}</div>
          {s.note && <p className="mt-2 text-[11.5px] leading-snug text-ui-4">{s.note}</p>}
        </section>
      ))}
      <section aria-label="Palette" className="border-b border-ui-subtle px-4 py-3">
        <div className="mb-2 text-[12px] font-semibold text-ui-1">Palette</div>
        <div className="flex flex-col gap-1.5">
          {SLOTS.map((slot) => (
            <PaletteRow key={slot} slot={slot} value={editor.palette[slot]} onSet={(v) => editor.setPalette(slot, v, `canvas-palette:${editor.zone.id}:${slot}`)} />
          ))}
        </div>
        <p className="mt-2 text-[11.5px] leading-snug text-ui-4">
          Studio only, never exported. New items and elements take these colours; changing one recolours everything that uses it, and baked elements bake again on export.
        </p>
      </section>
      <p className="px-4 py-3 text-[11.5px] leading-snug text-ui-4">Select an item on the canvas or in Layers to edit it.</p>
    </div>
  );
}
