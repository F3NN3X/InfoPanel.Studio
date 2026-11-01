import type { ReactNode } from "react";
import { BACKGROUND_DEFAULTS, withBackgroundType, type BackgroundType, type PageBackground } from "@/lib/appearance";
import type { ThemeTokens } from "@/lib/theme";
import { skinLabel, skinOf } from "@/lib/theme-skins";
import { cn } from "@/lib/utils";
import { SKIN_PACKS } from "@/widgets/core/theme";
import { BackgroundEditor } from "./background-editor";
import { PickerShell } from "./theme-pickers";
import { BackgroundSwatch, SkinSwatch } from "./theme-swatches";

/** A 2-column tile: its 72 px preview, name and tag; ringed when it is the current one. */
export function Tile({ name, tag, title, selected, disabled, onPick, children }: { name: string; tag?: string; title?: string; selected: boolean; disabled?: boolean; onPick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onPick}
      title={title}
      disabled={disabled}
      aria-pressed={selected}
      className="flex min-w-0 flex-col gap-1 rounded-lg text-left outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent disabled:cursor-not-allowed disabled:opacity-40"
    >
      <div className={cn("h-[72px] w-full overflow-hidden rounded-lg border bg-background text-foreground", selected ? "border-[#60a5fa] ring-1 ring-[#60a5fa]" : "border-ui-strong hover:border-[#52525b]")}>{children}</div>
      <span className="truncate text-[13px] font-medium text-ui-1">{name}</span>
      {tag && <span className="-mt-1 text-[11px] text-ui-hint">{tag}</span>}
    </button>
  );
}

export const GRID = "grid grid-cols-2 gap-3 px-4 pb-4 pt-1";

/** The Skin picker (SPEC §4.3.3): all 14 skins in picker order, drawn live; Default picks `DEFAULT_SKIN`. */
export function SkinPicker({ current, onPick, onBack }: { current: string; onPick: (skin: string) => void; onBack: () => void }) {
  return (
    <PickerShell
      title="Skin"
      help={'How widgets are drawn: card, rings, meters, graphs and numerals. Colors stay. "Default" is the studio\'s own skin.'}
      onBack={onBack}
    >
      <div className={GRID}>
        {SKIN_PACKS.map((p) => (
          <Tile key={p.name} name={skinLabel(p.name)} title={p.description} selected={skinOf(current) === skinOf(p.name)} onPick={() => onPick(skinOf(p.name))}>
            <SkinSwatch skin={p.name} />
          </Tile>
        ))}
      </div>
    </PickerShell>
  );
}

/** The kinds the Background picker offers besides the theme's own. */
const KINDS: { type: BackgroundType; label: string }[] = [
  { type: "color", label: "Solid" },
  { type: "gradient", label: "Gradient" },
  { type: "image", label: "Image" },
];

interface BackgroundPickerProps {
  value: PageBackground | undefined;
  /** The applied theme's background, when it has one ("This theme's"). */
  themes?: PageBackground;
  tokens: ThemeTokens;
  onChange: (bg: PageBackground) => void;
  copyLabel: string;
  profileId: string;
  onOpenLibrary: () => void;
  onBack: () => void;
}

/**
 * The Background picker (SPEC §4.3.3): This theme's · Solid · Gradient · Image, then today's background editor for
 * the kind chosen (a video is picked there too).
 */
export function BackgroundPicker({ value, themes, tokens, onChange, copyLabel, profileId, onOpenLibrary, onBack }: BackgroundPickerProps) {
  const bg = value ?? { type: "none" as const };
  const sample = (type: BackgroundType): PageBackground =>
    type === "color" ? { type, color: BACKGROUND_DEFAULTS.color } : type === "gradient" ? { type, gradient: { ...BACKGROUND_DEFAULTS.gradient } } : { type, color: BACKGROUND_DEFAULTS.color };
  return (
    <PickerShell title="Background" help={'Part of the theme. When you switch themes, the background only changes if "Include background" is ticked.'} onBack={onBack}>
      <div className={GRID}>
        <Tile
          name="This theme's"
          tag={themes ? undefined : "The theme has none"}
          disabled={!themes}
          selected={themes !== undefined && JSON.stringify(themes) === JSON.stringify(value)}
          onPick={() => themes && onChange({ ...themes })}
        >
          <BackgroundSwatch bg={themes} tokens={tokens} className="relative block h-full w-full" />
        </Tile>
        {KINDS.map((k) => (
          <Tile key={k.type} name={k.label} selected={bg.type === k.type || (k.type === "image" && bg.type === "video")} onPick={() => onChange(withBackgroundType(bg, k.type))}>
            <BackgroundSwatch bg={bg.type === k.type ? bg : sample(k.type)} tokens={tokens} className="relative block h-full w-full" />
          </Tile>
        ))}
      </div>
      {bg.type !== "none" && (
        <div className="px-1 pb-4">
          <BackgroundEditor value={bg} types={["none", "color", "gradient", "image", "video"]} onChange={onChange} copyLabel={copyLabel} profileId={profileId} onOpenLibrary={onOpenLibrary} />
        </div>
      )}
    </PickerShell>
  );
}
