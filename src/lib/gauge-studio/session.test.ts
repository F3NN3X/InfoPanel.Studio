import { beforeEach, describe, expect, it } from "vitest";
import { newGaugeOpen } from "./open";
import { closeSession, keepCopy, openSession, sessionCopy, sessionEditor } from "./session";

describe("editor session", () => {
  beforeEach(closeSession);

  it("keeps the open editor and its working copy until it is closed", () => {
    expect(sessionEditor()).toBeNull();
    const slot = openSession(newGaugeOpen());
    expect(sessionEditor()).toBe(slot);
    keepCopy(slot.id, { name: "edited" });
    expect(sessionCopy(slot.id)).toEqual({ name: "edited" });
    keepCopy(slot.id, { name: "later" });
    expect(sessionCopy(slot.id)).toEqual({ name: "later" });
    closeSession();
    expect(sessionEditor()).toBeNull();
    expect(sessionCopy(slot.id)).toBeUndefined();
  });

  it("drops the copy of the editor before when another opens, and ignores a late keep", () => {
    const first = openSession(newGaugeOpen());
    keepCopy(first.id, "one");
    const second = openSession(newGaugeOpen());
    expect(second.id).not.toBe(first.id);
    expect(sessionCopy(first.id)).toBeUndefined();
    expect(sessionCopy(second.id)).toBeUndefined();
    keepCopy(first.id, "stale");
    expect(sessionCopy(first.id)).toBeUndefined();
  });
});
