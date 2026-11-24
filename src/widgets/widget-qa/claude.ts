import type { Flag } from "./adoption";
import type { WidgetNotes } from "./notes";
import { DEFAULT_SPANS, DEFAULT_STATE, frameLook, frameRef, LOOK_KEYS, placementSettings, serializeParams, type QaState } from "./params";
import type { Issue } from "./probe";

/**
 * The page's report and its Copy for Claude text (`window.__qa.report`, `__qa.copyForClaude`, `tools/qa/report.mjs`): one entry per
 * frame with what the probe and the theme check found, and a markdown block an agent can act on without looking anything up. Pure:
 * the page reads the frames (`console.ts`), this shapes them, so the format stays stable (tests/widgets/widget-qa/claude.test.ts).
 */

export type FrameKind = "span" | "view" | "layout" | "surface";

/** One frame as the page read it. */
export interface QaFrame {
  /** As the adoption report names it: `<module> <key>`, or `surface:<name>`. */
  frame: string;
  /** The frame's anchor (`<module>--<key>`); a surface has none. */
  id: string;
  /** The widget; a surface: "". */
  module: string;
  /** A span (`2x1`), `view:<id>`, `layout:<id>` or `surface:<name>`. */
  key: string;
  kind: FrameKind;
  /** The zone box in px. */
  size: [number, number];
  /** False while the frame is not mounted: nothing was read. */
  checked: boolean;
  issues: Issue[];
  flags: Flag[];
  note?: string;
}

/** What the report lists: some widgets or one frame; clean frames only with `all`; the notes with `notes`. */
export interface ReportFilter {
  /** Widget ids (one or a list). */
  module?: string | readonly string[];
  /** One frame: its key (`2x1`, `view:gauge`, `surface:rail`), its name (`CpuMonitor 2x1`) or its anchor (`CpuMonitor--2x1`). */
  frame?: string;
  /** List the clean frames too. */
  all?: boolean;
  /** Add every note in `notes.json`, with its frame reference and link. */
  notes?: boolean;
  /** Read only the frames mounted now, without mounting the rest (the page's own buttons). */
  checked?: boolean;
}

export interface WidgetFiles {
  folder: string;
  files: readonly string[];
}

export interface ReportContext {
  state: QaState;
  /** The page's origin and path, before the query (`http://localhost:5173/`). */
  base: string;
  /** Whether the theme check ran (a Look other than Classic is worn). */
  flagsChecked: boolean;
  files: (module: string) => WidgetFiles | undefined;
  /** Every widget's notes (`NOTES`). */
  notes: Readonly<Record<string, WidgetNotes>>;
}

export interface ReportFrame extends Omit<QaFrame, "checked"> {
  link: string;
  /** Not mounted yet: issues and flags were not read. */
  unchecked?: true;
}

export interface NoteEntry {
  module: string;
  /** The frame (`2x1`, `view:<id>`) or `*` for the widget. */
  key: string;
  text: string;
  ref: string;
  link: string;
}

export interface QaReport {
  /** The page as it is set. */
  link: string;
  /** What the frames are drawn in (`frameLook`). */
  look: string;
  summary: {
    widgets: number;
    frames: number;
    checked: number;
    withIssues: number;
    withFlags: number;
    withNotes: number;
    issues: number;
    flags: number;
    /** Checked frames with nothing found and no note. */
    clean: number;
    listed: number;
  };
  frames: ReportFrame[];
  notes?: NoteEntry[];
}

/** The name a frame goes by: `CpuMonitor 2x1`, `surface:rail`. */
export const frameName = (module: string, key: string): string => (module ? `${module} ${key}` : key);

const matches = (f: QaFrame, ref: string) => f.key === ref || f.frame === ref || (!!f.id && f.id === ref);
/** Something to look at: an issue, a theme flag or a note. */
const wrong = (f: Pick<QaFrame, "issues" | "flags" | "note">) => f.issues.length > 0 || f.flags.length > 0 || !!f.note;

/** The frames a filter keeps, in page order. */
export function filterFrames(frames: readonly QaFrame[], filter: ReportFilter = {}): QaFrame[] {
  const ids = filter.module === undefined ? undefined : new Set(typeof filter.module === "string" ? filter.module.split(",").filter(Boolean) : filter.module);
  return frames.filter((f) => (!ids?.size || ids.has(f.module)) && (!filter.frame || matches(f, filter.frame)));
}

/** The link that opens a frame: the widget alone at it, or the page at its surfaces. */
export function frameLink(f: Pick<QaFrame, "module" | "key">, ctx: Pick<ReportContext, "state" | "base">): string {
  if (f.module) return frameRef(ctx.state, f.module, f.key, ctx.base).url;
  return `${ctx.base}${serializeParams({ ...ctx.state, module: undefined, q: "", surfaces: true })}#surfaces`;
}

/** The report: a summary of the kept frames, and each one with something found (every one with `all`). */
export function buildReport(frames: readonly QaFrame[], filter: ReportFilter, ctx: ReportContext): QaReport {
  const kept = filterFrames(frames, filter);
  const checked = kept.filter((f) => f.checked);
  const listed = kept.filter((f) => filter.all || wrong(f));
  const notes = filter.notes
    ? Object.entries(ctx.notes).flatMap(([module, byKey]) =>
        Object.entries(byKey).map(([key, text]) => {
          const ref = key === "*" ? { text: `${module} (the widget)`, url: `${ctx.base}${serializeParams({ ...ctx.state, module: [module], q: "" })}#${module}` } : frameRef(ctx.state, module, key, ctx.base);
          return { module, key, text, ref: ref.text.split("\n")[0], link: ref.url };
        })
      )
    : undefined;
  return {
    link: `${ctx.base}${serializeParams(ctx.state)}`,
    look: frameLook(ctx.state),
    summary: {
      widgets: new Set(kept.filter((f) => f.module).map((f) => f.module)).size,
      frames: kept.length,
      checked: checked.length,
      withIssues: kept.filter((f) => f.issues.length).length,
      withFlags: kept.filter((f) => f.flags.length).length,
      withNotes: kept.filter((f) => f.note).length,
      issues: kept.reduce((n, f) => n + f.issues.length, 0),
      flags: kept.reduce((n, f) => n + f.flags.length, 0),
      clean: checked.filter((f) => !wrong(f)).length,
      listed: listed.length,
    },
    frames: listed.map(({ checked: read, ...f }) => ({ ...f, link: frameLink(f, ctx), ...(read ? {} : { unchecked: true as const }) })),
    ...(notes ? { notes } : {}),
  };
}

/** A value as a shell takes it: bare when it is plain, else single-quoted (bash and PowerShell both read that). */
const arg = (v: string | number) => (/^[\w.,:/@-]+$/.test(String(v)) ? String(v) : `'${String(v).replace(/'/g, "'\\''")}'`);

/** The `report.mjs` line that reads the same frames under the same settings again: one frame, or the page as it is filtered. */
export function reproduce(s: QaState, frame?: Pick<QaFrame, "module" | "key" | "kind">): string {
  const flags: [string, string | number][] = [];
  const module = frame ? (frame.module ? [frame.module] : undefined) : s.module;
  if (module?.length) flags.push(["module", module.join(",")]);
  if (frame?.kind === "span") flags.push(["spans", frame.key]);
  else if (frame) flags.push(["frame", frame.key]);
  else if (s.spans !== DEFAULT_SPANS) flags.push(["spans", s.spans]);
  if (!frame && s.q) flags.push(["q", s.q]);
  if (s.look) flags.push(["look", `${s.look}${s.lookVariant ? `/${s.lookVariant}` : ""}`]);
  if (s.fx) flags.push(["fx", s.fx]);
  if (!s.script) flags.push(["script", "0"]);
  for (const k of LOOK_KEYS) if (s[k]) flags.push([k, s[k]]);
  if (s.cell !== DEFAULT_STATE.cell) flags.push(["cell", s.cell]);
  if (s.gap !== DEFAULT_STATE.gap) flags.push(["gap", s.gap]);
  if (s.theme) flags.push(["theme", s.theme]);
  if (s.settings) flags.push(["settings", s.settings]);
  if (s.data !== DEFAULT_STATE.data) flags.push(["data", s.data]);
  return ["node tools/qa/report.mjs", ...flags.map(([k, v]) => `--${k} ${arg(v)}`)].join(" ");
}

/** `{ "surface": "glass" }`, or "none". */
function settingsText(s: QaState): string {
  const entries = Object.entries(placementSettings(s));
  return entries.length ? `{ ${entries.map(([k, v]) => `${JSON.stringify(k)}: ${JSON.stringify(v)}`).join(", ")} }` : "none";
}

const issueLine = (x: Issue) => `- ${x.kind} dx ${x.dx} dy ${x.dy} · ${x.selector}`;
const flagLine = (f: Flag) => `- ${f.kind} ${f.prop} ${f.value} at ${f.at}`;

/** One frame's Copy for Claude block. */
export function frameMarkdown(f: QaFrame | ReportFrame, ctx: ReportContext): string {
  const read = "checked" in f ? f.checked : !f.unchecked;
  const files = f.module ? ctx.files(f.module) : undefined;
  const widgetNote = f.module ? ctx.notes[f.module]?.["*"] : undefined;
  const lines = [
    `Widget QA · ${frameName(f.module, f.key)} (${frameLook(ctx.state)})`,
    `Link: ${frameLink(f, ctx)}`,
    ...(f.module ? [`Files: ${files ? `${files.folder} (${files.files.join(", ")})` : "no widget folder"}`] : []),
    `Frame: ${f.size[0]}×${f.size[1]} px · settings over default: ${settingsText(ctx.state)}`,
    ...(!read ? ["Issues: not checked (the frame is not mounted)"] : f.issues.length ? [`Issues (${f.issues.length}):`, ...f.issues.map(issueLine)] : ["Issues: none"]),
    ...(!ctx.flagsChecked ? ["Theme flags: not checked (no Look worn)"] : !read ? ["Theme flags: not checked (the frame is not mounted)"] : f.flags.length ? [`Theme flags (${f.flags.length}):`, ...f.flags.map(flagLine)] : ["Theme flags: none"]),
    ...(f.note ? [`Note: ${JSON.stringify(f.note)}`] : []),
    ...(widgetNote ? [`Widget note: ${JSON.stringify(widgetNote)}`] : []),
    `Reproduce: ${reproduce(ctx.state, f)}`,
  ];
  return lines.join("\n");
}

/** The report's Copy for Claude text: a summary, then a block per listed frame, then the notes when asked for. */
export function reportMarkdown(r: QaReport, ctx: ReportContext, scope = "the page"): string {
  const s = r.summary;
  const counts = [`${s.widgets} ${s.widgets === 1 ? "widget" : "widgets"}`, `${s.frames} ${s.frames === 1 ? "frame" : "frames"}${s.checked < s.frames ? ` (${s.checked} checked)` : ""}`, `${s.withIssues} with issues`, ...(ctx.flagsChecked ? [`${s.withFlags} with theme flags`] : []), `${s.withNotes} with notes`];
  const head = [`Widget QA · ${scope} · ${counts.join(" · ")} (${r.look})`, `Link: ${r.link}`, ...(ctx.flagsChecked ? [] : ["Theme flags: not checked (no Look worn)"]), `Reproduce: ${reproduce(ctx.state)}`];
  const rest = s.clean - r.frames.filter((f) => !f.unchecked && !wrong(f)).length;
  const tail = [...(rest > 0 ? [`${rest} clean ${rest === 1 ? "frame" : "frames"} not listed.`] : []), ...(s.checked < s.frames ? [`${s.frames - s.checked} ${s.frames - s.checked === 1 ? "frame" : "frames"} not checked (not mounted).`] : [])];
  const notes = r.notes?.length ? [["Notes:", ...r.notes.map((n) => `- ${n.ref}: ${JSON.stringify(n.text)}\n  ${n.link}`)].join("\n")] : [];
  return [head.join("\n"), ...r.frames.map((f) => frameMarkdown(f, ctx)), ...notes, ...(tail.length ? [tail.join("\n")] : [])].join("\n\n");
}
