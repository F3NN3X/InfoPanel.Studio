import { X } from "lucide-react";
import { useSensors } from "@/hooks/useSensors";
import { SENSOR_OPS, type SensorCondition, type SensorOp } from "@/lib/alerts";
import { sensorAt } from "@/lib/sensors";
import { cn } from "@/lib/utils";
import { AlertChart } from "./alerts-chart";
import { clearLabel, previewSensor, previewText } from "./alerts-model";
import { NumField, TextField } from "./alerts-fields";
import { InlineRow, SELECT, StackRow } from "./setting-rows";
import { SensorField } from "./widget-editor/sensor-field";
import { sensorName } from "./widget-kinds";

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

interface AlertConditionProps {
  condition: SensorCondition;
  /** Set for a rule with several sensors: the row is numbered and can be removed. */
  position?: { index: number; onRemove: () => void };
  /** Edit one field of the condition; `field` is the history key part. */
  onEdit: (field: string, fn: (c: SensorCondition) => SensorCondition) => void;
  onOpenSources: () => void;
}

/** One sensor condition of a sensor alert: sensor, the five-minute chart, operator, value and hysteresis. */
export function AlertCondition({ condition, position, onEdit, onOpenSources }: AlertConditionProps) {
  const live = useSensors(condition.key ? [condition.key] : []);
  const reading = condition.key ? sensorAt(live, condition.key) : undefined;
  const { state } = previewSensor(condition, reading);
  const numeric = NUMERIC_OPS.includes(condition.op);
  const setOp = (op: SensorOp) =>
    onEdit("op", (c) => {
      const { clearBelow, ...rest } = c;
      const keepClear = clearLabel(op) !== null && clearLabel(c.op) === clearLabel(op);
      const value = NUMERIC_OPS.includes(op) && !Number.isFinite(Number(c.value)) ? 0 : c.value;
      return { ...rest, op, value, ...(keepClear && clearBelow !== undefined ? { clearBelow } : {}) };
    });
  const unit = reading?.unit;

  return (
    <div className={cn("flex flex-col gap-2", position && "rounded-10 border border-ui-default p-3")}>
      {position && (
        <div className="flex items-center justify-between">
          <span className="text-caption font-medium text-ui-3">
            Sensor {position.index + 1} <span className={state === "fires" ? "text-ui-warn" : "text-ui-3"}>· {previewText(state)}</span>
          </span>
          <button
            type="button"
            onClick={position.onRemove}
            aria-label={`Remove sensor ${position.index + 1}`}
            className="grid h-6 w-6 place-items-center rounded-md text-ui-3 hover:bg-ui-hover hover:text-ui-1"
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
      {condition.key === "" && <div className="text-caption text-ui-warn">Pick a sensor to watch</div>}
      {condition.key !== "" && (
        <AlertChart
          sensorKey={condition.key}
          name={sensorName(condition.key)}
          unit={unit}
          value={typeof reading?.value === "number" ? reading.value : undefined}
          limit={numeric && Number.isFinite(Number(condition.value)) ? Number(condition.value) : undefined}
          clear={numeric ? condition.clearBelow : undefined}
          above={condition.op === ">" || condition.op === ">="}
        />
      )}
      <div className="flex flex-col divide-y divide-ui-row [&>*]:min-h-10 [&>*]:py-1">
        {condition.op === "contains" || condition.op === "=" || condition.op === "!=" ? (
          <>
            <InlineRow label="Condition">
              <OpSelect op={condition.op} onChange={setOp} />
            </InlineRow>
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
          </>
        ) : (
          <InlineRow label="Condition">
            <OpSelect op={condition.op} onChange={setOp} />
            {numeric && (
              <NumField label="Threshold" unit={unit} value={Number(condition.value)} onChange={(n) => onEdit("value", (c) => ({ ...c, value: n ?? 0 }))} />
            )}
          </InlineRow>
        )}
        {clearLabel(condition.op) && (
          <InlineRow label={clearLabel(condition.op) ?? ""} hint="Hysteresis. Empty = clears as soon as the condition stops holding">
            <NumField
              label={clearLabel(condition.op) ?? "Clears at"}
              unit={unit}
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
      </div>
    </div>
  );
}

function OpSelect({ op, onChange }: { op: SensorOp; onChange: (op: SensorOp) => void }) {
  return (
    <select aria-label="Condition" value={op} onChange={(e) => onChange(e.target.value as SensorOp)} className={SELECT}>
      {SENSOR_OPS.map((o) => (
        <option key={o} value={o}>
          {OP_LABEL[o]}
        </option>
      ))}
    </select>
  );
}
