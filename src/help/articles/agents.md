---
id: agents
title: Coding agents
icon: smart_toy
related: [problems, diagnostics]
verified: 1.3.0-beta.33
---

Show what Claude Code and Codex are doing, live on your dashboard.

## Turning it on

1. Open Settings › App › Coding agents.
2. Turn on **Connect coding agents**.
3. Start a new Claude Code or Codex session. It appears on widgets that show agent sessions.
4. For Codex, run `/hooks` once in the session to approve the hooks.

:::open settings/agents Settings › App › Coding agents

## What it changes

| Agent | File | Change |
|---|---|---|
| Claude Code | `~/.claude/settings.json` | Adds hooks, and wraps your statusline so it still prints as before |
| Codex | `~/.codex/hooks.json` | Adds hooks |

Each file is backed up before it is edited, and **Open backups** shows them. The hooks run `ips-agent.exe`, a small helper installed with InfoPanel Studio, so you don't need Node installed. It takes about 6 ms per event. The permission hook waits for its answer, so it can answer from the panel; while that is off it returns at once and the agent asks in its terminal as before. Hooks written by an older version are moved over when the app starts. Turning the setting off removes what was added.

## Answer from the panel

When an agent asks for permission to run something, you can answer on the panel instead of at the keyboard. It's off until you turn it on, for each agent.

1. Open Settings › App › Coding agents.
2. Under **Answer from the panel**, turn on **Answer Claude Code from the panel** or **Answer Codex from the panel**.
3. Restart the server when the app asks.

When a request comes in, the kiosk on this PC shows what the agent wants to run, in full; the command scrolls when it's long. Tap **Deny** to refuse it, or keep a finger on **Hold to allow** for 0.6 s to allow it. On a keyboard, Tab to a button: Enter denies, and holding Enter or Space allows. The panel waits 25 s, then the agent asks in its terminal as usual. Nothing is answered for you when the time runs out.

The prompt shows on screens that already show the agents: the Island's agent notices, a **Coding Agents** widget, or a rail badge for waiting agents. The **Sessions** view of the Coding Agents widget shows the same buttons on the waiting session's card.

Only the kiosk on the PC running InfoPanel Studio can see a request or answer it. A kiosk on another device doesn't get the command, even with editing from other devices on. Every answer is listed under **Answers** in Settings › Coding agents. Your agent's own deny rules still apply when you allow.

:::open settings/agents Settings › App › Coding agents

## If sessions don't appear

- Check the status chip for each agent: **Hooks installed**, **Not connected**, **Needs repair** or **Agent not found**. **Needs repair** means the hooks were changed or removed; press **Repair hooks**.
- Sessions that were already running before you connected won't report until they restart.
- The server must be running: agents post to it.
