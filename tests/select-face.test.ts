// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { installSelectFace } from "@/select-face";

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

const faces = (select: Element) => select.querySelectorAll(":scope > button > selectedcontent").length;

describe("installSelectFace", () => {
  it("gives each select one button with a selectedcontent, now and for selects added later", async () => {
    vi.stubGlobal("CSS", { supports: () => true });
    document.body.innerHTML = "<select><option>a</option></select>";
    installSelectFace();
    const first = document.querySelector("select") as HTMLSelectElement;
    expect(faces(first)).toBe(1);
    expect(first.firstElementChild?.tagName).toBe("BUTTON");

    const wrap = document.createElement("div");
    wrap.innerHTML = "<select><option>b</option></select>";
    document.body.append(wrap);
    await Promise.resolve();
    expect(faces(wrap.querySelector("select") as Element)).toBe(1);
    expect(faces(first)).toBe(1);
  });

  it("leaves selects alone where base-select is not supported", () => {
    vi.stubGlobal("CSS", { supports: () => false });
    document.body.innerHTML = "<select><option>a</option></select>";
    installSelectFace();
    expect(document.querySelector("select > button")).toBeNull();
  });
});
