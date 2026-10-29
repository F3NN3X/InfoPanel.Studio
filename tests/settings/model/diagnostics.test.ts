import { describe, expect, it } from "vitest";
import { diagnosticsSummary, withoutPersonal } from "@/settings/model/diagnostics";
import type { Diagnostics, Status } from "@/settings/types";

const status = (over: Partial<Status>): Status =>
  ({ state: "running", owned: true, host: "127.0.0.1", port: 6379, appVersion: "1.3.1-beta.2", message: null, ...over }) as Status;

const diag = (over: Partial<Status> = {}): Diagnostics => ({
  debug: true,
  samples: 2,
  latestTime: null,
  series: [],
  logsDir: "C:\\Users\\alice\\AppData\\Local\\InfoPanel Studio\\logs",
  sampleEverySecs: 30,
  status: status(over),
});

describe("diagnosticsSummary", () => {
  it("leaves out the logs folder and the server's address", () => {
    const text = diagnosticsSummary(diag({ host: "192.168.1.40" }));
    expect(text).not.toContain("alice");
    expect(text).not.toContain("192.168");
    expect(text).toContain("Server: running on the network, port 6379");
    expect(diagnosticsSummary(diag())).toContain("Server: running on this PC, port 6379");
  });

  it("takes user folders and addresses out of the server's message", () => {
    const text = diagnosticsSummary(diag({ state: "failed", message: "could not open C:\\Users\\alice\\data on 10.0.0.5" }));
    expect(text).toContain("- could not open %USERPROFILE%\\data on <address>");
  });
});

describe("withoutPersonal", () => {
  it("keeps loopback and text without a user folder", () => {
    expect(withoutPersonal("bound 127.0.0.1:6379")).toBe("bound 127.0.0.1:6379");
    expect(withoutPersonal("D:/users/Bob Smith/x")).toBe("%USERPROFILE%/x");
  });
});
