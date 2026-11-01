import { BoxSelect } from "lucide-react";
import type { ProfileView, Placement } from "@/lib/layout";
import type { Appearance } from "@/lib/style-resolve";
import { settingKeys, type ModuleSetting, type ModuleSettings } from "@/modules/types";
import { chipSections, isVisible, sharedDefs, type InspectorContext, type InspectorSection } from "../inspector-model";
import { sectionInherit } from "../section-inherit";
import type { FieldsApi } from "../settings-panel";
import type { InheritanceContext } from "../use-inheritance";
import { MultiHeader } from "../zone-inspector-parts";
import { quickDefsFor } from "../quick-sets";
import { useQuickPins } from "./inspector-prefs";
import { InspectorView } from "./inspector-view";
import { readOnlyFields, shownValue, shownValues, withoutSettings, withSettings, zoneDefs, zoneLookValues } from "./zone-fields";
import { zoneName } from "./zone-meta";

interface MultiInspectorProps {
  /** The selected zones, the primary last (its values show). */
  zones: Placement[];
  appearance: Appearance;
  /** The screen and page the zones are on, and the config the chips read and write. */
  inherit: InheritanceContext;
  profileId: string;
  pageId: string;
  /** Edit the active profile (one undo step per `key`). */
  updateProfile: (fn: (p: ProfileView) => ProfileView, key?: string) => void;
  onDeselect: (id: string) => void;
  onToggleVisible: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  query: string;
  onQuery: (query: string) => void;
  jumpTo?: { id: string; key?: string; seq: number };
}

/**
 * Several zones selected: no tabs, only the Style sections of the look
 * they share. The rows and inheritance chips show the primary zone's state; every
 * edit (Customise and Reset too) applies to each selected zone in one undo step.
 */
export function MultiInspector({
  zones,
  appearance,
  inherit,
  profileId,
  pageId,
  updateProfile,
  onDeselect,
  onToggleVisible,
  onDuplicate,
  onRemove,
  query,
  onQuery,
  jumpTo,
}: MultiInspectorProps) {
  const primary = zones[zones.length - 1];
  const pins = useQuickPins();
  const ids = new Set(zones.map((z) => z.id));
  const defs = sharedDefs(zones.map(zoneDefs));
  const context: InspectorContext = { kind: "multi", defs };
  const values = zoneLookValues(primary, appearance);

  /** Every selected zone through `fn`, as one change. */
  const each = (fn: (z: Placement) => Placement, key?: string) =>
    updateProfile((p) => ({ ...p, placements: p.placements.map((z) => (ids.has(z.id) ? fn(z) : z)) }), key);

  /** The value each zone shows for a row's keys; the row is mixed when they differ. */
  const mixed = (def: ModuleSetting) => {
    const seen = new Set(
      zones.map((z) => {
        const own = zoneLookValues(z, appearance);
        return JSON.stringify(settingKeys(def).map((key) => shownValue(own, key, def)));
      })
    );
    return seen.size > 1;
  };

  const fields: FieldsApi = {
    values,
    mixed,
    shown: (key, def) => shownValue(values, key, def),
    onChange: (key, v) => each((z) => withSettings(z, { [key]: v }), `multi-setting:${key}`),
    onPatch: (patch: ModuleSettings) => each((z) => withSettings(z, patch), `multi-setting:${Object.keys(patch).join()}`),
    onClear: (keys) => each((z) => withoutSettings(z, keys)),
    ...readOnlyFields(primary, appearance),
  };
  const effective = shownValues(values, defs);
  const scopeOf = (z: Placement) => ({ level: "widget", profileId, pageId, zoneId: z.id }) as const;
  const inheritOf = (s: InspectorSection) => {
    const sections = chipSections(s);
    return sections.length === 0
      ? undefined
      : sectionInherit({ sections, title: s.title, scope: scopeOf(primary), alsoScopes: zones.filter((z) => z !== primary).map(scopeOf), ctx: inherit });
  };

  return (
    <InspectorView
      context={context}
      contextKey="multi"
      header={
        <MultiHeader
          zones={zones.map((z) => ({ id: z.id, name: zoneName(z), visible: z.visible }))}
          onDeselect={onDeselect}
          onToggleVisible={onToggleVisible}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      }
      fields={fields}
      visible={(def) => isVisible(def, effective)}
      parts={() => ({})}
      inherit={inheritOf}
      query={query}
      onQuery={onQuery}
      jumpTo={jumpTo}
      identity={{
        icon: <BoxSelect />,
        name: `${zones.length} widgets`,
        meta: () => "Edits apply to all of them",
        hidden: zones.every((z) => !z.visible),
        onToggleVisible,
        noun: "widgets",
      }}
      quickKeys={quickDefsFor(zones, pins, zoneDefs).map((d) => d.key)}
    />
  );
}
