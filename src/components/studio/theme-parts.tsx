import type { ComponentType, ReactNode } from "react";
import { Frame, Image as ImageIcon, Layers, Mountain, Shapes, ShieldCheck, Sparkles, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import type { PartText } from "./theme-pack-model";

const ICON: Readonly<Record<PartText["id"], ComponentType<{ className?: string; strokeWidth?: number }>>> = {
  scenery: Mountain,
  effects: Sparkles,
  details: Frame,
  icons: Shapes,
  font: Type,
};

/** A row of "In this theme": a 28 px tile, the name and one line, and what is on the right. */
function PartRow({ icon, label, badge, hint, children }: { icon: ReactNode; label: string; badge?: ReactNode; hint: string; children?: ReactNode }) {
  return (
    <div className="flex min-h-12 items-center gap-3">
      <span aria-hidden className="grid h-7 w-7 shrink-0 place-items-center rounded-ui-sm bg-ui-raised text-ui-3">
        {icon}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="flex items-center gap-2 text-body text-ui-1">
          {label}
          {badge}
        </span>
        <span className="truncate text-caption text-ui-3" title={hint}>
          {hint}
        </span>
      </span>
      {children}
    </div>
  );
}

export interface ThemePartsProps {
  /** "Theme pack · 6 parts", "Plain theme". */
  summary: string;
  /** What the pack brings (none for a plain theme). */
  parts: readonly PartText[];
  /** Keep my background, for this screen. */
  keepBackground: boolean;
  onKeepBackground: (keep: boolean) => void;
  /** Whether the level can hold a background of its own (a page's is its screen's). */
  backgroundOwn: boolean;
  /** The level's background in words, and the picker it opens (a page's background is its screen's: no Change). */
  background: string;
  onChangeBackground: () => void;
  /** The pack's burn-in need ("Needs pixel shift") and what the screen does about it. */
  burnIn: string;
  needsCare: boolean;
  protection: string;
  onChangeFont: () => void;
  onChangeProtection: () => void;
}

/**
 * In this theme: each part the theme brings as a row (Scenery, Effects, Card details, Icons say what is drawn; they have no
 * switch yet), its Font with a Change, Keep my background, and the Burn-in care the pack needs with the screen's own
 * protection.
 */
export function ThemeParts(p: ThemePartsProps) {
  return (
    <section aria-label="In this theme" data-nav-section="parts" className="flex flex-col gap-1 px-5 pb-4">
      <h2 className="flex items-baseline justify-between pb-1 text-caption font-medium text-ui-3">
        In this theme
        <span className="font-normal">{p.summary}</span>
      </h2>
      {p.parts.map((part) => {
        const Icon = ICON[part.id];
        return (
          <PartRow key={part.id} icon={<Icon className="h-4 w-4" strokeWidth={1.5} />} label={part.label} hint={part.hint}>
            {part.id === "font" ? (
              <Button variant="ghost" small onClick={p.onChangeFont} aria-label="Change font">
                Change
              </Button>
            ) : (
              <span className="max-w-40 shrink-0 truncate text-right font-ui-mono text-caption text-ui-2" title={part.value}>
                {part.value}
              </span>
            )}
          </PartRow>
        );
      })}
      <PartRow icon={<Layers className="h-4 w-4" strokeWidth={1.5} />} label="Background" hint={p.background}>
        <Button variant="ghost" small disabled={!p.backgroundOwn} onClick={p.onChangeBackground} aria-label="Change background">
          Change
        </Button>
      </PartRow>
      <PartRow icon={<ImageIcon className="h-4 w-4" strokeWidth={1.5} />} label="Keep my background" hint={p.keepBackground ? "On: a theme you apply leaves your background" : "Off: a theme with a background replaces yours"}>
        <Toggle checked={p.keepBackground} label="Keep my background" disabled={!p.backgroundOwn} onChange={p.onKeepBackground} />
      </PartRow>
      <PartRow
        icon={<ShieldCheck className="h-4 w-4" strokeWidth={1.5} />}
        label="Burn-in care"
        badge={<StatusChip tone={p.needsCare ? "warn" : "neutral"} dot={false} className={cn("h-5 px-2 text-micro")}>{p.burnIn}</StatusChip>}
        hint={p.protection}
      >
        <Button variant="ghost" small onClick={p.onChangeProtection} aria-label="Change burn-in care">
          Change
        </Button>
      </PartRow>
    </section>
  );
}
