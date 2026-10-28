import { useState, type ReactNode } from "react";
import { Check, ChevronLeft, MoreHorizontal } from "lucide-react";
import { presetTokens, type AppearancePreset } from "@/lib/appearance-presets";
import { variantName, type TemplateThemeRow } from "@/lib/screen-templates/template-rows";
import { cn } from "@/lib/utils";
import { AppearancePreview } from "./appearance-preview";
import { ThemeNameInput } from "./theme-name-input";
import { filteredThemes, rowTag, templatesHeading, type ThemeFilter } from "./theme-view-model";

const HEADING = "px-4 pb-1.5 pt-3 font-ui-mono text-[10px] uppercase tracking-[0.08em] text-[#71717a]";
const ACTION = "rounded-sm text-[12px] text-[#60a5fa] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** A picker's frame (SPEC §4.3.3): ‹ Back and the title, the help text, the list, and a footer. */
export function PickerShell({ title, help, onBack, footer, children }: { title: string; help: string; onBack: () => void; footer?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col">
      <div className="flex items-center gap-2.5 px-4 pb-1 pt-3">
        <button
          type="button"
          onClick={onBack}
          className="flex h-7 items-center gap-0.5 rounded-md border border-ui-strong pl-1.5 pr-2.5 text-[13px] text-[#a1a1aa] hover:bg-ui-hover hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden />
          Back
        </button>
        <h2 className="truncate text-[14px] font-semibold text-ui-1">{title}</h2>
      </div>
      <p className="px-4 py-2 text-[12px] leading-snug text-[#a1a1aa]">{help}</p>
      <div className="flex-1">{children}</div>
      {footer && <div className="sticky bottom-0 flex flex-col gap-2 border-t border-ui-subtle bg-ui-chrome px-4 py-3">{footer}</div>}
    </div>
  );
}

/** "Include background", remembered for the session (owner decision 6): not stored, off when the studio opens. */
let includeBackgroundPref = false;

/** The theme's accent: its widget accent, else its primary color. */
const accentOf = (p: AppearancePreset): string => (typeof p.style.accent === "string" && p.style.accent ? p.style.accent : `hsl(${presetTokens(p).primary})`);

/** A row's thumbnail button: the look at 72×46, ringed when it is the applied one. */
function Thumb({ preset, selected, onPick }: { preset: AppearancePreset; selected: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      onClick={onPick}
      aria-label={`Apply ${preset.name}`}
      className={cn("shrink-0 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ui-accent", selected && "ring-2 ring-[#60a5fa]")}
    >
      <AppearancePreview preset={preset} className="h-[46px] w-[72px] rounded-md" />
    </button>
  );
}

interface SwitchThemeProps {
  saved: readonly AppearancePreset[];
  /** The template rows, once loaded. */
  rows?: readonly TemplateThemeRow[];
  /** The applied theme's id (its row is ringed). */
  currentId?: string;
  counts: string;
  /** A saved theme's "used by" line. */
  usedBy: (id: string) => string;
  onApply: (preset: AppearancePreset, includeBackground: boolean) => void;
  onRename: (id: string, name: string) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  /** + Save current look as a theme. */
  onSaveCurrent: (name: string) => void;
  onBack: () => void;
}

const FILTERS: { id: ThemeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "saved", label: "Saved" },
  { id: "templates", label: "Templates" },
  { id: "light", label: "Light" },
];

/**
 * Switch theme (handoff SPEC §4.3.3): the filters, the saved themes (each with ⋯: who uses it, Rename, Duplicate,
 * Delete), one row per template with its variant chips, and the footer's Include background, counts and Save.
 * Picking applies at once; the editor goes back to Main and toasts.
 */
export function SwitchThemePicker(p: SwitchThemeProps) {
  const [filter, setFilter] = useState<ThemeFilter>("all");
  const [include, setInclude] = useState(includeBackgroundPref);
  const [menuFor, setMenuFor] = useState<string>();
  const [renaming, setRenaming] = useState<string>();
  const [saving, setSaving] = useState(false);
  /** The variant last chosen per template (the row applies it). */
  const [variant, setVariant] = useState<Record<string, number>>({});
  const shown = filteredThemes(filter, p.saved, p.rows ?? []);
  const apply = (preset: AppearancePreset) => p.onApply(preset, include);
  return (
    <PickerShell
      title="Switch theme"
      help="A theme sets the palette, skin and corners, plus the background if you tick it below. Picking one adds to what you have. Fine-tune changes stay."
      onBack={p.onBack}
      footer={
        <>
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ui-1">
            <input
              type="checkbox"
              checked={include}
              onChange={(e) => {
                includeBackgroundPref = e.target.checked;
                setInclude(e.target.checked);
              }}
              className="peer sr-only"
            />
            <span
              aria-hidden
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-[4px] border peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-ui-accent",
                include ? "border-[#3b82f6] bg-[#3b82f6] text-white" : "border-[#52525b]"
              )}
            >
              {include && <Check className="h-3 w-3" strokeWidth={3} />}
            </span>
            Include background
          </label>
          <p className="text-[12px] text-[#71717a]">{include ? "The theme's background replaces yours." : "Your background stays."}</p>
          <div className="flex items-center gap-3 text-[12px]">
            <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[#71717a]">{p.counts}</span>
            {saving ? (
              <ThemeNameInput
                initial=""
                label="Theme name"
                onDone={(name) => {
                  setSaving(false);
                  if (name) p.onSaveCurrent(name);
                }}
              />
            ) : (
              <button type="button" onClick={() => setSaving(true)} className={cn(ACTION, "shrink-0")}>
                + Save current look as a theme
              </button>
            )}
          </div>
        </>
      }
    >
      <div role="group" aria-label="Filter themes" className="flex gap-1.5 px-4 pb-1">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            aria-pressed={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={cn(
              "h-6 rounded-full border px-2.5 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
              filter === f.id ? "border-[#60a5fa] bg-[#0b1530] text-[#bfdbfe]" : "border-ui-strong text-[#a1a1aa] hover:text-ui-1"
            )}
          >
            {f.label}
          </button>
        ))}
      </div>
      {shown.saved && (
        <>
          <h3 className={HEADING}>Saved themes · {shown.saved.length}</h3>
          {shown.saved.length === 0 && <p className="px-4 pb-2 text-[12px] text-[#71717a]">Themes you save appear here.</p>}
          {shown.saved.map((t) => (
            <div key={t.id}>
              <div className="flex items-center gap-3 px-4 py-2 hover:bg-[#111113]">
                <Thumb preset={t} selected={t.id === p.currentId} onPick={() => apply(t)} />
                {renaming === t.id ? (
                  <ThemeNameInput
                    initial={t.name}
                    label="Theme name"
                    onDone={(name) => {
                      setRenaming(undefined);
                      if (name) p.onRename(t.id, name);
                    }}
                  />
                ) : (
                  <button type="button" onClick={() => apply(t)} className="flex min-w-0 flex-1 flex-col items-start text-left">
                    <span className="truncate text-[13px] font-medium text-ui-1">{t.name}</span>
                    <span className="text-[11px] text-[#71717a]">Saved</span>
                  </button>
                )}
                <button
                  type="button"
                  aria-expanded={menuFor === t.id}
                  aria-label={`${t.name} actions`}
                  onClick={() => setMenuFor(menuFor === t.id ? undefined : t.id)}
                  className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[#71717a] hover:bg-ui-hover hover:text-ui-1"
                >
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              </div>
              {menuFor === t.id && (
                <div className="mx-4 mb-2 flex flex-col gap-1.5 rounded-lg border border-ui-strong bg-[#131316] px-3 py-2">
                  <p className="text-[11px] text-[#71717a]">{p.usedBy(t.id)}</p>
                  <div className="flex gap-3">
                    <button type="button" className={ACTION} onClick={() => setRenaming(t.id)}>
                      Rename
                    </button>
                    <button type="button" className={ACTION} onClick={() => p.onDuplicate(t.id)}>
                      Duplicate
                    </button>
                    <button type="button" className={cn(ACTION, "text-[#f87171]")} onClick={() => p.onDelete(t.id)}>
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
      {shown.rows && (
        <>
          <h3 className={HEADING}>{p.rows ? templatesHeading(shown.rows) : "From screen templates"}</h3>
          {!p.rows && <p className="px-4 pb-2 text-[12px] text-[#71717a]">Loading…</p>}
          {shown.rows.map((row) => {
            const chosen = row.presets[variant[row.id] ?? 0] ?? row.presets[0];
            const pick = (i: number) => {
              setVariant((v) => ({ ...v, [row.id]: i }));
              apply(row.presets[i]);
            };
            return (
              <div key={row.id} className="flex items-start gap-3 px-4 py-2 hover:bg-[#111113]">
                <Thumb preset={chosen} selected={row.presets.some((x) => x.id === p.currentId)} onPick={() => apply(chosen)} />
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                  <button type="button" onClick={() => apply(chosen)} className="flex flex-col items-start text-left">
                    <span className="truncate text-[13px] font-medium text-ui-1">{row.name}</span>
                    <span className="text-[11px] text-[#71717a]">{rowTag(row)}</span>
                  </button>
                  {row.presets.length > 1 && (
                    <div className="flex flex-wrap gap-1">
                      {row.presets.map((v, i) => (
                        <button
                          key={v.id}
                          type="button"
                          aria-pressed={v.id === chosen.id}
                          title={v.name}
                          onClick={() => pick(i)}
                          className={cn(
                            "flex h-5 items-center gap-1 rounded-full border px-1.5 text-[11px]",
                            v.id === chosen.id ? "border-[#60a5fa] bg-[#0b1530] text-[#bfdbfe]" : "border-ui-strong text-[#a1a1aa] hover:text-ui-1"
                          )}
                        >
                          <span className="h-1.5 w-1.5 rounded-full" style={{ background: accentOf(v) }} aria-hidden />
                          {variantName(v)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </>
      )}
    </PickerShell>
  );
}
