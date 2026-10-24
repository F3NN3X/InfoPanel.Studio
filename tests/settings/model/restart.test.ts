import { describe, expect, it } from "vitest";
import type { RunningConfig } from "@/settings/types";
import { parseHosts, parsePort, restartItems, restartText } from "@/settings/model/restart";

const running: RunningConfig = { listen: "local", port: 3922, debug: false, allowedHosts: [], allowRemoteEdit: false, server: "node" };
const saved = { listen: "local" as const, port: 3922, debug: false, allowedHosts: [] as string[], allowRemoteEdit: false, server: "node" as const };

describe("restartItems", () => {
  it("is empty while nothing differs, or no server runs", () => {
    expect(restartItems(saved, running)).toEqual([]);
    expect(restartItems({ ...saved, port: 4000, debug: true }, null)).toEqual([]);
  });

  it("lists each setting the running server hasn't picked up, with the value Undo restores", () => {
    const items = restartItems({ listen: "lan", port: 3923, debug: true, allowedHosts: ["panel.lan"], allowRemoteEdit: true, server: "native" }, running);
    expect(items.map((i) => [i.key, i.running])).toEqual([
      ["port", 3922],
      ["listen", "local"],
      ["debug", false],
      ["allowedHosts", []],
      ["allowRemoteEdit", false],
      ["server", "node"],
    ]);
    expect(restartText(items)).toBe(
      "Restart the server to apply: port 3923, local network access, debug mode on, allowed host names, editing from other devices on, the native server."
    );
  });

  it("words listen and debug by the saved value", () => {
    const text = restartText(restartItems({ ...saved, listen: "local", debug: false }, { ...running, listen: "lan", debug: true }));
    expect(text).toBe("Restart the server to apply: local-only access, debug mode off.");
  });

  it("does not count a debug mode forced for the run as a change", () => {
    expect(restartItems(saved, { ...running, debug: true }, true)).toEqual([]);
    expect(restartItems(saved, { ...running, debug: true }, false).map((i) => i.key)).toEqual(["debug"]);
  });
});

describe("parsePort", () => {
  it("takes whole numbers from 1024 to 65535", () => {
    expect(parsePort("1024")).toBe(1024);
    expect(parsePort("65535")).toBe(65535);
    expect(parsePort("3922")).toBe(3922);
  });

  it("refuses everything else", () => {
    for (const bad of ["", "1023", "65536", "0", "99999", "39 22", "3922.5", "-1", "abc", "1e3"]) expect(parsePort(bad)).toBeNull();
  });
});

describe("parseHosts", () => {
  it("splits on commas and spaces", () => {
    expect(parseHosts("panel.lan, kiosk  nas")).toEqual(["panel.lan", "kiosk", "nas"]);
    expect(parseHosts(" , ")).toEqual([]);
  });
});
