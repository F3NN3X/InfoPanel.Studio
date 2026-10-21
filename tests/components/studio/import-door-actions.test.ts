import { describe, expect, it, vi } from "vitest";
import { sniffFile } from "@/lib/import-sniff";
import { defaultConfig, newProfile, type DashboardConfig, type MonitorProfile } from "@/lib/layout";
import { DEFAULT_CHOICES, restoreConfig, runImport, type DoorChoices, type DoorContext, type DoorFile } from "@/components/studio/import-door-actions";
import { parseProfileFile, profileFileText } from "@/components/studio/profile-file";

const configOf = (...names: string[]): DashboardConfig => {
  const base = defaultConfig();
  return { ...base, profiles: names.map((n) => newProfile(n, 1920, 550)) };
};
const text = (c: unknown) => JSON.stringify(c);

/** A file as the door holds it: sniffed from its bytes, as the dialog does. */
async function door(name: string, body: string, id = 0): Promise<DoorFile> {
  const file = new File([body], name);
  return { id, file, sniffed: await sniffFile(name, file.type, new Uint8Array(await file.arrayBuffer())) };
}

function context(current: DashboardConfig, backup = true) {
  const calls: string[] = [];
  const ctx: DoorContext = {
    config: current,
    setConfig: vi.fn(() => void calls.push("set")) as unknown as DoorContext["setConfig"],
    addScreen: vi.fn(() => void calls.push("add")),
    backup: vi.fn(() => (calls.push("backup"), backup)),
    useAsBackground: vi.fn(),
  };
  return { ctx, calls };
}

describe("restoreConfig", () => {
  const current = configOf("Mine");
  const file = text(configOf("Theirs A", "Theirs B"));

  it("replaces everything, and backs the current dashboard up first by default", async () => {
    const backup = vi.fn(() => true);
    const r = await restoreConfig(file, { current, mode: "replace", backupFirst: true, backup });
    expect(backup).toHaveBeenCalledExactlyOnceWith(current);
    expect(r.config.profiles.map((p) => p.name)).toEqual(["Theirs A", "Theirs B"]);
    expect(r.backedUp).toBe(true);
  });

  it("skips the backup when it is switched off", async () => {
    const backup = vi.fn(() => true);
    const r = await restoreConfig(file, { current, mode: "replace", backupFirst: false, backup });
    expect(backup).not.toHaveBeenCalled();
    expect(r.backedUp).toBe(false);
  });

  it("replaces nothing when the backup cannot be written", async () => {
    await expect(restoreConfig(file, { current, mode: "replace", backupFirst: true, backup: () => false })).rejects.toThrow("could not be backed up");
  });

  it("does not back up, or touch the file, when it is not a config", async () => {
    const backup = vi.fn(() => true);
    await expect(restoreConfig("{}", { current, mode: "replace", backupFirst: true, backup })).rejects.toThrow("Missing profiles");
    expect(backup).not.toHaveBeenCalled();
  });

  it("adds its screens only, keeping what is there, with fresh ids and names that are free", async () => {
    const same = configOf("Mine", "Other");
    const backup = vi.fn(() => true);
    const r = await restoreConfig(text(same), { current, mode: "add-screens", backupFirst: true, backup });
    expect(backup).not.toHaveBeenCalled();
    expect(r.config.profiles[0]).toBe(current.profiles[0]);
    expect(r.config.profiles).toHaveLength(3);
    expect(new Set(r.config.profiles.map((p) => p.name)).size).toBe(3);
    expect(new Set(r.config.profiles.map((p) => p.id)).size).toBe(3);
  });
});

describe("runImport", () => {
  const replace: DoorChoices = { ...DEFAULT_CHOICES };

  it("restores a config backup: the backup is written first, then the config is replaced in one step", async () => {
    const current = configOf("Mine");
    const { ctx, calls } = context(current);
    const r = await runImport([await door("backup.json", text(configOf("Theirs")))], replace, ctx);
    expect(calls).toEqual(["backup", "set"]);
    expect(vi.mocked(ctx.setConfig).mock.calls[0][0]).toMatchObject({ profiles: [{ name: "Theirs" }] });
    expect(r.failed).toEqual([]);
    expect(r.done[0]).toMatch(/backed up first/);
  });

  it("leaves the dashboard alone, and says so, when the backup fails", async () => {
    const { ctx, calls } = context(configOf("Mine"), false);
    const r = await runImport([await door("backup.json", text(configOf("Theirs")))], replace, ctx);
    expect(calls).toEqual(["backup"]);
    expect(r.done).toEqual([]);
    expect(r.failed[0]).toMatch(/backup\.json: .*could not be backed up/);
  });

  it("takes a Studio profile file through the door as a new screen, and goes to Screens", async () => {
    const original: MonitorProfile = { ...newProfile("Wide", 1920, 550), gap: 8 };
    const current = configOf("Wide");
    const { ctx } = context(current);
    const r = await runImport([await door("wide.json", profileFileText(original))], replace, ctx);
    const added = vi.mocked(ctx.addScreen).mock.calls[0][0];
    expect(added.id).not.toBe(original.id);
    expect(added.name).not.toBe("Wide");
    expect(added).toMatchObject({ width: 1920, height: 550, gap: 8 });
    expect(added.pages).toHaveLength(original.pages.length);
    expect(r.go).toEqual({ to: "screens" });
    // The file's own contents survive the trip: parsing the export gives the same profile the door added (bar ids and name).
    const parsed = parseProfileFile(profileFileText(original));
    if ("error" in parsed) throw new Error(parsed.error);
    expect({ ...added, id: "", name: "", pages: [] }).toEqual({ ...parsed.profile, id: "", name: "", pages: [] });
  });

  it("gives two screens of one batch names of their own", async () => {
    const { ctx } = context(configOf("Wide"));
    await runImport([await door("a.json", profileFileText(newProfile("Wide", 1920, 550)), 0), await door("b.json", profileFileText(newProfile("Wide", 1920, 550)), 1)], replace, ctx);
    const names = vi.mocked(ctx.addScreen).mock.calls.map(([p]) => p.name);
    expect(new Set([...names, "Wide"]).size).toBe(3);
  });

  it("reports a file it does not recognise and a profile that is broken, and goes on with the rest", async () => {
    const { ctx } = context(configOf("Mine"));
    const bad = await door("bad.json", text({ ...newProfile("x", 1, 1), width: "wide" }));
    const r = await runImport([await door("notes.txt", "hello", 0), bad, await door("ok.json", profileFileText(newProfile("Ok", 800, 480)), 2)], replace, ctx);
    expect(vi.mocked(ctx.addScreen)).toHaveBeenCalledOnce();
    expect(r.failed.join("\n")).toContain("notes.txt: We don't recognise this file.");
    expect(r.done).toHaveLength(1);
  });

  it("takes one config or one InfoPanel file at a time", async () => {
    const { ctx } = context(configOf("Mine"));
    const r = await runImport(
      [await door("a.json", text(configOf("A")), 0), await door("b.json", text(configOf("B")), 1), await door("one.infopanel", "x", 2), await door("two.infopanel", "x", 3)],
      replace,
      ctx,
    );
    expect(vi.mocked(ctx.setConfig)).toHaveBeenCalledOnce();
    expect(r.failed).toEqual(["b.json: import this one on its own", "two.infopanel: import this one on its own"]);
    expect(r.wizard?.file.name).toBe("one.infopanel");
  });

  it("hands an InfoPanel file to the wizard with the destination chosen in the door", async () => {
    const { ctx } = context(configOf("Mine"));
    const file = await door("ARCv2.infopanel", "x");
    expect((await runImport([file], replace, ctx)).wizard?.dest).toBe("new");
    expect((await runImport([file], { ...replace, canvas: "canvas-zone" }, ctx)).wizard?.dest).toBe("zone");
  });
});
