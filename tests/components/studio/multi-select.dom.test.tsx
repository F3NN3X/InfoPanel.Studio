// @vitest-environment happy-dom
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ToastProvider } from "@/components/ui/toast";
import { useConfigHistory } from "@/hooks/use-config-history";
import { defaultConfig, type DashboardConfig, type Placement } from "@/lib/layout";
import { profileWithPage } from "@/lib/pages";
import { useStudioMutations } from "@/components/studio/use-studio-mutations";
import { useStudioSelection } from "@/components/studio/use-studio-selection";

const zone = (id: string, colStart: number, rowStart: number): Placement => ({
  id,
  module: "FpsMonitor",
  colStart,
  rowStart,
  colSpan: 2,
  rowSpan: 1,
  visible: true,
});

const start = (): DashboardConfig => {
  const config = defaultConfig();
  const [profile] = config.profiles;
  return { ...config, profiles: [{ ...profile, pages: [{ ...profile.pages[0], placements: [zone("a", 1, 1), zone("b", 4, 1), zone("c", 7, 3), zone("d", 4, 3)] }] }] };
};

/** The selection and mutation hooks the studio view wires together, with buttons for the keys. */
function Harness() {
  const [config, setConfig] = useState(start);
  const history = useConfigHistory(config, setConfig);
  const profile = profileWithPage(config.profiles[0]);
  const sel = useStudioSelection(profile);
  const edit = useStudioMutations({
    config,
    profile,
    setConfig: history.set,
    sel,
    onPresetSaved: () => {},
    onPageChange: () => {},
    onSelectProfile: () => {},
  });
  return (
    <div>
      <output data-testid="zones">{profile.placements.map((p) => p.id).join(",")}</output>
      <output data-testid="selected">{sel.selectedIds.join(",")}</output>
      <button onClick={() => sel.selectMany(["a", "b", "d"])}>marquee</button>
      <button onClick={() => sel.selectMany(["a", "c"])}>pair</button>
      <button onClick={() => sel.selectMany(["a", "b"])}>neighbours</button>
      <button onClick={edit.removeSelection}>delete</button>
      <button onClick={() => edit.arrangeSelection("align-left")}>align left</button>
      <button onClick={history.undo}>undo</button>
      <output data-testid="cols">{profile.placements.map((p) => p.colStart).join(",")}</output>
    </div>
  );
}

const text = (id: string) => screen.getByTestId(id).textContent;

describe("a multi-selection on the canvas", () => {
  it("deletes together and one undo brings every zone back", () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("marquee"));
    expect(text("selected")).toBe("a,b,d");
    fireEvent.click(screen.getByText("delete"));
    expect(text("zones")).toBe("c");
    fireEvent.click(screen.getByText("undo"));
    expect(text("zones")).toBe("a,b,c,d");
  });

  it("aligns as one undo step, and leaves the zones alone when they would collide", () => {
    render(
      <ToastProvider>
        <Harness />
      </ToastProvider>
    );
    fireEvent.click(screen.getByText("neighbours"));
    fireEvent.click(screen.getByText("align left"));
    expect(text("cols")).toBe("1,4,7,4");
    fireEvent.click(screen.getByText("pair"));
    fireEvent.click(screen.getByText("align left"));
    expect(text("cols")).toBe("1,4,1,4");
    fireEvent.click(screen.getByText("undo"));
    expect(text("cols")).toBe("1,4,7,4");
  });
});
