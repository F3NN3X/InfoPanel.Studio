// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatRefusal, type ChatMessage, type ChatState } from "@/lib/chat";
import { EMPTY_EXTRAS, EMPTY_TWITCH, type Extras } from "@/lib/extras";

const mocks = vi.hoisted(() => ({ extras: null as Extras | null, chat: null as ChatState | null, send: vi.fn() }));

vi.mock("@/widgets/time-hooks", async (original) => ({ ...(await original<typeof import("@/widgets/time-hooks")>()), useExtras: () => mocks.extras }));
vi.mock("@/lib/chat", async (original) => ({ ...(await original<typeof import("@/lib/chat")>()), useChat: () => mocks.chat, chatSend: mocks.send }));

import StreamChat from "@/widgets/StreamChat";

const m = (id: string, ts: number, user: string, text: string, extra: Partial<ChatMessage> = {}): ChatMessage => ({ id, platform: "twitch", user, text, color: "", badge: "", ts, ...extra });
const state = (messages: ChatMessage[], connected = true): ChatState => ({ messages, platforms: { twitch: { connected, channel: "me" } } });

beforeEach(() => {
  mocks.extras = { ...EMPTY_EXTRAS, twitch: { ...EMPTY_TWITCH, signedIn: true, login: "me", connected: true, live: true, viewers: 7 } };
  mocks.chat = state([m("a", 1, "Alice", "hello @me", { badge: "mod", color: "#ff0000" }), m("b", 2, "Bob", "plain")]);
  mocks.send.mockReset();
  chatRefusal.set(false);
});

afterEach(cleanup);

describe("StreamChat", () => {
  it("lists the messages oldest first with badges and colours, and tints a mention of the signed-in name", () => {
    const { container } = render(<StreamChat data={{}} />);
    const lines = [...container.querySelectorAll("div.shrink-0")];
    expect(lines.map((l) => l.textContent)).toEqual(["Alice hello @me", "Bob plain"]);
    expect(lines[0].querySelector("[title=mod]")).not.toBeNull();
    expect((lines[0].querySelector("span.font-semibold") as HTMLElement).style.color).toBe("#ff0000");
    expect(lines.map((l) => l.hasAttribute("data-mention"))).toEqual([true, false]);
    expect(screen.getByText(/7 watching/)).toBeTruthy();
  });

  it("shows the TW tag only when both platforms are on, and keeps the newest max messages", () => {
    mocks.chat = state([m("a", 1, "Alice", "one"), m("b", 2, "Bob", "two"), m("c", 3, "Cy", "three")]);
    const { container, rerender } = render(<StreamChat data={{}} />);
    expect(container.textContent).not.toContain("TW");
    rerender(<StreamChat data={{}} source="both" maxMessages={2} />);
    expect(container.textContent).toContain("TW");
    expect(container.textContent).not.toContain("one");
    expect(container.textContent).toContain("three");
  });

  it("says where to sign in, or that there are no messages", () => {
    mocks.chat = state([]);
    mocks.extras = EMPTY_EXTRAS;
    const { rerender } = render(<StreamChat data={{}} />);
    expect(screen.getByText("Sign in to Twitch in Settings › Connections")).toBeTruthy();
    mocks.extras = { ...EMPTY_EXTRAS, twitch: { ...EMPTY_TWITCH, signedIn: true } };
    rerender(<StreamChat data={{}} />);
    expect(screen.getByText("No messages yet")).toBeTruthy();
  });

  it("has a send box only when sending can work", () => {
    const { rerender } = render(<StreamChat data={{}} />);
    expect(screen.getByLabelText("Chat message")).toBeTruthy();
    rerender(<StreamChat data={{}} showInput={false} />);
    expect(screen.queryByLabelText("Chat message")).toBeNull();
    mocks.chat = state([], false);
    rerender(<StreamChat data={{}} />);
    expect(screen.queryByLabelText("Chat message")).toBeNull();
    mocks.chat = state([]);
    mocks.extras = EMPTY_EXTRAS;
    rerender(<StreamChat data={{}} />);
    expect(screen.queryByLabelText("Chat message")).toBeNull();
  });

  it("hides the send box after the server refuses writes", () => {
    render(<StreamChat data={{}} />);
    expect(screen.getByLabelText("Chat message")).toBeTruthy();
    chatRefusal.set(true);
    cleanup();
    render(<StreamChat data={{}} />);
    expect(screen.queryByLabelText("Chat message")).toBeNull();
  });

  it("sends on Enter, clears on success and shows a short error otherwise", async () => {
    mocks.send.mockResolvedValueOnce({ ok: false, reason: "busy", message: "Slow down, Twitch limits chat." }).mockResolvedValueOnce({ ok: true });
    render(<StreamChat data={{}} />);
    const input = screen.getByLabelText("Chat message") as HTMLInputElement;
    fireEvent.change(input, { target: { value: " hi there " } });
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(input.placeholder).toBe("Slow down, Twitch limits chat."));
    expect(mocks.send).toHaveBeenCalledWith("twitch", "hi there");
    expect(input.value).toBe(" hi there ");
    fireEvent.submit(input.closest("form") as HTMLFormElement);
    await waitFor(() => expect(input.value).toBe(""));
    expect(input.placeholder).toBe("Send a message");
  });
});
