/**
 * What the New wizard page reads of a kind's templates, loaded apart from the page itself (`useKit`): the catalog as
 * gallery entries, their search tags and sensor fit, the card thumbnail and the inspector preview, and the making of
 * the screen or profile. The page opens at once with Blank, the ways in and the inspector; the gallery fills in when
 * the kit arrives. Only types live here, so neither the page nor the studio carries a catalog.
 */
import { useEffect, useState, type ComponentType } from "react";
import type { ApiHwinfoDevice } from "@/lib/catalog";
import type { ShapeClass } from "@/lib/infopanel/templates/layout";
import type { RoleChoice } from "@/lib/infopanel/templates/instantiate";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import type { MonitorProfile } from "@/lib/layout";
import type { SensorMap } from "@/modules/types";
import type { RoleOverrides } from "../infopanel/role-sensors";
import type { WizardKind } from "./recent-templates";
import type { Size } from "./size-presets";
import type { VariantChip } from "./variant-chips";

/** A template as the gallery lists it. */
export interface WizardEntry {
  id: string;
  name: string;
  blurb: string;
  fits: readonly ShapeClass[];
  /** The size it is made for. */
  size: Size;
  /** Its palettes, its own first. */
  palettes: readonly VariantChip[];
}

/** How many sensors a template reads, and how many of them this PC has. */
export interface SensorFit {
  need: number;
  found: number;
}

export interface ThumbProps {
  entry: WizardEntry;
  palette: string;
  width: number;
  height: number;
  /** The selected card (its picture is taken first). */
  selected?: boolean;
}

export interface PreviewProps {
  entry: WizardEntry;
  palette: string;
  width: number;
  height: number;
  sensors: SensorMap;
  hwinfo?: readonly ApiHwinfoDevice[];
  overrides?: RoleOverrides;
}

export interface MakeInput {
  name: string;
  width: number;
  height: number;
  palette: string;
  sensors: SensorMap;
  hwinfo?: readonly ApiHwinfoDevice[];
  overrides?: RoleOverrides;
}

interface KitBase {
  entries: readonly WizardEntry[];
  /** The words search matches besides the name and blurb: the widgets it uses and the sensors it reads (worked out on first use). */
  tagsOf: (entry: WizardEntry) => readonly string[];
  /** Its sensor fit with this catalog (worked out once per template and catalog). */
  fitOf: (entry: WizardEntry, sensors: SensorMap) => SensorFit;
  Thumb: ComponentType<ThumbProps>;
  /** Drawn once beside the cards when the thumbnails need it (the screens' offscreen pictures). */
  Host?: ComponentType;
  Preview: ComponentType<PreviewProps>;
}

export interface ScreenKit extends KitBase {
  kind: "screen";
  make: (entry: WizardEntry, input: MakeInput) => { profile: MonitorProfile; unbound: string[] };
}

export interface ProfileKit extends KitBase {
  kind: "ip";
  make: (entry: WizardEntry, input: MakeInput) => { stored: StoredCanvas; unbound: string[] };
  /** The roles it reads with the sensor each ended up with (overrides applied), for the Sensors list. */
  roles: (entry: WizardEntry, input: Omit<MakeInput, "name" | "width" | "height">) => RoleChoice[];
}

export type Kit = ScreenKit | ProfileKit;

const LOADERS: Record<WizardKind, () => Promise<Kit>> = {
  screen: () => import("./screen-kit").then((m) => m.SCREEN_KIT),
  ip: () => import("../infopanel/profile-kit").then((m) => m.PROFILE_KIT),
};

/** Kits already loaded: a second opening has its gallery at once. */
const loaded: Partial<Record<WizardKind, Kit>> = {};

/** The kind's kit, undefined while it loads. */
export function useKit(kind: WizardKind): Kit | undefined {
  const [kit, setKit] = useState<Kit | undefined>(() => loaded[kind]);
  useEffect(() => {
    if (loaded[kind]) return setKit(loaded[kind]);
    let live = true;
    setKit(undefined);
    // A chunk that fails to load leaves the gallery loading; Blank and the ways in still work.
    LOADERS[kind]().then(
      (k) => {
        loaded[kind] = k;
        if (live) setKit(k);
      },
      () => {},
    );
    return () => {
      live = false;
    };
  }, [kind]);
  return kit?.kind === kind ? kit : undefined;
}
