import { describe, expect, it } from "vitest";
import { canvasPlaces } from "@/components/infopanel/edit/canvas-places";
import { placeDeletion, withoutPlace, withPlaceName } from "@/components/infopanel/edit/place-actions";
import { newStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { CANVAS_ID, type DashboardConfig, type Placement } from "@/lib/layout";

const canvasZone = (id: string, name: string) =>
  ({ id, module: CANVAS_ID, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true, canvas: newStored({ name, width: 800, height: 480 }) }) as Placement & { canvas: StoredCanvas };
const clock = { id: "c", module: "clock", colStart: 2, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true } as Placement;
const screenOf = (id: string, placements: Placement[]) => ({ id, name: id, pages: [{ id: `${id}-pg`, name: "Page 1", placements }] });
const configOf = (...profiles: ReturnType<typeof screenOf>[]) => ({ profiles }) as unknown as DashboardConfig;
const placeOf = (config: DashboardConfig, zoneId: string) => canvasPlaces(config).find((c) => c.zoneId === zoneId)!;

describe("deleting an InfoPanel profile from the home", () => {
  it("takes its screen when the screen holds only it", () => {
    const config = configOf(screenOf("solo", [canvasZone("z", "Desk")]), screenOf("other", [clock]));
    const d = placeDeletion(config, placeOf(config, "z"), ["solo"]);
    expect(d.screen).toBe(true);
    expect(d.lines).toEqual([
      "This removes the screen with 1 page, 1 zone, 1 InfoPanel canvas.",
      "1 kiosk shows it now.",
      "A copy saved in the Library stays there.",
      "Undo (Ctrl+Z) brings it back.",
    ]);
  });

  it("takes only its zone on a shared screen, or on the last screen", () => {
    const shared = configOf(screenOf("mixed", [canvasZone("z", "Desk"), clock]), screenOf("other", [clock]));
    expect(placeDeletion(shared, placeOf(shared, "z")).screen).toBe(false);
    const last = configOf(screenOf("solo", [canvasZone("z", "Desk")]));
    const d = placeDeletion(last, placeOf(last, "z"));
    expect(d.screen).toBe(false);
    expect(d.lines[0]).toBe("This takes it off solo. The rest of the screen stays.");

    const after = withoutPlace(shared, "z");
    expect(after.profiles[0].pages[0].placements.map((z) => z.id)).toEqual(["c"]);
    expect(after.profiles[1]).toBe(shared.profiles[1]);
  });
});

describe("renaming an InfoPanel profile from the home", () => {
  it("sets InfoPanel's Name and keeps the source the Library link reads", () => {
    const config = configOf(screenOf("s", [canvasZone("z", "Desk"), canvasZone("y", "Other")]));
    const next = withPlaceName(config, "z", "Bench");
    const [z, y] = next.profiles[0].pages[0].placements;
    expect(z.canvas?.profile.Name).toBe("Bench");
    expect(z.canvas?.source).toEqual(config.profiles[0].pages[0].placements[0].canvas?.source);
    expect(y).toBe(config.profiles[0].pages[0].placements[1]);
  });
});
