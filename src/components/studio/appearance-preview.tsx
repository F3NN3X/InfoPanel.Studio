import type { CSSProperties } from "react";
import { surfaceColors } from "@/components/surfaces";
import { chromeVars, surfaceBox } from "@/components/widget-style";
import { backgroundLayers, posterBackground, type PageBackground } from "@/lib/appearance";
import { presetTokens, type AppearancePreset } from "@/lib/appearance-presets";
import { chromeOf } from "@/modules/standard-settings";

/** The mini page: the preset's background (a video as its poster), else its theme's page color. */
function MiniPage({ bg }: { bg: PageBackground | undefined }) {
  if (!bg) return <div className="absolute inset-0 bg-background" />;
  const layers = backgroundLayers(bg.type === "video" ? posterBackground(bg) : bg);
  // No page blur at thumbnail size.
  const media = layers.media && { ...layers.media, filter: undefined, inset: 0 };
  return (
    <div className="absolute inset-0" style={layers.fill}>
      {media && <div className="absolute inset-0" style={media} />}
      {layers.overlay && <div className="absolute inset-0" style={layers.overlay} />}
    </div>
  );
}

/** One mini widget: the preset's surface, border, glow, opacity, blur and type, an accent bar and a value. */
function MiniTile({ preset, value, fill }: { preset: AppearancePreset; value: string; fill: number }) {
  const chrome = chromeOf(preset.style);
  // Glow sizes are page pixels too; the soft one reads right at this scale.
  const box = surfaceBox(surfaceColors(preset.style.surface), { ...chrome, glow: chrome.glow === "none" ? "none" : "soft" });
  const radius = (chrome.radius ?? preset.radius * 16) * 0.3;
  const accent = chrome.accent || "hsl(var(--primary))";
  return (
    <div
      className="flex min-w-0 flex-1 flex-col justify-between p-1"
      style={{ ...chromeVars(chrome), ...box, borderRadius: radius }}
    >
      <div className="text-[10px] font-semibold leading-none tabular-nums">{value}</div>
      <div className="h-[2px] w-full rounded-full" style={{ background: "rgb(128 128 128 / 0.25)" }}>
        <div className="h-full rounded-full" style={{ width: `${fill}%`, background: accent }} />
      </div>
    </div>
  );
}

/**
 * A CSS-drawn thumbnail of an appearance preset: its theme tokens scoped
 * to the box, its page background and two mini widgets in its global
 * style — drawn with the same surface helpers as the real widgets.
 */
export function AppearancePreview({ preset }: { preset: AppearancePreset }) {
  const tokens = Object.fromEntries(
    Object.entries(presetTokens(preset)).map(([key, value]) => [`--${key}`, value])
  );
  return (
    <div
      className="relative h-10 overflow-hidden border border-ui-default"
      style={{ ...(tokens as CSSProperties), borderRadius: `${preset.radius}rem` }}
    >
      <MiniPage bg={preset.background} />
      <div className="relative flex h-full gap-1 p-1.5">
        <MiniTile preset={preset} value="42°" fill={62} />
        <MiniTile preset={preset} value="7.3" fill={35} />
      </div>
    </div>
  );
}
