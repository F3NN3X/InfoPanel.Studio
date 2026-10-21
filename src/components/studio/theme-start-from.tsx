import type { ReactNode } from "react";
import { activePresetId } from "./appearance-actions";
import { AppearancePreview } from "./appearance-preview";
import { MoreRows, moreKey } from "./inspector/more-rows";
import type { AppearancePreset } from "@/lib/appearance-presets";
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

/** A gallery item: the 16:10 swatch (2 px white border when current), its name and kind. */
function Item({ name, kind, current, title, onPick, children }: { name: string; kind: string; current: boolean; title?: string; onPick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onPick}
      title={title}
      aria-label={`Start from ${name} (${kind})`}
      aria-pressed={current}
      className="flex min-w-0 flex-col gap-1 rounded-md text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
    >
      <div
        className={cn(
          "aspect-[16/10] w-full overflow-hidden rounded-md bg-background text-foreground",
          current ? "border-2 border-ui-1" : "border border-ui-strong hover:border-ui-3"
        )}
      >
        {children}
      </div>
      <span className="truncate text-[11px] capitalize text-ui-1">{name}</span>
      <span className="-mt-1 text-[10px] text-[#7c7c86]">{kind}</span>
    </button>
  );
}

interface ThemeStartFromProps {
  /** The tokens, radius and widget style the scope shows (the current palette, skin and saved Theme). */
  tokens: ThemeTokens;
  radius: number;
  style: ModuleSettings;
  saved: readonly AppearancePreset[];
  onPalette: (tokens: ThemeTokens) => void;
  onSkin: (skin: string) => void;
  onSaved: (preset: AppearancePreset) => void;
  onLibrary: () => void;
}

/**
 * Theme › 1 · Start from (SPEC §7.2, All screens and Screen scopes): the built-in palettes (color tokens), the 14
 * skins (the skin, with its own card) and the saved Themes, three to a row; the current palette and skin get a
 * white border. The current skin shows, the other 13 behind More so the sections stay in reach.
 */
export function ThemeStartFrom({ tokens, radius, style, saved, onPalette, onSkin, onSaved, onLibrary }: ThemeStartFromProps) {
  const palette = JSON.stringify(tokens);
  const skin = !style.skin || style.skin === "auto" ? "default" : String(style.skin);
  const savedId = activePresetId(saved, { tokens, radius, style });
  const skinItem = (p: (typeof SKIN_PACKS)[number]) => (
    <Item key={p.name} name={p.name} kind="Skin" title={p.description} current={p.name === skin} onPick={() => onSkin(p.name)}>
      <SkinSwatch skin={p.name} />
    </Item>
  );
  return (
    <section data-nav-section="start" className="flex flex-col gap-2 px-3.5 pb-3.5 pt-1">
      <h3 className="font-ui-mono text-[10px] uppercase tracking-[0.06em] text-[#7c7c86]">1 · Start from</h3>
      <div className="grid grid-cols-3 gap-1.5">
        {THEME_PRESETS.map((p) => (
          <Item key={p.name} name={p.label} kind="Palette" current={JSON.stringify(p.tokens) === palette} onPick={() => onPalette(p.tokens)}>
            <PaletteSwatch tokens={p.tokens} />
          </Item>
        ))}
        {SKIN_PACKS.filter((p) => p.name === skin).map(skinItem)}
        {saved.map((p) => (
          <Item key={p.id} name={p.name} kind="Saved theme" current={p.id === savedId} onPick={() => onSaved(p)}>
            <AppearancePreview preset={p} className="h-full rounded-none border-0" />
          </Item>
        ))}
      </div>
      <MoreRows storeKey={moreKey("theme", "start")} count={SKIN_PACKS.length - 1} className="pl-0">
        <div className="grid grid-cols-3 gap-1.5 bg-ui-chrome">{SKIN_PACKS.filter((p) => p.name !== skin).map(skinItem)}</div>
      </MoreRows>
      <button
        type="button"
        onClick={onLibrary}
        className="self-start rounded-sm text-[11.5px] text-ui-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
      >
        All themes in Library ↗
      </button>
    </section>
  );
}
