import { StatusChip } from "@/components/ui/status-chip";
import { type PackTrust, trustBadge, trustMeaning } from "@/looks/pack-trust";
import { cn } from "@/lib/utils";

interface PackTrustBadgeProps {
  trust: PackTrust;
  className?: string;
}

/** A pack's trust as a status pill (a dot and words, never colour alone): green verified, amber unverified, red changed or withdrawn. */
export function PackTrustBadge({ trust, className }: PackTrustBadgeProps) {
  const badge = trustBadge(trust);
  return (
    <StatusChip tone={badge.tone} className={cn("max-w-full", className)}>
      <span data-pack-trust={trust.state} className="truncate">
        {badge.label}
      </span>
    </StatusChip>
  );
}

/** The badge with what it means, for the detail pane and the import dialog. */
export function PackTrustNote({ trust }: { trust: PackTrust }) {
  return (
    <div data-pack-trust-note className="flex flex-col items-start gap-1">
      <PackTrustBadge trust={trust} />
      <span className="text-caption text-ui-3">{trustMeaning(trust)}</span>
    </div>
  );
}
