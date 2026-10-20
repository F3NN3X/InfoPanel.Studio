/**
 * Text as InfoPanel draws it with RichTextKit (`SkiaGraphics.DrawString`):
 * anchored at its top-left; `Width` > 0 sets MaxWidth (lines wrap, Right and
 * Center align inside it); Wrap means MaxLines = 1, with an ellipsis when
 * Ellipsis is on; RightAlign with Width 0 ends the text at X. RichTextKit's
 * line height is ascent + descent + leading, which is CSS `line-height: normal`.
 */
import { useLayoutEffect, useRef, useState, type CSSProperties } from "react";
import { Marquee } from "@/components/ui/marquee";
import { cssColor } from "@/lib/infopanel/render/color.ts";
import type { DrawNode, TextStyle } from "@/lib/infopanel/render/scene.ts";
import { visibleText } from "@/lib/infopanel/render/scene.ts";

export type FontCss = (style: TextStyle) => CSSProperties;

type TextNode = Extract<DrawNode, { kind: "text" }>;
type TableNode = Extract<DrawNode, { kind: "table" }>;

/** SKBlendMode names CSS can express; the rest draw normally. */
const BLEND: Record<string, CSSProperties["mixBlendMode"]> = {
  srcover: "normal", screen: "screen", plus: "plus-lighter", multiply: "multiply", overlay: "overlay",
  darken: "darken", lighten: "lighten", colordodge: "color-dodge", colorburn: "color-burn", hardlight: "hard-light",
  softlight: "soft-light", difference: "difference", exclusion: "exclusion", hue: "hue", saturation: "saturation",
  color: "color", luminosity: "luminosity",
};

export function textCss(style: TextStyle, font: FontCss): CSSProperties {
  const decoration = [style.underline && "underline", style.strikeout && "line-through"].filter(Boolean).join(" ");
  const face = font(style);
  const css: CSSProperties = {
    ...face,
    // Glyphs the face lacks: Skia's fallback on Windows, typically Segoe UI.
    fontFamily: `${face.fontFamily}, "Segoe UI", sans-serif`,
    fontSize: style.size,
    lineHeight: "normal",
    color: cssColor(style.color) ?? "transparent",
    textDecoration: decoration || undefined,
    fontKerning: "normal",
  };
  if (style.glow) {
    // Skia blurs with sigma = radius; a CSS shadow's blur is 2 sigma.
    css.textShadow = `0 0 ${style.glow.radius * 2}px ${cssColor(style.glow.color) ?? "transparent"}`;
    css.mixBlendMode = BLEND[style.glow.blend.toLowerCase()] ?? "normal";
  }
  return css;
}

interface Layout {
  x: number;
  y: number;
  width: number;
  height: number;
  rightAlign: boolean;
  centerAlign: boolean;
  oneLine: boolean;
  ellipsis: boolean;
  rotation: number;
}

/** Positioning and line handling for one DrawString call, inside a profile of `canvasWidth`. */
export function layoutCss(l: Layout, canvasWidth: number): CSSProperties {
  const css: CSSProperties = { position: "absolute", top: l.y, margin: 0 };
  if (l.width > 0) {
    Object.assign(css, {
      left: l.x,
      width: l.width,
      whiteSpace: "pre-wrap",
      overflowWrap: "anywhere",
      textAlign: l.centerAlign ? "center" : l.rightAlign ? "right" : "left",
    });
  } else if (l.rightAlign) {
    Object.assign(css, { right: canvasWidth - l.x, whiteSpace: "pre", textAlign: "right" });
  } else {
    Object.assign(css, { left: l.x, whiteSpace: "pre" });
  }
  if (l.oneLine) {
    // RichTextKit truncating to one line with an ellipsis trims characters until the
    // ellipsis fits ("Moderate R..."); without one it keeps the first wrapped line.
    if (l.ellipsis) Object.assign(css, { whiteSpace: "pre", overflow: "hidden", textOverflow: "ellipsis" });
    else Object.assign(css, { maxHeight: "1lh", overflow: "hidden" });
  }
  if (l.rotation !== 0) {
    // DrawString's pivot: the box centre where Width/Height are set, else the measured
    // text's, always measured from X, even when RightAlign moved the text left of X.
    const ox = l.width > 0 ? `${Math.trunc(l.width / 2)}px` : l.rightAlign ? "150%" : "50%";
    const oy = l.height > 0 ? `${Math.trunc(l.height / 2)}px` : "50%";
    Object.assign(css, { transform: `rotate(${l.rotation}deg)`, transformOrigin: `${ox} ${oy}` });
  }
  return css;
}


export function Text({ node, font, canvasWidth }: { node: TextNode; font: FontCss; canvasWidth: number }) {
  if (!node.text) return null;
  if (node.marquee) return <MarqueeText node={node} font={font} canvasWidth={canvasWidth} />;
  const text = visibleText(node.text, node.oneLine, node.ellipsis);
  return (
    <div data-path={node.path} style={{ ...layoutCss(node, canvasWidth), ...textCss(node.style, font) }}>
      {text}
    </div>
  );
}

/**
 * PanelDraw.DrawMarqueeText: when the text is wider than Width it scrolls left at
 * MarqueeSpeed px/s, clipped to Width × (Height or the text height), followed by a
 * second copy MarqueeSpacing px behind. No alignment, wrapping or rotation. The
 * phase follows the wall clock, as InfoPanel's does. Text that fits is drawn as plain text.
 */
function MarqueeText({ node, font, canvasWidth }: { node: TextNode; font: FontCss; canvasWidth: number }) {
  const css = textCss(node.style, font);
  const { speed, spacing } = node.marquee!;
  return (
    <Marquee
      data-path={node.path}
      speed={speed}
      spacing={spacing}
      wallClock
      style={(scrolls) =>
        scrolls
          ? { position: "absolute", left: node.x, top: node.y, width: node.width, ...(node.height > 0 ? { height: node.height } : {}), ...css }
          : { ...layoutCss(node, canvasWidth), ...css }
      }
    >
      {node.text}
    </Marquee>
  );
}

/**
 * PanelDraw.DrawTableSensorDisplay: rows step by the measured height of "A",
 * truncated to whole pixels; each column sits at X + the widths before it + 10 px
 * each, and only columns after the first take RightAlign.
 */
export function Table({ node, font, canvasWidth }: { node: TableNode; font: FontCss; canvasWidth: number }) {
  const probe = useRef<HTMLDivElement>(null);
  const [rowHeight, setRowHeight] = useState(node.style.size * 1.2);
  const css = textCss(node.style, font);
  useLayoutEffect(() => {
    const h = probe.current?.getBoundingClientRect().height;
    if (h) setRowHeight(h);
  }, [css.fontFamily, css.fontWeight, css.fontSize]);

  const cell = (text: string, key: string, dx: number, width: number, row: number, first: boolean) => (
    <div
      key={key}
      data-path={node.path}
      style={{
        ...layoutCss(
          {
            x: node.x + dx, y: node.y + Math.trunc(rowHeight * row), width, height: 0,
            rightAlign: !first && node.rightAlign, centerAlign: node.centerAlign,
            oneLine: node.oneLine, ellipsis: node.ellipsis, rotation: 0,
          },
          canvasWidth,
        ),
        ...css,
      }}
    >
      {visibleText(text, node.oneLine, node.ellipsis)}
    </div>
  );
  return (
    <>
      <div ref={probe} style={{ ...css, position: "absolute", visibility: "hidden", whiteSpace: "pre" }}>
        A
      </div>
      {node.columns.map((c, i) => [
        node.header && cell(c.title, `h${i}`, c.dx, c.width, 0, i === 0),
        ...c.cells.map((t, j) => cell(t, `${i}.${j}`, c.dx, c.width, j + (node.header ? 1 : 0), i === 0)),
      ])}
    </>
  );
}
