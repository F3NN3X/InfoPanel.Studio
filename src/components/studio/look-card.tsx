import { Check, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/button";
import type { AppearancePreset } from "@/lib/appearance-presets";
import { LookThumb } from "./look-thumb";

export const FOCUS = FOCUS_RING;
/** A card's thumbnail width: four a row in Browse's column. */
export const CARD_W = 220;

interface CardProps {
  id: string;
  name: string;
  description: string;
  preset: AppearancePreset;
  /** Whether it is a theme pack (the "Pack" badge). */
  pack: boolean;
  /** The theme the level wears (the "Applied" badge). */
  applied: boolean;
  /** The one the detail pane shows. */
  selected: boolean;
  /** Validation warnings of an imported pack. */
  warnings?: number;
  /** The roving tab stop. */
  tabStop: boolean;
  /** The theme the canvas previews: Enter on its card applies it. */
  previewing?: boolean;
  onSelect: () => void;
  onApply: () => void;
  /** The pointer came onto the card (`true`) or left it (Preview on hover). */
  onHover?: (on: boolean) => void;
}

/**
 * One theme card: the real-render thumbnail with its badges, the name and one line; a click shows its detail and
 * previews it, a double click, or Enter on the card being previewed, applies it.
 */
export function ThemeCard({ id, name, description, preset, pack, applied, selected, warnings = 0, tabStop, previewing, onSelect, onApply, onHover }: CardProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onApply}
      onKeyDown={(e) => {
        if (e.key !== "Enter" || !previewing) return;
        e.preventDefault();
        onApply();
      }}
      onPointerEnter={onHover && (() => onHover(true))}
      onPointerLeave={onHover && (() => onHover(false))}
      data-previewing={previewing || undefined}
      aria-pressed={selected}
      aria-label={`${name}${pack ? ", theme pack" : ""}${applied ? ", applied" : ""}${warnings > 0 ? `, ${warnings} ${warnings === 1 ? "warning" : "warnings"}` : ""}`}
      tabIndex={tabStop ? 0 : -1}
      data-look-card={id}
      className={cn(
        "flex flex-col overflow-hidden rounded-ui-lg border bg-ui-panel text-left transition-colors duration-(--ui-dur-fast) ease-ui hover:border-ui-hover-edge",
        FOCUS_RING,
        selected ? "border-ui-accent" : "border-ui-subtle"
      )}
      style={{ width: CARD_W }}
    >
      <span className="relative block">
        <LookThumb preset={preset} width={CARD_W - 2} className="w-full" />
        <span className="absolute inset-x-2 top-2 flex items-start justify-between gap-1">
          {pack ? <span className="rounded-ui-sm bg-ui-app/80 px-1.5 py-0.5 text-caption text-ui-1">Pack</span> : <span />}
          {applied ? (
            <span className="flex items-center gap-1 rounded-ui-sm bg-ui-app/80 px-1.5 py-0.5 text-caption text-ui-1">
              <Check className="h-3 w-3" aria-hidden />
              Applied
            </span>
          ) : (
            warnings > 0 && (
              <span className="flex items-center gap-1 rounded-ui-sm bg-ui-app/80 px-1.5 py-0.5 text-caption text-ui-warn">
                <TriangleAlert className="h-3 w-3" aria-hidden />
                {warnings} {warnings === 1 ? "warning" : "warnings"}
              </span>
            )
          )}
        </span>
      </span>
      <span className="flex flex-col gap-0.5 px-3 pb-3 pt-2.5">
        <span className="truncate text-body font-medium text-ui-1">{name}</span>
        <span className="truncate text-caption text-ui-3">{description}</span>
      </span>
    </button>
  );
}
