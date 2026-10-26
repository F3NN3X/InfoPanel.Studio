/**
 * The New InfoPanel profile Sensors rows (inside the Sensors line, `templates/sensor-summary.tsx`): one per sensor role
 * the chosen template reads, with the sensor Create found for it in the same dropdown the inspector uses. Pick another,
 * or leave a role unbound (Remap lists it after Create); one not found shows so in amber.
 */
import type { ChosenSensor } from "@/lib/infopanel/editor/bind";
import { ROLE_INFO, type Role } from "@/lib/infopanel/templates/roles";
import type { RoleChoice } from "@/lib/infopanel/templates/instantiate";
import { cn } from "@/lib/utils";
import { SensorSelect } from "./edit/sensor-select";

export type RoleOverrides = Partial<Record<Role, ChosenSensor | null>>;

interface RoleSensorsProps {
  roles: readonly RoleChoice[];
  onOverride: (role: Role, sensor: ChosenSensor | null) => void;
}

export function RoleSensors({ roles, onOverride }: RoleSensorsProps) {
  if (roles.length === 0) return null;
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] items-center gap-x-2 gap-y-1">
      {roles.map(({ role, sensor }) => (
        <div key={role} className="contents">
          <span className="truncate text-[11.5px] text-ui-2" title={ROLE_INFO[role].label}>
            {ROLE_INFO[role].label}
          </span>
          <SensorSelect
            label={`${ROLE_INFO[role].label} sensor`}
            current={sensor?.key}
            fallbackName={sensor?.name}
            placeholder="Not found · left unbound"
            className={cn("h-6 min-w-0", !sensor && "border-ui-warning/40 text-ui-warning")}
            onPick={(s) => onOverride(role, s)}
            onClear={() => onOverride(role, null)}
          />
        </div>
      ))}
    </div>
  );
}
