import { useState, type ReactNode } from "react";
import { ChevronDown, Copy } from "lucide-react";
import { activePresetId, sameTokens } from "./appearance-actions";
import { AppearancePreview } from "./appearance-preview";
import { MoreRows, moreKey } from "./inspector/more-rows";
import type { AppearancePreset } from "@/lib/appearance-presets";
import type { TemplatePresetGroup } from "@/lib/screen-templates/template-presets";
import { THEME_PRESETS, type ThemeTokens } from "@/lib/theme";
import { cn } from "@/lib/utils";
import type { ModuleSettings } from "@/modules/types";
import { Widget } from "@/widgets/core/Widget";
import { Num, Spark } from "@/widgets/core/primitives";
import { SKIN_PACKS, SKINS } from "@/widgets/core/theme";

const HISTORY = [38, 44, 41, 52, 48, 61, 57, 66, 59, 63];

/** A palette at thumbnail size: its page, a card on it and the primary colour. */
export function PaletteSwatch({ tokens }: { tokens: ThemeTokens }) {
  const c = (key: keyof ThemeTokens) => `hsl(${tokens[key]})`;
  return (
    <div className="flex h-full items-end gap-[3px] p-[5px]" style={{ background: c("background") }}>
      <span className="h-2.5 w-2.5 rounded-[3px]" style={{ background: c("primary") }} />
      <span className="h-2.5 w-2.5 rounded-[3px] border" style={{ background: c("card"), borderColor: c("border") }} />
    </div>
  );
}

/** One skin drawn live: its own card, fonts, numerals and graph at thumbnail size. */
function SkinSwatch({ skin }: { skin: string }) {
  return (
    <div className="h-full p-[3px]">
      <Widget skin={skin} surface="auto" radius={Math.min(SKINS[skin]?.radius ?? 16, 8)} showHeader={false}>
        <div className="flex h-full flex-col justify-between">
          <Num className="text-[12px] leading-none">63%</Num>
          <Spark values={HISTORY} min={0} max={100} className="h-3" />
        </div>
      </Widget>
    </div>
  );
}

/** A gallery item: the 16:10 swatch, its name and kind. A pure "start from" choice: nothing is marked as selected. */
function Item({ name, kind, title, onPick, children }: { name: string; kind: string; title?: string; onPick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onPick}
      title={title}
      aria-label={`Start from ${name} (${kind})`}
      className="flex min-w-0 flex-col gap-1 rounded-md text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
    >
      <div className="aspect-[16/10] w-full overflow-hidden rounded-md border border-ui-strong bg-background text-foreground hover:border-ui-3">{children}</div>
      <span className="truncate text-[11px] capitalize text-ui-1">{name}</span>
      <span className="-mt-1 text-[10px] text-[#7c7c86]">{kind}</span>
    </button>
  );
}

/** A labelled row of gallery items, three to a row. */
function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <h4 className="text-[11px] text-ui-4">{label}</h4>
      <div className="grid grid-cols-3 gap-1.5">{children}</div>
    </div>
  );
}

/** The skins the Skins row shows up front; the rest are behind More. */
const REGULAR_SKINS = 6;

interface ThemeStartFromProps {
  /** The tokens, radius and widget style the scope shows (the current palette, skin and saved Theme). */
  tokens: ThemeTokens;
  radius: number;
  style: ModuleSettings;
  saved: readonly AppearancePreset[];
  /** The template looks (built-in Themes), once loaded. */
  templates?: readonly TemplatePresetGroup[];
  onPalette: (tokens: ThemeTokens) => void;
  onSkin: (skin: string) => void;
  onSaved: (preset: AppearancePreset) => void;
  /** Apply a template's look. */
  onTemplate: (preset: AppearancePreset) => void;
  /** Keep a template's look as a saved Theme of the user's own. */
  onCopy: (preset: AppearancePreset) => void;
  onLibrary: () => void;
  /** Collapsed to its header like the cards below it (the editor's accordion owns the state). */
  open: boolean;
  onToggle: () => void;
}

/**
 * Theme › 1 · Start from (SPEC §7.2, All screens and Screen scopes): one "Current look" line (the saved Theme the
 * scope matches, else its palette and skin), then the saved Themes, the built-in palettes and the 14 skins as
 * plain starting points, three to a row. A row marks nothing as selected; the skins show the first few, the rest
 * behind More so the sections stay in reach. Its header collapses it like a section card.
 */
export function ThemeStartFrom({ tokens, radius, style, saved, templates, onPalette, onSkin, onSaved, onTemplate, onCopy, onLibrary, open, onToggle }: ThemeStartFromProps) {
  const [fromTemplates, setFromTemplates] = useState(false);
  const skin = !style.skin || style.skin === "auto" ? "default" : String(style.skin);
  const known = [...saved, ...(templates?.flatMap((g) => g.presets) ?? [])];
  const savedName = known.find((p) => p.id === activePresetId(known, { tokens, radius, style }))?.name;
  const palette = THEME_PRESETS.find((p) => sameTokens(p.tokens, tokens))?.label;
  const current = savedName ?? `${palette ?? "Custom"} palette · ${skin.charAt(0).toUpperCase()}${skin.slice(1)} skin${palette ? "" : " · edited"}`;
  const skinItem = (p: (typeof SKIN_PACKS)[number]) => (
    <Item key={p.name} name={p.name} kind="Skin" title={p.description} onPick={() => onSkin(p.name)}>
      <SkinSwatch skin={p.name} />
    </Item>
  );
  return (
    <section data-nav-section="start" className="border-t border-ui-subtle">
      <header className="flex min-h-[38px] items-center gap-2 py-[9px] pl-3.5 pr-2.5">
        <button
          type="button"
          aria-expanded={open}
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-sm text-left text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
        >
          <span className="w-3.5 shrink-0 font-ui-mono text-[10px] text-ui-5">1</span>
          <span className="truncate text-[12.5px] font-medium">Start from</span>
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-hidden
          onClick={onToggle}
          className="flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-md text-[#7c7c86] hover:bg-ui-hover"
        >
          <ChevronDown className={cn("h-[17px] w-[17px] transition-transform duration-150", open && "rotate-180")} />
        </button>
      </header>
      {open && (
        <div className="flex flex-col gap-2.5 px-3.5 pb-3.5 pt-0.5">
          <p className="text-[12px] text-ui-4">
            Current look <span className="font-medium text-ui-1">{current}</span>
          </p>
          {saved.length > 0 && (
            <Row label="Saved themes">
              {saved.map((p) => (
                <Item key={p.id} name={p.name} kind="Saved theme" onPick={() => onSaved(p)}>
                  <AppearancePreview preset={p} className="h-full rounded-none border-0" />
                </Item>
              ))}
            </Row>
          )}
          <Row label="Palettes">
            {THEME_PRESETS.map((p) => (
              <Item key={p.name} name={p.label} kind="Palette" onPick={() => onPalette(p.tokens)}>
                <PaletteSwatch tokens={p.tokens} />
              </Item>
            ))}
          </Row>
          <Row label="Skins">{SKIN_PACKS.slice(0, REGULAR_SKINS).map(skinItem)}</Row>
          <MoreRows storeKey={moreKey("theme", "start")} count={SKIN_PACKS.length - REGULAR_SKINS} className="pl-0">
            <div className="grid grid-cols-3 gap-1.5 bg-ui-chrome">{SKIN_PACKS.slice(REGULAR_SKINS).map(skinItem)}</div>
          </MoreRows>
          {templates && (
            <div className="flex flex-col gap-2.5">
              <button
                type="button"
                aria-expanded={fromTemplates}
                onClick={() => setFromTemplates(!fromTemplates)}
                className="flex items-center gap-1 self-start rounded-sm text-[11px] text-ui-4 hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
              >
                From templates ({templates.reduce((n, g) => n + g.presets.length, 0)})
                <ChevronDown className={cn("h-3 w-3 transition-transform duration-150", fromTemplates && "rotate-180")} />
              </button>
              {fromTemplates &&
                templates.map((g) => (
                  <Row key={g.id} label={g.name}>
                    {g.presets.map((p) => (
                      <div key={p.id} className="relative min-w-0 [&>button]:w-full">
                        <Item name={p.name.split(" · ")[1] ?? p.name} kind="Template look" title={p.description} onPick={() => onTemplate(p)}>
                          <AppearancePreview preset={p} className="h-full rounded-none border-0" />
                        </Item>
                        <button
                          type="button"
                          onClick={() => onCopy(p)}
                          title="Save a copy to my themes"
                          aria-label={`Save a copy of ${p.name} to my themes`}
                          className="absolute right-1 top-1 rounded bg-black/50 p-0.5 text-white/80 hover:text-white focus-visible:outline-2 focus-visible:outline-ui-accent"
                        >
                          <Copy className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                  </Row>
                ))}
            </div>
          )}
          <button
            type="button"
            onClick={onLibrary}
            className="self-start rounded-sm text-[11.5px] text-ui-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
          >
            All themes in Library ↗
          </button>
        </div>
      )}
    </section>
  );
}
