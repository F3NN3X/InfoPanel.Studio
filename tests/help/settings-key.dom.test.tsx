// @vitest-environment happy-dom
// Ctrl+, opens Settings from Help (as in the Studio), in the desktop app only.
import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { HelpApp } from "@/help/app";
import { buildHelp } from "@/help/build";
import { browserEnv, EnvProvider, type HelpEnv } from "@/help/env";

vi.mock("@/app-window/title-bar", () => ({ TitleBar: () => null }));
vi.mock("@/settings/ipc", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/settings/ipc")>()),
  onEvent: () => Promise.resolve(() => {}),
  ipc: { appInfo: () => Promise.resolve({ version: "1" }), getSettings: () => Promise.resolve({ zoom: 100 }) },
}));

const content = buildHelp({ "./articles/welcome.md": "---\nid: welcome\ntitle: Welcome\nicon: dns\nverified: 1\n---\nStart here." }, [{ label: "Start here", articles: ["welcome"] }]);

const open = (env: HelpEnv) =>
  render(
    <EnvProvider value={env}>
      <HelpApp content={content} />
    </EnvProvider>
  );

describe("Ctrl+, in Help", () => {
  it("opens Settings in the desktop app", () => {
    const openSettings = vi.fn();
    open({ ...browserEnv, desktop: true, openSettings });
    const event = new KeyboardEvent("keydown", { key: ",", ctrlKey: true, cancelable: true });
    fireEvent(window, event);
    expect(openSettings).toHaveBeenCalledTimes(1);
    expect(event.defaultPrevented).toBe(true);
  });

  it("does nothing on a bare comma", () => {
    const openSettings = vi.fn();
    open({ ...browserEnv, desktop: true, openSettings });
    fireEvent.keyDown(window, { key: "," });
    expect(openSettings).not.toHaveBeenCalled();
  });

  it("does nothing in a browser tab", () => {
    const openSettings = vi.fn();
    open({ ...browserEnv, openSettings });
    fireEvent.keyDown(window, { key: ",", ctrlKey: true });
    expect(openSettings).not.toHaveBeenCalled();
  });
});
