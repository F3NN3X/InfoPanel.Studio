import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useElementSize } from "@/hooks/use-element-size";
import type { DashboardConfig, MonitorProfile, ProfilePage as Page } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { zoneName } from "./inspector/zone-meta";
import { ProfilePage } from "./profile-page";
import type { ThemeAt } from "./theme-cards";
import { differenceSummary, differencesPill, pageDifferences, type WidgetDifference } from "./theme-differences";
import { previewProfile, type ThemeException } from "./theme-exceptions";

const BUTTON =
  "h-7 shrink-0 rounded-[7px] border border-ui-strong px-[11px] text-[13px] text-ui-1 transition-colors hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";
const LINK = "shrink-0 rounded-sm text-[13px] hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** A widget's box on the scaled canvas, in px from its top left. */
interface Box {
  id: string;
  left: number;
  top: number;
  width: number;
  height: number;
}

interface ThemePreviewProps {
  config: DashboardConfig;
  at: ThemeAt;
  profile: MonitorProfile;
  /** The page drawn: any page of the screen, whatever the level. */
  page: Page;
  onPage: (pageId: string) => void;
  /** The level's name ("Everything else follows ‹level›"). */
  levelName: string;
  /** What below the level doesn't follow it, the theme's own writes left out (`differencesOf`). */
  differences: readonly ThemeException[];
  /** The toast row, under the header. */
  toast?: ReactNode;
  /** Make these follow the level again, in one change. */
  onFollow: (differences: readonly ThemeException[]) => void;
  onOpenInEdit: (pageId: string, zoneId: string) => void;
}

/**
 * The preview (handoff SPEC §4.4): "Preview", the screen's pages to look at (the level stays), the differences pill,
 * the toast row, then the page drawn with the live look at its real aspect ratio, each widget that differs tagged
 * "✎ ‹section›". A widget clicked is selected, and the bar under the canvas says what it uses of its own, with Use
 * theme's value and Open in Edit; with none selected, Make all follow.
 */
export function ThemePreview({ config, at, profile, page, onPage, levelName, differences, toast, onFollow, onOpenInEdit }: ThemePreviewProps) {
  const { ref, w } = useElementSize();
  const scale = profile.width > 0 ? w / profile.width : 0;
  const [selected, setSelected] = useState<string>();
  const [tags, setTags] = useState(true);
  const [boxes, setBoxes] = useState<Box[]>([]);
  const drawn = useRef<HTMLDivElement>(null);
  // At a page level only that page's widgets are measured against it; another page previewed shows no differences.
  const foreign = at.level === "page" && page.id !== at.pageId;
  const diffs = foreign ? new Map<string, WidgetDifference>() : pageDifferences(differences, page.id);
  const zone = page.placements.find((z) => z.id === selected);
  const diff = zone ? diffs.get(zone.id) : undefined;

  // A selection belongs to the page and level it was made on.
  useEffect(() => setSelected(undefined), [page.id, profile.id]);

  // The widgets' boxes, measured once drawn and again whenever the drawn page changes size (a font or image that
  // loads late): the click targets and tags sit over the inert page.
  useLayoutEffect(() => {
    const root = drawn.current;
    if (!root || scale <= 0) {
      setBoxes([]);
      return;
    }
    const measure = () => {
      const origin = root.getBoundingClientRect();
      setBoxes(
        [...root.querySelectorAll<HTMLElement>("[data-preview-zone]")].map((el) => {
          const r = el.getBoundingClientRect();
          return { id: el.dataset.previewZone!, left: r.left - origin.left, top: r.top - origin.top, width: r.width, height: r.height };
        })
      );
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    for (const el of root.querySelectorAll("[data-preview-zone]")) observer.observe(el);
    return () => observer.disconnect();
  }, [config, profile, page.id, at, scale]);

  return (
    <section aria-label="Preview" className="flex w-full min-w-0 flex-col gap-3.5">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-[13px] font-normal text-[#a1a1aa]">Preview</h2>
        <div role="group" aria-label="Page to preview" className="flex gap-0.5 rounded-[7px] border border-ui-strong bg-[#131316] p-0.5">
          {profile.pages.map((pg) => (
            <button
              key={pg.id}
              type="button"
              aria-pressed={pg.id === page.id}
              onClick={() => {
                setSelected(undefined);
                onPage(pg.id);
              }}
              className={cn(
                "rounded-[5px] px-2.5 py-1 text-[12px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
                pg.id === page.id ? "bg-[#27272a] text-[#fafafa]" : "text-[#a1a1aa] hover:text-ui-1"
              )}
            >
              {pg.name}
            </button>
          ))}
        </div>
        <div className="flex-1" />
        <button
          type="button"
          aria-pressed={tags}
          onClick={() => setTags((t) => !t)}
          className="flex items-center gap-1.5 rounded-full border border-[#1e3a8a] bg-[#0b1530] px-[9px] py-1 text-[12px] text-[#93c5fd] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
        >
          <span className="h-[7px] w-[7px] rounded-full bg-[#3b82f6]" aria-hidden />
          {foreign ? "Differences show on the page you edit" : differencesPill(diffs.size, tags)}
        </button>
      </div>
      {toast}
      <div
        ref={ref}
        className="relative w-full overflow-hidden rounded-[10px] border border-ui-strong bg-[#070709]"
        style={{ height: profile.height * scale }}
        onClick={() => setSelected(undefined)}
      >
        {scale > 0 && (
          <div ref={drawn} className="absolute inset-0">
            <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ scale: String(scale) }} inert>
              <ProfilePage
                profile={previewProfile(profile, at)}
                dashboard={config}
                pageId={page.id}
                badge={(p) => <span data-preview-zone={p.id} className="pointer-events-none absolute inset-0" />}
              />
            </div>
            {boxes.map((b) => {
              const d = diffs.get(b.id);
              const z = page.placements.find((x) => x.id === b.id);
              return (
                <button
                  key={b.id}
                  type="button"
                  aria-label={z ? zoneName(z) : b.id}
                  aria-pressed={selected === b.id}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(b.id);
                  }}
                  className={cn(
                    "absolute rounded-[6px] -outline-offset-2 focus-visible:outline-2 focus-visible:outline-ui-accent",
                    selected === b.id && "outline outline-2 outline-[#60a5fa]"
                  )}
                  style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
                >
                  {tags && d && (
                    <span className="absolute -right-[7px] -top-[7px] whitespace-nowrap rounded-full bg-[#3b82f6] px-[7px] py-0.5 text-[10px] font-semibold text-white shadow-[0_0_0_2px_#09090b]">
                      ✎ {d.exceptions[0].card.title}
                      {d.exceptions.length > 1 ? ` +${d.exceptions.length - 1}` : ""}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>
      {zone ? (
        <div className="flex flex-wrap items-center gap-4 rounded-[10px] border border-ui-strong bg-[#111113] px-4 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <p className="truncate text-[14px] font-semibold text-ui-1">
              {zoneName(zone)} <span className="font-normal text-[#71717a]">· widget on {page.name}</span>
            </p>
            <p className="text-[13px] text-[#a1a1aa]">{differenceSummary(zone, diff, levelName)}</p>
          </div>
          {diff && (
            <button type="button" className={BUTTON} onClick={() => onFollow(diff.exceptions)}>
              Use theme's value
            </button>
          )}
          <button type="button" className={`${LINK} text-[#60a5fa]`} onClick={() => onOpenInEdit(page.id, zone.id)}>
            Open in Edit ↗
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4 text-[13px] text-[#71717a]">
          <span>Click a widget to see what it changes.</span>
          {diffs.size > 0 && (
            <button type="button" className={`${LINK} text-[#a1a1aa]`} onClick={() => onFollow([...diffs.values()].flatMap((d) => d.exceptions))}>
              Make all follow
            </button>
          )}
        </div>
      )}
    </section>
  );
}
