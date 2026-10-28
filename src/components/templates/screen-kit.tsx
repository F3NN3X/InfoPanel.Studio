/**
 * The New wizard's screen kit (`wizard-kit.ts`): the native screen templates as gallery entries, each card its live
 * picture (`ScreenTemplateThumb`), the preview the screen Create makes drawn live with this PC's data, and the making
 * (`instantiate`). Search tags are the widgets a template places and the sensor roles it reads; the sensor fit counts
 * those roles and how many this catalog has. Loaded when the page asks for it, never with the studio.
 */
import { useMemo } from "react";
import type { DataApiValue } from "@/lib/infopanel/sensors";
import { ROLE_INFO, resolveRole, type Role } from "@/lib/infopanel/templates/roles";
import { defaultConfig } from "@/lib/layout";
import { SCREEN_TEMPLATES } from "@/lib/screen-templates/catalog";
import { instantiate, layoutClassOf } from "@/lib/screen-templates/instantiate";
import type { ScreenTemplate } from "@/lib/screen-templates/kit";
import type { SensorMap } from "@/modules/types";
import { ALL_MODULES } from "../studio/studio-modules";
import { ProfilePage } from "../studio/profile-page";
import { Scaled } from "./new-wizard";
import { ScreenTemplateThumb } from "./screen-template-gallery";
import { TemplateShotHost } from "./template-shots";
import type { PreviewProps, ScreenKit, SensorFit, ThumbProps, WizardEntry } from "./wizard-kit";

const byId = new Map<string, ScreenTemplate>(SCREEN_TEMPLATES.map((t) => [t.id, t]));
const templateOf = (e: WizardEntry): ScreenTemplate => byId.get(e.id)!;
const asApi = (s: SensorMap) => s as unknown as Record<string, DataApiValue>;

const entries: WizardEntry[] = SCREEN_TEMPLATES.map((t) => ({
  id: t.id,
  name: t.name,
  blurb: t.blurb,
  fits: t.fits,
  size: t.size,
  palettes: (t.variants ?? []).map((v) => ({ id: v.id, name: v.name, swatch: v.swatch })),
}));

/** The roles a template reads at its own size. */
function rolesOf(t: ScreenTemplate): Role[] {
  const layout = t.layouts[layoutClassOf(t, t.size.width, t.size.height)];
  return [...new Set((layout?.pages ?? []).flat().flatMap((z) => Object.values(z.roles ?? {})))];
}

const tags = new Map<string, string[]>();
function tagsOf(e: WizardEntry): string[] {
  let found = tags.get(e.id);
  if (!found) {
    const t = templateOf(e);
    const zones = Object.values(t.layouts).flatMap((l) => l?.pages.flat() ?? []);
    const titles = zones.map((z) => ALL_MODULES.find((m) => m.id === z.module)?.title ?? z.module);
    const roles = zones.flatMap((z) => Object.values(z.roles ?? {})).map((r) => ROLE_INFO[r].label);
    found = [...new Set([...titles, ...roles])];
    tags.set(e.id, found);
  }
  return found;
}

/** Per catalog: whether each role is found, and each template's fit. */
const fits = new WeakMap<SensorMap, { roles: Map<Role, boolean>; fit: Map<string, SensorFit> }>();
function fitOf(e: WizardEntry, sensors: SensorMap): SensorFit {
  let memo = fits.get(sensors);
  if (!memo) {
    memo = { roles: new Map(), fit: new Map() };
    fits.set(sensors, memo);
  }
  let fit = memo.fit.get(e.id);
  if (!fit) {
    const roles = rolesOf(templateOf(e));
    const has = (r: Role) => {
      if (!memo.roles.has(r)) memo.roles.set(r, resolveRole(r, asApi(sensors)) !== undefined);
      return memo.roles.get(r)!;
    };
    fit = { need: roles.length, found: roles.filter(has).length };
    memo.fit.set(e.id, fit);
  }
  return fit;
}

function Thumb({ entry, palette, width, height, selected }: ThumbProps) {
  return <ScreenTemplateThumb template={templateOf(entry)} variant={palette} width={width} height={height} first={selected} />;
}

function Preview({ entry, palette, width, height, sensors }: PreviewProps) {
  const profile = useMemo(
    () => instantiate(templateOf(entry), { name: entry.name, variant: palette, width, height, sensors: asApi(sensors) }).profile,
    [entry, palette, width, height, sensors],
  );
  const dashboard = useMemo(() => defaultConfig(), []);
  return (
    <Scaled width={width} height={height}>
      <ProfilePage profile={profile} dashboard={dashboard} />
    </Scaled>
  );
}

export const SCREEN_KIT: ScreenKit = {
  kind: "screen",
  entries,
  tagsOf,
  fitOf,
  Thumb,
  Host: TemplateShotHost,
  Preview,
  make: (entry, { name, width, height, palette, sensors }) => {
    // The screen counts as having its template theme applied, so a later theme switch takes the variant's zone writes back.
    const { profile, unbound, applied } = instantiate(templateOf(entry), { name, width, height, variant: palette, sensors: asApi(sensors) });
    return { profile: { ...profile, appliedTheme: applied }, unbound };
  },
};
