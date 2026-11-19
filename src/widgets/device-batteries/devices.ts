// The battery keys as devices: the parse the widget draws from and the studio's device picker lists from.
import { containers } from "../entries";
import { clamp, num, type ShellProps } from "../kit";
import { P } from "./meta";

/** One polled device, as its `battery.<id>.*` keys describe it. */
export interface BatteryDevice {
  /** The server's stable id (the key's middle segment, a hash of the device key). */
  id: string;
  name: string;
  /** 0-100; undefined = the device has never reported a level (the percent key is absent). */
  percent?: number;
  charging: boolean;
  /** mouse, keyboard, headset, controller, phone, other. */
  kind: string;
  via?: string;
  /** The server's low-threshold flag (`.low` is "yes"/"no"). */
  low: boolean;
  connected: boolean;
  asleep: boolean;
  detail?: string;
}

/**
 * Every device in the data, grouped by the id in its keys (`containers`). A field the server left out is absent (`percent`
 * on a device that never reported); a text field counts when it has text, so an empty name falls back to the id.
 */
export function batteryDevices(d: ShellProps["data"]): BatteryDevice[] {
  const out: BatteryDevice[] = [];
  for (const [id, items] of containers(d, P)) {
    // `battery.status` is the source's own line: containers() reads it as an id with no fields.
    if (!id || id === "status") continue;
    const field = (name: string): string | undefined => {
      const hit = items.find((i) => i.key.slice(i.key.lastIndexOf(".") + 1) === name);
      return hit && hit.text !== "" ? hit.text : undefined;
    };
    const yes = (name: string): boolean => /^yes$/i.test(field(name) ?? "");
    const pct = num(field("percent"));
    out.push({
      id,
      name: field("name") ?? id,
      percent: Number.isFinite(pct) ? clamp(pct) : undefined,
      charging: yes("charging"),
      kind: (field("kind") ?? "other").toLowerCase(),
      via: field("via"),
      low: yes("low"),
      // A data set that never said (an older source) is taken as connected, not hidden.
      connected: field("connected") === undefined ? true : yes("connected"),
      asleep: yes("asleep"),
      detail: field("detail"),
    });
  }
  return out;
}

/** The picker's options: the lowest charge, then each device as "Name · via"; a stored id that is not listed stays selectable. */
export function batteryDeviceOptions(devices: readonly BatteryDevice[], stored: string): { value: string; label: string }[] {
  const listed = devices.map((d) => ({ value: d.id, label: d.via ? `${d.name} · ${d.via}` : d.name }));
  return [{ value: "", label: "Lowest charge" }, ...listed, ...(stored && !devices.some((d) => d.id === stored) ? [{ value: stored, label: `${stored} (not connected)` }] : [])];
}
