import { Toggle } from "@/components/ui/toggle";
import { FOCUS_RING } from "@/components/ui/button";
import type { MonitorProfile } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { PageMap } from "../screens/page-map";
import { aspectOf } from "../screens/profile-card";

interface PinnedPagesProps {
  profile: MonitorProfile;
  current: string;
  onSelect: (pageId: string) => void;
  /** Draw the pinned layer on the thumbnails (a studio preference, the page tabs' thumbnails follow it too). */
  showPinned: boolean;
  onShowPinned: (on: boolean) => void;
}

/** Under the canvas while Edit shows the pinned layer: the profile's pages as thumbnails, with the layer on them or not. */
export function PinnedPages({ profile, current, onSelect, showPinned, onShowPinned }: PinnedPagesProps) {
  return (
    <section aria-label={`Pages in ${profile.name}`} className="shrink-0 border-t border-ui-subtle bg-ui-chrome px-4 py-3 font-ui">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-body font-semibold text-ui-1">{`Pages in ${profile.name}`}</h2>
        <label className="flex items-center gap-2 text-body text-ui-2">
          <Toggle checked={showPinned} onChange={onShowPinned} label="Show the pinned layer on thumbnails" />
          Show the pinned layer on thumbnails
        </label>
      </div>
      <div className="flex gap-3 overflow-x-auto pb-1">
        {profile.pages.map((p) => (
          <button key={p.id} type="button" aria-current={p.id === current ? "page" : undefined} onClick={() => onSelect(p.id)} className={cn("flex shrink-0 flex-col gap-1.5 rounded-ui-md text-left", FOCUS_RING)}>
            <span className={cn("block overflow-hidden rounded-ui-md border", p.id === current ? "border-ui-blue" : "border-ui-edge")} style={{ width: 150, aspectRatio: aspectOf(profile.width, profile.height) }}>
              <PageMap profile={profile} page={p} pinned={showPinned} />
            </span>
            <span className={cn("text-caption", p.id === current ? "text-ui-1" : "text-ui-3")}>{p.name}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
