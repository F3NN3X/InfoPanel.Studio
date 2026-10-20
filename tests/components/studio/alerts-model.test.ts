import { describe, expect, it } from "vitest";
import { defaultConfig } from "@/lib/layout";
import type { AlertHistoryEntry, AlertRule } from "@/lib/alerts";
import {
  addRule,
  ageText,
  alertsKey,
  alertsOf,
  clearLabel,
  duplicateRule,
  lastFired,
  patchDefaults,
  patchRule,
  previewSensor,
  removeRule,
  ruleKey,
  setAlertsEnabled,
  setQuietHours,
  summarizeRule,
} from "@/components/studio/alerts-model";

const rule = (over: Partial<AlertRule> = {}): AlertRule => ({
  id: "r1",
  name: "GPU hot",
  enabled: true,
  severity: "warning",
  source: { kind: "sensor", key: "gpu.temp", op: ">", value: 80, forSeconds: 10 },
  cooldownSeconds: 60,
  outputs: {},
  ...over,
});

describe("summarizeRule", () => {
  it("writes a sensor threshold with unit and duration", () => {
    expect(summarizeRule(rule(), { name: "GPU Temperature", unit: "°C" })).toBe("GPU Temperature > 80 °C for 10 s");
  });
  it("falls back to the key's last segment, and asks for a sensor when empty", () => {
    expect(summarizeRule(rule())).toBe("temp > 80 for 10 s");
    expect(summarizeRule(rule({ source: { kind: "sensor", key: "", op: ">", value: 1, forSeconds: 0 } }))).toBe("Pick a sensor");
  });
  it("writes text and change conditions", () => {
    const s = (op: "contains" | "changes" | "=" | "missing", value: string | number, forSeconds = 0) =>
      rule({ source: { kind: "sensor", key: "a.status", op, value, forSeconds } });
    expect(summarizeRule(s("contains", "down"))).toBe("status contains “down”");
    expect(summarizeRule(s("changes", 0))).toBe("status changes");
    expect(summarizeRule(s("missing", 0, 30))).toBe("status stops reporting for 30 s");
    expect(summarizeRule(s("=", "down"))).toBe("status = down");
  });
  it("writes notification sources", () => {
    const n = (source: AlertRule["source"]) => rule({ source });
    expect(summarizeRule(n({ kind: "notification", apps: ["Discord"] }))).toBe("Notifications from Discord");
    expect(summarizeRule(n({ kind: "notification" }))).toBe("Any notification");
    expect(summarizeRule(n({ kind: "notification", match: "ping" }))).toBe("Any notification containing “ping”");
  });
});

describe("rule edits", () => {
  it("creates alerts on first edit, without mutating the config", () => {
    const base = defaultConfig();
    const next = addRule(base, rule());
    expect(base.alerts).toBeUndefined();
    expect(next.alerts?.enabled).toBe(true);
    expect(next.alerts?.rules.map((r) => r.id)).toEqual(["r1"]);
    expect(next.alerts?.defaults.seconds).toBe(8);
    expect(alertsOf(base).rules).toEqual([]);
  });

  it("patches, removes and duplicates immutably", () => {
    const one = addRule(defaultConfig(), rule());
    const patched = patchRule(one, "r1", (r) => ({ ...r, name: "Hot" }));
    expect(one.alerts!.rules[0].name).toBe("GPU hot");
    expect(patched.alerts!.rules[0].name).toBe("Hot");
    expect(patchRule(one, "nope", (r) => ({ ...r, name: "x" }))).toBe(one);
    expect(patchRule(one, "r1", (r) => r)).toBe(one);

    const dup = duplicateRule(patched, "r1", "r2");
    expect(dup.alerts!.rules.map((r) => [r.id, r.name])).toEqual([["r1", "Hot"], ["r2", "Hot copy"]]);
    expect(dup.alerts!.rules[1].source).not.toBe(dup.alerts!.rules[0].source);
    expect(duplicateRule(patched, "nope", "r3")).toBe(patched);

    expect(removeRule(dup, "r1").alerts!.rules.map((r) => r.id)).toEqual(["r2"]);
    expect(removeRule(dup, "nope")).toBe(dup);
  });

  it("sets the master switch, defaults and quiet hours", () => {
    const c = setAlertsEnabled(defaultConfig(), false);
    expect(c.alerts?.enabled).toBe(false);
    expect(patchDefaults(c, { style: "banner" }).alerts?.defaults.style).toBe("banner");
    const q = setQuietHours(c, { from: "22:00", to: "06:00", minSeverity: "critical" });
    expect(q.alerts?.quietHours?.from).toBe("22:00");
    expect(setQuietHours(q, undefined).alerts).not.toHaveProperty("quietHours");
  });

  it("keys one field of one rule so a burst of typing is one undo step", () => {
    expect(ruleKey("r1", "name")).toBe(ruleKey("r1", "name"));
    expect(ruleKey("r1", "name")).not.toBe(ruleKey("r2", "name"));
    expect(ruleKey("r1", "name")).not.toBe(ruleKey("r1", "value"));
    expect(alertsKey("enabled")).not.toBe(ruleKey("enabled", "enabled"));
  });
});

describe("history and preview", () => {
  const h = (id: string, ruleId: string, startedAt: number, test = false): AlertHistoryEntry => ({
    id,
    ruleId,
    name: "n",
    severity: "info",
    text: "t",
    startedAt,
    test,
  });
  it("finds the newest real firing of a rule", () => {
    const list = [h("a", "r1", 100), h("b", "r1", 300, true), h("c", "r1", 200), h("d", "r2", 400)];
    expect(lastFired(list, "r1")?.id).toBe("c");
    expect(lastFired(list, "zz")).toBeUndefined();
  });
  it("formats ages", () => {
    expect(ageText(0, 2000)).toBe("now");
    expect(ageText(0, 42_000)).toBe("42 s");
    expect(ageText(0, 5 * 60_000)).toBe("5 m");
    expect(ageText(0, 3 * 3_600_000)).toBe("3 h");
    expect(ageText(0, 2 * 86_400_000)).toBe("2 d");
  });
  it("flips the clear label with the direction", () => {
    expect(clearLabel(">")).toBe("Clears below");
    expect(clearLabel("<=")).toBe("Clears above");
    expect(clearLabel("=")).toBeNull();
  });
  it("previews whether the rule would fire now", () => {
    const s = rule().source;
    expect(previewSensor(s, { value: 90, unit: "°C" })).toEqual({ value: "90 °C", state: "fires" });
    expect(previewSensor(s, { value: 50, unit: "°C" }).state).toBe("ok");
    expect(previewSensor(s, undefined)).toEqual({ value: null, state: "nodata" });
    expect(previewSensor({ kind: "sensor", key: "a", op: "contains", value: "dow", forSeconds: 0 }, { text: "Down", unit: "" }).state).toBe("fires");
    expect(previewSensor({ kind: "sensor", key: "a", op: "changes", value: 0, forSeconds: 0 }, { value: 1, unit: "" }).state).toBe("event");
    const missing = { kind: "sensor" as const, key: "a", op: "missing" as const, value: 0, forSeconds: 30 };
    expect(previewSensor(missing, { value: 1, unit: "" }).state).toBe("ok");
    expect(previewSensor(missing, undefined).state).toBe("nodata");
  });
});
