import { memo } from "react";
import type { MonitorProfile } from "@/lib/layout";
import { screenKind } from "@/lib/screens/list";
import { cn } from "@/lib/utils";
import { PageMap } from "./page-map";
import { aspectOf } from "./profile-card";

/**
 * A screen's pages as a strip of mini-maps under its thumbnail: each is a button that opens Edit on that page. A
 * screen of one page has no strip, its thumbnail is the page. It lies along the thumbnail's bottom edge, so every card keeps its height.
 */
export const PageStrip = memo(function PageStrip({ profile, onOpen, inline = false }: { profile: MonitorProfile; onOpen: (screenId: string, pageId: string) => void; inline?: boolean }) {
  // An InfoPanel screen opens in its own editor and its pages are canvases the schematic cannot draw: no strip.
  if (profile.pages.length < 2 || screenKind(profile) === "infopanel") return null;
  const aspect = aspectOf(profile.width, profile.height);
  return (
    <div role="group" aria-label={`Pages of ${profile.name}`} onClick={(e) => e.stopPropagation()} className={cn("flex gap-1 overflow-x-auto", inline ? "max-w-55" : "absolute inset-x-0 bottom-0 bg-gradient-to-t from-ui-app/90 to-transparent px-1.5 pb-1.5 pt-3")}>
      {profile.pages.map((page) => (
        <div key={page.id} className="w-11 shrink-0">
          <button
            type="button"
            title={`Open ${page.name}`}
            aria-label={`Open ${profile.name}, ${page.name}`}
            onClick={() => onOpen(profile.id, page.id)}
            className="block w-full overflow-hidden rounded border border-ui-strong hover:border-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
          >
            <div style={{ aspectRatio: aspect }}>
              <PageMap profile={profile} page={page} />
            </div>
          </button>
        </div>
      ))}
    </div>
  );
});
