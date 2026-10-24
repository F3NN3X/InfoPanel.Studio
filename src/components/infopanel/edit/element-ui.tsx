/**
 * The studio elements' shared bits of UI: each element's icon (Add palette, Layers, inspector)
 * and the export badge (Native, Baked or Approximated) with its reason.
 */
import { Activity, CircleDashed, Cpu, GripHorizontal, Minus, RectangleHorizontal, Smile, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { BADGE_LABEL, type Badge } from "@/lib/infopanel/elements/apply";
import type { ElementType } from "@/lib/infopanel/elements/spec";

export const ELEMENT_ICONS: Record<ElementType, LucideIcon> = {
  ring: CircleDashed,
  ledbar: GripHorizontal,
  card: RectangleHorizontal,
  glow: Sparkles,
  divider: Minus,
  icon: Smile,
  cores: Cpu,
  sparkline: Activity,
};

const BADGE_TONE: Record<Badge["kind"], string> = {
  native: "border-ui-success/40 text-ui-success",
  baked: "border-ui-accent/50 text-ui-accent",
  approximated: "border-ui-warning/50 text-ui-warning",
};

/** How the item exports to InfoPanel: Native, Baked or Approximated, its reason and what it loses on hover. */
export function BadgeChip({ badge, compact = false }: { badge: Badge; compact?: boolean }) {
  const title = [badge.reason, ...(badge.lost.length ? [`Lost: ${badge.lost.join(", ")}.`] : [])].join(" ");
  return (
    <span title={title} aria-label={`${BADGE_LABEL[badge.kind]}: ${title}`} className={cn("shrink-0 rounded-full border px-1.5 font-medium leading-4", compact ? "text-[10px]" : "py-0.5 text-[11px]", BADGE_TONE[badge.kind])}>
      {compact ? BADGE_LABEL[badge.kind][0] : BADGE_LABEL[badge.kind]}
    </span>
  );
}
