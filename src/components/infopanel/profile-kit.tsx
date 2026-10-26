/**
 * The New wizard's InfoPanel profile kit (`templates/wizard-kit.ts`): the profile templates as gallery entries, each
 * card drawn by the kiosk's canvas renderer with a made-up machine's values (`TemplateThumb`), the preview the profile
 * Create makes drawn with this PC's data, and the making (`instantiate`, overrides applied). A template's roles and
 * the items it draws are read once from it made with the made-up sensors: the roles give the sensor fit against a
 * catalog, and with the item kinds they are the search tags. Loaded when the page asks for it, never with the studio.
 */
import { useMemo } from "react";
import { readStored } from "@/lib/infopanel/import/stored";
import { elementOf } from "@/lib/infopanel/elements/spec";
import { walkItems } from "@/lib/infopanel/parse";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { TEMPLATES } from "@/lib/infopanel/templates/catalog";
import { instantiate } from "@/lib/infopanel/templates/instantiate";
import type { Template } from "@/lib/infopanel/templates/kit";
import { MOCK_SENSORS } from "@/lib/infopanel/templates/mock";
import { ROLE_INFO, resolveRole, type Role } from "@/lib/infopanel/templates/roles";
import type { SensorMap } from "@/modules/types";
import type { PreviewProps, ProfileKit, SensorFit, ThumbProps, WizardEntry } from "../templates/wizard-kit";
import CanvasZone from "./CanvasZone";
import { TemplateThumb, paletteChips } from "./template-gallery";

/** The size a template without one of its own is made at: InfoPanel's usual panel. */
const USUAL = { width: 800, height: 480 };

const byId = new Map<string, Template>(TEMPLATES.map((t) => [t.id, t]));
const templateOf = (e: WizardEntry): Template => byId.get(e.id)!;
const asApi = (s: SensorMap) => s as unknown as Record<string, DataApiValue>;

const entries: WizardEntry[] = TEMPLATES.map((t) => ({
  id: t.id,
  name: t.name,
  blurb: t.blurb,
  fits: t.fits,
  size: t.size ?? USUAL,
  palettes: paletteChips(t),
}));

/** What a template reads and draws, from it made once with the made-up sensors. */
const shapes = new Map<string, { roles: Role[]; tags: string[] }>();
function shapeOf(e: WizardEntry) {
  let found = shapes.get(e.id);
  if (!found) {
    const made = instantiate(templateOf(e), { name: e.name, ...e.size, sensors: MOCK_SENSORS });
    const items = [...walkItems(readStored(made.stored).items)].map(({ item }) => item);
    const drawn = items.map((item) => elementOf(item)?.type ?? item.kind);
    const roles = made.roles.map((r) => r.role);
    found = { roles, tags: [...new Set([...drawn, ...roles.map((r) => ROLE_INFO[r].label)])] };
    shapes.set(e.id, found);
  }
  return found;
}

const fits = new WeakMap<SensorMap, Map<string, SensorFit>>();
function fitOf(e: WizardEntry, sensors: SensorMap): SensorFit {
  let memo = fits.get(sensors);
  if (!memo) {
    memo = new Map();
    fits.set(sensors, memo);
  }
  let fit = memo.get(e.id);
  if (!fit) {
    const { roles } = shapeOf(e);
    fit = { need: roles.length, found: roles.filter((r) => resolveRole(r, asApi(sensors)) !== undefined).length };
    memo.set(e.id, fit);
  }
  return fit;
}

function Thumb({ entry, palette, width, height }: ThumbProps) {
  return <TemplateThumb template={templateOf(entry)} variant={palette} width={width} height={height} />;
}

function Preview({ entry, palette, width, height, sensors, hwinfo, overrides }: PreviewProps) {
  const canvas = useMemo(
    () => instantiate(templateOf(entry), { name: entry.name, width, height, variant: palette, sensors: asApi(sensors), hwinfo, overrides }).stored,
    [entry, palette, width, height, sensors, hwinfo, overrides],
  );
  return <CanvasZone canvas={canvas} sensors={sensors} />;
}

export const PROFILE_KIT: ProfileKit = {
  kind: "ip",
  entries,
  tagsOf: (e) => shapeOf(e).tags,
  fitOf,
  Thumb,
  Preview,
  make: (entry, { name, width, height, palette, sensors, hwinfo, overrides }) =>
    instantiate(templateOf(entry), { name, width, height, variant: palette, sensors: asApi(sensors), hwinfo, overrides }),
  // The roles don't depend on the size.
  roles: (entry, { palette, sensors, hwinfo, overrides }) =>
    instantiate(templateOf(entry), { name: "roles", width: 480, height: 320, variant: palette, sensors: asApi(sensors), hwinfo, overrides }).roles,
};
