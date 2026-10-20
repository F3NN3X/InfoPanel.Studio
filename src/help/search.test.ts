import { describe, expect, it } from "vitest";
import { buildHelp } from "./build";
import { buildIndex, MAX_RESULTS, searchHelp, snippet } from "./search";

const file = (id: string, title: string, body: string) => `---\nid: ${id}\ntitle: ${title}\nicon: dns\nverified: 1\n---\n${body}`;

const content = buildHelp(
  {
    "./articles/kiosk.md": file(
      "kiosk",
      "Kiosk and server",
      "The local server hosts your dashboard.\n\n## The kiosk URL\n\nCopy the **address** from Settings and paste it into InfoPanel.\n\n## Changing the port\n\nPick a port from 1024 to 65535.\n\n| Option | Address |\n|---|---|\n| Local | `127.0.0.1` |"
    ),
    "./articles/problems.md": file("problems", "Common problems", "Quick fixes.\n\n## The display says it can't connect\n\nCheck the kiosk URL and the port.")
  },
  [
    { label: "Run", articles: ["kiosk"] },
    { label: "Troubleshoot", articles: ["problems"] },
  ]
);
const index = buildIndex(content);

describe("buildIndex", () => {
  it("makes the lede and the text before the first heading one entry, then one entry per heading", () => {
    expect(index.map((e) => [e.article, e.heading])).toEqual([
      ["kiosk", null],
      ["kiosk", "The kiosk URL"],
      ["kiosk", "Changing the port"],
      ["problems", null],
      ["problems", "The display says it can't connect"],
    ]);
    expect(index[0].text).toBe("The local server hosts your dashboard.");
    expect(index[2].text).toContain("127.0.0.1");
  });
});

describe("searchHelp", () => {
  it("needs every word, in any order and case, and strips the markup before matching", () => {
    const hits = searchHelp("PASTE address", content, index);
    expect(hits.map((h) => h.kind === "help" && h.headingId)).toEqual(["the-kiosk-url"]);
    expect(searchHelp("paste zebra", content, index)).toEqual([]);
    expect(searchHelp("**address**", content, index)).toEqual([]);
    expect(searchHelp("   ", content, index)).toEqual([]);
  });

  it("scores 3 a word in the title and 2 a word in the heading, best first", () => {
    const hits = searchHelp("kiosk url", content, index);
    // "kiosk" is in the title (3) and the heading (2) of The kiosk URL, and "url" in its heading (2); the problems section has both only in its text.
    expect(hits.map((h) => [h.kind === "help" ? h.article : "", h.score])).toEqual([
      ["kiosk", 3 + 2 + 2],
      ["problems", 0],
    ]);
  });

  it("gives the section, its group and a snippet with the first match to light", () => {
    const [hit] = searchHelp("port", content, index);
    expect(hit).toMatchObject({ kind: "help", article: "kiosk", heading: "Changing the port", group: "Run" });
    if (hit.kind !== "help") throw new Error("expected a help hit");
    expect(`${hit.pre}${hit.hit}${hit.post}`).toContain("Pick a port from 1024");
    expect(hit.hit).toBe("port");
  });

  it("keeps at most 30 results", () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ row: `r${i}`, label: `Port ${i}`, section: "server" as const }));
    expect(searchHelp("port", content, index, many)).toHaveLength(MAX_RESULTS);
  });

  it("finds Settings rows by label or section name and ranks them with the help hits", () => {
    const settings = [
      { row: "port", label: "Port", section: "server" as const },
      { row: "zoom", label: "App zoom", section: "general" as const },
    ];
    const hits = searchHelp("port", content, index, settings);
    const row = hits.find((h) => h.kind === "settings");
    expect(row).toMatchObject({ section: "server", row: "port", score: 3 });
    expect(hits.some((h) => h.kind === "settings" && h.row === "zoom")).toBe(false);
    expect(searchHelp("server", content, index, settings).some((h) => h.kind === "settings" && h.row === "port")).toBe(true);
  });
});

describe("snippet", () => {
  it("shows the start of the text when only the title or heading matched", () => {
    expect(snippet("Short text.", ["zzz"])).toEqual({ pre: "", hit: "", post: "Short text." });
  });

  it("trims long text on both sides with an ellipsis", () => {
    const text = `${"a ".repeat(100)}needle${" b".repeat(100)}`;
    const s = snippet(text, ["needle"]);
    expect(s.hit).toBe("needle");
    expect(s.pre.startsWith("…")).toBe(true);
    expect(s.post.endsWith("…")).toBe(true);
    expect(s.pre.length + s.hit.length + s.post.length).toBeLessThan(180);
  });
});
