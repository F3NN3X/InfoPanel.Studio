import { useMemo } from "react";
import { walkItems } from "./parse.ts";
import { cssColor } from "./render/color.ts";
import type { DisplayItem } from "./schema.ts";
import { DATA_API, liveMatch, sensorState, type SensorMode, type SourceInput } from "./sensor-source.ts";
import { dateText, sensorColor, sensorText } from "./sensor-text.ts";
import { bindingRef, isBound, type BoundItem } from "./sensors.ts";

interface Row {
  path: string;
  item: DisplayItem;
  binding: string | null;
}

export interface SensorPanelProps {
  items: DisplayItem[];
  source: SourceInput;
  now: Date;
  onMode(mode: SensorMode): void;
  onMock(item: BoundItem, value: number): void;
}

export function SensorPanel({ items, source, now, onMode, onMock }: SensorPanelProps) {
  const { mode } = source;
  const rows = useMemo(() => {
    const out: Row[] = [];
    let i = 0;
    for (const { item } of walkItems(items)) {
      const path = String(i++);
      if (isBound(item)) out.push({ path, item, binding: bindingRef(item) ?? (item.SensorName || null) });
      else if (item.kind === "Clock" || item.kind === "Calendar") out.push({ path, item, binding: null });
    }
    return out;
  }, [items]);

  const counts = { ref: 0, "plugin-key": 0, name: 0, unmapped: 0 };
  const view = rows.map((row) => {
    const { item } = row;
    if (!isBound(item)) {
      return { row, match: null, text: dateText(item as Extract<DisplayItem, { kind: "Clock" | "Calendar" }>, now), color: "Color" in item ? item.Color : "" };
    }
    const match = liveMatch(item, source);
    if (mode === "live") counts[match?.via ?? "unmapped"]++;
    const { reading } = sensorState(item, source);
    const text =
      item.kind === "Sensor" ? sensorText(item, reading) : reading ? (reading.text ?? String(reading.now)) : "-";
    const color = item.kind === "Sensor" ? sensorColor(item, reading) : "";
    return { row, match, text, color };
  });

  const radio = (m: SensorMode, label: string) => (
    <label>
      <input type="radio" checked={mode === m} onChange={() => onMode(m)} /> {label}
    </label>
  );
  return (
    <section>
      <h3>Sensors</h3>
      <p>
        {radio("unbound", "Unbound (as in the screenshots)")} {radio("live", `Live (${DATA_API})`)} {radio("mock", "Mock")}
        {mode === "live" &&
          ` — ref ${counts.ref}, plugin key ${counts["plugin-key"]}, name ${counts.name}, unmapped ${counts.unmapped}`}
      </p>
      {mode === "live" && source.live.error && <p>{source.live.error}</p>}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Kind</th>
            <th>Name</th>
            <th>Binding</th>
            <th>{mode === "live" ? "Data API key" : mode === "mock" ? "Value" : ""}</th>
            <th>Text</th>
          </tr>
        </thead>
        <tbody>
          {view.map(({ row, match, text, color }) => (
            <tr key={row.path}>
              <td>{row.path}</td>
              <td>{row.item.kind}</td>
              <td>{row.item.Name}</td>
              <td>
                <code>{row.binding ?? ""}</code>
              </td>
              <td>
                {mode === "live" && isBound(row.item) && (match ? `${match.key} (${match.via})` : <em>unmapped</em>)}
                {mode === "mock" && isBound(row.item) && (
                  <input
                    type="range"
                    min={0}
                    max={Math.max(100, "MaxValue" in row.item ? row.item.MaxValue : 0)}
                    step="any"
                    value={source.mock.get(row.item) ?? 0}
                    onChange={(e) => onMock(row.item as BoundItem, Number(e.target.value))}
                  />
                )}
              </td>
              <td style={{ color: color ? (cssColor(color) ?? undefined) : undefined, whiteSpace: "pre" }}>{text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
