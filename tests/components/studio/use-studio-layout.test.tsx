import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SCROLL_ROW_H, type ProfileView } from "@/lib/layout";
import { ScreenFold } from "@/components/studio/screen-fold";
import { fitZoomFor } from "@/components/studio/studio-layout";
import { pageSize } from "@/components/studio/use-studio-layout";

const profile = (p: Partial<ProfileView>): ProfileView =>
  ({ width: 1024, height: 600, cols: 9, rows: 11, fit: "scroll", gap: 0, padding: 0, ...p }) as ProfileView;

describe("pageSize", () => {
  it("is the design size in both fit modes", () => {
    expect(pageSize(profile({ fit: "fill" }))).toMatchObject({ width: 1024, height: 600 });
    expect(pageSize(profile({ fit: "scroll" }))).toMatchObject({ width: 1024, height: 600 });
  });

  it("does not change with the grid: rows and columns only subdivide the page", () => {
    for (const fit of ["fill", "scroll"] as const) {
      const base = pageSize(profile({ fit }));
      for (const grid of [{ cols: 4 }, { cols: 24 }, { rows: 2 }, { rows: 24 }]) {
        const next = pageSize(profile({ fit, ...grid }));
        expect([next.width, next.height]).toEqual([base.width, base.height]);
      }
    }
  });

  it("reports a scroll page's grid height so the part past the screen can be shown", () => {
    expect(pageSize(profile({ fit: "scroll", rows: 11 })).naturalHeight).toBe(11 * SCROLL_ROW_H);
    expect(pageSize(profile({ fit: "fill" })).naturalHeight).toBeUndefined();
  });

  it("fits the zoom to the screen, so changing rows never rescales the page", () => {
    const box = { width: 1200, height: 800 };
    const zooms = [2, 11, 24].map((rows) => fitZoomFor(box, pageSize(profile({ rows }))));
    expect(new Set(zooms).size).toBe(1);
  });
});

describe("ScreenFold", () => {
  it("marks where the screen ends, constant on screen at any zoom", () => {
    const out = renderToString(<ScreenFold height={600} zoom={0.5} />);
    expect(out).toContain("Screen ends at 600 px");
    expect(out).toContain("top:600px");
    expect(out).toContain("3px dashed");
  });
});
