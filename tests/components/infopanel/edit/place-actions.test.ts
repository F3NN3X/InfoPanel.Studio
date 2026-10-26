import { describe, expect, it } from "vitest";
import { withPlaceName } from "@/components/infopanel/edit/place-actions";
import { newStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { CANVAS_ID, type DashboardConfig, type Placement } from "@/lib/layout";

const canvasZone = (id: string, name: string) =>
  ({ id, module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, canvas: newStored({ name, width: 800, height: 480 }) }) as Placement & { canvas: StoredCanvas };
const screenOf = (id: string, placements: Placement[]) => ({ id, name: id, pages: [{ id: `${id}-pg`, name: "Page 1", placements }] });
const configOf = (...profiles: ReturnType<typeof screenOf>[]) => ({ profiles }) as unknown as DashboardConfig;

describe("renaming a placed InfoPanel profile", () => {
  it("sets InfoPanel's Name and keeps the source the Library link reads", () => {
    const config = configOf(screenOf("s", [canvasZone("z", "Desk"), canvasZone("y", "Other")]));
    const next = withPlaceName(config, "z", "Bench");
    const [z, y] = next.profiles[0].pages[0].placements;
    expect(z.canvas?.profile.Name).toBe("Bench");
    expect(z.canvas?.source).toEqual(config.profiles[0].pages[0].placements[0].canvas?.source);
    expect(y).toBe(config.profiles[0].pages[0].placements[1]);
  });
});
