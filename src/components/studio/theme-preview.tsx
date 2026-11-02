import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Minus, Plus } from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { useElementSize } from "@/hooks/use-element-size";
import type { DashboardConfig, MonitorProfile, ProfilePage as Page } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { zoneName } from "./inspector/zone-meta";
import { ProfilePage } from "./profile-page";
import { stepZoom } from "./studio-layout";
import type { ThemeAt } from "./theme-cards";
import { differenceSummary, differencesPill, pageDifferences, type WidgetDifference } from "./theme-differences";
import { previewProfile, type ThemeException } from "./theme-exceptions";
import { previewFit } from "./theme-view-model";

const BUTTON =
  "h-7 shrink-0 rounded-[7px] border border-ui-strong px-[11px] text-body text-ui-1 transition-colors hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";
const ZOOM_BUTTON = "h-7 w-7 rounded-md text-ui-2 hover:bg-ui-default";
const ZOOM_TEXT = "h-[26px] rounded-md px-[9px] text-[11.5px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";
const LINK = "shrink-0 rounded-sm text-body hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

/** The share of the window's height the preview may take before it scrolls. */
const MAX_HEIGHT = 0.7;

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
  /** The Update bar (`ThemeUpdateBar`), in the header before the differences pill and the zoom. */
  bar?: ReactNode;
  /** The toast row, under the header. */
  toast?: ReactNode;
  /** Make these follow the level again, in one change. */
  onFollow: (differences: readonly ThemeException[]) => void;
  onOpenInEdit: (pageId: string, zoneId: string) => void;
}

/**
 * The preview (handoff SPEC §4.4): "Preview", the screen's pages to look at (the level stays), the differences pill,
 * the zoom (Fit by default: the whole screen, at most its real size), the toast row, then the page drawn with the live
 * look at its real aspect ratio, each widget that differs tagged
 * "✎ ‹section›". A widget clicked is selected, and the bar under the canvas says what it uses of its own, with Use
 * theme's value and Open in Edit; with none selected, Make all follow.
 */
export function ThemePreview({ config, at, profile, page, onPage, levelName, differences, bar, toast, onFollow, onOpenInEdit }: ThemePreviewProps) {
  const { ref, w } = useElementSize();
  // Fit, or a zoom picked with − / + / 100% (the frame then scrolls).
  const [zoom, setZoom] = useState<number | "fit">("fit");
  const maxHeight = Math.round(window.innerHeight * MAX_HEIGHT);
  const fit = previewFit(w, maxHeight, profile);
  const scale = w > 0 ? (zoom === "fit" ? fit : zoom) : 0;
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
        <h2 className="text-body font-normal text-ui-soft">Preview</h2>
        <div role="group" aria-label="Page to preview" className="flex gap-0.5 rounded-[7px] border border-ui-strong bg-ui-panel p-0.5">
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
                "rounded-[5px] px-2.5 py-1 text-caption focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent",
                pg.id === page.id ? "bg-[#27272a] text-[#fafafa]" : "text-ui-soft hover:text-ui-1"
              )}
            >
              {pg.name}
            </button>
          ))}
        </div>
        <div className="flex min-w-0 flex-1 justify-end">{bar}</div>
        <button
          type="button"
          aria-pressed={tags}
          onClick={() => setTags((t) => !t)}
          className="flex items-center gap-1.5 rounded-full border border-[#1e3a8a] bg-[#0b1530] px-[9px] py-1 text-caption text-ui-accent-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
        >
          <span className="h-[7px] w-[7px] rounded-full bg-ui-blue" aria-hidden />
          {foreign ? "Differences show on the page you edit" : differencesPill(diffs.size, tags)}
        </button>
        <div role="group" aria-label="Preview zoom" className="flex items-center gap-0.5">
          <IconButton label="Zoom out" className={ZOOM_BUTTON} onClick={() => setZoom(stepZoom(scale, -1))}>
            <Minus className="h-4 w-4" />
          </IconButton>
          <span className="min-w-11 text-center font-ui-mono text-[11.5px] text-ui-1">{Math.round(scale * 100)}%</span>
          <IconButton label="Zoom in" className={ZOOM_BUTTON} onClick={() => setZoom(stepZoom(scale, 1))}>
            <Plus className="h-4 w-4" />
          </IconButton>
          <button
            type="button"
            aria-pressed={zoom === "fit"}
            title="Fit the whole screen, at most its real size"
            onClick={() => setZoom("fit")}
            className={cn(ZOOM_TEXT, zoom === "fit" ? "bg-ui-active text-ui-1" : "text-ui-4 hover:bg-ui-default")}
          >
            Fit
          </button>
          <button
            type="button"
            aria-pressed={zoom === 1}
            title="The screen at its real size"
            onClick={() => setZoom(1)}
            className={cn(ZOOM_TEXT, zoom === 1 ? "bg-ui-active text-ui-1" : "text-ui-4 hover:bg-ui-default")}
          >
            100%
          </button>
        </div>
      </div>
      {toast}
      <div ref={ref} className="w-full overflow-auto p-px" style={{ maxHeight }} onClick={() => setSelected(undefined)}>
        {scale > 0 && (
          <div
            ref={drawn}
            className="relative mx-auto overflow-hidden rounded-[10px] bg-s-well ring-1 ring-ui-strong"
            style={{ width: profile.width * scale, height: profile.height * scale }}
          >
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
                    "absolute rounded-ui-sm -outline-offset-2 focus-visible:outline-2 focus-visible:outline-ui-accent",
                    selected === b.id && "outline outline-2 outline-ui-accent"
                  )}
                  style={{ left: b.left, top: b.top, width: b.width, height: b.height }}
                >
                  {tags && d && (
                    <span className="absolute -right-[7px] -top-[7px] whitespace-nowrap rounded-full bg-ui-blue px-[7px] py-0.5 text-[10px] font-semibold text-white shadow-[0_0_0_2px_#09090b]">
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
        <div className="flex flex-wrap items-center gap-4 rounded-[10px] border border-ui-strong bg-ui-panel px-4 py-3.5">
          <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
            <p className="truncate text-[14px] font-semibold text-ui-1">
              {zoneName(zone)} <span className="font-normal text-ui-hint">· widget on {page.name}</span>
            </p>
            <p className="text-body text-ui-soft">{differenceSummary(zone, diff, levelName)}</p>
          </div>
          {diff && (
            <button type="button" className={BUTTON} onClick={() => onFollow(diff.exceptions)}>
              Use theme's value
            </button>
          )}
          <button type="button" className={`${LINK} text-ui-accent`} onClick={() => onOpenInEdit(page.id, zone.id)}>
            Open in Edit ↗
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-4 text-body text-ui-hint">
          <span>Click a widget to see what it changes.</span>
          {diffs.size > 0 && (
            <button type="button" className={`${LINK} text-ui-soft`} onClick={() => onFollow([...diffs.values()].flatMap((d) => d.exceptions))}>
              Make all follow
            </button>
          )}
        </div>
      )}
    </section>
  );
}
