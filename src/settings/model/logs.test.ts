import { describe, expect, it } from "vitest";
import { countLevels, filterLines, LOG_BUFFER, parseLine, pushLines } from "./logs";

const now = new Date(2026, 9, 20, 14, 5, 9, 42);

describe("parseLine", () => {
  it("reads an app.log line: its time, level and message", () => {
    expect(parseLine("[2026-10-20][02:02:05][infopanel_studio_lib::commands][DEBUG] ipc: report_metrics", now)).toEqual({
      ts: "02:02:05",
      level: "debug",
      msg: "ipc: report_metrics",
    });
    expect(parseLine("[2026-10-20][02:02:05][studio][ERROR] boom: x [y]", now)).toMatchObject({ level: "error", msg: "boom: x [y]" });
    expect(parseLine("[2026-10-20][02:02:05][a][WARN] careful", now).level).toBe("warn");
    expect(parseLine("[2026-10-20][02:02:05][a][TRACE] t", now).level).toBe("debug");
  });

  it("reads a server.log prefix and stamps the line on arrival", () => {
    expect(parseLine("[debug] GET /api/debug/stats 200 0ms", now)).toEqual({ ts: "14:05:09.042", level: "debug", msg: "GET /api/debug/stats 200 0ms" });
    expect(parseLine("[error] listen failed", now).level).toBe("error");
    expect(parseLine("[warn] slow", now).level).toBe("warn");
  });

  it("counts a line without a level as info, stamped on arrival", () => {
    expect(parseLine("InfoPanel Studio on http://127.0.0.1:3922", now)).toEqual({
      ts: "14:05:09.042",
      level: "info",
      msg: "InfoPanel Studio on http://127.0.0.1:3922",
    });
    // A continuation line of a multi-line message.
    expect(parseLine("    at Server.listen (node:net:1)", now).level).toBe("info");
  });

  it("shows the server wrapper's UTC time of day in the local zone", () => {
    const line = parseLine("[23:39:54Z] --- starting server (pid 7700) on 127.0.0.1:3922 ---", now);
    const expected = new Date(now);
    expected.setUTCHours(23, 39, 54, 0);
    expect(line.ts).toBe(expected.toTimeString().slice(0, 8));
    expect(line.msg).toBe("--- starting server (pid 7700) on 127.0.0.1:3922 ---");
  });
});

describe("pushLines", () => {
  it("appends parsed lines with rising ids", () => {
    const a = pushLines([], ["one", "[debug] two"], 0, now);
    const b = pushLines(a, ["three"], 2, now);
    expect(b.map((l) => [l.id, l.msg])).toEqual([[0, "one"], [1, "two"], [2, "three"]]);
    expect(a).toHaveLength(2);
  });

  it("keeps the newest 2000 lines", () => {
    const first = pushLines([], Array.from({ length: LOG_BUFFER }, (_, i) => `line ${i}`), 0, now);
    const next = pushLines(first, ["a", "b", "c"], LOG_BUFFER, now);
    expect(next).toHaveLength(LOG_BUFFER);
    expect(next[0].msg).toBe("line 3");
    expect(next.at(-1)?.msg).toBe("c");
    expect(pushLines(first, [], LOG_BUFFER, now)).toBe(first);
  });
});

describe("level counts and filters", () => {
  const lines = pushLines([], ["[debug] Alpha", "[error] Beta", "gamma", "[debug] alphabet"], 0, now);

  it("counts each level and the total", () => {
    expect(countLevels(lines)).toEqual({ all: 4, error: 1, warn: 0, info: 1, debug: 2 });
  });

  it("filters by level and by a message substring, ignoring case", () => {
    expect(filterLines(lines, "debug", "").map((l) => l.msg)).toEqual(["Alpha", "alphabet"]);
    expect(filterLines(lines, "all", "ALPHA").map((l) => l.msg)).toEqual(["Alpha", "alphabet"]);
    expect(filterLines(lines, "error", "alpha")).toEqual([]);
    expect(filterLines(lines, "all", "")).toBe(lines);
  });
});
