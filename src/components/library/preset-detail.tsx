/**
 * The Library's detail pane for a Theme, a skin or a Style: a preview, the name (renamed in place for the saved
 * ones), the actions (a Theme's or a skin's "Apply to…" scopes, then the rest) and a readable summary: a Theme's
 * colours, corners, background, widget style and the screens that use it; a skin's or a Style's keys.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { presetTokens, type AppearancePreset } from "@/lib/appearance-presets";
import type { DashboardConfig } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import { BUILTIN_LOOK } from "@/lib/my-library/config-items";
import { KIND_LABEL, metaLine } from "@/lib/my-library/model";
import type { ThemePreset } from "@/lib/theme";
import type { ModuleSettings } from "@/modules/types";
import { ADVANCED_TOKENS, VISIBLE_TOKENS } from "@/components/studio/theme-rows";
import { AssetThumb } from "./asset-thumb";
import type { DetailAction } from "./library-detail";
import { isUserPreset, type ScopeChoice } from "./preset-actions";
import { styleRows, themeUsedBy } from "./preset-summary";

export interface PresetDetailProps {
  item: LibraryItem;
  /** Shown in a bottom sheet (a narrow viewport): fills it instead of a 320 px side column. */
  sheet?: boolean;
  config: DashboardConfig;
  primary: DetailAction | null;
  /** A Theme's or a skin's "Apply to…" choices. */
  scopes: ScopeChoice[];
  secondary: DetailAction[];
  /** Focus and select the name field (Rename). */
  focusName?: boolean;
  onFocusedName?: () => void;
  onRename: (name: string) => void;
}

const BUTTON = "flex h-[34px] items-center justify-center gap-2 rounded-[8px] px-3 text-[12.5px] disabled:pointer-events-none disabled:opacity-40";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-ui-subtle pt-3">
      <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[.06em] text-ui-4">{title}</div>
      {children}
    </div>
  );
}

function Rows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <>
      {rows.map((r) => (
        <div key={r.label} className="flex gap-3 py-[3px] text-[12px]">
          <span className="w-[110px] shrink-0 text-ui-4">{r.label}</span>
          <span className="min-w-0 flex-1 truncate font-ui-mono text-ui-2">{r.value}</span>
        </div>
      ))}
    </>
  );
}

/** A Theme's colour tokens as swatches (the name and value on hover). */
function Swatches({ preset }: { preset: Pick<AppearancePreset, "theme"> }) {
  const tokens = presetTokens(preset);
  return (
    <div className="grid grid-cols-6 gap-1.5">
      {[...VISIBLE_TOKENS, ...ADVANCED_TOKENS].map(([key, label]) => (
        <span key={key} title={`${label} · ${tokens[key]}`} className="aspect-square rounded-[5px] border border-ui-strong" style={{ background: `hsl(${tokens[key]})` }} />
      ))}
    </div>
  );
}

const BACKGROUND_LABEL: Record<string, string> = { none: "None", color: "Color", gradient: "Gradient", image: "Image", video: "Video" };

export function PresetDetail(p: PresetDetailProps) {
  const { item } = p;
  const user = isUserPreset(item);
  const theme = item.kind === "theme";
  const [name, setName] = useState(item.name);
  const nameRef = useRef<HTMLInputElement>(null);
  const { focusName, onFocusedName } = p;
  useEffect(() => {
    if (!focusName || !nameRef.current) return;
    nameRef.current.focus();
    nameRef.current.select();
    onFocusedName?.();
  }, [focusName, onFocusedName]);

  // A template look is a whole Theme like a saved one; a palette is colors only.
  const saved = theme && (user || item.id.startsWith(BUILTIN_LOOK)) ? (item.data as AppearancePreset) : undefined;
  const palette = theme && !saved ? (item.data as ThemePreset) : undefined;
  const settings: ModuleSettings = theme ? (saved?.style ?? {}) : (item.data as { settings: ModuleSettings }).settings;
  const rows = styleRows(settings);
  const usedBy = saved ? themeUsedBy(p.config, saved) : [];
  const button = (a: DetailAction, primary?: boolean) => (
    <button
      key={a.label}
      type="button"
      onClick={a.run}
      disabled={a.disabled}
      title={a.title}
      className={cn(BUTTON, primary ? "w-full bg-ui-inverse font-medium text-ui-inverse-fg hover:opacity-90" : "border border-ui-default text-ui-1 hover:bg-ui-hover")}
    >
      <a.icon className="h-4 w-4" strokeWidth={1.75} />
      {a.label}
    </button>
  );
  return (
    <aside aria-label="Item details" className={cn("flex flex-col gap-4 overflow-y-auto bg-ui-panel p-4 font-ui", p.sheet ? "min-w-0 flex-1" : "w-[320px] shrink-0 border-l border-ui-subtle")}>
      <AssetThumb item={item} size="lg" className="aspect-[16/10] w-full border border-ui-subtle" />
      <div>
        <input
          aria-label="Name"
          value={name}
          disabled={!user}
          ref={nameRef}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== item.name && p.onRename(name.trim())}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="-mx-1 w-full rounded-[6px] border border-transparent bg-transparent px-1 py-0.5 text-[14px] font-semibold text-ui-1 outline-none hover:border-ui-default focus:border-ui-accent disabled:hover:border-transparent"
        />
        <div className="font-ui-mono text-[11px] text-ui-4">{metaLine(item) || KIND_LABEL[item.kind]}</div>
      </div>
      <div className="flex flex-col gap-2">
        {p.primary && button(p.primary, true)}
        {p.scopes.length > 0 && (
          <div>
            <div className="mb-1 text-[11px] text-ui-4">Apply to…</div>
            <div className="grid grid-cols-3 gap-1.5">
              {p.scopes.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={s.run}
                  disabled={s.disabled}
                  title={s.title}
                  className="h-[34px] rounded-[8px] border border-ui-default px-1 text-[12px] text-ui-1 hover:bg-ui-hover disabled:pointer-events-none disabled:opacity-40"
                >
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {p.secondary.length > 0 && <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">{p.secondary.map((a) => button(a))}</div>}
      </div>
      {theme && (
        <Section title="Colors">
          <Swatches preset={saved ?? { theme: palette!.tokens }} />
        </Section>
      )}
      {saved && (
        <Section title="Look">
          <Rows
            rows={[
              { label: "Corners", value: `${saved.radius} rem` },
              { label: "Background", value: saved.background ? (BACKGROUND_LABEL[saved.background.type] ?? saved.background.type) : "Not included" },
            ]}
          />
        </Section>
      )}
      {(!theme || saved) && (
        <Section title={theme || item.kind === "skin" ? "Widget style" : "Settings"}>
          {rows.length > 0 ? (
            <Rows rows={rows} />
          ) : (
            <span className="text-[12px] text-ui-4">{theme ? "The widgets follow their skin." : "No settings: it clears the widget’s own look."}</span>
          )}
        </Section>
      )}
      {usedBy.length > 0 && (
        <Section title="Used by">
          <div className="text-[12px] text-ui-2">{usedBy.join(", ")}</div>
        </Section>
      )}
      <Section title="Kept in">
        <span className="text-[12px] text-ui-2">{user ? "this dashboard’s config" : "the Studio (built in)"}</span>
      </Section>
    </aside>
  );
}
