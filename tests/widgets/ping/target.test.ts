import { describe, expect, it } from "vitest";
import { statusOf, targetId, targetPrefix, toneOf } from "@/widgets/ping/target";

// The id is the server's (`ping.rs` `target_id`): its tests pin the same spellings.
describe("the target id", () => {
  it("is the host and port as lowercase words, as the server keys it", () => {
    expect(targetId("1.1.1.1", 443)).toBe("1-1-1-1-443");
    expect(targetId("Router.Local", 80)).toBe("router-local-80");
    expect(targetId("fe80::1", 22)).toBe("fe80-1-22");
    expect(targetId("  example.net ", 443)).toBe("example-net-443");
  });

  it("is no prefix without a host, so nothing is read", () => {
    expect(targetPrefix("", 443)).toBe("");
    expect(targetPrefix("   ", 443)).toBe("");
    expect(targetPrefix("example.net", 443)).toBe("ping.example-net-443.");
  });
});

describe("the status", () => {
  it("takes down and waiting from the server and says slow at the warn time", () => {
    expect(statusOf("down", Number.NaN, 100)).toBe("down");
    expect(statusOf("waiting", Number.NaN, 100)).toBe("waiting");
    expect(statusOf("ok", 99.9, 100)).toBe("ok");
    expect(statusOf("ok", 100, 100)).toBe("slow");
  });

  it("is waiting for a reading it does not know, never up", () => {
    expect(statusOf("", Number.NaN, 100)).toBe("waiting");
    expect(statusOf("ok", Number.NaN, 100)).toBe("waiting");
  });

  it("is critical when down or at the critical time, a warning when slow", () => {
    expect(toneOf("down", Number.NaN, 250)).toBe("crit");
    expect(toneOf("slow", 120, 250)).toBe("warn");
    expect(toneOf("slow", 250, 250)).toBe("crit");
    expect(toneOf("ok", 20, 250)).toBe("ok");
    expect(toneOf("waiting", Number.NaN, 250)).toBe("ok");
  });
});
