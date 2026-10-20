import { describe, expect, it } from "vitest";
import { parseInline, stripInline } from "./inline";

describe("parseInline", () => {
  it("splits code, bold and plain text", () => {
    expect(parseInline("Use `3922` or **both** ports.")).toEqual([
      { kind: "text", text: "Use " },
      { kind: "code", text: "3922" },
      { kind: "text", text: " or " },
      { kind: "bold", text: "both" },
      { kind: "text", text: " ports." },
    ]);
  });

  it("reads article links, with and without a heading", () => {
    expect(parseInline("See [Widgets](widgets) and [the port](problems#the-server-wont-start-port-in-use).")).toEqual([
      { kind: "text", text: "See " },
      { kind: "article", label: "Widgets", article: "widgets" },
      { kind: "text", text: " and " },
      { kind: "article", label: "the port", article: "problems", heading: "the-server-wont-start-port-in-use" },
      { kind: "text", text: "." },
    ]);
  });

  it("reads web links as external", () => {
    expect(parseInline("[GitHub](https://github.com/F3NN3X)")).toEqual([{ kind: "external", label: "GitHub", url: "https://github.com/F3NN3X" }]);
  });

  it("leaves anything else as plain text, markup characters included", () => {
    expect(parseInline("a * b <b>x</b> `open")).toEqual([{ kind: "text", text: "a * b <b>x</b> `open" }]);
  });
});

describe("stripInline", () => {
  it("drops the markup and keeps the words", () => {
    expect(stripInline("**Press** `Ctrl+S` or [save](studio) now")).toBe("Press Ctrl+S or save now");
  });
});
