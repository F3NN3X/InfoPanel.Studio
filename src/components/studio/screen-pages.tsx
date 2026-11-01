import { useEffect, useRef, useState } from "react";
import { GripVertical, LayoutGrid, RefreshCw, RefreshCwOff } from "lucide-react";
import type { PageRotate, ProfilePage } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { dropRow } from "./inspector/behaviour-model";
import { pageIcon } from "./page-icons";
import { trackPointer } from "./pointer-drag";
import { rotationPageIds, toggleRotationPage } from "./screens-model";

/** A page-order drag in flight: the page and the row it would land on. */
interface Drag {
  id: string;
  to: number;
}

interface ScreenPagesProps {
  pages: ProfilePage[];
  rotate: PageRotate | undefined;
  onMove: (id: string, toIndex: number) => void;
  /** Switch a page in or out of the rotation (the new `rotate.pages`). */
  onRotate: (patch: { pages: string[] | undefined }) => void;
  /** Design, on that page. */
  onOpen: (pageId: string) => void;
}

/**
 * PAGES · ORDER & ROTATION (SPEC §8): a handle to drag the pages into order (the page tabs follow), the page's
 * icon and name, whether the rotation steps through it, and Open (Design on that page). Order and rotation
 * only: renaming, icons, adding (the group header) and deleting stay with the page tabs and the Page inspector.
 */
export function ScreenPages({ pages, rotate, onMove, onRotate, onOpen }: ScreenPagesProps) {
  const rows = useRef<(HTMLElement | null)[]>([]);
  const stop = useRef<() => void>(undefined);
  const [drag, setDrag] = useState<Drag | null>(null);
  useEffect(() => () => stop.current?.(), []);
  const included = rotationPageIds(rotate, pages);
  const start = (e: React.PointerEvent, from: number) => {
    e.preventDefault();
    // The rows as they sit now: the rows move while dragging, the drop math keeps to these.
    // (Only the current pages: the list keeps the refs of pages that were deleted.)
    const rects = rows.current.slice(0, pages.length).map((el) => el?.getBoundingClientRect() ?? new DOMRect());
    const id = pages[from].id;
    let to = from;
    setDrag({ id, to });
    stop.current = trackPointer(
      (ev) => {
        to = dropRow(rects, from, ev.clientY);
        setDrag({ id, to });
      },
      (cancelled) => {
        setDrag(null);
        if (!cancelled && to !== from) onMove(id, to);
      }
    );
  };
  // While dragging, the page shows where it would land.
  const shown = drag
    ? (() => {
        const rest = pages.filter((p) => p.id !== drag.id);
        const moved = pages.find((p) => p.id === drag.id);
        return moved ? [...rest.slice(0, drag.to), moved, ...rest.slice(drag.to)] : pages;
      })()
    : pages;
  return (
    <ul className="flex flex-col">
      {shown.map((page) => {
        const Icon = pageIcon(page.icon) ?? LayoutGrid;
        const inRotation = included.includes(page.id);
        const toggle = toggleRotationPage(rotate, pages, page.id);
        return (
          <li
            key={page.id}
            ref={(el) => {
              rows.current[pages.findIndex((p) => p.id === page.id)] = el;
            }}
            className={cn(
              "flex h-8 items-center gap-1.5 rounded-md border px-1.5 text-[12.5px]",
              drag?.id === page.id ? "border-ui-accent bg-ui-raised text-ui-1" : "border-transparent text-ui-2 hover:bg-ui-hover"
            )}
          >
            <button
              type="button"
              aria-label={`Drag ${page.name} to reorder`}
              title="Drag to reorder"
              onPointerDown={(e) => start(e, pages.findIndex((p) => p.id === page.id))}
              className="flex h-6 w-5 shrink-0 cursor-grab touch-none items-center justify-center rounded text-ui-hint hover:text-ui-2 active:cursor-grabbing"
            >
              <GripVertical className="h-4 w-4" />
            </button>
            <Icon className="h-4 w-4 shrink-0 text-ui-3" />
            <span className="min-w-0 flex-1 truncate">{page.name}</span>
            <button
              type="button"
              aria-pressed={inRotation}
              aria-label={`${page.name} in rotation`}
              title={!toggle ? "The rotation needs at least one page" : inRotation ? "In rotation" : "Not in rotation"}
              disabled={!toggle}
              onClick={() => toggle && onRotate(toggle)}
              className={cn(
                "flex h-6 w-6 shrink-0 items-center justify-center rounded hover:bg-ui-active disabled:pointer-events-none",
                inRotation ? "text-ui-2" : "text-ui-hint"
              )}
            >
              {inRotation ? <RefreshCw className="h-4 w-4" /> : <RefreshCwOff className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => onOpen(page.id)}
              className="rounded-sm px-1 text-[11px] text-ui-accent-text hover:underline"
            >
              Open
            </button>
          </li>
        );
      })}
    </ul>
  );
}
