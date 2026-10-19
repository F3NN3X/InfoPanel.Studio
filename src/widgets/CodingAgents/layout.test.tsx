import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { AgentSession, Agents } from "@/lib/agents";
import { CodingAgentsView, SessionRow, fitBreakdown, wantsBody } from "../CodingAgents";
import { dayKey, heatmapFit, heatmapWeeks, levelOf } from "./history";
import { barDensity, resetIn, ringLayout, shown } from "./limits";

/** The measured box the widget lays out in; 0 × 0 (the default) is an unmeasured one. */
const box = vi.hoisted(() => ({ w: 0, h: 0 }));
vi.mock("../core/layout", async (orig) => {
  const mod = await orig<typeof import("../core/layout")>();
  return { ...mod, useBox: () => [{ current: null }, box.w || box.h ? mod.boxOf(box.w, box.h, undefined) : { w: 0, h: 0, size: "md", shape: "box" }] };
});

const text = (el: Parameters<typeof renderToString>[0]) => renderToString(el).replace(/<!-- -->/g, "");

describe("Coding Agents limits", () => {
  it("counts down to a reset in minutes, hours, then days", () => {
    expect(resetIn(8 * 60_000)).toBe("8m");
    expect(resetIn(4.5 * 3_600_000)).toBe("4h 30m");
    expect(resetIn(54 * 3_600_000)).toBe("2d 6h");
    expect(resetIn(48 * 3_600_000)).toBe("2d");
  });

  it("reads a window as used or left", () => {
    expect(shown({ used: 32.4 }, "used")).toBe(32);
    expect(shown({ used: 32.4 }, "left")).toBe(68);
  });

  it("picks the roomiest bar layout that fits", () => {
    expect(barDensity(2, 400)).toBe("full");
    expect(barDensity(2, 100)).toBe("row");
    expect(barDensity(2, 40)).toBe("list");
    expect(barDensity(2, 20)).toBeNull();
  });

  it("puts two agents' rings side by side in a wide box and drops rings that would be too small", () => {
    expect(ringLayout(2, 600, 140)).toMatchObject({ across: true });
    expect(ringLayout(2, 200, 400)).toMatchObject({ across: false });
    expect(ringLayout(1, 120, 40)).toBeNull();
    expect(ringLayout(1, 500, 150)?.details).toBe(true);
    expect(ringLayout(1, 160, 150)?.details).toBe(false);
  });

  it("puts the reset under each ring when there is no room beside them", () => {
    // A 4x2 cell beside the sessions: the limits column is about 312 wide.
    expect(ringLayout(1, 312, 150)).toMatchObject({ below: true, details: false });
    expect(ringLayout(1, 312, 150)!.d).toBeGreaterThanOrEqual(44);
    expect(ringLayout(1, 500, 150)).toMatchObject({ details: true, below: false });
    expect(ringLayout(1, 100, 70)).toMatchObject({ details: false, below: false });
    expect(ringLayout(1, 312, 50)).toBeNull();
    const l = ringLayout(1, 312, 150)!;
    expect(l.h).toBeLessThanOrEqual(150);
  });

  it("adds a pace line to the ring details only with room for it", () => {
    expect(ringLayout(1, 500, 150)?.pace).toBe(true);
    expect(ringLayout(1, 500, 100)).toMatchObject({ details: true, pace: false });
    expect(ringLayout(1, 160, 150)?.pace).toBe(false);
  });
});

describe("Coding Agents heatmap", () => {
  it("lays the days out Monday to Sunday from the first week with data, today's week last", () => {
    const today = new Date(2026, 9, 15); // a Thursday
    const weeks = heatmapWeeks(new Map([["2026-10-04", 5], ["2026-10-15", 9]]), today);
    expect(weeks.length).toBe(3); // 28 Sep, 5 Oct and 12 Oct
    expect(weeks[0][0].day).toBe("2026-09-28");
    expect(weeks[0][6]).toMatchObject({ day: "2026-10-04", v: 5 });
    expect(weeks[2][3]).toMatchObject({ day: "2026-10-15", v: 9, future: false });
    expect(weeks[2][4].future).toBe(true);
    expect(dayKey(today)).toBe("2026-10-15");
  });

  it("keeps at most six weeks", () => {
    expect(heatmapWeeks(new Map([["2026-01-01", 1]]), new Date(2026, 9, 15)).length).toBe(6);
  });

  it("shades on four levels and keeps an empty day empty", () => {
    expect(levelOf(0, 100)).toBe(0);
    expect(levelOf(1, 100)).toBe(1);
    expect(levelOf(100, 100)).toBe(4);
  });

  it("fits its cells to the box, with weekday labels only when the cells are big enough", () => {
    expect(heatmapFit(5, 300, 120)).toMatchObject({ labels: true, cell: 15 });
    expect(heatmapFit(5, 300, 60)).toMatchObject({ labels: false, cell: 6 });
    expect(heatmapFit(5, 300, 30)).toBeNull();
  });
});

describe("Coding Agents settings", () => {
  const now = Date.now();
  const AGENTS: Agents = {
    sessions: [],
    plan: { claude: { fiveHour: { used: 30, resetsAt: now + 3_600_000 }, sevenDay: { used: 70 }, at: now } },
    usage: { claude: { today: 1e6, history: 2e6, days: [{ day: dayKey(new Date(now)), input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 1e6 }] } },
  };

  it("shows what is left of the limits when asked", () => {
    const html = text(<CodingAgentsView data={{}} all={AGENTS} percent="left" />);
    expect(html).toContain(">70%<");
    expect(html).toContain(">30%<");
    expect(html).toContain("left");
  });

  it("draws rings and a heatmap when asked", () => {
    const html = text(<CodingAgentsView data={{}} all={AGENTS} limitStyle="rings" history="heatmap" />);
    expect(html).toContain("-rotate-90");
    expect(html).toContain('aria-label="Tokens per day"');
  });

  it("keeps bars and daily bars by default", () => {
    const html = text(<CodingAgentsView data={{}} all={AGENTS} />);
    expect(html).not.toContain("-rotate-90");
    expect(html).not.toContain('aria-label="Tokens per day"');
    expect(html).toContain("Resets in 1h");
  });
});

describe("Coding Agents breakdown layout", () => {
  const at = Date.now();
  const AGENTS: Agents = {
    sessions: [{ key: "a", agent: "claude", project: "app", state: "working", since: at, tool: "Bash" }],
    plan: { claude: { fiveHour: { used: 30, resetsAt: at + 3_600_000 }, sevenDay: { used: 20 }, at } },
    usage: {
      claude: {
        today: 1e6,
        history: 2e6,
        days: [{ day: dayKey(new Date(at)), input: 12_000, output: 40_000, cacheRead: 3_000_000, cacheWrite: 100_000, total: 3.2e6 }],
        breakdown: { week: { projects: [{ name: "app", total: 410 }, { name: "api", total: 300 }], models: [{ name: "opus-5-5", total: 620 }, { name: "sonnet-5-5", total: 380 }] } },
      },
    },
  };
  const at_ = (w: number, h: number, extra = {}, all = AGENTS) => {
    box.w = w;
    box.h = h;
    try {
      return text(<CodingAgentsView data={{}} all={all} {...extra} />);
    } finally {
      box.w = 0;
      box.h = 0;
    }
  };

  it("fits project rows to the room and the by-type line after them", () => {
    expect(fitBreakdown(200, true)).toMatchObject({ rows: 3, withTokens: true });
    expect(fitBreakdown(90, true)).toMatchObject({ rows: 2, withTokens: false });
    expect(fitBreakdown(68, false)).toMatchObject({ rows: 1, withTokens: false });
    expect(fitBreakdown(67, false)).toBeNull();
    // No models: the model bar's 30 px are not reserved.
    expect(fitBreakdown(38, false, false)).toMatchObject({ rows: 1 });
    expect(fitBreakdown(37, false, false)).toBeNull();
  });

  it("shows under the sessions with room, with today's tokens by type on a wide box", () => {
    const html = at_(340, 460);
    expect(html).toContain("This week");
    expect(html).toContain("Opus 5.5 62%");
    expect(html).toContain("in 12k · out 40k · cache 3.1M");
    expect(html).toContain("Today");
  });

  it("shows a session's model from 420 px and its cost from 260, the context first", () => {
    const s: AgentSession = { ...AGENTS.sessions[0], context: 37, cost: 3.1, model: "opus-5-5" };
    const row = (width: number) => text(<ul><SessionRow s={s} now={at} width={width} /></ul>);
    expect(row(420)).toContain("Opus 5.5");
    expect(row(420)).toContain("$3.10");
    expect(row(419)).not.toContain("Opus 5.5");
    expect(row(260)).toContain("$3.10");
    expect(row(259)).not.toContain("$3.10");
    expect(row(220)).toContain("37% ctx");
    expect(row(219)).not.toContain("37% ctx");
  });

  it("is dropped before the history in a small box", () => {
    const html = at_(340, 230);
    expect(html).not.toContain("This week");
    expect(html).toContain("Today");
    expect(html).toContain(">1.0M<");
    expect(at_(340, 460)).toContain(">1.0M<");
  });

  it("keeps the by-type line off a narrow box and can be switched off", () => {
    expect(at_(255, 460)).not.toContain("cache 3.1M");
    expect(at_(340, 460, { showBreakdown: false })).not.toContain("Opus 5.5");
  });

  it("is absent when the server sent no breakdown", () => {
    const bare: Agents = { ...AGENTS, usage: { claude: { ...AGENTS.usage.claude!, breakdown: undefined } } };
    expect(at_(340, 460, {}, bare)).not.toContain("Opus 5.5");
  });

  it("budgets the breakdown under the limits row beside the sessions, never over the history", () => {
    // 700 wide splits the limits and sessions; the limits (106) and the history (64 with its gap) leave 78 at 260 and 58 at 240.
    expect(at_(700, 260)).toContain("This week");
    expect(at_(700, 240)).not.toContain("This week");
    expect(at_(700, 240)).toContain("Today");
  });

  it("goes under the heatmap in a wide box when that column has the height", () => {
    const html = at_(700, 330, { history: "heatmap" });
    expect(html).toContain('aria-label="Tokens per day"');
    expect(html).toContain("Opus 5.5 62%");
  });
});

describe("Coding Agents limit freshness", () => {
  const at = Date.now();
  const plan = (reportedAt: number, resetsAt: number, used = 50): Agents => ({ sessions: [], plan: { claude: { fiveHour: { used, resetsAt }, sevenDay: { used: 20 }, at: reportedAt } }, usage: {} });

  it("shows a passed window as new, at 0 %", () => {
    const html = text(<CodingAgentsView data={{}} all={plan(at, at - 1000, 90)} />);
    expect(html).toContain("New window");
    expect(html).toContain(">0%<");
    expect(html).not.toContain(">90%<");
  });

  it("dims a stale report and says how old it is", () => {
    const html = text(<CodingAgentsView data={{}} all={plan(at - 12 * 60_000, at + 3_600_000)} />);
    expect(html).toContain("as of 12m");
    expect(html).toContain("opacity:0.55");
  });

  it("drops a projected full time that has already passed", () => {
    // 95 % two hours in projects full 6 minutes after the report, which was 9 minutes ago.
    const reportedAt = at - 9 * 60_000;
    expect(text(<CodingAgentsView data={{}} all={plan(reportedAt, reportedAt + 3 * 3_600_000, 95)} />)).not.toContain("at this pace");
  });

  it("projects the window to full when it burns faster than its time passes", () => {
    const html = text(<CodingAgentsView data={{}} all={plan(at, at + 3 * 3_600_000, 60)} />);
    expect(html).toContain("at this pace");
    expect(text(<CodingAgentsView data={{}} all={plan(at, at + 3_600_000, 10)} />)).not.toContain("at this pace");
  });
});

describe("Coding Agents small cells", () => {
  const at = Date.now();
  const AGENTS: Agents = {
    sessions: [{ key: "a", agent: "claude", project: "myproject", state: "working", since: at, tool: "Bash" }],
    plan: { claude: { fiveHour: { used: 31, resetsAt: at + 3 * 3_600_000 }, sevenDay: { used: 67 }, at } },
    usage: { claude: { today: 1e6, history: 2e6, days: [{ day: dayKey(new Date(at)), input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 1e6 }] } },
  };
  const render = (w: number, h: number, extra = {}) => {
    box.w = w;
    box.h = h;
    try {
      return text(<CodingAgentsView data={{}} all={AGENTS} {...extra} />);
    } finally {
      box.w = 0;
      box.h = 0;
    }
  };

  it("wants the body from 200 px in a tile or column, and the summary elsewhere", () => {
    expect(wantsBody({ shape: "tile", w: 228, h: 228 }, "auto")).toBe(true);
    expect(wantsBody({ shape: "column", w: 228, h: 464 }, undefined)).toBe(true);
    expect(wantsBody({ shape: "column", w: 110, h: 228 }, "auto")).toBe(false);
    expect(wantsBody({ shape: "tile", w: 110, h: 110 }, "auto")).toBe(false);
    expect(wantsBody({ shape: "strip", w: 464, h: 110 }, "auto")).toBe(false);
    expect(wantsBody({ shape: "tile", w: 228, h: 228 }, "on")).toBe(false);
  });

  it("lays out the limits and a session at 2x2 and 2x4, not the summary card", () => {
    for (const [w, h] of [[228, 228], [228, 464]]) {
      const html = render(w, h);
      expect(html).toContain('data-wp-view="body"');
      expect(html).toContain(">31%<");
      expect(html).toContain(">67%<");
      expect(html).toContain("myproject");
    }
    expect(render(228, 228)).not.toContain("This week");
  });

  it("keeps the summary at 1x1 and when it is forced on", () => {
    expect(render(110, 110)).toContain('data-wp-view="compact"');
    expect(render(228, 228, { compactView: "on" })).toContain('data-wp-view="compact"');
  });

  it("draws the reset under rings beside the sessions at 4x2", () => {
    const html = render(624, 308, { limitStyle: "rings" });
    expect(html).toContain("leading-[14px]");
    expect(html).toContain("myproject");
  });
});
