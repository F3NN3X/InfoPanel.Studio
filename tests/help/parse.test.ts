import { describe, expect, it } from "vitest";
import { ArticleError, parseArticle } from "@/help/parse";

const FRONT = ["---", "id: kiosk", "title: Kiosk and server", "icon: dns", "related: [startup, problems]", "verified: 1.3.0-beta.1", "status: coming-soon", "---"].join("\n");
const article = (body: string) => parseArticle(`${FRONT}\n${body}`, "kiosk.md");

describe("parseArticle front-matter", () => {
  it("reads the scalars, the list and the status", () => {
    const a = article("Lede.");
    expect(a).toMatchObject({ id: "kiosk", title: "Kiosk and server", icon: "dns", related: ["startup", "problems"], verified: "1.3.0-beta.1", status: "coming-soon" });
  });

  it("defaults the status to shipped and the lists to empty", () => {
    const a = parseArticle("---\nid: a\ntitle: A\nicon: home\nverified: 1\n---\nLede.");
    expect(a.status).toBe("shipped");
    expect(a.related).toEqual([]);
  });

  it("refuses a file without front-matter, a missing field or a bad status", () => {
    expect(() => parseArticle("Just text.")).toThrow(ArticleError);
    expect(() => parseArticle("---\nid: a\nicon: home\n---\nx")).toThrow(/title/);
    expect(() => parseArticle("---\nid: a\ntitle: A\nicon: home\nstatus: later\n---\nx")).toThrow(/status/);
  });
});

describe("parseArticle blocks", () => {
  it("takes the first paragraph as the lede and the rest as blocks", () => {
    const a = article("The lede\ncon tinues here.\n\nA second paragraph with `code`.");
    expect(a.lede).toBe("The lede con tinues here.");
    expect(a.blocks).toEqual([{ type: "p", text: "A second paragraph with `code`." }]);
  });

  it("makes ## headings with unique anchors", () => {
    const a = article("Lede.\n\n## The kiosk URL\n\n## The kiosk URL\n\n## Can't connect: port 3922?");
    expect(a.blocks).toEqual([
      { type: "h", text: "The kiosk URL", id: "the-kiosk-url" },
      { type: "h", text: "The kiosk URL", id: "the-kiosk-url-2" },
      { type: "h", text: "Can't connect: port 3922?", id: "cant-connect-port-3922" },
    ]);
  });

  it("reads bullet and numbered lists, with wrapped lines", () => {
    const a = article("Lede.\n\n- one\n- two\n  wraps\n\n1. first\n2. second");
    expect(a.blocks).toEqual([
      { type: "ul", items: ["one", "two wraps"] },
      { type: "ol", items: ["first", "second"] },
    ]);
  });

  it("reads a table, with escaped bars and short rows", () => {
    const a = article("Lede.\n\n| Setting | Does |\n|---|---|\n| **Port** | a \\| b |\n| Host |");
    expect(a.blocks).toEqual([{ type: "table", head: ["Setting", "Does"], rows: [["**Port**", "a | b"], ["Host", ""]] }]);
  });

  it("reads the callouts, including the coming-soon one", () => {
    const a = article("Lede.\n\n:::tip\nTry this\nfirst.\n:::\n\n:::note\nN\n:::\n\n:::warn\nW\n:::\n\n:::soon\nLater\n:::");
    expect(a.blocks).toEqual([
      { type: "callout", kind: "tip", text: "Try this first." },
      { type: "callout", kind: "note", text: "N" },
      { type: "callout", kind: "warn", text: "W" },
      { type: "callout", kind: "soon", text: "Later" },
    ]);
  });

  it("reads keys and flow lines split on the spaced em dash", () => {
    const a = article("Lede.\n\n:::keys\nCtrl+S — Save\nCtrl +  — Zoom in\n:::\n\n:::flow\nSensors — InfoPanel publishes\nStudio — You lay out\n:::");
    expect(a.blocks).toEqual([
      { type: "keys", rows: [["Ctrl+S", "Save"], ["Ctrl +", "Zoom in"]] },
      { type: "flow", steps: [["Sensors", "InfoPanel publishes"], ["Studio", "You lay out"]] },
    ]);
  });

  it("reads the one-line open and generated blocks", () => {
    const a = article("Lede.\n\n:::open settings/server Settings › Server\n\n:::generated widgets.table\n\nAfter.");
    expect(a.blocks).toEqual([
      { type: "open", target: "settings/server", label: "Settings › Server" },
      { type: "generated", key: "widgets.table" },
      { type: "p", text: "After." },
    ]);
  });

  it("reads Windows line endings", () => {
    const a = parseArticle(`${FRONT}\nLede.\n\n## H\n\ntext`.replace(/\n/g, "\r\n"));
    expect(a.lede).toBe("Lede.");
    expect(a.blocks.map((b) => b.type)).toEqual(["h", "p"]);
  });

  it("refuses unknown, unclosed and malformed blocks", () => {
    expect(() => article("Lede.\n\n:::danger\nx\n:::")).toThrow(/unknown block/);
    expect(() => article("Lede.\n\n:::tip\nnever closed")).toThrow(/never closed/);
    expect(() => article("Lede.\n\n:::keys\nno separator\n:::")).toThrow(/needs/);
    expect(() => article("Lede.\n\n| a | b |\n| 1 | 2 |")).toThrow(/table/);
    expect(() => article("Lede.\n\n:::open settings/server")).toThrow(/target and a label/);
  });
});
