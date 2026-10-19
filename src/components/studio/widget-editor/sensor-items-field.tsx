import { RotateCcw } from "lucide-react";
import { clearItem, itemsOf, setItemField, type ItemField } from "@/widgets/registry/settings-kit";
import { FIELD } from "../setting-rows";

const DECIMALS = [0, 1, 2, 3, 4];
const NUMBERS = [
  ["max", "Max"],
  ["warn", "Warn"],
  ["crit", "Crit"],
] as const;

const cell = `${FIELD} h-[26px] w-full min-w-0 px-1.5 font-ui-mono text-[11.5px]`;

/**
 * One bound sensor's overrides (a sensor list's tune panel): a label and max / warn / crit /
 * decimals; blank = the shared value. `value` is every sensor's overrides as one JSON string;
 * `onChange` gets the whole string back with an edit key per sensor and field, so typing coalesces.
 */
export function SensorOverride({
  sensorKey: key,
  name,
  value,
  onChange,
}: {
  sensorKey: string;
  name: string;
  value: string;
  onChange: (value: string, editKey: string) => void;
}) {
  const own = itemsOf(value)[key] ?? {};
  const set = (field: ItemField, v: string | number | undefined) => onChange(setItemField(value, key, field, v), `items:${key}:${field}`);
  return (
    <div className="space-y-1.5 pt-1.5">
      <div className="flex items-center gap-1.5">
        <input
          type="text"
          aria-label={`${name} label`}
          placeholder={name}
          value={own.label ?? ""}
          onChange={(e) => set("label", e.target.value || undefined)}
          className={`${FIELD} h-[26px] min-w-0 flex-1`}
        />
        <button
          type="button"
          onClick={() => onChange(clearItem(value, key), `items:${key}:reset`)}
          disabled={Object.keys(own).length === 0}
          aria-label={`Reset ${name}`}
          title="Reset this sensor"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1 disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <RotateCcw className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-4 gap-1.5">
        {NUMBERS.map(([field, text]) => (
          <input
            key={field}
            type="number"
            aria-label={`${name} ${text}`}
            placeholder={text}
            title={`${text} (blank = shared)`}
            value={own[field] ?? ""}
            onChange={(e) => set(field, e.target.value === "" ? undefined : Number(e.target.value))}
            className={cell}
          />
        ))}
        <select
          aria-label={`${name} decimals`}
          title="Decimals"
          value={own.decimals ?? ""}
          onChange={(e) => set("decimals", e.target.value === "" ? undefined : Number(e.target.value))}
          className={`${cell} cursor-pointer`}
        >
          <option value="">Auto</option>
          {DECIMALS.map((n) => (
            <option key={n} value={n}>
              {n} dec
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
