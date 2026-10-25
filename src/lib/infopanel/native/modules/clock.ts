/**
 * Clock: digital is InfoPanel's own Clock (and a Calendar for the date). Analog is a round face and three
 * needle Gauges bound to the clock plugin's second, minute and 12-hour readings, so the hands move with the
 * time (they step a reading at a time rather than glide).
 */
import { DEFAULT_GAUGE, normalizeGauge } from "../../gauges/vector.ts";
import type { DisplayItem } from "../../schema.ts";
import { argb, bound, fontSizeOf, make, type ConvertContext, type Rect } from "../items.ts";
import { column, container, type Converter } from "./kit.ts";

const CLOCK = /^plugins\.clock-plugin\.clock\./;

const rgb = (c: string) => "#" + c.slice(3);

/** One needle: a gauge over the whole face that draws only a hand, `length` of the radius. */
function hand(ctx: ConvertContext, face: Rect, name: string, key: string, max: number, length: number, width: number, color: string): DisplayItem {
  const vector = normalizeGauge({
    ...DEFAULT_GAUGE,
    width: face.w,
    height: face.h,
    start: 0,
    sweep: 360,
    thickness: 1,
    track: null,
    fill: { ...DEFAULT_GAUGE.fill, mode: "solid", color: rgb(ctx.palette.card) },
    needle: { color: rgb(color), length, width, style: "line" },
  });
  return bound(make("Gauge", ctx, face, name, { MaxValue: max, vector }), key, ctx);
}

export const clock: Converter = (box, ctx, s) => {
  const c = container(ctx.sensors, CLOCK, "second");
  const date = s.showDate !== false;
  if (s.face === "analog") {
    if (!c) return [];
    const side = Math.min(box.w, box.h);
    const face: Rect = { x: box.x + (box.w - side) / 2, y: box.y + (box.h - side) / 2, w: side, h: side };
    const dial = make("Shape", ctx, face, "Dial", { Type: "Ellipse", FillColor: ctx.palette.card, CornerRadius: 0 });
    return [
      dial,
      hand(ctx, face, "Hour hand", c + "12-hour", 12, 0.5, 4, ctx.palette.text),
      hand(ctx, face, "Minute hand", c + "minute", 60, 0.72, 3, ctx.palette.subtext),
      ...(s.showSeconds !== false ? [hand(ctx, face, "Second hand", c + "second", 60, 0.8, 1.5, ctx.palette.accent1)] : []),
    ];
  }
  const [time, day] = date ? column(box, [2.2, 1], 4) : [box, undefined];
  const twelve = s.format === "12h";
  const format = `${twelve ? "hh" : "HH"}:mm${s.showSeconds ? ":ss" : ""}${twelve ? " tt" : ""}`;
  const look = (r: Rect, px: number) => ({ FontSize: fontSizeOf(px), Color: argb(ctx.palette.text), Uppercase: false, CenterAlign: true, Width: Math.round(r.w) });
  return [
    make("Clock", ctx, time, "Time", { ...look(time, time.h * 0.8), Format: format, Bold: true }),
    ...(day ? [make("Calendar", ctx, day, "Date", { ...look(day, day.h * 0.7), Format: "dddd d MMMM", Color: argb(ctx.palette.subtext) })] : []),
  ];
};
