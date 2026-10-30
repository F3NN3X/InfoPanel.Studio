// Which tiles Stream Control draws, and where. Pure: the widget passes its inner size and what OBS offers.

/** The gap between tiles, px. */
export const GAP = 8;

/** A scene as the tiles need it: its place in OBS's list decides its tint and its order. */
export interface PlanScene {
  id: string;
  /** Position in the list, from 0. */
  i: number;
}

export type Cell = { kind: "live"; span: number } | { kind: "mic"; span: 1 } | { kind: "replay"; span: 1 } | { kind: "scene"; span: 1; scene: PlanScene };

export interface PlanInput {
  w: number;
  h: number;
  scenes: PlanScene[];
  /** The program scene's id. */
  current: string;
  showMic: boolean;
  showReplay: boolean;
}

export interface Plan {
  cols: number;
  rows: number;
  /** In display order. */
  cells: Cell[];
  /** The width of one column and the height of one row. */
  colW: number;
  tileH: number;
}

interface Ranked {
  cell: Cell;
  /** Lower is kept first when the grid is short of room. */
  pri: number;
  /** Where it sits in the grid. */
  ord: number;
}

/**
 * Columns are `floor((w + gap) / 112)` (2 to 6) and rows `floor((h + gap) / 92)`; only the rows the tiles need are used, and
 * the columns then spread to fill the width. Tiles are kept by priority (live, mic, the current scene, the other scenes in
 * order, replay) until the grid is full, then laid out as scene 1, scene 2, live, the other scenes, mic, replay. In a grid
 * of two cells or fewer the live tile is one cell wide and ranks after the current scene, so a scene can still be tapped.
 */
export function planTiles({ w, h, scenes, current, showMic, showReplay }: PlanInput): Plan {
  const colsFit = Math.max(2, Math.min(6, Math.floor((w + GAP) / 112)));
  const rowsFit = Math.max(1, Math.floor((h + GAP) / (84 + GAP)));
  const totalSpan = 2 + scenes.length + (showMic ? 1 : 0) + (showReplay ? 1 : 0);
  const rows = Math.min(rowsFit, Math.ceil(totalSpan / colsFit));
  const cols = Math.max(2, Math.min(colsFit, Math.ceil(totalSpan / rows)));
  const tiny = cols * rows <= 2;
  const liveSpan = tiny ? 1 : Math.min(2, cols);
  const all: Ranked[] = [
    { cell: { kind: "live", span: liveSpan } as Cell, pri: tiny ? 2.5 : 0, ord: 1.5 },
    ...(showMic ? [{ cell: { kind: "mic", span: 1 } as Cell, pri: 1, ord: 100 }] : []),
    ...scenes.map((scene) => ({ cell: { kind: "scene", span: 1, scene } as Cell, pri: scene.id === current ? 2 : 3 + scene.i, ord: scene.i < 2 ? scene.i : scene.i + 1 })),
    ...(showReplay ? [{ cell: { kind: "replay", span: 1 } as Cell, pri: 60, ord: 101 }] : []),
  ].sort((a, b) => a.pri - b.pri);
  let used = 0;
  const cap = cols * rows;
  const cells = all
    .filter((it) => (used + it.cell.span <= cap ? ((used += it.cell.span), true) : false))
    .sort((a, b) => a.ord - b.ord)
    .map((it) => it.cell);
  return { cols, rows, cells, colW: (w - GAP * (cols - 1)) / cols, tileH: (h - GAP * (rows - 1)) / rows };
}

/** `h:mm:ss`. */
export function clock(seconds: number): string {
  const s = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}
