import { describe, expect, it } from "vitest";
import { isValidElement } from "react";
import { ZoneErrorBoundary, safeRender, zoneErrorMessage } from "@/components/zone-error-boundary";

describe("zoneErrorMessage", () => {
  it("keeps the first line of an Error", () => {
    expect(zoneErrorMessage(new Error("boom\n  at x"))).toBe("boom");
  });
  it("stringifies non-errors and falls back when empty", () => {
    expect(zoneErrorMessage("bad")).toBe("bad");
    expect(zoneErrorMessage(new Error(""))).toBe("Unknown error");
  });
  it("truncates long messages", () => {
    const msg = zoneErrorMessage(new Error("x".repeat(300)));
    expect(msg.length).toBe(118);
    expect(msg.endsWith("…")).toBe(true);
  });
});

describe("safeRender", () => {
  it("returns the render result", () => {
    expect(safeRender("W", () => "ok")).toBe("ok");
  });
  it("turns a throw into an error tile", () => {
    const out = safeRender("CPU", () => {
      throw new Error("no data");
    });
    expect(isValidElement(out)).toBe(true);
    expect((out as { props: { title: string; message: string } }).props).toMatchObject({
      title: "CPU",
      message: "no data",
    });
  });
});

describe("ZoneErrorBoundary state", () => {
  it("captures an error and clears it when the reset key changes", () => {
    const caught = ZoneErrorBoundary.getDerivedStateFromError(new Error("x"));
    expect(caught.error).toBeInstanceOf(Error);
    const state = { error: new Error("x"), resetKey: 1 };
    expect(ZoneErrorBoundary.getDerivedStateFromProps({ title: "", resetKey: 1, children: null }, state)).toBeNull();
    expect(ZoneErrorBoundary.getDerivedStateFromProps({ title: "", resetKey: 2, children: null }, state)).toEqual({
      error: null,
      resetKey: 2,
    });
  });
});
