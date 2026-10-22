import { Component, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Placement } from "@/lib/layout";
import type { Appearance } from "@/lib/style-resolve";
import { fitsIn, sizeText, type AddItem } from "./add-catalog";
import { AddItemIcon, PartIcon } from "./add-row";
import { LivePlacement } from "./placement-content";

/** The preview card (handoff SPEC §5): the highlighted row's live widget or schematic, and its description. */

export const PREVIEW_WIDTH = 332;
/** The card height the top clamp assumes. */
const CLAMP_HEIGHT = 400;
const STAGE_W = 300;
const STAGE_H = 172;
/** A widget renders at its native cell size, then scales down to the stage. */
const CELL = 150;
const CELL_GAP = 10;

/** The card's top for a row at `rowTop` (viewport px): 8 px above it, kept 52 px from the top and 12 px inside the bottom. */
export function previewTop(rowTop: number, windowHeight: number): number {
  return Math.max(52, Math.min(rowTop - 8, windowHeight - 12 - CLAMP_HEIGHT));
}

/** A widget's native size and the scale (never above 1) that fits it in the stage. */
export function previewScale(w: number, h: number): { width: number; height: number; scale: number } {
  const width = w * CELL + (w - 1) * CELL_GAP;
  const height = h * CELL + (h - 1) * CELL_GAP;
  return { width, height, scale: Math.min(1, STAGE_W / width, STAGE_H / height) };
}

/** A failed widget shows its icon and "Preview unavailable", never the error. */
class PreviewBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

function StageNote({ item, text }: { item: AddItem; text: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <AddItemIcon item={item} size={40} />
      <span className="text-[11.5px] text-[#7c7c86]">{text}</span>
    </div>
  );
}

/** The real widget at its default size, live, under the page's theme. */
function WidgetStage({ item, appearance, pageStyle }: { item: AddItem; appearance?: Appearance; pageStyle?: CSSProperties }) {
  const { width, height, scale } = previewScale(item.w, item.h);
  // A view row adds the widget with that view set: preview it the same way.
  const settings = item.drop.kind === "module" ? item.drop.settings : undefined;
  const placement: Placement = { id: `add-preview:${item.id}`, module: item.drop.id, settings, colStart: 1, rowStart: 1, colSpan: item.w, rowSpan: item.h, visible: true };
  return (
    <PreviewBoundary fallback={<StageNote item={item} text="Preview unavailable" />}>
      <LivePlacement placement={placement} appearance={appearance} studio>
        {({ content, scope }) =>
          content == null ? (
            <StageNote item={item} text="No live data yet" />
          ) : (
            <div className="overflow-hidden rounded-[8px]" style={{ width: width * scale, height: height * scale }}>
              <div className="origin-top-left text-foreground" style={{ ...pageStyle, ...scope, width, height, transform: `scale(${scale})` }}>
                {content}
              </div>
            </div>
          )
        }
      </LivePlacement>
    </PreviewBoundary>
  );
}

/** A panel or layout as one tile per item, in its flow. */
function Schematic({ item }: { item: AddItem }) {
  return (
    <div
      className="flex flex-wrap gap-1.5 overflow-hidden rounded-[8px] border border-[#27272a] bg-[#18181b] p-2.5"
      style={{ width: Math.min(STAGE_W, item.w * 70), height: Math.min(STAGE_H, item.h * 70), flexDirection: item.dir === "column" ? "column" : "row" }}
    >
      {(item.parts ?? []).map((part, i) => (
        <div key={i} className="flex min-h-0 min-w-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-[6px] bg-[#1f1f24] px-1">
          <PartIcon kind={part.kind} />
          <span className="max-w-full truncate text-[10.5px] text-[#8a8a94]">{part.label}</span>
        </div>
      ))}
    </div>
  );
}

const KIND_NAME = { panel: "Panel", layout: "Layout" } as const;

interface AddPreviewProps {
  item: AddItem;
  /** Viewport px: the panel's right edge + 10, and the clamped top. */
  left: number;
  top: number;
  /** How the row was highlighted (the action line says Click or Enter). */
  via: "mouse" | "key";
  target?: { cols: number; rows: number };
  appearance?: Appearance;
  /** The page's theme variables and font, so the widget looks as it will on the canvas. */
  pageStyle?: CSSProperties;
}

export function AddPreview({ item, left, top, via, target, appearance, pageStyle }: AddPreviewProps) {
  const fits = !target || fitsIn(item, target.cols, target.rows);
  const zone = target && sizeText(target.cols, target.rows);
  const action = !target
    ? `${via === "key" ? "Enter" : "Click"} to add · drag to place`
    : fits
      ? `Click to fill the ${zone} zone`
      : `Too big for the ${zone} zone`;
  return createPortal(
    <div
      aria-hidden
      className="add-preview-in pointer-events-none fixed z-[60] overflow-hidden rounded-[12px] border border-ui-strong bg-[#141418] font-ui shadow-[0_18px_48px_rgba(0,0,0,.55)]"
      style={{ left, top, width: PREVIEW_WIDTH }}
    >
      <div
        className="flex h-[200px] items-center justify-center border-b border-ui-subtle bg-[#0c0c0e]"
        style={{ backgroundImage: "radial-gradient(#1a1a1f 1px, transparent 1px)", backgroundSize: "12px 12px" }}
      >
        {item.kind === "widget" ? <WidgetStage item={item} appearance={appearance} pageStyle={pageStyle} /> : <Schematic item={item} />}
      </div>
      <div className="flex flex-col gap-2 px-3.5 pb-3.5 pt-3">
        <div className="flex items-baseline gap-2">
          <span className="truncate text-[14px] font-semibold text-ui-1">{item.name}</span>
          <span className="shrink-0 text-[11.5px] text-[#7c7c86]">{item.kind === "widget" ? item.category : KIND_NAME[item.kind]}</span>
        </div>
        <p className="text-pretty text-[12px] leading-[1.5] text-[#a1a1aa]">{item.description || item.blurb}</p>
        <div className="flex items-center gap-2 text-[11.5px] text-[#8a8a94]">
          <span className="rounded-[4px] bg-ui-subtle px-1.5 py-0.5 font-ui-mono text-[11px] text-[#c8c8ce]">{sizeText(item.w, item.h)}</span>
          {item.mw === 1 && item.mh === 1 ? "Adapts down to 1×1" : `Needs at least ${sizeText(item.mw, item.mh)}`}
        </div>
        <div
          className="border-t border-ui-subtle pt-2 text-[11.5px]"
          style={{ color: !target ? "#8a8a94" : fits ? "oklch(0.85 0.10 255)" : "oklch(0.80 0.13 60)" }}
        >
          {action}
        </div>
      </div>
    </div>,
    document.body
  );
}
