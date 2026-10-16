import { useEffect, useMemo, useState } from "react";
import { walkItems } from "./parse.ts";
import type { DisplayItem } from "./schema.ts";
import { dateText, sensorColor, sensorText, type SensorReading } from "./sensor-text.ts";
import { bindingRef, buildCatalog, isBound, mapBinding, toReading, type Catalog, type DataApiValue } from "./sensors.ts";

const DATA_API = "http://127.0.0.1:3921";
const EMPTY = buildCatalog({});

/** `#AARRGGBB` → CSS `#RRGGBBAA`. */
const cssColor = (c: string) => (/^#[0-9a-f]{8}$/i.test(c) ? `#${c.slice(3)}${c.slice(1, 3)}` : c);

interface Row {
  path: string;
  item: DisplayItem;
  binding: string | null;
}

function useLiveCatalog(enabled: boolean): { catalog: Catalog; error: string | null } {
  const [catalog, setCatalog] = useState<Catalog>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let stop = false;
    const tick = () =>
      fetch(`${DATA_API}/api/sensors`)
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then((s: { sensors: Record<string, DataApiValue> }) => {
          if (!stop) {
            setCatalog(buildCatalog(s.sensors));
            setError(null);
          }
        })
        .catch((e: Error) => !stop && setError(`${DATA_API}: ${e.message}`));
    tick();
    const id = setInterval(tick, 1000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [enabled]);
  return { catalog, error };
}

function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return now;
}

export function SensorPanel({ items }: { items: DisplayItem[] }) {
  const [mode, setMode] = useState<"live" | "mock">("live");
  const [mock, setMock] = useState<Record<string, number>>({});
  const { catalog, error } = useLiveCatalog(mode === "live");
  const now = useNow();

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
      return { row, match: null, reading: null, text: dateText(item as Extract<DisplayItem, { kind: "Clock" | "Calendar" }>, now), color: "Color" in item ? item.Color : "" };
    }
    const match = mode === "live" ? mapBinding(item, catalog) : null;
    if (mode === "live") counts[match?.via ?? "unmapped"]++;
    const reading: SensorReading | null =
      mode === "mock"
        ? { now: mock[row.path] ?? 0, min: 0, max: 0, avg: 0, unit: "" }
        : match
          ? toReading(catalog.sensors[match.key])
          : null;
    const text =
      item.kind === "Sensor" ? sensorText(item, reading) : reading ? (reading.text ?? String(reading.now)) : "-";
    const color = item.kind === "Sensor" ? sensorColor(item, reading) : "";
    return { row, match, reading, text, color };
  });

  return (
    <section>
      <h3>Sensors</h3>
      <p>
        <label>
          <input type="radio" checked={mode === "live"} onChange={() => setMode("live")} /> Live ({DATA_API})
        </label>{" "}
        <label>
          <input type="radio" checked={mode === "mock"} onChange={() => setMode("mock")} /> Mock
        </label>
        {mode === "live" &&
          ` — ref ${counts.ref}, plugin key ${counts["plugin-key"]}, name ${counts.name}, unmapped ${counts.unmapped}`}
      </p>
      {mode === "live" && error && <p>{error}</p>}
      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Kind</th>
            <th>Name</th>
            <th>Binding</th>
            <th>{mode === "live" ? "Data API key" : "Value"}</th>
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
                {mode === "live" ? (
                  isBound(row.item) && (match ? `${match.key} (${match.via})` : <em>unmapped</em>)
                ) : (
                  isBound(row.item) && (
                    <input
                      type="range"
                      min={0}
                      max={Math.max(100, "MaxValue" in row.item ? row.item.MaxValue : 0)}
                      step="any"
                      value={mock[row.path] ?? 0}
                      onChange={(e) => setMock({ ...mock, [row.path]: Number(e.target.value) })}
                    />
                  )
                )}
              </td>
              <td style={{ color: color ? cssColor(color) : undefined, whiteSpace: "pre" }}>{text}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
