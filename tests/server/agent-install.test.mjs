import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { repoRoot } from "../setup/repo-root.mjs";
import { describe, expect, it } from "vitest";
import { CLAUDE_EVENTS, CODEX_EVENTS, forwardCommand, installClaude, installCodex, removeClaude, removeCodex, runInstall, unwrapStatusline, urlSuffix } from "../../tools/agent-install.mjs";

const FWD = 'node "E:/repo/tools/agent-status.mjs"';
const root = repoRoot;

describe("agent install", () => {
  const mine = { hooks: { Stop: [{ hooks: [{ type: "command", command: "my-stop.sh" }] }] }, statusLine: { type: "command", command: 'node "C:/Users/me/.claude/statusline.mjs"', padding: 1 }, model: "opus" };

  it("adds a hook per event beside the user's own and wraps their statusline", () => {
    const next = installClaude(mine, FWD);
    expect(Object.keys(next.hooks).sort()).toEqual([...CLAUDE_EVENTS].sort());
    expect(next.hooks.Stop).toHaveLength(2);
    expect(next.hooks.Stop[0]).toEqual(mine.hooks.Stop[0]);
    expect(next.hooks.Stop[1].hooks[0]).toEqual({ type: "command", command: `${FWD} hook claude`, timeout: 5, async: true });
    expect(next.statusLine.padding).toBe(1);
    expect(next.statusLine.command).toMatch(/^node ".*agent-status\.mjs" statusline --wrap=/);
    expect(unwrapStatusline(next.statusLine.command)).toBe(mine.statusLine.command);
    expect(next.model).toBe("opus");
  });

  it("is idempotent and fully reversible", () => {
    const once = installClaude(mine, FWD);
    expect(installClaude(once, FWD)).toEqual(once);
    expect(removeClaude(once)).toEqual(mine);
    // A statusline we added (none before) goes away again.
    const bare = installClaude({}, FWD);
    expect(bare.statusLine.command).toBe(`${FWD} statusline`);
    expect(removeClaude(bare)).toEqual({});
  });

  it("does the same for Codex's hooks.json", () => {
    const file = { hooks: { Stop: [{ hooks: [{ type: "command", command: "x" }] }] } };
    const next = installCodex(file, FWD);
    expect(Object.keys(next.hooks).sort()).toEqual([...CODEX_EVENTS].sort());
    expect(next.hooks.Interrupt[0].hooks[0].command).toBe(`${FWD} hook codex`);
    expect(removeCodex(next)).toEqual(file);
    expect(removeCodex(installCodex({}, FWD))).toEqual({});
  });
});

describe("agent install options", () => {
  it("builds the forwarder command with a given Node and a trailing --url", () => {
    expect(forwardCommand("E:/repo/tools/agent-status.mjs")).toBe(FWD);
    const fwd = forwardCommand("C:/app/agent-status.mjs", "C:\\app\\node\\node.exe");
    expect(fwd).toBe('"C:\\app\\node\\node.exe" "C:/app/agent-status.mjs"');
    const url = urlSuffix("http://127.0.0.1:3999");
    expect(urlSuffix(undefined)).toBe("");
    const claude = installClaude({ statusLine: { type: "command", command: "mine" } }, fwd, url);
    expect(claude.hooks.Stop[0].hooks[0].command).toBe(`${fwd} hook claude --url=http://127.0.0.1:3999`);
    expect(claude.statusLine.command).toMatch(/ statusline --wrap=[A-Za-z0-9_-]+ --url=http:\/\/127\.0\.0\.1:3999$/);
    expect(unwrapStatusline(claude.statusLine.command)).toBe("mine");
    expect(installClaude({}, fwd, url).statusLine.command).toBe(`${fwd} statusline --url=http://127.0.0.1:3999`);
    expect(installCodex({}, fwd, url).hooks.Stop[0].hooks[0].command).toBe(`${fwd} hook codex --url=http://127.0.0.1:3999`);
    expect(removeClaude(claude)).toEqual({ statusLine: { type: "command", command: "mine" } });
  });

  describe("in a temp home", () => {
    const script = "E:/repo/tools/agent-status.mjs";
    const withHome = (fn) => {
      const home = fs.mkdtempSync(path.join(os.tmpdir(), "ipd-home-"));
      try {
        fn(home);
      } finally {
        fs.rmSync(home, { recursive: true, force: true });
      }
    };

    it("reports each agent's status and backs up what it rewrites", () =>
      withHome((home) => {
        const claudeFile = path.join(home, ".claude", "settings.json");
        fs.mkdirSync(path.dirname(claudeFile));
        fs.writeFileSync(claudeFile, JSON.stringify({ model: "opus" }));

        const dry = runInstall({ home, script });
        expect(dry.map((r) => [r.agent, r.status])).toEqual([["Claude Code", "installed"], ["Codex", "skipped"]]);
        expect(JSON.parse(fs.readFileSync(claudeFile, "utf8"))).toEqual({ model: "opus" });

        const done = runInstall({ home, script, apply: true, node: "C:/n/node.exe", url: "http://127.0.0.1:3999" });
        expect(done[0]).toMatchObject({ agent: "Claude Code", status: "installed", file: claudeFile });
        expect(JSON.parse(fs.readFileSync(done[0].backup, "utf8"))).toEqual({ model: "opus" });
        expect(JSON.parse(fs.readFileSync(claudeFile, "utf8")).hooks.Stop[0].hooks[0].command).toBe(`"C:/n/node.exe" "${script}" hook claude --url=http://127.0.0.1:3999`);

        expect(runInstall({ home, script, apply: true })[0].status).toBe("unchanged");
        const removed = runInstall({ home, script, apply: true, remove: true });
        expect(removed[0]).toMatchObject({ status: "removed" });
        expect(JSON.parse(fs.readFileSync(claudeFile, "utf8"))).toEqual({ model: "opus" });
      }));

    it("creates Codex's file when its folder exists, and reports unreadable JSON as an error", () =>
      withHome((home) => {
        fs.mkdirSync(path.join(home, ".codex"));
        fs.mkdirSync(path.join(home, ".claude"));
        fs.writeFileSync(path.join(home, ".claude", "settings.json"), "{ nope");
        const [claude, codex] = runInstall({ home, script, apply: true });
        expect(claude.status).toBe("error");
        expect(claude.message).toMatch(/not valid JSON/);
        expect(fs.readFileSync(path.join(home, ".claude", "settings.json"), "utf8")).toBe("{ nope");
        expect(codex).toMatchObject({ status: "installed", backup: null });
        expect(fs.existsSync(path.join(home, ".codex", "hooks.json"))).toBe(true);
      }));
  });

  it("--json prints the results and nothing else (no files touched without --apply)", () =>
    withHomeEnv((env) => {
      const run = spawnSync(process.execPath, [path.join(root, "tools", "agent-install.mjs"), "--json", "--node=C:/n/node.exe", "--url=http://127.0.0.1:3999"], { encoding: "utf8", env });
      expect(run.status).toBe(0);
      const out = JSON.parse(run.stdout);
      expect(out.apply).toBe(false);
      expect(out.results.map((r) => [r.agent, r.status])).toEqual([["Claude Code", "installed"], ["Codex", "skipped"]]);
      expect(Object.keys(out.results[0]).sort()).toEqual(["agent", "backup", "file", "message", "status"]);
      expect(out.results[0].file.startsWith(env.USERPROFILE)).toBe(true);
    }));

  it("keeps the text output and the plain command by default", () =>
    withHomeEnv((env) => {
      const run = spawnSync(process.execPath, [path.join(root, "tools", "agent-install.mjs")], { encoding: "utf8", env });
      expect(run.stdout).toContain("Claude Code: ");
      expect(run.stdout).toContain("Codex: not installed");
      expect(run.stdout).toContain("Nothing was changed. Run again with --apply to make these changes.");
      expect(run.stdout).toContain('statusLine: node "');
    }));
});

// Runs `fn` with an env whose home is an empty temp folder, so the real ~/.claude and ~/.codex are out of reach.
function withHomeEnv(fn) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "ipd-home-"));
  try {
    fn({ ...process.env, HOME: home, USERPROFILE: home });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
}

describe("agent-status forwarder", () => {
  it("posts a hook's stdin with the header, prints nothing and exits 0, also with no server", async () => {
    const got = [];
    const server = http.createServer((req, res) => {
      let body = "";
      req.on("data", (c) => (body += c));
      req.on("end", () => {
        got.push({ url: req.url, header: req.headers["x-agent-event"], body });
        res.writeHead(204).end();
      });
    });
    await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
    const url = `http://127.0.0.1:${server.address().port}`;
    // Async, so this process's server can answer while the forwarder runs.
    const run = (args, input, env) =>
      new Promise((ok) => {
        const child = spawn(process.execPath, [path.join(root, "tools", "agent-status.mjs"), ...args], { env: { ...process.env, ...env } });
        let stdout = "";
        child.stdout.on("data", (c) => (stdout += c));
        child.on("close", (status) => ok({ status, stdout }));
        child.stdin.end(input);
      });
    try {
      const hook = await run(["hook", "codex"], '{"hook_event_name":"Stop","session_id":"x"}', { DASHBOARD_URL: url });
      expect(hook.status).toBe(0);
      expect(hook.stdout).toBe("");
      // The wrapped statusline still prints its own line.
      const wrapped = Buffer.from(`"${process.execPath}" -e "process.stdin.pipe(process.stdout)"`).toString("base64url");
      const line = await run(["statusline", `--wrap=${wrapped}`], '{"session_id":"x"}', { DASHBOARD_URL: url });
      expect(line.status).toBe(0);
      expect(line.stdout).toBe('{"session_id":"x"}');
      // --url wins over DASHBOARD_URL (which points at nothing here).
      const viaFlag = await run(["hook", "claude", `--url=${url}/`], '{"hook_event_name":"Stop"}', { DASHBOARD_URL: "http://127.0.0.1:9" });
      expect(viaFlag.status).toBe(0);
    } finally {
      server.close();
    }
    expect(got).toEqual([
      { url: "/api/agents/event?agent=codex", header: "1", body: '{"hook_event_name":"Stop","session_id":"x"}' },
      { url: "/api/agents/statusline", header: "1", body: '{"session_id":"x"}' },
      { url: "/api/agents/event?agent=claude", header: "1", body: '{"hook_event_name":"Stop"}' },
    ]);
    const offline = spawnSync(process.execPath, [path.join(root, "tools", "agent-status.mjs"), "hook", "claude"], { input: "{}", encoding: "utf8", env: { ...process.env, DASHBOARD_URL: "http://127.0.0.1:9" } });
    expect(offline.status).toBe(0);
  });
});
