import { describe, expect, it } from "vitest";
import { CONFIG_VERSION, mergeConfig, type StoredConfig } from "@/lib/layout";

const profile = { id: "p", name: "Desk", width: 1920, height: 1080, cols: 12, rows: 6, fit: "scroll", pages: [{ id: "main", name: "Main", placements: [] }] };

const rule = (id: string, source: Record<string, unknown>) => ({
  id,
  name: id,
  enabled: true,
  severity: "warning",
  source,
  cooldownSeconds: 60,
  outputs: {},
});

const stored = (version: number, rules: unknown[]): StoredConfig =>
  ({ version, activeProfile: "auto", profiles: [profile], alerts: { enabled: true, rules, defaults: { style: "toast", position: "top-right", backdrop: "none", size: "m", seconds: 8 } } }) as unknown as StoredConfig;

describe("v11: sensor alerts hold a list of conditions", () => {
  it("turns a single key, op and value into a one-item list and keeps the rest", () => {
    const legacy = stored(10, [
      rule("hot", { kind: "sensor", key: "gpu.temp", op: ">", value: 80, forSeconds: 10, clearBelow: 75 }),
      rule("gone", { kind: "sensor", key: "fps", op: "missing", value: 0, forSeconds: 30 }),
      rule("chat", { kind: "notification", apps: ["Discord"] }),
    ]);
    const migrated = mergeConfig(legacy);
    expect(migrated.version).toBe(CONFIG_VERSION);
    expect(migrated.alerts?.rules.map((r) => r.source)).toEqual([
      { kind: "sensor", conditions: [{ key: "gpu.temp", op: ">", value: 80, clearBelow: 75 }], forSeconds: 10 },
      { kind: "sensor", conditions: [{ key: "fps", op: "missing", value: 0 }], forSeconds: 30 },
      { kind: "notification", apps: ["Discord"] },
    ]);
  });

  it("is idempotent and round-trips through JSON", () => {
    const once = mergeConfig(stored(10, [rule("hot", { kind: "sensor", key: "gpu.temp", op: ">", value: 80, forSeconds: 0 })]));
    const again = mergeConfig(JSON.parse(JSON.stringify(once)) as StoredConfig);
    expect(again).toEqual(once);
  });

  it("keeps a rule whose sensor is not picked yet and a rule with several conditions", () => {
    const migrated = mergeConfig(
      stored(10, [
        rule("blank", { kind: "sensor", key: "", op: ">", value: 80, forSeconds: 0 }),
        rule("two", { kind: "sensor", conditions: [{ key: "a", op: ">", value: 1 }, { key: "b", op: "<", value: 2 }], forSeconds: 5 }),
      ])
    );
    expect(migrated.alerts?.rules[0].source).toMatchObject({ conditions: [{ key: "" }] });
    expect(migrated.alerts?.rules[1].source).toMatchObject({ conditions: [{ key: "a" }, { key: "b" }], forSeconds: 5 });
  });
});
