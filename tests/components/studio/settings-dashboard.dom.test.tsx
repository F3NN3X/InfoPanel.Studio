// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SettingsDashboard } from "@/components/studio/settings-dashboard";
import { defaultConfig, type DashboardConfig } from "@/lib/layout";

const config = (activeProfile: string): DashboardConfig => {
  const base = defaultConfig();
  return {
    ...base,
    activeProfile,
    profiles: [
      { ...base.profiles[0], id: "desk", name: "Desk" },
      { ...base.profiles[0], id: "wall", name: "Wall" },
    ],
  };
};

const show = (activeProfile: string) => {
  const onPatch = vi.fn();
  render(<SettingsDashboard config={config(activeProfile)} onPatch={onPatch} onExport={() => {}} onReset={() => {}} onOpenScreen={() => {}} />);
  return { onPatch, select: screen.getByLabelText("When the app opens") as HTMLSelectElement };
};

describe("Settings › Dashboard › Startup screen", () => {
  it("lists Best fit and every screen, and shows the saved choice", () => {
    const { select } = show("wall");
    expect([...select.options].map((o) => o.value)).toEqual(["auto", "desk", "wall"]);
    expect(select.value).toBe("wall");
  });

  it("reads an id no screen has as Best fit", () => {
    expect(show("gone").select.value).toBe("auto");
  });

  it("saves a screen by id, and Best fit as null", async () => {
    const { onPatch, select } = show("auto");
    await userEvent.selectOptions(select, "desk");
    expect(onPatch).toHaveBeenLastCalledWith({ activeProfile: "desk" });
    await userEvent.selectOptions(select, "auto");
    expect(onPatch).toHaveBeenLastCalledWith({ activeProfile: null });
  });
});
