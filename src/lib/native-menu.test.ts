// @vitest-environment happy-dom
import { afterEach, describe, expect, it } from "vitest";
import { isTextField, suppressNativeMenu } from "./native-menu";

const fire = (el: Element) => {
  const e = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
  el.dispatchEvent(e);
  return e.defaultPrevented;
};

let stop = () => {};
afterEach(() => {
  stop();
  document.body.innerHTML = "";
});

describe("suppressNativeMenu", () => {
  it("cancels the native menu on ordinary elements", () => {
    stop = suppressNativeMenu(window);
    const div = document.body.appendChild(document.createElement("div"));
    expect(fire(div)).toBe(true);
  });

  it("keeps it in text fields", () => {
    stop = suppressNativeMenu(window);
    document.body.innerHTML = `<input id="a"><input id="b" type="search"><textarea id="c"></textarea>`;
    for (const id of ["a", "b", "c"]) expect(fire(document.getElementById(id)!)).toBe(false);
  });

  it("cancels it on checkboxes and ranges", () => {
    stop = suppressNativeMenu(window);
    document.body.innerHTML = `<input id="a" type="checkbox"><input id="b" type="range">`;
    expect(fire(document.getElementById("a")!)).toBe(true);
    expect(fire(document.getElementById("b")!)).toBe(true);
  });

  it("stops when removed", () => {
    suppressNativeMenu(window)();
    const div = document.body.appendChild(document.createElement("div"));
    expect(fire(div)).toBe(false);
  });
});

describe("isTextField", () => {
  it("is false for non-elements", () => {
    expect(isTextField(null)).toBe(false);
    expect(isTextField(window)).toBe(false);
  });
});
