// @vitest-environment happy-dom
// The pack importer behind Browse themes: an import shows the validator's issues in plain words and stores only a pack with no
// error; removing a pack that a level wears takes it off that level (Classic is drawn there) and says so.
import { act, cleanup, fireEvent, render, renderHook, screen } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useImportedPacks } from "@/components/studio/use-imported-packs";
import { UserPacks, type PackImporterHandle } from "@/components/studio/user-packs";
import { forgetUserPack } from "@/looks/user-packs";
import { readPackDir } from "../../../tools/validate-pack.mjs";

// biome-ignore lint/suspicious/noExplicitAny: fixtures edit parsed JSON of any shape.
type Json = any;
const enc = (s: string) => new TextEncoder().encode(s);

/** Field Kit's files as a user's own pack `mine`, as `File`s with their folder path. */
function files(edit: (all: Map<string, Uint8Array>, pack: Json, look: Json) => void = () => {}): File[] {
  const src = readPackDir("src/looks/packs/field-kit", /\.tsx?$/);
  const all = new Map<string, Uint8Array>(src.files.filter((f: Json) => f.path !== "pack.css").map((f: Json) => [f.path, f.bytes]));
  const pack = structuredClone(src.pack) as Json;
  const look = structuredClone(src.look) as Json;
  pack.id = look.id = "mine";
  pack.fonts = pack.fonts.map((f: Json) => ({ ...f, family: f.family.replace("pack-", "pack-mine-") }));
  for (const k of Object.keys(look.fonts)) look.fonts[k] = look.fonts[k].replace("pack-", "pack-mine-");
  pack.assets = [...all].filter(([p]) => p.startsWith("assets/")).map(([p, b]) => ({ file: p.slice(7), bytes: b.length }));
  edit(all, pack, look);
  all.set("pack.json", enc(JSON.stringify(pack)));
  all.set("look.json", enc(JSON.stringify(look)));
  return [...all].map(([path, bytes]) => {
    const file = new File([bytes as BlobPart], path.split("/").pop()!);
    Object.defineProperty(file, "webkitRelativePath", { value: `mine/${path}` });
    return file;
  });
}

/** The fake server: a list of packs, a log of the requests. */
function server(list: { id: string; name: string; size: number }[]) {
  const log: string[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    log.push(`${init?.method ?? "GET"} ${url}`);
    if (url === "/api/packs" && (init?.method ?? "GET") === "GET") return new Response(JSON.stringify(list));
    if (url === "/api/packs" && init?.method === "POST") return new Response("", { status: 200 });
    if (init?.method === "DELETE") {
      list.splice(0, list.length);
      return new Response(null, { status: 204 });
    }
    return new Response("", { status: 404 });
  });
  return log;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  forgetUserPack("mine");
});

/** The importer with a ref, as Browse holds it (its Remove button is the detail pane's). */
function mount(onRemove: () => number = () => 0) {
  const ref = createRef<PackImporterHandle>();
  render(<UserPacks ref={ref} onChange={() => {}} onRemove={onRemove} />);
  return ref;
}

const pick = async (label: string, list: File[]) => {
  const input = screen.getByLabelText(label) as HTMLInputElement;
  Object.defineProperty(input, "files", { value: list, configurable: true });
  await act(async () => void fireEvent.change(input));
  await act(async () => {});
};

describe("importing a pack", () => {
  it("a hostile pack is refused with the issue in words, and nothing is sent", async () => {
    const log = server([]);
    mount();
    await act(async () => {});
    await pick("Pack folder", files((all) => all.set("assets/hazard.svg", enc("<svg><script>alert(1)</script></svg>"))));
    const report = screen.getByRole("alert");
    expect(report.textContent).toContain("can't be imported");
    expect(report.textContent).toContain("assets/hazard.svg");
    expect(log.some((l) => l.startsWith("POST"))).toBe(false);
  });

  it("a pack with its own style sheet is refused, a good one is posted", async () => {
    const log = server([]);
    mount();
    await act(async () => {});
    const css = new File(["a{}"], "pack.css");
    Object.defineProperty(css, "webkitRelativePath", { value: "mine/pack.css" });
    await pick("Pack folder", [...files(), css]);
    expect(screen.getByRole("alert").textContent).toContain("cannot bring its own stylesheet");
    expect(log.some((l) => l.startsWith("POST"))).toBe(false);
    await pick("Pack folder", files());
    expect(log.filter((l) => l.startsWith("POST"))).toEqual(["POST /api/packs"]);
  });
});

describe("the pack-script switch", () => {
  it("is the server's: turned off here with the write header, and shown off when PACK_SCRIPTS is", async () => {
    const puts: string[] = [];
    let env = true;
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      if (url !== "/api/pack-scripts") return new Response("[]");
      if (init?.method === "PUT") puts.push(`${(init.headers as Record<string, string>)["X-Dashboard-Pack"]} ${init.body}`);
      const on = init?.method === "PUT" ? JSON.parse(init.body as string).on : true;
      return new Response(JSON.stringify({ on, env, fetching: false, stale: false }));
    });
    mount();
    await act(async () => {});
    const toggle = screen.getByRole("switch", { name: "Pack effect scripts" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    await act(async () => void fireEvent.click(toggle));
    expect(puts).toEqual(['1 {"on":false}']);
    expect(screen.getByRole("switch", { name: "Pack effect scripts" }).getAttribute("aria-checked")).toBe("false");
    cleanup();
    env = false;
    mount();
    await act(async () => {});
    expect((screen.getByRole("switch", { name: "Pack effect scripts" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.querySelector("[data-pack-scripts]")?.textContent).toContain("PACK_SCRIPTS=off");
  });
});

describe("user packs switched off on the server", () => {
  it("is reported as off, so Browse shows no import and says so", async () => {
    vi.stubGlobal("fetch", async () => new Response("[]", { headers: { "X-User-Packs": "off" } }));
    const { result } = renderHook(() => useImportedPacks());
    await act(async () => {});
    expect(result.current.off).toBe(true);
    expect(result.current.packs).toEqual([]);
  });
});

describe("a pack a later build's built-in shadows", () => {
  it("removing it leaves the levels that wear the built-in alone", async () => {
    const log = server([{ id: "paper", name: "My Paper", size: 10 }]);
    const onRemove = vi.fn(() => 2);
    const ref = mount(onRemove);
    await act(async () => {});
    await act(async () => void (await ref.current!.remove({ id: "paper", name: "My Paper" })));
    await act(async () => {});
    expect(log).toContain("DELETE /api/packs/paper");
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Removed My Paper.");
  });
});

describe("a pack that was stored but cannot be read back", () => {
  it("is taken off the server again, and the report says so", async () => {
    const log = server([]);
    mount();
    await act(async () => {});
    await pick("Pack folder", files());
    expect(log).toContain("DELETE /api/packs/mine");
    expect(screen.getByRole("alert").textContent).toContain("taken off again");
  });
});

describe("removing a pack", () => {
  it("one that a level wears is taken off it, with a notice that Classic is drawn there", async () => {
    const list = [{ id: "mine", name: "Mine", size: 10 }];
    const log = server(list);
    const onRemove = vi.fn(() => 2);
    const ref = mount(onRemove);
    await act(async () => {});
    await act(async () => void (await ref.current!.remove({ id: "mine", name: "Mine" })));
    await act(async () => {});
    expect(onRemove).toHaveBeenCalledWith("mine");
    expect(log).toContain("DELETE /api/packs/mine");
    expect(screen.getByRole("status").textContent).toBe("Removed Mine. 2 places that wore it now draw Classic.");
  });

  it("a removal the server refuses leaves the config as it was and says so", async () => {
    const log: string[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      log.push(`${init?.method ?? "GET"} ${url}`);
      if (init?.method === "DELETE") return new Response("user packs are off", { status: 403 });
      return new Response(JSON.stringify([{ id: "mine", name: "Mine", size: 10 }]));
    });
    const onRemove = vi.fn(() => 2);
    const ref = mount(onRemove);
    await act(async () => {});
    await act(async () => void (await ref.current!.remove({ id: "mine", name: "Mine" })));
    await act(async () => {});
    expect(log).toContain("DELETE /api/packs/mine");
    expect(onRemove).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toBe("Couldn't remove Mine. It is still stored, and nothing that wears it was changed.");
  });

  it("a pack the server no longer has (404) is taken off the studio and out of the config like any removal", async () => {
    vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => (init?.method === "DELETE" ? new Response("", { status: 404 }) : new Response(JSON.stringify([{ id: "mine", name: "Mine", size: 10 }]))));
    const onRemove = vi.fn(() => 1);
    const ref = mount(onRemove);
    await act(async () => {});
    await act(async () => void (await ref.current!.remove({ id: "mine", name: "Mine" })));
    await act(async () => {});
    expect(onRemove).toHaveBeenCalledWith("mine");
    expect(screen.getByRole("status").textContent).toBe("Removed Mine. A place that wore it now draws Classic.");
  });

  it("one nothing wears is removed without that line", async () => {
    server([{ id: "mine", name: "Mine", size: 10 }]);
    const ref = mount();
    await act(async () => {});
    await act(async () => void (await ref.current!.remove({ id: "mine", name: "Mine" })));
    await act(async () => {});
    expect(screen.getByRole("status").textContent).toBe("Removed Mine.");
  });
});
