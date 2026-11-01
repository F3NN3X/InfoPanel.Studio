import { DynamicIsland } from "@/components/island/dynamic-island";
import type { IslandBus } from "@/lib/island/bus";
import { ISLAND_DEFAULTS, type IslandConfig } from "@/lib/island/config";

interface IslandPreviewProps {
  island: IslandConfig | undefined;
  /** The screen's design size: a short strip or a small screen gets a smaller island. */
  page: { width: number; height: number };
  /** The bus "Preview an alert" notifies; only this preview listens. */
  bus: IslandBus;
}

/** The real island on a dark stage, fed the screen's island settings, so every row shows as it is set. */
export function IslandPreview({ island, page, bus }: IslandPreviewProps) {
  const config = island ?? { ...ISLAND_DEFAULTS, enabled: false };
  return (
    <div className="flex flex-col gap-1.5">
      <div aria-label="Island preview" className="relative h-[120px] overflow-hidden rounded-[10px] border border-ui-subtle bg-s-well">
        <DynamicIsland config={config} alerts={[]} placement="absolute" page={page} bus={bus} />
      </div>
      {!config.enabled && (
        <p className="text-[11px] text-ui-hint">The island is off on this screen. This is how it will look when you turn it on.</p>
      )}
    </div>
  );
}
