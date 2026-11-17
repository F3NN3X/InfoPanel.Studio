import { describe, expect, it } from "vitest";
import { normalizeKeys, type KeySlot } from "@/lib/keys";
import { addKey, levelKeys, moveKey, newKey, removeKey, updateKey, withField, withLevel } from "@/lib/keys-edit";

// The Keys editor's changes (pinned layer P7): one level at a time, the top or a folder's, each giving what a load keeps.

const RUN = { op: "run", command: "calc.exe" } as const;

describe("the keys editor's changes", () => {
  const top: KeySlot[] = [
    { id: "a", name: "A" },
    { id: "f", name: "F", keys: [{ id: "b", name: "B" }] },
  ];

  it("add, move, change and remove keys on the top level or in a folder, and give back what a load keeps", () => {
    const key = newKey();
    const added = withLevel(top, null, (l) => addKey(l, key));
    expect(added.map((k) => k.id)).toEqual(["a", "f", key.id]);
    const inFolder = withLevel(added, "f", (l) => addKey(l, newKey()));
    expect(levelKeys(inFolder, "f")).toHaveLength(2);
    const moved = withLevel(inFolder, null, (l) => moveKey(l, "a", 1));
    expect(moved.map((k) => k.id)).toEqual(["f", "a", key.id]);
    expect(moveKey(moved, "f", -1)).toEqual(moved);
    const named = withLevel(moved, "f", (l) => updateKey(l, "b", (k) => withField({ ...k, name: "Calc" }, "touch", { tap: RUN })));
    expect(levelKeys(named, "f")[0]).toEqual({ id: "b", name: "Calc", touch: { tap: RUN } });
    expect(withField(levelKeys(named, "f")[0], "touch", undefined)).toEqual({ id: "b", name: "Calc" });
    const gone = withLevel(named, null, (l) => removeKey(l, "f"));
    expect(gone.map((k) => k.id)).toEqual(["a", key.id]);
    // a folder that is gone changes nothing
    expect(withLevel(gone, "f", () => [])).toEqual(gone);
    expect(normalizeKeys(named)).toEqual(named);
    // a new folder is an empty one with the folder icon
    expect(newKey(true)).toMatchObject({ name: "Folder", icon: { from: "set", name: "folder" }, keys: [] });
  });

  it("stop adding at 48 on a level", () => {
    const full = Array.from({ length: 48 }, (_, i) => ({ id: `k${i}`, name: "K" }));
    expect(addKey(full, newKey())).toHaveLength(48);
  });
});
