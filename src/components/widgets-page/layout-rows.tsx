// The Block tab's layout rows (builder plan Phase 5 and 6, recipe format 2): a grid's tracks, a block's area in them, its background
// layer (fit, position, opacity, blur and inset), its part of its column's width or its row's height with where it sits, a condition on
// a reading, and its motion; the free layout's Place freely and a free block's box. The same values the stage's handles set; each change
// is one edit (one undo step).
import { Button } from "@/components/ui/button";
import { Toggle } from "@/components/ui/toggle";
import type { Binding, Block, Condition, Recipe } from "@/widgets/recipe/types";
import { blockAt, repeatAbove, updateBlock, type Path } from "./builder-model";
import { type DataRowsProps, SourceRows } from "./data-rows";
import { Field, Heading, NumberInput, Select, TextInput } from "./fields";
import { areaGrid, areaNow, backgroundRefusal, fillAxis, parseTracks, setArea, setBackground, setFill, setTracks, tracksText } from "./layout-model";
import { drawnBoxes } from "./free-handles";
import { freeParent, freeRefusal, isFree, setBoxes, setFree } from "./free-layout";
import { EnumRow } from "./style-rows";

/** A grid's layout: equal cells (columns, or as many as fit), or tracks typed as shares ("1 2 1"). */
export function TrackRows({ recipe, path, onChange }: { recipe: Recipe; path: Path; onChange: (r: Recipe) => void }) {
  const b = blockAt(recipe, path);
  if (b?.type !== "grid") return null;
  const t = b.tracks;
  const set = (side: "cols" | "rows", text: string) => {
    const list = parseTracks(text);
    if (list && t) onChange(setTracks(recipe, path, { ...t, [side]: list }));
  };
  return (
    <>
      <Field label="Layout" hint="Tracks: columns and rows of the sizes you give, each block placed on them by its area (drag it on the stage)">
        <Toggle label="Lay out on tracks" checked={!!t} onChange={(on) => onChange(setTracks(recipe, path, on ? { cols: [1, 1], rows: [1, 1] } : undefined))} />
        <span className="text-body text-ui-3">{t ? "Tracks" : "Equal cells"}</span>
      </Field>
      {t && (
        <>
          <Field label="Columns" hint="Each column's share of the width, 1 to 24 of them: 1 2 1 is a wide middle column">
            <TextInput label="Column tracks" value={tracksText(t.cols)} onChange={(v) => set("cols", v)} width={140} />
          </Field>
          <Field label="Rows" hint="Each row's share of the height, 1 to 24 of them">
            <TextInput label="Row tracks" value={tracksText(t.rows)} onChange={(v) => set("rows", v)} width={140} />
          </Field>
        </>
      )}
    </>
  );
}

/** A block's area in its grid's tracks: column and row, and how many of each it spans. */
export function AreaRows({ recipe, path, onChange }: { recipe: Recipe; path: Path; onChange: (r: Recipe) => void }) {
  const grid = areaGrid(recipe, path);
  if (!grid) return null;
  const a = areaNow(recipe, path);
  const [cols, rows] = [grid.tracks.cols.length, grid.tracks.rows.length];
  const own = !!blockAt(recipe, path)?.area;
  const set = (patch: Partial<typeof a>) => onChange(setArea(recipe, path, { ...a, ...patch }));
  return (
    <>
      <Heading>Area</Heading>
      {!own && <p className="text-caption leading-snug text-ui-3">In the next free cell; set a place or drag it on the stage to give it its own.</p>}
      <Field label="Column, row">
        <NumberInput label="Area column" value={a.col} min={1} max={cols} onChange={(v) => set({ col: v ?? 1 })} width={56} />
        <NumberInput label="Area row" value={a.row} min={1} max={rows} onChange={(v) => set({ row: v ?? 1 })} width={56} />
      </Field>
      <Field label="Spans" hint="How many columns and rows it covers; areas may overlap, a later block drawn over an earlier one">
        <NumberInput label="Area columns" value={a.cols} min={1} max={cols} onChange={(v) => set({ cols: v ?? 1 })} width={56} />
        <span className="text-ui-3">×</span>
        <NumberInput label="Area rows" value={a.rows} min={1} max={rows} onChange={(v) => set({ rows: v ?? 1 })} width={56} />
      </Field>
    </>
  );
}

/** The stage's zone, where Free reads where each block is drawn now. */
const stageZone = (): HTMLElement | null => document.querySelector<HTMLElement>("[data-builder-stage] [data-recipe-zone]");

/** A card's, a row's or a grid's layout: its blocks in a flow, or each placed freely at its own box (format 2). */
export function FreeRows({ recipe, path, onChange }: { recipe: Recipe; path: Path; onChange: (r: Recipe) => void }) {
  const b = blockAt(recipe, path);
  if (!b || (b.type !== "card" && b.type !== "row" && b.type !== "grid")) return null;
  const free = isFree(b);
  const why = free ? undefined : freeRefusal(recipe, path);
  return (
    <Field label="Place freely" hint={why ?? "Each block at its own place and size, dragged anywhere on the stage; off puts them back in order"}>
      <Toggle
        label="Place freely"
        checked={free}
        disabled={!!why}
        onChange={(on) => {
          // each block starts where it is drawn now, so nothing jumps
          const r = setFree(recipe, path, on, on ? drawnBoxes(stageZone(), recipe, path) : {});
          if (!("why" in r)) onChange(r);
        }}
      />
    </Field>
  );
}

/** A free block's box in per cent of its container: x and y, width and height. */
export function BoxRows({ recipe, path, onChange }: { recipe: Recipe; path: Path; onChange: (r: Recipe) => void }) {
  const box = freeParent(recipe, path) ? blockAt(recipe, path)?.box : undefined;
  if (!box) return null;
  const pc = (f: number) => Math.round(f * 1000) / 10;
  const set = (k: number, v: number | undefined) => onChange(setBoxes(recipe, [{ path, box: box.map((n, i) => (i === k ? (v ?? 0) / 100 : n)) }]));
  return (
    <>
      <Heading>Box</Heading>
      <Field label="X, Y" hint="Its place from the container's left and top edges, in per cent of its size">
        <NumberInput label="Box x" value={pc(box[0])} min={0} max={100} step={0.1} unit="%" onChange={(v) => set(0, v)} width={64} />
        <NumberInput label="Box y" value={pc(box[1])} min={0} max={100} step={0.1} unit="%" onChange={(v) => set(1, v)} width={64} />
      </Field>
      <Field label="Width, height" hint="Its size in per cent of the container's; its text keeps the card's size">
        <NumberInput label="Box width" value={pc(box[2])} min={3} max={100} step={0.1} unit="%" onChange={(v) => set(2, v)} width={64} />
        <NumberInput label="Box height" value={pc(box[3])} min={3} max={100} step={0.1} unit="%" onChange={(v) => set(3, v)} width={64} />
      </Field>
    </>
  );
}

const FITS = [
  { value: "", label: "Cover" },
  { value: "contain", label: "Contain" },
  { value: "stretch", label: "Stretch" },
  { value: "center", label: "Centre" },
];
const POSITIONS = [
  { value: "", label: "Centre" },
  { value: "top", label: "Top" },
  { value: "bottom", label: "Bottom" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
];
const LAYER_OPACITIES = [
  { value: "", label: "100" },
  { value: "80", label: "80" },
  { value: "60", label: "60" },
  { value: "40", label: "40" },
  { value: "20", label: "20" },
];
const BLURS = [
  { value: "", label: "None" },
  { value: "2", label: "2 px" },
  { value: "4", label: "4 px" },
  { value: "8", label: "8 px" },
];

/** "Background of its container": on or off, and a layer's fit, position and blur (a picture's), opacity and inset. */
export function BackgroundRows({ recipe, path, onChange }: { recipe: Recipe; path: Path; onChange: (r: Recipe) => void }) {
  const b = blockAt(recipe, path);
  if (!b || !path.length || b.type === "repeat") return null;
  const bg = b.background;
  const why = bg ? undefined : backgroundRefusal(recipe, [path]);
  const set = (patch: Record<string, unknown>) => {
    const next: Record<string, unknown> = { ...bg, ...patch };
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete next[k];
    onChange(updateBlock(recipe, path, { background: next }));
  };
  return (
    <>
      <Heading>Layer</Heading>
      <Field label="Background of its container" hint={why ?? "Fills its container under the container's other blocks"}>
        <Toggle
          label="Background of its container"
          checked={!!bg}
          disabled={!!why}
          onChange={(on) => {
            const r = setBackground(recipe, [path], on);
            if (!("why" in r)) onChange(r);
          }}
        />
      </Field>
      {bg && (
        <>
          {b.type === "image" && (
            <>
              <EnumRow label="Fit" hint="Cover fills it and cuts the picture's sides; Contain shows it whole; Stretch fills it out of shape; Centre keeps its own size" value={bg.fit} options={FITS} onPick={(v) => set({ fit: v })} />
              <EnumRow label="Position" hint="Which part of the picture stays in view" value={bg.position} options={POSITIONS} onPick={(v) => set({ position: v })} />
              <EnumRow label="Blur" value={bg.blur} options={BLURS} number onPick={(v) => set({ blur: v })} />
            </>
          )}
          <EnumRow label="Opacity %" hint="60 % or less keeps text over it readable (a scrim)" value={bg.opacity} options={LAYER_OPACITIES} number onPick={(v) => set({ opacity: v })} />
          <Field label="Inset" hint="Room between the layer and its container's edges">
            <NumberInput label="Background inset" value={bg.inset} placeholder="0" min={0} max={24} onChange={(v) => set({ inset: v ? Math.max(0, Math.min(24, Math.round(v))) : undefined })} unit="px" />
          </Field>
        </>
      )}
    </>
  );
}

const PLACES = [
  { value: "", label: "Start" },
  { value: "center", label: "Centre" },
  { value: "end", label: "End" },
];

/** A block's part of its column's width or its row's height, and where it sits in what is left. */
export function FillRows({ recipe, path, onChange }: { recipe: Recipe; path: Path; onChange: (r: Recipe) => void }) {
  const axis = fillAxis(recipe, path);
  const b = blockAt(recipe, path);
  if (!axis || !b) return null;
  const label = axis === "column" ? "Width in its column" : "Height in its row";
  return (
    <>
      <Field label={label} hint="Its part of the room across; 100 % fills it. The handles on its sides set it on the stage">
        <NumberInput label={label} value={b.fill === undefined ? undefined : Math.round(b.fill * 100)} placeholder="100" min={10} max={100} step={1} unit="%" onChange={(v) => onChange(setFill(recipe, path, v === undefined ? undefined : Math.max(10, Math.min(100, v)) / 100, b.place))} />
      </Field>
      {b.fill !== undefined && <EnumRow label="Sits" hint="Where it sits in the room it leaves" value={b.place} options={PLACES} onPick={(v) => onChange(setFill(recipe, path, b.fill, v as "center" | "end" | undefined))} />}
    </>
  );
}

const READING_OPS = [
  { value: "above", label: "is above" },
  { value: "below", label: "is below" },
  { value: "equals", label: "equals" },
] as const;

/** "On a reading" (format 2): shown only while a reading is above, below or at a level; the reading picked as a block's data is. */
export function ReadingRows({ recipe, path, block, rows, onChange }: { recipe: Recipe; path: Path; block: Block; rows: DataRowsProps; onChange: (r: Recipe) => void }) {
  const r = block.when?.reading;
  const set = (reading: NonNullable<Condition["reading"]> | undefined) => {
    const rest = { ...block.when, reading };
    if (!reading) delete rest.reading;
    onChange(updateBlock(recipe, path, { when: Object.keys(rest).length ? rest : undefined }));
  };
  const op = r ? (r.equals !== undefined ? "equals" : r.above !== undefined ? "above" : "below") : "above";
  const level = r?.equals ?? r?.above ?? r?.below;
  const repeat = repeatAbove(recipe, path);
  const first: Binding = "bind" in block && block.bind ? block.bind : repeat ? { field: "temp" } : { sensor: Object.keys(rows.data).find((k) => k.includes(".")) ?? "libre.cpu_total" };
  return (
    <>
      <Field label="On a reading" hint="Shown only while a reading is past a level: a warning when it runs hot, a note when it reads 0">
        <Toggle label="Shows on a reading" checked={!!r} onChange={(on) => set(on ? { bind: first, above: 90 } : undefined)} />
      </Field>
      {r && (
        <>
          <SourceRows recipe={recipe} bind={r.bind} label="Reading" props={{ ...rows, path }} onBind={(bind) => set({ ...r, bind })} />
          <Field label="Shows while it">
            <Select label="Shows while the reading" value={op} options={READING_OPS} onChange={(v) => set({ bind: r.bind, [v]: level ?? 0 })} width={100} />
            <NumberInput label="Level" value={level} onChange={(v) => set({ bind: r.bind, [op]: v ?? 0 })} width={72} />
          </Field>
        </>
      )}
    </>
  );
}

const MOTIONS = [
  { value: "", label: "None" },
  { value: "fade-in", label: "Fade in" },
  { value: "pulse", label: "Pulse on alert" },
];

/** A block's motion: a fade in as it shows, or a pulse while its reading is critical (a block with warning levels). */
export function MotionRow({ block, onPick, onClear }: { block: Block; onPick: (m: string | undefined) => void; onClear: () => void }) {
  const levels = !!(block as { thresholds?: unknown }).thresholds;
  const options = MOTIONS.filter((m) => m.value !== "pulse" || levels || block.motion === "pulse");
  return (
    <>
      <EnumRow label="Motion" hint="Fade in as it shows; Pulse while its reading is critical (needs warning levels). Off where the screen asks for reduced motion" value={block.motion} options={options} onPick={(v) => onPick(v as string | undefined)} />
      {block.motion === "pulse" && !levels && (
        <p className="flex items-center gap-2 text-caption leading-snug text-ui-warn">
          A pulse follows warning levels; this block has none.
          <Button small variant="ghost" onClick={onClear}>
            Remove it
          </Button>
        </p>
      )}
    </>
  );
}
