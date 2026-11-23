import { useEffect, useRef, useState } from "react";
import { DynamicIsland } from "@/components/island/dynamic-island";
import type { PageSkin } from "@/components/island/island-look";
import type { IslandBus } from "@/lib/island/bus";
import { ISLAND_DEFAULTS, type IslandConfig } from "@/lib/island/config";
import type { MonitorProfile } from "@/lib/layout";
import { ScreenThumb } from "./screens/screen-thumb";

interface IslandPreviewProps {
  profile: MonitorProfile;
  /** The screen's widget skin, worn by an island whose placement is "skin". */
  skin?: PageSkin;
  /** The bus the Idle, Alert and Notice switch plays on; only this preview listens. */
  bus: IslandBus;
}

/** The real island, fed the screen's island settings, over a picture of the screen at the size the box leaves. */
export function IslandPreview({ profile, skin, bus }: IslandPreviewProps) {
  const config: IslandConfig = profile.island ?? { ...ISLAND_DEFAULTS, enabled: false };
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []);
  return (
    <div className="flex flex-col gap-1.5">
      <div
        ref={box}
        role="group"
        aria-label="Island preview"
        className="relative overflow-hidden rounded-12 border border-ui-default bg-ui-chrome"
        style={{ aspectRatio: profile.width / profile.height }}
      >
        <ScreenThumb profile={profile} />
        {width > 0 && (
          <div className="absolute left-0 top-0 origin-top-left" style={{ width: profile.width, height: profile.height, transform: `scale(${width / profile.width})` }}>
            <DynamicIsland config={config} alerts={[]} placement="absolute" page={{ width: profile.width, height: profile.height }} skin={skin} bus={bus} />
          </div>
        )}
      </div>
      {!config.enabled && <p className="text-caption text-ui-3">The island is off on this screen. This is how it will look when you turn it on</p>}
    </div>
  );
}
