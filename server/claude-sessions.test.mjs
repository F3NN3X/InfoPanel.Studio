import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { isAlive, parseClaudeSession, readClaudeSessions } from "./claude-sessions.mjs";

const file = (over = {}) =>
  JSON.stringify({ pid: 123, sessionId: "abc-1", cwd: "E:\\GitHub\\MyRepos\\InfoPanel.Studio", startedAt: 1, kind: "interactive", status: "busy", updatedAt: 2000, ...over });

describe("parseClaudeSession", () => {
  it("maps the status and keeps the project folder only", () => {
    expect(parseClaudeSession(file())).toEqual({ id: "abc-1", pid: 123, project: "InfoPanel.Studio", state: "working", updatedAt: 2000 });
    expect(parseClaudeSession(file({ status: "waiting" }))?.state).toBe("waiting");
    expect(parseClaudeSession(file({ status: "idle" }))?.state).toBe("idle");
    expect(parseClaudeSession(file({ status: "weird" }))?.state).toBe("idle");
    expect(JSON.stringify(parseClaudeSession(file()))).not.toContain("GitHub");
  });

  it("rejects bad input", () => {
    for (const bad of ["{nope", "null", "[]", file({ pid: 0 }), file({ pid: "1" }), file({ sessionId: 5 }), file({ sessionId: "" })]) expect(parseClaudeSession(bad)).toBeNull();
    expect(parseClaudeSession(file({ updatedAt: "x" }))?.updatedAt).toBeNull();
  });
});

describe("isAlive", () => {
  it("knows this process and not a missing one", () => {
    expect(isAlive(process.pid)).toBe(true);
    expect(isAlive(2 ** 22 + 12345)).toBe(false);
  });
});

describe("readClaudeSessions", () => {
  let home;
  afterEach(() => home && fs.rmSync(home, { recursive: true, force: true }));

  it("lists the .json files' sessions, each marked alive or not", () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "claude-sessions-"));
    const dir = path.join(home, ".claude", "sessions");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "1.json"), file({ pid: 1, sessionId: "live" }));
    fs.writeFileSync(path.join(dir, "2.json"), file({ pid: 2, sessionId: "dead" }));
    fs.writeFileSync(path.join(dir, "3.json"), "garbage");
    fs.writeFileSync(path.join(dir, "4.tmp"), file({ pid: 1, sessionId: "tmp" }));
    const list = readClaudeSessions({ home, alive: (pid) => pid === 1 }).map((s) => [s.id, s.alive]);
    expect(list.sort()).toEqual([["dead", false], ["live", true]]);
  });

  it("is empty without the folder", () => {
    home = fs.mkdtempSync(path.join(os.tmpdir(), "claude-sessions-"));
    expect(readClaudeSessions({ home })).toEqual([]);
  });
});
