import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { stubDesktop } from "../../tools/ci-stub-desktop.mjs";

// Always a scratch copy: the stub must never touch this checkout's src-tauri/resources or target/.
describe("the CI desktop stub", () => {
  let root;
  const resources = () => path.join(root, "src-tauri", "resources");
  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), "stub-desktop-"));
  });
  afterEach(() => fs.rmSync(root, { recursive: true, force: true }));

  it("refuses to stub an empty agent: tauri-build would copy it over the built one", () => {
    expect(() => stubDesktop(root)).toThrow(/cargo build -p ips-agent/);
    fs.mkdirSync(path.join(root, "src-tauri", "target", "debug"), { recursive: true });
    fs.writeFileSync(path.join(root, "src-tauri", "target", "debug", "ips-agent.exe"), "");
    expect(() => stubDesktop(root)).toThrow(/cargo build -p ips-agent/);
    expect(fs.existsSync(path.join(resources(), "ips-agent.exe"))).toBe(false);
  });

  it("copies the built debug agent in and creates the app folder tauri-build wants", () => {
    const built = path.join(root, "src-tauri", "target", "debug");
    fs.mkdirSync(built, { recursive: true });
    fs.writeFileSync(path.join(built, "ips-agent.exe"), "MZ-real");
    expect(stubDesktop(root)).toEqual([path.join("src-tauri", "resources", "ips-agent.exe")]);
    expect(fs.statSync(path.join(resources(), "app")).isDirectory()).toBe(true);
    expect(fs.readFileSync(path.join(resources(), "ips-agent.exe"), "utf8")).toBe("MZ-real");
    expect(fs.readFileSync(path.join(built, "ips-agent.exe"), "utf8")).toBe("MZ-real");
  });

  it("never overwrites what is there", () => {
    fs.mkdirSync(path.join(resources(), "app"), { recursive: true });
    fs.writeFileSync(path.join(resources(), "ips-agent.exe"), "real");
    expect(stubDesktop(root)).toEqual([]);
    expect(fs.readFileSync(path.join(resources(), "ips-agent.exe"), "utf8")).toBe("real");
  });
});
