import { createPortal } from "react-dom";
import type { MonitorProfile, ProfilePage } from "@/lib/layout";
import { THUMB_W } from "./page-thumb";
import { PageMap } from "./screens/page-map";
import { aspectOf } from "./screens/profile-card";

/** A page's schematic (the Screens card's `PageMap`, with the pinned layer when `pinned`) and name, under its tab. Decorative: the tab names the page. */
export default function PageThumb({ profile, page, left, top, pinned }: { profile: MonitorProfile; page: ProfilePage; left: number; top: number; pinned?: boolean }) {
  return createPortal(
    <div
      aria-hidden
      data-testid="page-thumb"
      className="pointer-events-none fixed z-[60] overflow-hidden rounded-ui-md border border-ui-strong bg-ui-tile font-ui shadow-ui-float"
      style={{ left, top, width: THUMB_W }}
    >
      <div style={{ aspectRatio: aspectOf(profile.width, profile.height) }}>
        <PageMap profile={profile} page={page} pinned={pinned} />
      </div>
      <div className="truncate border-t border-ui-subtle px-2 py-1 text-micro text-ui-3">{page.name}</div>
    </div>,
    document.body
  );
}
