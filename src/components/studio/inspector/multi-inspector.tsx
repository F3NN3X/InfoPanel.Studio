import { BoxSelect } from "lucide-react";
import type { ProfileView, Placement } from "@/lib/layout";
import type { Appearance } from "@/lib/style-resolve";
import type { ModuleSettings } from "@/modules/types";
import { isVisible, sharedDefs, type InspectorContext } from "../inspector-model";
import type { FieldsApi } from "../settings-panel";
import { MultiHeader } from "../zone-inspector-parts";
import { quickDefsFor } from "../quick-sets";
import { useQuickPins } from "./inspector-prefs";
import { InspectorView } from "./inspector-view";
import { followFields, shownValue, shownValues, withoutSettings, withSettings, zoneDefs, zoneLookValues } from "./zone-fields";
import { zoneName } from "./zone-meta";

interface MultiInspectorProps {
  /** The selected zones, the primary last (its values show). */
  zones: Placement[];
  appearance: Appearance;
  /** Edit the active profile (one undo step per `key`). */
  updateProfile: (fn: (p: ProfileView) => ProfileView, key?: string) => void;
  onDeselect: (id: string) => void;
  onToggleVisible: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  query: string;
  onQuery: (query: string) => void;
  /** The Changed filter (only values set here, across every tab). */
  changedOnly: boolean;
  onChangedOnly: (on: boolean) => void;
  jumpTo?: { id: string; key?: string; seq: number };
}

/**
 * Several zones selected: no tabs, only the Style sections of the look
 * they share. The rows and Follow bars show the primary zone's state; every
 * edit (Customize and Use theme too) applies to each selected zone in one
 * undo step.
 */
export function MultiInspector({
  zones,
  appearance,
  updateProfile,
  onDeselect,
  onToggleVisible,
  onDuplicate,
  onRemove,
  query,
  onQuery,
  changedOnly,
  onChangedOnly,
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

  const fields: FieldsApi = {
    values,
    shown: (key, def) => shownValue(values, key, def),
    onChange: (key, v) => each((z) => withSettings(z, { [key]: v }), `multi-setting:${key}`),
    onPatch: (patch: ModuleSettings) => each((z) => withSettings(z, patch), `multi-setting:${Object.keys(patch).join()}`),
    onClear: (keys) => each((z) => withoutSettings(z, keys)),
    ...followFields(primary, appearance, each),
  };
  const effective = shownValues(values, defs);

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
      query={query}
      onQuery={onQuery}
      changedOnly={changedOnly}
      onChangedOnly={onChangedOnly}
      jumpTo={jumpTo}
      identity={{
        icon: <BoxSelect />,
        name: `${zones.length} widgets`,
        meta: () => "Edits apply to all of them",
        hidden: zones.every((z) => !z.visible),
        onToggleVisible,
      }}
      quickKeys={quickDefsFor(zones, pins, zoneDefs).map((d) => d.key)}
    />
  );
}
