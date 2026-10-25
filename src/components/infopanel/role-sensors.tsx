/**
 * The New InfoPanel profile dialog's Sensors section: one row per sensor role the chosen template
 * reads, with the sensor Create found for it in the same dropdown the inspector uses. Pick another,
 * or leave a role unbound (Remap lists it after Create).
 */
import type { ChosenSensor } from "@/lib/infopanel/editor/bind";
import { ROLE_INFO, type Role } from "@/lib/infopanel/templates/roles";
import type { RoleChoice } from "@/lib/infopanel/templates/instantiate";
import { SensorSelect } from "./edit/sensor-select";

export type RoleOverrides = Partial<Record<Role, ChosenSensor | null>>;

interface RoleSensorsProps {
  roles: readonly RoleChoice[];
  onOverride: (role: Role, sensor: ChosenSensor | null) => void;
}

export function RoleSensors({ roles, onOverride }: RoleSensorsProps) {
  if (roles.length === 0) return null;
  return (
    <div role="group" aria-label="Sensors">
      <span className="mb-1 block text-[12px] text-ui-3">Sensors</span>
      <div className="grid grid-cols-1 gap-x-3 gap-y-1.5 sm:grid-cols-2">
        {roles.map(({ role, sensor }) => (
          <div key={role} className="flex min-w-0 items-center gap-2">
            <span className="w-[104px] shrink-0 truncate text-[12px] text-ui-2" title={ROLE_INFO[role].label}>
              {ROLE_INFO[role].label}
            </span>
            <SensorSelect
              label={`${ROLE_INFO[role].label} sensor`}
              current={sensor?.key}
              fallbackName={sensor?.name}
              placeholder="Not found: choose one"
              className="h-8 min-w-0 flex-1"
              onPick={(s) => onOverride(role, s)}
              onClear={() => onOverride(role, null)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
