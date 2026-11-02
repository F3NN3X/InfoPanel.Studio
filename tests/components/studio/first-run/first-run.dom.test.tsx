// @vitest-environment happy-dom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Probes } from "@/components/studio/first-run/checks";
import FirstRunPage, { type SetupOutcome } from "@/components/studio/first-run/first-run-page";
import { applyFirstRun, isPristine } from "@/components/studio/first-run-model";
import { ToastProvider } from "@/components/ui/toast";
import { defaultConfig } from "@/lib/layout";
import { allPlacements } from "@/lib/pages";

/** Probes that never answer: the setup must work without any of them. */
const hanging: Probes = {
  local: () => new Promise(() => {}),
  sources: () => new Promise(() => {}),
  sensors: () => new Promise(() => {}),
  portOwner: async () => null,
  server: () => new Promise(() => {}),
  sleep: () => new Promise(() => {}),
};

function open(props: { rerun?: boolean } = {}) {
  const onFinish = vi.fn<(o: SetupOutcome) => void>();
  const onSkip = vi.fn<(url: string | undefined) => void>();
  render(
    <ToastProvider>
      <FirstRunPage rerun={props.rerun ?? false} windowSize={{ width: 1440, height: 900 }} onFinish={onFinish} onSkip={onSkip} probes={hanging} />
    </ToastProvider>,
  );
  return { onFinish, onSkip };
}

describe("FirstRunPage", () => {
  it("starts the checks on open, and finishing a Blank start still makes the first screen at the size", async () => {
    const user = userEvent.setup();
    const { onFinish } = open();
    // Check 1 is running before any navigation; the Welcome strip says so.
    expect(screen.getByText(/Checking your data… 1 of 8/)).toBeTruthy();
    // Never blocked: Next moves on while the checks hang.
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Check your data" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: "800 × 480, 5″ / 7″ panel" }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("radio", { name: /Blank grid/ }));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("heading", { name: "Ready to go" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Go to the studio" }));
    expect(onFinish).toHaveBeenCalledTimes(1);
    const outcome = onFinish.mock.calls[0][0];
    expect(outcome).toMatchObject({ next: "screen", choices: { width: 800, height: 480, start: "blank" } });
    const base = defaultConfig();
    const { config, profileId } = applyFirstRun(base, outcome.choices);
    expect(profileId).toBe(base.profiles[0].id);
    expect(isPristine(config)).toBe(true);
    expect(config.profiles[0]).toMatchObject({ width: 800, height: 480 });
    expect(allPlacements(config.profiles[0])).toEqual([]);
  });

  it("moves between steps with Alt+arrows, focusing each step's heading", async () => {
    const user = userEvent.setup();
    open();
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Check your data"));
    await user.keyboard("{Alt>}{ArrowRight}{/Alt}");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Your screen"));
    await user.keyboard("{Alt>}{ArrowLeft}{/Alt}");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Check your data"));
  });

  it("asks before skipping, with focus on Keep setting up", async () => {
    const user = userEvent.setup();
    const { onSkip } = open();
    await user.keyboard("{Escape}");
    const dialog = screen.getByRole("alertdialog");
    expect(dialog.textContent).toContain("Skip setup?");
    await waitFor(() => expect(document.activeElement?.textContent).toBe("Keep setting up"));
    await user.click(screen.getAllByRole("button", { name: "Skip setup" }).at(-1)!);
    expect(onSkip).toHaveBeenCalledWith(undefined);
  });

  it("does not ask to skip when Escape is pressed in the address field", async () => {
    const user = userEvent.setup();
    open();
    await user.click(screen.getByRole("button", { name: "Next" }));
    const field = screen.getAllByRole("textbox")[0];
    field.focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // Outside a field it still does.
    (document.activeElement as HTMLElement).blur();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("run again starts on Don't add a screen and finishing adds none", async () => {
    const user = userEvent.setup();
    const { onFinish } = open({ rerun: true });
    for (let i = 0; i < 3; i++) await user.click(screen.getByRole("button", { name: "Next" }));
    expect(screen.getByRole("radio", { name: /Don’t add a screen/ }).getAttribute("aria-checked")).toBe("true");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByRole("button", { name: "Go to the studio" }));
    const outcome = onFinish.mock.calls[0][0];
    const used = applyFirstRun(defaultConfig(), { width: 1024, height: 600, start: "template" }).config;
    expect(applyFirstRun(used, outcome.choices).config.profiles).toBe(used.profiles);
    expect(outcome.next).toBe("none");
  });
});
