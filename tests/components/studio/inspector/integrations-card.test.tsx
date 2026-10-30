// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EMPTY_EXTRAS, type Extras } from "@/lib/extras";

const mocks = vi.hoisted(() => ({ extras: null as Extras | null }));

vi.mock("@/lib/extras", async (original) => ({
  ...(await original<typeof import("@/lib/extras")>()),
  extras: { getState: () => mocks.extras, subscribe: () => () => {} },
}));

import { IntegrationsCard } from "@/components/studio/inspector/integrations-card";

const stored = { obs: { host: "127.0.0.1", port: 4455, hasPassword: true }, calendar: { links: [] } };
const puts: { streaming?: unknown }[] = [];

beforeEach(() => {
  puts.length = 0;
  mocks.extras = {
    ...EMPTY_EXTRAS,
    obs: { ...EMPTY_EXTRAS.obs, configured: true, connected: true, scenes: [{ id: "u1", name: "Game", sub: "", icon: "" }], inputs: ["Mic/Aux", "Desktop Audio"] },
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        return { ok: true, json: async () => stored };
      }
      return { ok: true, json: async () => stored };
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("IntegrationsCard, OBS", () => {
  it("saves the mic and the scenes' looks beside the connection, without a password it was not given", async () => {
    render(<IntegrationsCard obs calendar={false} />);
    await screen.findByLabelText("OBS mic input");
    fireEvent.change(screen.getByLabelText("OBS mic input"), { target: { value: "Mic/Aux" } });
    fireEvent.change(screen.getByLabelText("Game line"), { target: { value: "Main cam" } });
    fireEvent.change(screen.getByLabelText("Game icon"), { target: { value: "videocam" } });
    fireEvent.click(screen.getByText("Save OBS"));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0]).toEqual({
      obs: { host: "127.0.0.1", port: 4455 },
      streaming: { obs: { mic: "Mic/Aux", scenes: { u1: { sub: "Main cam", icon: "videocam" } } } },
    });
  });

  it("lists a saved mic OBS does not offer now, and keeps saved looks while OBS is closed", async () => {
    mocks.extras = EMPTY_EXTRAS;
    (fetch as ReturnType<typeof vi.fn>).mockImplementation(async (_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        puts.push(JSON.parse(String(init.body)));
        return { ok: true, json: async () => stored };
      }
      return { ok: true, json: async () => ({ ...stored, streaming: { obs: { mic: "Old mic", scenes: { u9: { sub: "Kept", icon: "" } } } } }) };
    });
    render(<IntegrationsCard obs calendar={false} />);
    const select = (await screen.findByLabelText("OBS mic input")) as HTMLSelectElement;
    expect(select.value).toBe("Old mic");
    fireEvent.click(screen.getByText("Save OBS"));
    await waitFor(() => expect(puts).toHaveLength(1));
    expect(puts[0].streaming).toEqual({ obs: { mic: "Old mic", scenes: { u9: { sub: "Kept", icon: "" } } } });
  });
});
