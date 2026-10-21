import { describe, expect, it } from "vitest";
import { DEFAULT_ALERT_DISPLAY, normalizeAlerts } from "@/lib/alerts";

const rule = (over: Record<string, unknown> = {}) => ({
  id: "r1",
  name: "GPU hot",
  enabled: true,
  severity: "critical",
  source: { kind: "sensor", conditions: [{ key: "gpu.temp", op: ">", value: 80 }], forSeconds: 5 },
  cooldownSeconds: 30,
  outputs: {},
  ...over,
});

describe("normalizeAlerts", () => {
  it("keeps absent absent and rejects non-objects", () => {
    expect(normalizeAlerts(undefined)).toBeUndefined();
    expect(normalizeAlerts(null)).toBeUndefined();
    expect(normalizeAlerts([])).toBeUndefined();
    expect(normalizeAlerts("x")).toBeUndefined();
  });

  it("fills the defaults for an empty object", () => {
    expect(normalizeAlerts({})).toEqual({ enabled: true, rules: [], defaults: DEFAULT_ALERT_DISPLAY });
    expect(normalizeAlerts({ enabled: false })?.enabled).toBe(false);
  });

  it("passes a valid rule through unchanged", () => {
    const r = rule({
      source: { kind: "sensor", conditions: [{ key: "gpu.temp", op: ">", value: 80, clearBelow: 75 }], forSeconds: 5 },
      outputs: {
        display: { style: "overlay", position: "center", backdrop: "blur", size: "l", seconds: 0, text: "{name}" },
        page: { profile: "p", page: "game", returnAfter: true },
        highlight: { zones: ["z1"] },
      },
      profiles: ["p"],
    });
    expect(normalizeAlerts({ rules: [r] })?.rules).toEqual([r]);
  });

  it("keeps several conditions in order and drops unreadable ones", () => {
    const conditions = [
      { key: "cpu.temp", op: ">", value: 95, clearBelow: 90 },
      { key: "gpu.temp", op: ">", value: 85 },
    ];
    const keep = rule({ source: { kind: "sensor", conditions, forSeconds: 10 } });
    expect(normalizeAlerts({ rules: [keep] })?.rules).toEqual([keep]);
    const messy = rule({ source: { kind: "sensor", conditions: [null, { op: ">" }, ...conditions], forSeconds: 10 } });
    expect(normalizeAlerts({ rules: [messy] })?.rules[0].source).toEqual(keep.source);
    const none = rule({ id: "none", source: { kind: "sensor", conditions: [], forSeconds: 0 } });
    expect(normalizeAlerts({ rules: [none] })?.rules).toEqual([]);
  });

  it("reads a rule saved with one key, op and value as a one-item list (v11)", () => {
    const legacy = rule({ source: { kind: "sensor", key: "gpu.temp", op: ">", value: 80, forSeconds: 5, clearBelow: 75 } });
    expect(normalizeAlerts({ rules: [legacy] })?.rules[0].source).toEqual({
      kind: "sensor",
      conditions: [{ key: "gpu.temp", op: ">", value: 80, clearBelow: 75 }],
      forSeconds: 5,
    });
  });

  it("drops bad rules and duplicate ids", () => {
    const out = normalizeAlerts({
      rules: [
        null,
        rule({ id: "" }),
        rule({ id: "nokind", source: { kind: "magic" } }),
        rule({ id: "dup" }),
        rule({ id: "dup", name: "second" }),
      ],
    });
    expect(out?.rules.map((r) => r.id)).toEqual(["dup"]);
    expect(out?.rules[0].name).toBe("GPU hot");
  });

  it("keeps a sensor rule whose sensor is not picked yet", () => {
    const out = normalizeAlerts({ rules: [rule({ id: "nokey", source: { kind: "sensor", key: "" } })] });
    expect(out?.rules.map((r) => r.id)).toEqual(["nokey"]);
  });

  it("defaults unknown enums and clamps numbers", () => {
    const [r] = normalizeAlerts({
      rules: [
        rule({
          severity: "fatal",
          cooldownSeconds: 1e9,
          source: { kind: "sensor", key: "k", op: "~", value: null, forSeconds: -5 },
          outputs: { display: { style: "popup", position: "middle", backdrop: "x", size: "xl", seconds: 9999 } },
        }),
      ],
    })!.rules;
    expect(r.severity).toBe("warning");
    expect(r.cooldownSeconds).toBe(86_400);
    expect(r.source).toMatchObject({ conditions: [{ op: ">", value: 0 }], forSeconds: 0 });
    expect(r.outputs.display).toEqual({ seconds: 600 });
  });

  it("maps the unequal sign and defaults cooldown", () => {
    const [r] = normalizeAlerts({
      rules: [rule({ cooldownSeconds: undefined, source: { kind: "sensor", key: "k", op: "≠", value: "a" } })],
    })!.rules;
    expect(r.source).toMatchObject({ conditions: [{ op: "!=", value: "a" }] });
    expect(r.cooldownSeconds).toBe(60);
  });

  it("normalises a notification source", () => {
    const [r] = normalizeAlerts({
      rules: [rule({ source: { kind: "notification", apps: ["Discord", 3, ""], exclude: [], match: "  " } })],
    })!.rules;
    expect(r.source).toEqual({ kind: "notification", apps: ["Discord"] });
  });

  it("drops a page output without a page and bad profiles", () => {
    const [r] = normalizeAlerts({
      rules: [rule({ outputs: { page: { profile: "p" } }, profiles: [] })],
    })!.rules;
    expect(r.outputs.page).toBeUndefined();
    expect(r.profiles).toBeUndefined();
  });

  it("validates quiet hours and the defaults", () => {
    const ok = normalizeAlerts({ quietHours: { from: "23:00", to: "07:00", minSeverity: "warning" } });
    expect(ok?.quietHours).toEqual({ from: "23:00", to: "07:00", minSeverity: "warning" });
    expect(normalizeAlerts({ quietHours: { from: "25:00", to: "07:00" } })?.quietHours).toBeUndefined();
    expect(normalizeAlerts({ quietHours: { from: "22:00", to: "06:30", minSeverity: "x" } })?.quietHours?.minSeverity).toBe(
      "critical",
    );
    expect(normalizeAlerts({ defaults: { style: "island" } })?.defaults.style).toBe("island");
    expect(normalizeAlerts({ defaults: { style: "banner", seconds: -3, size: "q" } })?.defaults).toEqual({
      ...DEFAULT_ALERT_DISPLAY,
      style: "banner",
      seconds: 0,
    });
  });
});
