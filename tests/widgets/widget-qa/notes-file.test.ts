import { describe, expect, it } from "vitest";
import { applyNoteEdit, editProblem, noteOf, noteStatus, notesJson, notesProblems, noteText, type NotesFile } from "@/widgets/widget-qa/notes-file";

// The notes file is the owner's queue: an edit that drops or garbles another widget's note loses it, so the edits are pinned here.
const file: NotesFile = {
  CodingAgents: { "1x1": "Sparkline.", "2x1": { text: "Beside the count.", status: "fixed" } },
  CpuMonitor: { "*": "Whole widget." },
};

describe("a note", () => {
  it("is its text when open and { text, status } once fixed; a note with no status is open", () => {
    expect(noteText("a")).toBe("a");
    expect(noteText({ text: "b", status: "fixed" })).toBe("b");
    expect(noteStatus("a")).toBe("open");
    expect(noteStatus({ text: "b" })).toBe("open");
    expect(noteStatus({ text: "b", status: "fixed" })).toBe("fixed");
    expect(noteOf("a", "open")).toBe("a");
    expect(noteOf("a", "fixed")).toEqual({ text: "a", status: "fixed" });
  });
});

describe("the file's shape", () => {
  it("passes today's file and one with statuses", () => {
    expect(notesProblems({ CodingAgents: { "1x1": "Room for a sparkline." } })).toEqual([]);
    expect(notesProblems(file)).toEqual([]);
  });

  it("names each wrong id, key, text and status", () => {
    expect(notesProblems([])).toEqual(["not an object of widgets"]);
    expect(
      notesProblems({ "bad id": {}, A: [], B: { "layout:x": "x", "2x1": " ", "1x1": { text: "t", status: "done" }, "1x2": { text: "t", extra: 1 }, "view:v": "x".repeat(2001) } })
    ).toEqual([
      "bad id: not a widget id",
      "A: not an object of frames",
      "B layout:x: not a span, a view or *",
      "B 2x1: no text",
      'B 1x1: status "done" is not open or fixed',
      "B 1x2: unknown field extra",
      "B view:v: longer than 2000 characters",
    ]);
  });
});

describe("an edit", () => {
  it("is checked before it is applied", () => {
    expect(editProblem({ module: "CpuMonitor", key: "2x1", note: "x" })).toBeUndefined();
    expect(editProblem({ module: "CpuMonitor", key: "2x1", note: null })).toBeUndefined();
    expect(editProblem({ clear: "fixed" })).toBeUndefined();
    expect(editProblem({ clear: "open" })).toBe("clear takes only fixed");
    expect(editProblem({ module: "../x", key: "2x1", note: "x" })).toBe("no widget id");
    expect(editProblem({ module: "CpuMonitor", key: "surface:rail", note: "x" })).toBe("surface:rail: not a span, a view or *");
    expect(editProblem({ module: "CpuMonitor", key: "2x1", note: { text: "" } })).toBe("no text");
    expect(editProblem("x")).toBe("not an edit");
  });

  it("sets one note, trimmed, in place or last, and writes an open one as its text", () => {
    expect(applyNoteEdit(file, { module: "CodingAgents", key: "1x1", note: { text: " Done. ", status: "fixed" } })).toEqual({
      CodingAgents: { "1x1": { text: "Done.", status: "fixed" }, "2x1": { text: "Beside the count.", status: "fixed" } },
      CpuMonitor: { "*": "Whole widget." },
    });
    const reopened = applyNoteEdit(file, { module: "CodingAgents", key: "2x1", note: { text: "Beside the count.", status: "open" } });
    expect(reopened.CodingAgents["2x1"]).toBe("Beside the count.");
    const added = applyNoteEdit(file, { module: "Bluetooth", key: "view:list", note: "New." });
    expect(Object.keys(added)).toEqual(["CodingAgents", "CpuMonitor", "Bluetooth"]);
    expect(Object.keys(applyNoteEdit(file, { module: "CodingAgents", key: "4x2", note: "x" }).CodingAgents)).toEqual(["1x1", "2x1", "4x2"]);
  });

  it("removes a note, and a widget with none left", () => {
    expect(applyNoteEdit(file, { module: "CodingAgents", key: "1x1", note: null }).CodingAgents).toEqual({ "2x1": { text: "Beside the count.", status: "fixed" } });
    expect(applyNoteEdit(file, { module: "CpuMonitor", key: "*", note: null })).toEqual({ CodingAgents: file.CodingAgents });
    expect(applyNoteEdit(file, { module: "Nope", key: "1x1", note: null })).toEqual(file);
  });

  it("clears every fixed note and leaves the open ones", () => {
    expect(applyNoteEdit(file, { clear: "fixed" })).toEqual({ CodingAgents: { "1x1": "Sparkline." }, CpuMonitor: { "*": "Whole widget." } });
    expect(applyNoteEdit({ A: { "1x1": { text: "t", status: "fixed" } } }, { clear: "fixed" })).toEqual({});
  });

  it("writes the file as it is checked in: two-space JSON, a final line end, in the file's own line ends", () => {
    expect(notesJson({ A: { "1x1": "t" } })).toBe('{\n  "A": {\n    "1x1": "t"\n  }\n}\n');
    expect(notesJson({ A: { "1x1": "t" } }, "\r\n")).toBe('{\r\n  "A": {\r\n    "1x1": "t"\r\n  }\r\n}\r\n');
  });
});
