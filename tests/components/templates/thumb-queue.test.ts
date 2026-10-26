import { describe, expect, it } from "vitest";
import { createThumbQueue } from "@/components/templates/thumb-queue";

const keys = (q: ReturnType<typeof createThumbQueue<string>>) => q.active().map(([key]) => key);

describe("the gallery's thumbnail queue", () => {
  it("draws at most `limit` at once and starts the next when one is done", () => {
    const q = createThumbQueue<string>(2);
    q.want("a", "A");
    q.want("b", "B");
    q.want("c", "C");
    expect(keys(q)).toEqual(["a", "b"]);
    q.done("a", "pic-a");
    expect(keys(q)).toEqual(["b", "c"]);
    expect(q.get("a")).toBe("pic-a");
  });

  it("does not draw a key twice, and keeps pictures for later asks", () => {
    const q = createThumbQueue<string>(2);
    q.want("a", "A");
    q.want("a", "A");
    expect(keys(q)).toEqual(["a"]);
    q.done("a", "pic");
    q.want("a", "A");
    expect(keys(q)).toEqual([]);
  });

  it("drops a waiting key nobody wants any more, but not one being drawn", () => {
    const q = createThumbQueue<string>(1);
    q.want("a", "A");
    const release = q.want("b", "B");
    release();
    const releaseA = q.want("a", "A");
    releaseA();
    q.done("a", "pic");
    expect(keys(q)).toEqual([]);
    expect(q.get("a")).toBe("pic");
  });

  it("draws a key asked for first ahead of those waiting (the selected card)", () => {
    const q = createThumbQueue<string>(1);
    q.want("a", "A");
    q.want("b", "B");
    q.want("c", "C", true);
    q.done("a", "pic");
    expect(keys(q)).toEqual(["c"]);
  });

  it("keeps a key while any asker still wants it", () => {
    const q = createThumbQueue<string>(1);
    q.want("a", "A");
    const first = q.want("b", "B");
    const second = q.want("b", "B");
    first();
    q.done("a", "pic");
    expect(keys(q)).toEqual(["b"]);
    second();
  });

  it("does not ask again for one that failed, and tells listeners of each change", () => {
    const q = createThumbQueue<string>(1);
    let calls = 0;
    q.subscribe(() => calls++);
    q.want("a", "A");
    q.fail("a");
    q.want("a", "A");
    expect(keys(q)).toEqual([]);
    expect(q.get("a")).toBeUndefined();
    expect(calls).toBe(2);
  });
});
