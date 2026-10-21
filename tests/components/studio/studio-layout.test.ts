import { describe, expect, it } from "vitest";
import {
  CANVAS_PAD_X,
  CANVAS_PAD_Y,
  FIT_MIN,
  FLOAT_INSET,
  computeLayout,
  fitZoomFor,
  inspectorMode,
  leftPanelFits,
  nearestSnap,
  sheetHeight,
  stepZoom,
  ZOOM_STEPS,
  type LayoutInput,
} from "@/components/studio/studio-layout";

const RAIL = 52;
const SIDE = 320;

/** A studio body under the 2000x1180 window's top bar. */
const BODY = { width: 2000, height: 1130 };

function layout(patch: Partial<LayoutInput> & Pick<LayoutInput, "page">) {
  return computeLayout({ body: BODY, rail: RAIL, inspector: SIDE, ...patch });
}

describe("inspectorMode", () => {
  it("docks from 960 px, floats from 600 px, and is a sheet below (SPEC §3.5)", () => {
    expect(inspectorMode(1440)).toBe("docked");
    expect(inspectorMode(1279)).toBe("docked");
    expect(inspectorMode(960)).toBe("docked");
    expect(inspectorMode(959)).toBe("floating");
    expect(inspectorMode(900)).toBe("floating");
    expect(inspectorMode(600)).toBe("floating");
    expect(inspectorMode(599)).toBe("sheet");
    expect(inspectorMode(390)).toBe("sheet");
  });

  it("is picked from the window's width when computing the layout, not the body's", () => {
    const body = { width: 900, height: 800 };
    expect(computeLayout({ body, rail: 48, inspector: SIDE, page: { width: 1920, height: 550 } }).mode).toBe("floating");
    expect(computeLayout({ body, windowWidth: 960, rail: 72, inspector: SIDE, page: { width: 1920, height: 550 } }).mode).toBe("docked");
  });

  it("docks before the studio is measured", () => {
    expect(inspectorMode(0)).toBe("docked");
  });
});

describe("fitZoomFor", () => {
  it("fits width and height, whichever is tighter", () => {
    const box = { width: 1000 + CANVAS_PAD_X, height: 500 + CANVAS_PAD_Y };
    // (1080 - 80) / 1000 = 1, (660 - 160) / 1000 = 0.5
    expect(fitZoomFor(box, { width: 1000, height: 1000 })).toBe(0.5);
    expect(fitZoomFor({ width: 500 + CANVAS_PAD_X, height: 9999 }, { width: 1000, height: 100 })).toBe(0.5);
  });

  it("fits the width only without a page height", () => {
    expect(fitZoomFor({ width: 1000 + CANVAS_PAD_X, height: 10 }, { width: 1000, height: 0 })).toBe(1);
  });

  it("floors to 1% so the page never overshoots", () => {
    const z = fitZoomFor({ width: 1000, height: 9999 }, { width: 1920, height: 100 });
    expect(z).toBe(0.47);
    expect(1920 * z + CANVAS_PAD_X).toBeLessThanOrEqual(1000);
  });

  it("clamps to the zoom range", () => {
    expect(fitZoomFor({ width: 99999, height: 99999 }, { width: 100, height: 100 })).toBe(2);
    expect(fitZoomFor({ width: 100, height: 100 }, { width: 5000, height: 5000 })).toBe(FIT_MIN);
  });

  it("fits a 1920 px page into a phone's 390 px canvas, below the lowest zoom stop", () => {
    expect(fitZoomFor({ width: 390, height: 600 }, { width: 1920, height: 550 })).toBe(0.16);
  });

  it("is 100% for an unknown page and the lowest fit for a box with no room", () => {
    expect(fitZoomFor({ width: 500, height: 500 }, { width: 0, height: 0 })).toBe(1);
    expect(fitZoomFor({ width: 0, height: 0 }, { width: 800, height: 480 })).toBe(FIT_MIN);
  });

  it("keeps the page clear of an inset", () => {
    const box = { width: 1000 + CANVAS_PAD_X + FLOAT_INSET, height: 9999 };
    expect(fitZoomFor(box, { width: 1000, height: 100 }, { right: FLOAT_INSET })).toBe(1);
    expect(fitZoomFor(box, { width: 1000, height: 100 })).toBeGreaterThan(1);
  });
});

describe("computeLayout", () => {
  const strip = { width: 1920, height: 550 };

  it("docks the inspector beside the canvas on a wide studio, whatever the profile", () => {
    const l = layout({ page: strip });
    expect(l.mode).toBe("docked");
    expect(l.canvasWidth).toBe(2000 - RAIL - SIDE);
    expect(l.canvasHeight).toBe(BODY.height);
    expect(l.inset).toEqual({});
  });

  it("frees the docked column for the canvas while collapsed", () => {
    expect(layout({ page: strip, collapsed: true }).canvasWidth).toBe(2000 - RAIL);
  });

  it("floats over a narrower studio: the canvas keeps the full width until the panel opens", () => {
    const body = { width: 900, height: 700 };
    const closed = layout({ page: strip, body });
    expect(closed.mode).toBe("floating");
    expect(closed.canvasWidth).toBe(900 - RAIL);
    expect(closed.inset).toEqual({});
    const open = layout({ page: strip, body, floatOpen: true });
    expect(open.canvasWidth).toBe(900 - RAIL);
    expect(open.inset).toEqual({ right: FLOAT_INSET });
    // The page fits into what the panel leaves.
    expect(open.fitZoom).toBeLessThan(closed.fitZoom);
  });

  it("ignores a collapsed flag outside the docked mode", () => {
    expect(layout({ page: strip, body: { width: 900, height: 700 }, collapsed: true }).canvasWidth).toBe(900 - RAIL);
  });

  it("narrows the canvas by the open left panel", () => {
    expect(layout({ page: strip, drawer: 256 }).canvasWidth).toBe(2000 - RAIL - 256 - SIDE);
  });

  it("fits a scroll page to the width only", () => {
    expect(layout({ page: { width: 1920, height: 0, naturalHeight: 400 } }).fitZoom).toBe(
      Math.floor(((2000 - RAIL - SIDE - CANVAS_PAD_X) / 1920) * 100) / 100
    );
  });

  it("never reports negative boxes, and docks an unmeasured body", () => {
    const unmeasured = layout({ page: strip, body: { width: 0, height: 0 } });
    expect(unmeasured.mode).toBe("docked");
    expect(unmeasured.canvasWidth).toBe(0);
    expect(unmeasured.fitZoom).toBe(FIT_MIN);
    expect(layout({ page: strip, body: { width: 300, height: 400 } }).canvasWidth).toBe(300 - RAIL);
  });
});

describe("stepZoom", () => {
  it("steps along the stops from a stop", () => {
    expect(stepZoom(1, 1)).toBe(1.25);
    expect(stepZoom(1, -1)).toBe(0.75);
    expect(stepZoom(0.25, -1)).toBe(0.25);
    expect(stepZoom(2, 1)).toBe(2);
  });

  it("goes the requested way from an off-stop zoom such as Fit", () => {
    expect(stepZoom(0.63, 1)).toBe(0.75);
    expect(stepZoom(0.63, -1)).toBe(0.5);
    expect(stepZoom(1.55, 1)).toBe(2);
    expect(stepZoom(1.55, -1)).toBe(1.5);
    expect(stepZoom(0.1, -1)).toBe(0.25);
    expect(stepZoom(3, 1)).toBe(2);
  });

  it("always moves in the asked direction inside the range", () => {
    for (let z = 0.3; z < 1.95; z += 0.037) {
      expect(stepZoom(z, 1)).toBeGreaterThan(z);
      expect(stepZoom(z, -1)).toBeLessThan(z);
      expect(ZOOM_STEPS).toContain(stepZoom(z, 1));
    }
  });
});

describe("left panel overlay", () => {
  const widths = { rail: RAIL, drawer: 256, inspector: SIDE };

  it("fits beside the canvas and a docked inspector on a wide window", () => {
    expect(leftPanelFits(1440, "docked", widths)).toBe(true);
  });

  it("overlays when the docked column leaves too little canvas (52 + 256 + 420 + 320 = 1048)", () => {
    expect(leftPanelFits(1047, "docked", widths)).toBe(false);
    expect(leftPanelFits(1048, "docked", widths)).toBe(true);
  });

  it("does not count a floating inspector (it lies over the canvas)", () => {
    expect(leftPanelFits(1024, "floating", widths)).toBe(true);
  });

  it("counts an unmeasured body or a closed panel as fitting", () => {
    expect(leftPanelFits(0, "docked", widths)).toBe(true);
    expect(leftPanelFits(800, "docked", { ...widths, drawer: 0 })).toBe(true);
  });

  it("a collapsed docked inspector takes no width, so the panel fits sooner", () => {
    expect(leftPanelFits(1100, "docked", { ...widths, inspector: 0 })).toBe(true);
  });
});

describe("bottom sheet", () => {
  it("rests at a peek (shorter with nothing selected), half and full height", () => {
    expect(sheetHeight("peek", 800, true)).toBe(150);
    expect(sheetHeight("peek", 800, false)).toBe(96);
    expect(sheetHeight("half", 800, true)).toBe(448);
    // Half never drops under 320 px, nor above full.
    expect(sheetHeight("half", 500, true)).toBe(320);
    expect(sheetHeight("half", 300, true)).toBe(292);
    expect(sheetHeight("full", 800, true)).toBe(792);
  });

  it("snaps a dragged height to the nearest rest", () => {
    expect(nearestSnap(200, 800, true)).toBe("peek");
    expect(nearestSnap(400, 800, true)).toBe("half");
    expect(nearestSnap(700, 800, true)).toBe("full");
  });

  it("keeps the page clear of the sheet up to its half height", () => {
    const page = { width: 1920, height: 550 };
    const at = (sheet: number) => layout({ page, body: { width: 390, height: 800 }, sheet }).inset.bottom;
    expect(at(150)).toBe(150 + 14 + 48 - 96);
    expect(at(448)).toBe(448 + 14 + 48 - 96);
    // A full sheet covers the canvas: no more room than at half.
    expect(at(792)).toBe(at(448));
    // Docked and floating have no sheet.
    expect(layout({ page, body: { width: 1440, height: 800 }, sheet: 150 }).inset.bottom).toBeUndefined();
  });
});
