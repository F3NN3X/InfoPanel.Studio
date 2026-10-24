/**
 * The InfoPanel editor's inspector with nothing selected: the profile's own settings, every field
 * InfoPanel's export carries. A typed value goes through the same setter checks as an item field
 * (`checkValue` over `PROFILE`): a refused one is shown with its message and not stored. Resizing
 * changes the profile only; every item keeps its place.
 */
import { useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { checkValue } from "@/lib/infopanel/editor/registry";
import { PROFILE, type Profile } from "@/lib/infopanel/schema";
import { Toggle } from "@/components/ui/toggle";
import { fromCss, toCss } from "@/components/studio/inspector/infopanel-defs";
import type { CanvasEditor } from "./use-canvas-editor";

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
  { title: "Profile", fields: ["Name", "Width", "Height"], note: "Resizing keeps every item where it is." },
  { title: "Text and colour", fields: ["BackgroundColor", "Font", "FontSize", "Color", "FontScale"], note: "New text items take the font, size and colour." },
  { title: "Display", fields: ["ShowFps", "OpenGL"] },
  {
    title: "Web view",
    fields: ["WebViewEnabled", "WebViewUrl", "WebViewInteractive", "WebViewDisableCache", "WebViewAutoRefreshSeconds", "WebViewMaxFps"],
    note: "InfoPanel shows the page instead of the items. Refresh 0 is off; Max FPS 0 follows the display and needs a newer InfoPanel.",
  },
];

const Message = ({ children }: { children: ReactNode }) => <p className="mt-1 text-[11.5px] leading-snug text-ui-danger">{children}</p>;

/** A typed text or number, stored on Enter or leaving. */
function TypedField({ field, value, onCommit }: { field: Field; value: unknown; onCommit: (raw: string) => string | null }) {
  const [draft, setDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = LABEL[field] ?? field;
  const commit = () => {
    if (draft === null) return;
    setError(onCommit(draft));
    setDraft(null);
  };
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-[11px] text-ui-4">{label}</span>
      <input
        aria-label={label}
        aria-invalid={error !== null}
        inputMode={PROFILE[field].kind === "string" ? undefined : "decimal"}
        value={draft ?? String(value ?? "")}
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
        className={cn(INPUT, error ? "border-ui-danger" : "border-ui-default")}
      />
      {error && <Message>{error}</Message>}
    </label>
  );
}

/** An #AARRGGBB colour: typed, or picked with the swatch (which keeps the alpha). */
function ColourField({ field, value, onSet, onCommit }: { field: Field; value: string; onSet: (v: string) => void; onCommit: (raw: string) => string | null }) {
  const label = LABEL[field] ?? field;
  return (
    <div className="flex items-end gap-2">
      <div className="min-w-0 flex-1">
        <TypedField field={field} value={value} onCommit={onCommit} />
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

export function ProfileSettings({ editor }: { editor: CanvasEditor }) {
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
  return (
    <div className="font-ui" data-help-article="infopanel-editor">
      <div className="border-b border-ui-subtle px-4 pb-3 pt-4">
        <div className="truncate text-[14px] font-semibold leading-4 text-ui-1">{profile.Name || "Profile"}</div>
        <div className="mt-1 truncate text-[11px] text-ui-4">
          InfoPanel profile · {profile.Width} × {profile.Height}
        </div>
      </div>
      {SECTIONS.map((s) => (
        <section key={s.title} aria-label={s.title} className="border-b border-ui-subtle px-4 py-3">
          <div className="mb-2 text-[12px] font-semibold text-ui-1">{s.title}</div>
          <div className={cn("gap-2", s.title === "Profile" ? "grid grid-cols-2 [&>*:first-child]:col-span-2" : "flex flex-col")}>{s.fields.map(row)}</div>
          {s.note && <p className="mt-2 text-[11.5px] leading-snug text-ui-4">{s.note}</p>}
        </section>
      ))}
      <p className="px-4 py-3 text-[11.5px] leading-snug text-ui-4">Select an item on the canvas or in Layers to edit it.</p>
    </div>
  );
}
