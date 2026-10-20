// @vitest-environment happy-dom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, describe, expect, it } from "vitest";
import { OBSERVED_SIZE } from "@/test/dom-setup";
import { HelpApp } from "./app";
import { buildHelp } from "./build";
import { browserEnv, EnvProvider } from "./env";

const file = (id: string, title: string, body: string) => `---\nid: ${id}\ntitle: ${title}\nicon: dns\nverified: 1\n---\n${body}`;

const content = buildHelp(
  {
    "./articles/welcome.md": file("welcome", "Welcome", "Start here."),
    "./articles/kiosk.md": file("kiosk", "Kiosk and server", "The local server hosts your dashboard.\n\n## The kiosk URL\n\nCopy it.\n\n## Changing the port\n\nPick a port from 1024 to 65535."),
  },
  [
    { label: "Start here", articles: ["welcome"] },
    { label: "Run", articles: ["kiosk"] },
  ]
);

// happy-dom does no layout: give each heading a position so the scroll offset can be checked.
const offsetTop = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetTop");
Object.defineProperty(HTMLElement.prototype, "offsetTop", {
  configurable: true,
  get(this: HTMLElement) {
    return this.dataset.hid === "changing-the-port" ? 480 : 0;
  },
});

afterEach(() => {
  window.history.replaceState(null, "", "/");
  OBSERVED_SIZE.width = 800;
});

describe("the help window", () => {
  it("searches, opens a result scrolled to its heading, and lights it in the TOC on a wide pane", async () => {
    OBSERVED_SIZE.width = 1200;
    const user = userEvent.setup();
    render(
      <EnvProvider value={browserEnv}>
        <HelpApp content={content} />
      </EnvProvider>
    );
    expect(screen.getByRole("heading", { name: "How can we help?" })).toBeTruthy();

    // Home has a search field of its own; the sidebar's stays on screen.
    const search = within(document.querySelector("aside") as HTMLElement).getByRole("textbox", { name: "Search help" });
    await user.type(search, "pick port");
    expect(screen.getByRole("heading", { name: "1 result" })).toBeTruthy();
    const pane = document.querySelector("main") as HTMLElement;
    await user.click(within(pane).getByRole("button", { name: /Kiosk and server/ }));

    expect(screen.getByRole("heading", { level: 1, name: "Kiosk and server" })).toBeTruthy();
    expect((search as HTMLInputElement).value).toBe("");
    // The pane scrolls to the heading minus 20, and the TOC marks it as the place.
    expect(pane.scrollTop).toBe(460);
    expect(screen.getByRole("button", { name: "Changing the port" }).getAttribute("aria-current")).toBe("location");
    expect(screen.getByRole("button", { name: "The kiosk URL" }).getAttribute("aria-current")).toBeNull();
    expect(window.location.hash).toBe("#kiosk/changing-the-port");
  });

  it("opens an article at the top for a crafted heading in the hash", () => {
    window.history.replaceState(null, "", '/#kiosk/a"b');
    render(
      <EnvProvider value={browserEnv}>
        <HelpApp content={content} />
      </EnvProvider>
    );
    expect(screen.getByRole("heading", { level: 1, name: "Kiosk and server" })).toBeTruthy();
    expect((document.querySelector("main") as HTMLElement).scrollTop).toBe(0);
  });
});

afterAll(() => {
  if (offsetTop) Object.defineProperty(HTMLElement.prototype, "offsetTop", offsetTop);
});
