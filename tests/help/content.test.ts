/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";
import { checkContent } from "@/help/check";
import { ARTICLE_FILES } from "@/help/content";
import { HELP_GROUPS } from "@/help/groups";

const file = (id: string, extra = "", body = "Lede.") => `---\nid: ${id}\ntitle: ${id}\nicon: dns\nverified: 1\n${extra}---\n${body}`;
const groups = [{ label: "G", articles: ["a", "b"] }];

describe("the article content", () => {
  it("passes every check (SPEC 8.5)", () => {
    expect(checkContent(ARTICLE_FILES, HELP_GROUPS)).toEqual([]);
  });
});

describe("checkContent", () => {
  const check = (files: Record<string, string>, g = groups) => checkContent(files, g).join("\n");

  it("accepts sound articles", () => {
    expect(
      checkContent(
        {
          "./articles/a.md": file("a", "related: [b]\n", "Lede.\n\n## Part one\n\nSee [b](b#part-two).\n\n:::open settings/server Settings › Server\n\n:::open help/b#part-two Part two\n\n:::generated widgets.table\n\n:::keys\nCtrl+S — Save\nF1 — Help\n:::"),
          "./articles/b.md": file("b", "", "Lede.\n\n## Part two\n\ntext"),
        },
        groups
      )
    ).toEqual([]);
  });

  it("flags a related id, a link and a heading anchor that point nowhere", () => {
    const out = check({
      "./articles/a.md": file("a", "related: [ghost]\n", "Lede.\n\nSee [x](ghost) and [y](b#nope)."),
      "./articles/b.md": file("b"),
    });
    expect(out).toContain('a (related): links to the missing article "ghost"');
    expect(out).toContain('a: links to the missing article "ghost"');
    expect(out).toContain('"b" has no heading "#nope"');
  });

  it("flags an open target that is not a route, and an unknown generated key", () => {
    const out = check({
      "./articles/a.md": file("a", "", "Lede.\n\n:::open settings/nowhere Nowhere\n\n:::open help/ghost Ghost\n\n:::generated nope.table"),
      "./articles/b.md": file("b"),
    });
    expect(out).toContain('":::open settings/nowhere" is not a route');
    expect(out).toContain('"ghost"');
    expect(out).toContain('unknown generated key "nope.table"');
  });

  it("flags an article with no verified stamp, one outside groups.ts, a group id with no file and a name that is not the id", () => {
    const out = check({
      "./articles/a.md": "---\nid: a\ntitle: A\nicon: dns\n---\nLede.",
      "./articles/c.md": file("c"),
      "./articles/wrong-name.md": file("b"),
    });
    expect(out).toContain("a: no \"verified\" stamp");
    expect(out).toContain("c: not in groups.ts");
    expect(out).toContain("the file name is not the id \"b\"");
    expect(check({ "./articles/a.md": file("a") })).toContain('groups.ts lists "b", which has no file');
  });

  it("flags a key that is not in the shortcut list, but lets the reference article list any", () => {
    const keys = "Lede.\n\n:::keys\nCtrl+Shift+Q — Nothing\n:::";
    const files = { "./articles/a.md": file("a", "", keys), "./articles/b.md": file("b") };
    expect(check(files)).toContain('the key "Ctrl+Shift+Q" is not in the shortcut list');
    expect(checkContent({ "./articles/shortcuts.md": file("shortcuts", "", keys) }, [{ label: "G", articles: ["shortcuts"] }])).toEqual([]);
  });

  it("reports a malformed article instead of throwing", () => {
    expect(check({ "./articles/a.md": "no front-matter", "./articles/b.md": file("b") })).toContain("missing the front-matter");
  });
});
