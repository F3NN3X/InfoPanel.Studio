---
id: agents
title: Coding agents
icon: smart_toy
related: [problems, diagnostics]
verified: 1.3.0-beta.1
---

Show what Claude Code and Codex are doing, live on your dashboard.

## Turning it on

1. Open Settings › Coding agents.
2. Turn on **Connect coding agents**.
3. Start a new Claude Code or Codex session. It appears on widgets that show agent sessions.
4. For Codex, run `/hooks` once in the session to approve the hooks.

:::open settings/agents Settings › Coding agents

## What it changes

| Agent | File | Change |
|---|---|---|
| Claude Code | `~/.claude/settings.json` | Adds hooks, and wraps your statusline so it still prints as before |
| Codex | `~/.codex/hooks.json` | Adds hooks |

Each file is backed up before it is edited, and **Open backups** shows them. The hooks run InfoPanel Studio's own Node, so you don't need Node installed. Turning the setting off removes what was added.

## If sessions don't appear

- Check the status chip for each agent: **Hooks installed**, **Not connected**, **Needs repair** or **Agent not found**. **Needs repair** means the hooks were changed or removed; press **Repair hooks**.
- Sessions that were already running before you connected won't report until they restart.
- The server must be running: agents post to it.
