// @vitest-environment happy-dom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WebPage from "@/widgets/WebPage";

/** The server's frame check answering `frame` for every URL, recording what it was asked. */
function serverSays(frame: string) {
  const asked: string[] = [];
  vi.stubGlobal("fetch", async (input: string) => {
    asked.push(input);
    return new Response(JSON.stringify({ frame }), { status: 200, headers: { "Content-Type": "application/json" } });
  });
  return asked;
}

beforeEach(() => {
  // happy-dom logs every iframe it was told not to load.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
  cleanup();
  vi.unstubAllGlobals();
  delete (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__;
});

describe("Web Page and sites that refuse to be framed", () => {
  it("shows the site's host and where it does show in place of a frame the site refuses", async () => {
    const asked = serverSays("refused");
    const { container } = render(<WebPage data={{}} url="https://www.refuses.test/news" />);
    expect(await screen.findByText("refuses.test doesn't allow being shown inside another page.")).toBeTruthy();
    expect(screen.getByText("It shows in the InfoPanel Studio desktop app.")).toBeTruthy();
    expect(container.querySelector("iframe")).toBeNull();
    expect(asked).toEqual([`/api/frame-check?url=${encodeURIComponent("https://www.refuses.test/news")}`]);
  });

  it("keeps the frame when the check allows it or can't tell", async () => {
    for (const [frame, url] of [["allowed", "https://allowed.test/"], ["unknown", "https://unknown.test/"]]) {
      const asked = serverSays(frame);
      const { container } = render(<WebPage data={{}} url={url} />);
      await waitFor(() => expect(asked).toHaveLength(1));
      await Promise.resolve();
      expect(container.querySelector("iframe")?.getAttribute("src"), frame).toBe(url);
      cleanup();
    }
  });

  it("never asks in the desktop app, which shows the site", () => {
    (window as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ = {};
    const asked = serverSays("refused");
    const { container } = render(<WebPage data={{}} url="https://desktop.test/" />);
    expect(container.querySelector("iframe")).not.toBeNull();
    expect(asked).toEqual([]);
  });
});
