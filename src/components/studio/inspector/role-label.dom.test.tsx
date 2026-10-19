// @vitest-environment happy-dom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ModuleSetting } from "@/modules/types";
import { SettingField, type FieldsApi } from "../settings-panel";

const cpuColor: ModuleSetting = { key: "cpuColor", label: "CPU", type: "color", default: "", role: "s1", tab: "style" };

const fields = (readOnly: boolean, own?: string): FieldsApi => ({
  values: { own: own ? { cpuColor: own } : {}, applies: () => !readOnly },
  shown: () => own ?? "",
  onChange: () => {},
  onPatch: () => {},
  onClear: () => {},
  readOnly: () => readOnly,
});

describe("a colour row with a palette role", () => {
  it("names the role while it follows the theme", () => {
    render(<SettingField def={cpuColor} fields={fields(true)} sources={null} />);
    expect(screen.getByRole("button", { name: "CPU: Series 1" })).toBeTruthy();
  });

  it("names its own colour while custom", () => {
    render(<SettingField def={cpuColor} fields={fields(false, "#5fa7ff")} sources={null} />);
    expect(screen.getByRole("button", { name: "CPU: Blue" })).toBeTruthy();
  });
});
