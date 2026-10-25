import { describe, expect, it } from "vitest";
import { resolveChanges } from "../../tools/verify/map.mjs";
import { buildPlan } from "../../tools/verify/plan.mjs";
import { isVersionOnly, RELEASE_FEATURE, splitVersionOnly } from "../../tools/verify/release.mjs";

const json = (value) => `${JSON.stringify(value, null, 2)}\n`;

const pkg = (version, deps = { react: "^19.0.0" }) => json({ name: "x", version, dependencies: deps });
const lock = (root, dep) =>
  json({ name: "x", version: root, lockfileVersion: 3, packages: { "": { name: "x", version: root }, "node_modules/react": { version: dep } } });
const toml = (version, dep) => `[package]\nname = "ips"\nversion = "${version}"\nedition = "2021"\n\n[dependencies]\nserde = { version = "${dep}", features = ["derive"] }\n`;
const cargoLock = (own, dep) =>
  `version = 4\n\n[[package]]\nname = "ips-server"\nversion = "${own}"\ndependencies = [\n "serde",\n]\n\n[[package]]\nname = "serde"\nversion = "${dep}"\nsource = "registry+https://github.com/rust-lang/crates.io-index"\nchecksum = "abc"\n`;

describe("isVersionOnly", () => {
  it("package.json: the root version alone", () => {
    expect(isVersionOnly("package.json", pkg("1.0.0"), pkg("1.1.0"))).toBe(true);
  });
  it("package.json: a dependency added or changed is not", () => {
    expect(isVersionOnly("package.json", pkg("1.0.0"), pkg("1.1.0", { react: "^19.0.0", zod: "^4.0.0" }))).toBe(false);
    expect(isVersionOnly("package.json", pkg("1.0.0"), pkg("1.0.0", { react: "^20.0.0" }))).toBe(false);
  });
  it("package-lock.json: the root version and packages[''] version alone", () => {
    expect(isVersionOnly("package-lock.json", lock("1.0.0", "19.0.0"), lock("1.1.0", "19.0.0"))).toBe(true);
  });
  it("package-lock.json: a dependency's version is not", () => {
    expect(isVersionOnly("package-lock.json", lock("1.0.0", "19.0.0"), lock("1.1.0", "19.1.0"))).toBe(false);
  });
  it("Cargo.toml: the [package] version alone", () => {
    expect(isVersionOnly("src-tauri/crates/ips-server/Cargo.toml", toml("1.0.0", "1.0.1"), toml("1.1.0", "1.0.1"))).toBe(true);
  });
  it("Cargo.toml: a dependency's version is not", () => {
    expect(isVersionOnly("src-tauri/Cargo.toml", toml("1.0.0", "1.0.1"), toml("1.0.0", "1.0.2"))).toBe(false);
  });
  it("Cargo.lock: a workspace package's version alone", () => {
    expect(isVersionOnly("src-tauri/Cargo.lock", cargoLock("1.0.0", "1.0.1"), cargoLock("1.1.0", "1.0.1"))).toBe(true);
  });
  it("Cargo.lock: a registry package's version is not", () => {
    expect(isVersionOnly("src-tauri/Cargo.lock", cargoLock("1.0.0", "1.0.1"), cargoLock("1.0.0", "1.0.2"))).toBe(false);
  });
  it("an added or deleted file, or one that does not parse, is not", () => {
    expect(isVersionOnly("package.json", null, pkg("1.0.0"))).toBe(false);
    expect(isVersionOnly("package.json", pkg("1.0.0"), null)).toBe(false);
    expect(isVersionOnly("package.json", "{", "{")).toBe(false);
  });
});

describe("a release-shaped change set", () => {
  const map = {
    checks: {
      typecheck: { cmd: "tsc" },
      unit: { cmd: "vt {tests}", tests: ["tests/**/*.test.ts"] },
      e2e: { cmd: "pw", tests: ["tests/e2e/*.spec.ts"], emptyMeansAll: true },
      "cargo-server": { cmd: "cargo test" },
      full: { escalate: true },
    },
    features: [
      { id: "tooling", paths: ["package.json", "package-lock.json"], tests: [], checks: ["full"] },
      { id: "server-core", paths: ["src-tauri/**"], tests: [], checks: ["e2e", "cargo-server"] },
      { id: "settings-window", paths: ["CHANGELOG.md"], tests: [], checks: ["typecheck", "unit"] },
      { id: RELEASE_FEATURE, paths: [], tests: [], checks: ["cargo-server"] },
    ],
  };
  const files = ["CHANGELOG.md", "package.json", "package-lock.json", "src-tauri/Cargo.toml", "src-tauri/Cargo.lock"];
  const bumped = {
    "package.json": { old: pkg("1.0.0"), new: pkg("1.1.0") },
    "package-lock.json": { old: lock("1.0.0", "19.0.0"), new: lock("1.1.0", "19.0.0") },
    "src-tauri/Cargo.toml": { old: toml("1.0.0", "1"), new: toml("1.1.0", "1") },
    "src-tauri/Cargo.lock": { old: cargoLock("1.0.0", "1"), new: cargoLock("1.1.0", "1") },
  };
  const planFor = (read) => {
    const { versionOnly, rest } = splitVersionOnly(files, read);
    const { byFeature } = resolveChanges(rest, map);
    if (versionOnly.length) byFeature.set(RELEASE_FEATURE, versionOnly);
    const features = [...byFeature.keys()].map((id) => map.features.find((f) => f.id === id));
    return { byFeature, plan: buildPlan({ map, features, changed: files, mode: "default", tracked: [], exists: () => true, platform: "linux" }) };
  };

  it("has no e2e and no full run, and names release-version", () => {
    const { byFeature, plan } = planFor((file) => bumped[file] ?? null);
    expect(plan.escalated).toBe(false);
    expect(plan.steps.map((s) => s.id)).toEqual(["typecheck", "unit", "cargo-server"]);
    expect(byFeature.get(RELEASE_FEATURE)).toEqual(files.slice(1));
  });

  it("still escalates when a manifest changes for real", () => {
    const real = { ...bumped, "package.json": { old: pkg("1.0.0"), new: pkg("1.1.0", { react: "^20.0.0" }) } };
    const { plan } = planFor((file) => real[file] ?? null);
    expect(plan.escalated).toBe(true);
    expect(plan.steps.map((s) => s.id)).toContain("e2e");
  });
});
