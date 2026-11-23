// @vitest-environment happy-dom
// The Add panel's "View options": changing one there changes the stored pref and the list at once, as Settings does.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { addCatalog } from "@/components/studio/add-catalog";
import { AddPanel } from "@/components/studio/add-panel";
import { DENSITY_KEY, PREVIEW_KEY, useAddListDensity, useAddPreviewOnHover } from "@/components/studio/add-prefs";
import { loadWidgetPresets } from "@/components/studio/widget-presets";

const catalog = addCatalog(undefined, await loadWidgetPresets());

/** The host the way the studio wires it: the stored prefs in, their setters passed down. */
function Host({ withSetters = true }: { withSetters?: boolean }) {
  const [density, setDensity] = useAddListDensity();
  const [previewOnHover, setPreviewOnHover] = useAddPreviewOnHover();
  return (
    <div>
      <output data-testid="density">{density}</output>
      <AddPanel
        catalog={catalog}
        recent={[]}
        onClearTarget={() => {}}
        onAdd={() => {}}
        onRenamePreset={() => {}}
        onDeletePreset={() => {}}
        density={density}
        previewOnHover={previewOnHover}
        onDensityChange={withSetters ? setDensity : undefined}
        onPreviewOnHoverChange={withSetters ? setPreviewOnHover : undefined}
      />
    </div>
  );
}

beforeEach(() => localStorage.clear());
afterEach(cleanup);

describe("the Add panel's view options", () => {
  it("saves the list density and applies it at once", async () => {
    render(<Host />);
    expect(screen.getByTestId("density").textContent).toBe("comfortable");
    // The Layouts tab lists rows, which are the ones density changes.
    fireEvent.click(screen.getByRole("tab", { name: /Layouts/ }));
    const rowHeight = () => screen.getAllByRole("option")[0].className.match(/\bh-1?\d\b/)?.[0];
    expect(rowHeight()).toBe("h-13");
    fireEvent.click(screen.getByRole("button", { name: "View options" }));
    fireEvent.click(await screen.findByRole("radio", { name: "Compact" }));
    expect(rowHeight()).toBe("h-10");
    expect(localStorage.getItem(DENSITY_KEY)).toBe("compact");
    expect(screen.getByTestId("density").textContent).toBe("compact");
    expect(screen.getByRole("radio", { name: "Compact" }).getAttribute("aria-checked")).toBe("true");
  });

  it("saves preview on hover", async () => {
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "View options" }));
    const toggle = await screen.findByRole("switch", { name: "Preview on hover" });
    expect(toggle.getAttribute("aria-checked")).toBe("true");
    fireEvent.click(toggle);
    expect(localStorage.getItem(PREVIEW_KEY)).toBe("0");
    expect(screen.getByRole("switch", { name: "Preview on hover" }).getAttribute("aria-checked")).toBe("false");
  });

  it("is not offered where the host passes no setters", () => {
    render(<Host withSetters={false} />);
    expect(screen.queryByRole("button", { name: "View options" })).toBeNull();
  });
});
