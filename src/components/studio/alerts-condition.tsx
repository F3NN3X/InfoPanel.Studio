import { X } from "lucide-react";
import { useSensors } from "@/hooks/useSensors";
import { SENSOR_OPS, type SensorCondition, type SensorOp } from "@/lib/alerts";
import { sensorAt } from "@/lib/sensors";
import { cn } from "@/lib/utils";
import { clearLabel, previewSensor } from "./alerts-model";
import { NumField, TextField } from "./alerts-fields";
import { InlineRow, SelectRow, StackRow } from "./setting-rows";
import { SensorField } from "./widget-editor/sensor-field";

const OP_LABEL: Record<SensorOp, string> = {
  ">": "is above",
  ">=": "is at least",
  "<": "is below",
  "<=": "is at most",
  "=": "equals",
  "!=": "is not",
  changes: "changes",
  contains: "contains",
  missing: "stops reporting",
};

const NUMERIC_OPS: readonly SensorOp[] = [">", ">=", "<", "<="];

/** The live line under a sensor: the current value and whether the condition would fire on it now. */
function LiveLine({ condition }: { condition: SensorCondition }) {
  const live = useSensors(condition.key ? [condition.key] : []);
  const { value, state } = previewSensor(condition, condition.key ? sensorAt(live, condition.key) : undefined);
  const note =
    state === "fires" ? "would fire now" : state === "ok" ? "not firing" : state === "event" ? "fires on each change" : "no reading";
  return (
    <div className="flex items-center gap-2 rounded-md bg-ui-app px-2 py-1.5 text-[11.5px]" aria-live="polite">
      <span className="text-ui-4">Now</span>
      <span className="font-ui-mono text-ui-1">{value ?? "—"}</span>
      <span
        className={cn(
          "ml-auto",
          state === "fires" ? "text-ui-warning" : state === "ok" ? "text-ui-success" : "text-ui-4"
        )}
      >
        {note}
      </span>
    </div>
  );
}

interface AlertConditionProps {
  condition: SensorCondition;
  /** Set for a rule with several sensors: the row is numbered and can be removed. */
  position?: { index: number; onRemove: () => void };
  /** Edit one field of the condition; `field` is the history key part. */
  onEdit: (field: string, fn: (c: SensorCondition) => SensorCondition) => void;
  onOpenSources: () => void;
}

/** One sensor condition of a sensor alert: sensor, operator, value, hysteresis and its live line. */
export function AlertCondition({ condition, position, onEdit, onOpenSources }: AlertConditionProps) {
  const setOp = (op: SensorOp) =>
    onEdit("op", (c) => {
      const { clearBelow, ...rest } = c;
      const keepClear = clearLabel(op) !== null && clearLabel(c.op) === clearLabel(op);
      const value = NUMERIC_OPS.includes(op) && !Number.isFinite(Number(c.value)) ? 0 : c.value;
      return { ...rest, op, value, ...(keepClear && clearBelow !== undefined ? { clearBelow } : {}) };
    });

  return (
    <div className={cn("space-y-2", position && "rounded-md border border-ui-default p-2.5")}>
      {position && (
        <div className="flex items-center justify-between">
          <span className="text-[11.5px] font-medium text-ui-3">Sensor {position.index + 1}</span>
          <button
            type="button"
            onClick={position.onRemove}
            aria-label={`Remove sensor ${position.index + 1}`}
            className="grid h-6 w-6 place-items-center rounded-md text-ui-4 hover:bg-ui-hover hover:text-ui-1"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
      <SensorField
        label="Sensor"
        value={condition.key || undefined}
        onChange={(key) => onEdit("key", (c) => ({ ...c, key: key ?? "" }))}
        onOpenExplorer={onOpenSources}
      />
      {condition.key === "" && <div className="text-[11px] text-ui-warning">Pick a sensor to watch.</div>}
      <SelectRow
        label="Condition"
        value={condition.op}
        onChange={(op) => setOp(op as SensorOp)}
        options={SENSOR_OPS.map((op) => ({ value: op, label: OP_LABEL[op] }))}
      />
      {condition.op !== "changes" &&
        condition.op !== "missing" &&
        (NUMERIC_OPS.includes(condition.op) ? (
          <InlineRow label="Threshold">
            <NumField
              label="Threshold"
              value={Number(condition.value)}
              onChange={(n) => onEdit("value", (c) => ({ ...c, value: n ?? 0 }))}
            />
          </InlineRow>
        ) : (
          <StackRow label="Value">
            <TextField
              label="Value"
              value={String(condition.value)}
              onChange={(text) =>
                onEdit("value", (c) => ({
                  ...c,
                  value: c.op !== "contains" && text.trim() !== "" && Number.isFinite(Number(text)) ? Number(text) : text,
                }))
              }
            />
          </StackRow>
        ))}
      {clearLabel(condition.op) && (
        <InlineRow label={`${clearLabel(condition.op)} (hysteresis)`} hint="Empty = clears as soon as the condition stops holding.">
          <NumField
            label={clearLabel(condition.op) ?? "Clears at"}
            value={condition.clearBelow}
            onChange={(n) =>
              onEdit("clear", (c) => {
                const { clearBelow: _was, ...rest } = c;
                return n === undefined ? rest : { ...rest, clearBelow: n };
              })
            }
          />
        </InlineRow>
      )}
      <LiveLine condition={condition} />
    </div>
  );
}
