import { describe, expect, it } from "vitest";
import { buildReport, frameMarkdown, reportMarkdown, reproduce, type QaFrame, type ReportContext } from "@/widgets/widget-qa/claude";
import { DEFAULT_STATE } from "@/widgets/widget-qa/params";

// Copy for Claude is pasted into an agent's prompt and `report.mjs` output is read by scripts: the format is the contract.
const state = { ...DEFAULT_STATE, look: "cyberspec", lookVariant: "crimson", surface: "glass" };
const ctx: ReportContext = {
  state,
  base: "http://localhost:5173/",
  flagsChecked: true,
  files: (id) => (id === "CpuMonitor" ? { folder: "src/widgets/cpu-monitor/", files: ["widget.ts", "meta.ts", "README.md"] } : undefined),
  notes: { CpuMonitor: { "2x1": "Value overlaps the label at this size." } },
};
const frame = (over: Partial<QaFrame>): QaFrame => ({ frame: "CpuMonitor 2x1", id: "CpuMonitor--2x1", module: "CpuMonitor", key: "2x1", kind: "span", size: [228, 110], checked: true, issues: [], flags: [], ...over });
const bad = frame({
  issues: [{ kind: "exceeds", dx: 6, dy: 0, selector: "div.cpu-head > span.value:nth-child(2)" }],
  flags: [{ kind: "colour", prop: "background-color", value: "#22c55e", at: "bar" }],
  note: "Value overlaps the label at this size.",
});

describe("Copy for Claude", () => {
  it("writes a frame as its name and look, link, files, size and settings, findings, note and the command that reads it again", () => {
    expect(frameMarkdown(bad, ctx)).toBe(
      [
        "Widget QA · CpuMonitor 2x1 (cell 110, skin default, surface glass, look cyberspec/crimson)",
        "Link: http://localhost:5173/?widget-qa&module=CpuMonitor&surface=glass&look=cyberspec&lookVariant=crimson#CpuMonitor--2x1",
        "Files: src/widgets/cpu-monitor/ (widget.ts, meta.ts, README.md)",
        'Frame: 228×110 px · settings over default: { "surface": "glass" }',
        "Issues (1):",
        "- exceeds dx 6 dy 0 · div.cpu-head > span.value:nth-child(2)",
        "Theme flags (1):",
        "- colour background-color #22c55e at bar",
        'Note: "Value overlaps the label at this size."',
        "Reproduce: node tools/qa/report.mjs --module CpuMonitor --spans 2x1 --look cyberspec/crimson --surface glass",
      ].join("\n")
    );
  });

  it("says what was not read: a frame not mounted, flags with no Look worn, a widget with no folder", () => {
    const text = frameMarkdown(frame({ module: "Legacy", frame: "Legacy view:big", key: "view:big", kind: "view", checked: false }), { ...ctx, state: DEFAULT_STATE, flagsChecked: false });
    expect(text).toContain("Files: no widget folder");
    expect(text).toContain("Issues: not checked (the frame is not mounted)");
    expect(text).toContain("Theme flags: not checked (no Look worn)");
    expect(text).toContain("settings over default: none");
    expect(text).toContain("Reproduce: node tools/qa/report.mjs --module Legacy --frame view:big");
  });

  it("quotes a value a shell would split or read as a comment", () => {
    expect(reproduce({ ...DEFAULT_STATE, accent: "#4ade80", settings: '{"a":"it\'s"}' })).toBe(`node tools/qa/report.mjs --accent '#4ade80' --settings '{"a":"it'\\''s"}'`);
  });
});

describe("the report", () => {
  const clean = frame({ frame: "CpuMonitor 4x2", id: "CpuMonitor--4x2", key: "4x2" });
  const rail = frame({ frame: "surface:rail", id: "", module: "", key: "surface:rail", kind: "surface", flags: bad.flags });

  it("counts clean frames and lists the rest, every one with all, and keeps a widget or one frame", () => {
    const r = buildReport([bad, clean, rail], {}, ctx);
    expect(r.summary).toMatchObject({ widgets: 1, frames: 3, checked: 3, withIssues: 1, withFlags: 2, withNotes: 1, issues: 1, flags: 2, clean: 1, listed: 2 });
    expect(r.frames.map((f) => f.frame)).toEqual(["CpuMonitor 2x1", "surface:rail"]);
    expect(r.frames[1].link).toBe("http://localhost:5173/?widget-qa&surface=glass&look=cyberspec&lookVariant=crimson#surfaces");
    expect(buildReport([bad, clean, rail], { all: true }, ctx).frames).toHaveLength(3);
    expect(buildReport([bad, clean, rail], { module: "CpuMonitor" }, ctx).summary.frames).toBe(2);
    for (const ref of ["4x2", "CpuMonitor 4x2", "CpuMonitor--4x2"]) expect(buildReport([bad, clean, rail], { frame: ref, all: true }, ctx).frames.map((f) => f.key)).toEqual(["4x2"]);
  });

  it("lists the notes with their reference and link when asked, and as markdown says what it left out", () => {
    const r = buildReport([bad, clean, frame({ frame: "CpuMonitor 1x1", key: "1x1", checked: false })], { notes: true }, ctx);
    expect(r.notes).toEqual([{ module: "CpuMonitor", key: "2x1", text: "Value overlaps the label at this size.", ref: "CpuMonitor 2x1 (cell 110, skin default, surface glass, look cyberspec/crimson)", link: r.frames[0].link }]);
    const md = reportMarkdown(r, ctx);
    expect(md.split("\n")[0]).toBe("Widget QA · the page · 1 widget · 3 frames (2 checked) · 1 with issues · 1 with theme flags · 1 with notes (cell 110, skin default, surface glass, look cyberspec/crimson)");
    expect(md).toContain("1 clean frame not listed.\n1 frame not checked (not mounted).");
  });
});
