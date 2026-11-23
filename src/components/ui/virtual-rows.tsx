import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { offsetsOf, rowAt, stickyBefore, windowRange } from "@/lib/virtual-window";
import { cn } from "@/lib/utils";

interface VirtualRowsProps<T> {
  rows: readonly T[];
  /** A row's stable key. */
  rowKey: (row: T) => string;
  /** A row's fixed height (px). Keep it stable between renders. */
  rowHeight: (row: T) => number;
  /** Rows that pin to the top while the rows under them scroll. With `renderPinned`. */
  isSticky?: (row: T) => boolean;
  /** The pinned copy of a sticky row: for the pointer only (the real row stays in the list). */
  renderPinned?: (row: T) => ReactNode;
  /** Rows the keyboard lands on (default all). A focusable row draws `data-row` and takes the `tabIndex` it is given. */
  isFocusable?: (row: T) => boolean;
  renderRow: (row: T, tabIndex: 0 | -1) => ReactNode;
  /** The rows now drawn (the window over the list), reported when it changes. Keep it stable between renders. */
  onVisible?: (rows: T[]) => void;
  /** A change starts the list again: scrolled to the top, the first row the Tab stop. Pass the filters (a search). */
  resetKey?: string;
  className?: string;
  role?: string;
  "aria-label"?: string;
}

/** Up and Down move between the drawn focusable rows. */
function onListKeyDown(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
  const here = e.target instanceof Element ? e.target.closest<HTMLElement>("[data-row]") : null;
  if (!here || e.target !== here) return;
  const step = (el: Element | null | undefined) => (e.key === "ArrowDown" ? el?.nextElementSibling : el?.previousElementSibling);
  let next = step(here.parentElement);
  while (next && !next.querySelector("[data-row]")) next = step(next);
  const row = next?.querySelector<HTMLElement>("[data-row]");
  if (!row) return;
  e.preventDefault();
  row.focus();
}

/**
 * A fixed-row-height window over a flat list: only the rows in view (and a few either side) are drawn. A sticky row stays
 * pinned on top. The list is one Tab stop; Up, Down, Home and End move between rows. A new `resetKey` (the filters)
 * starts the list scrolled to the top. It reads no layout of its own: the scroll position and the height come from events.
 */
export function VirtualRows<T>({ rows, rowKey, rowHeight, isSticky, renderPinned, isFocusable, renderRow, onVisible, resetKey, className, role, "aria-label": label }: VirtualRowsProps<T>) {
  const ref = useRef<HTMLDivElement>(null);
  /** The row that is the list's one Tab stop: the last focused one, else the first drawn. */
  const [active, setActive] = useState<string | null>(null);
  /** A row Home or End asked for that may still be scrolled out. */
  const pending = useRef<string | null>(null);
  const [view, setView] = useState({ top: 0, height: 600 });
  /** Where the list is scrolled, as the scroll events (and Home or End) last said, so a reset writes `scrollTop` only when it must. */
  const scrolled = useRef(0);
  const [seenKey, setSeenKey] = useState(resetKey);
  if (seenKey !== resetKey) {
    setSeenKey(resetKey);
    setActive(null);
    setView((v) => (v.top === 0 ? v : { ...v, top: 0 }));
  }
  useLayoutEffect(() => {
    if (scrolled.current === 0 || !ref.current) return;
    scrolled.current = 0;
    ref.current.scrollTop = 0;
  }, [resetKey]);
  const offsets = useMemo(() => offsetsOf(rows, rowHeight), [rows, rowHeight]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1];
      const height = box.borderBoxSize?.[0]?.blockSize ?? box.contentRect.height;
      setView((v) => (v.height === height ? v : { ...v, height }));
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const { start, end } = windowRange(offsets, view.top, view.height);
  const pinned = isSticky ? rows[stickyBefore(rows, rowAt(offsets, view.top), isSticky)] : undefined;
  const drawn = rows.slice(start, end);
  const keys = drawn.map(rowKey).join("\n");
  const canFocus = (r: T) => isFocusable?.(r) ?? true;

  const firstFocusable = drawn.find(canFocus);
  const stop = drawn.some((r) => rowKey(r) === active && canFocus(r)) ? active : firstFocusable && rowKey(firstFocusable);

  const lastFocusable = () => {
    for (let i = rows.length - 1; i >= 0; i--) if (canFocus(rows[i])) return i;
    return -1;
  };

  /** Focus the row Home or End asked for once it is drawn. */
  const focusPending = () => {
    if (pending.current === null) return;
    const el = ref.current?.querySelector<HTMLElement>(`[data-key="${CSS.escape(pending.current)}"] [data-row]`);
    if (!el) return;
    pending.current = null;
    el.focus();
  };
  useEffect(focusPending, [start, end]);

  const latest = useRef(drawn);
  latest.current = drawn;
  useEffect(() => onVisible?.(latest.current), [keys, onVisible]);
  useEffect(() => () => onVisible?.([]), [onVisible]);

  return (
    <div
      ref={ref}
      role={role}
      aria-label={label}
      onScroll={(e) => {
        const top = e.currentTarget.scrollTop;
        scrolled.current = top;
        setView((v) => ({ ...v, top }));
      }}
      onKeyDown={(e) => {
        onListKeyDown(e);
        if ((e.key !== "Home" && e.key !== "End") || e.altKey || e.ctrlKey || e.metaKey) return;
        if (!(e.target instanceof Element) || e.target !== e.target.closest("[data-row]")) return;
        const at = e.key === "Home" ? rows.findIndex(canFocus) : lastFocusable();
        if (at < 0) return;
        e.preventDefault();
        pending.current = rowKey(rows[at]);
        setActive(pending.current);
        scrolled.current = offsets[at];
        e.currentTarget.scrollTop = offsets[at];
        setView((v) => ({ ...v, top: offsets[at] }));
        focusPending();
      }}
      onFocus={(e) => {
        const key = e.target instanceof Element && e.target.hasAttribute("data-row") ? e.target.parentElement?.getAttribute("data-key") : null;
        if (key) setActive(key);
      }}
      className={cn("relative min-h-0 flex-1 overflow-y-auto", className)}
    >
      {pinned && renderPinned && <div className="sticky top-0 z-10 h-0">{renderPinned(pinned)}</div>}
      <div className="relative" style={{ height: offsets[offsets.length - 1] }}>
        {drawn.map((row, i) => (
          <div key={rowKey(row)} data-key={rowKey(row)} className="absolute inset-x-0" style={{ top: offsets[start + i], height: rowHeight(row) }}>
            {renderRow(row, rowKey(row) === stop ? 0 : -1)}
          </div>
        ))}
      </div>
    </div>
  );
}
