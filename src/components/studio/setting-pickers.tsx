import { Circle, CircleDot, Square, SquareCheck } from "lucide-react";
import { useAudioDevices } from "@/hooks/use-audio-devices";
import { useAudio } from "@/lib/audio-control";
import { useExtras } from "@/widgets/time-hooks";
import { useSensors } from "@/hooks/useSensors";
import { useSensorCatalog } from "@/lib/catalog";
import { parseNameList } from "@/lib/name-list";
import { AUTO_RULES, autoDevice, deviceOptions, deviceReading } from "@/lib/device-options";
import { cn } from "@/lib/utils";
import { meterKey, useWavelinkState } from "@/lib/wavelink";
import { shortName } from "@/widgets/audio-data";
import { allChannels } from "@/widgets/StreamMixer/channels";
import type { DeviceKind, ModuleSetting, ModuleSettingValue } from "@/modules/types";
import { ChipsField } from "./alerts-fields";
import { SELECT as SELECT_BASE, StackRow, type RowLabelProps } from "./setting-rows";

/** A comma-separated list ("" = none) as its items. */
const splitList = (value: string): string[] => (value ? value.split(",").map((s) => s.trim()).filter(Boolean) : []);

/**
 * A checklist bound to a comma-separated string ("" = none). Used for
 * `multiple` select settings.
 */
export function MultiSelect({
  value,
  onChange,
  options,
  label,
}: {
  value: string;
  onChange: (value: ModuleSettingValue) => void;
  options: { value: string; label: string }[];
  label?: string;
}) {
  if (options.length === 0) return <span className="text-[11px] text-ui-4">No options available</span>;
  const ticked = splitList(value);
  const toggle = (id: string) => onChange((ticked.includes(id) ? ticked.filter((v) => v !== id) : [...ticked, id]).join(","));
  return (
    <div role="group" aria-label={label} className="flex flex-col gap-0.5">
      {options.map((o) => {
        const on = ticked.includes(o.value);
        const Box = on ? SquareCheck : Square;
        return (
          <button
            key={o.value}
            type="button"
            role="checkbox"
            aria-checked={on}
            onClick={() => toggle(o.value)}
            className="flex items-center gap-2 px-0.5 py-1 text-left text-[12px] text-[#d4d4da]"
          >
            <Box className={cn("h-[18px] w-[18px] shrink-0", on ? "text-ui-accent" : "text-ui-4")} />
            <span className="min-w-0 flex-1 truncate">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const SELECT = cn(SELECT_BASE, "w-full max-w-none");
const LINK = "text-[11px] text-ui-4 hover:text-ui-1";

interface PickerProps {
  def: ModuleSetting;
  value: string;
  onChange: (value: ModuleSettingValue) => void;
  lead?: RowLabelProps["lead"];
  hint?: string;
}

/**
 * Picker for the browser's audio capture devices (the ones Web Audio can read
 * directly). Device ids are always enumerable; labels only resolve once the
 * microphone permission is granted, so a button unlocks them. Handles both
 * single-select and multi-select (`def.multiple`).
 */
export function MediaDevicePicker({ def, value, onChange, lead, hint }: PickerProps) {
  const { devices, status, request } = useAudioDevices();
  const options = devices.map((d) => ({ value: d.deviceId, label: d.label }));
  return (
    <StackRow label={def.label} lead={lead} hint={hint}>
      {def.multiple ? (
        <MultiSelect value={value} onChange={onChange} options={options} label={def.label} />
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={def.label} className={SELECT}>
          <option value="">None (loudest live device)</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {status !== "unsupported" && (
        <button type="button" onClick={() => void request()} className={LINK}>
          {status === "denied" ? "Microphone blocked — allow access" : "Enable microphone access"}
        </button>
      )}
    </StackRow>
  );
}

/**
 * Picker for the Wave Link widget's rows (the plugin's live channels +
 * input devices). Input devices keep their stored `device:{id}` value; the
 * widget meters them per input. Handles both single-select and multi-select
 * (`def.multiple`); "" means all meters.
 */
export function WavelinkMeterPicker({ def, value, onChange, lead, hint, flow }: PickerProps & { flow?: string }) {
  const state = useWavelinkState();
  // Show: Inputs = the channels and input devices, Outputs = the mixes
  const options = [
    ...(flow === "output" ? [] : state.channels.map((c) => ({ value: meterKey.channel(c.id), label: `Channel · ${c.name}` }))),
    ...(flow === "output" ? [] : state.devices.map((d) => ({ value: meterKey.device(d.id), label: `Input · ${d.name}` }))),
    ...(flow === "input" ? [] : state.mixes.map((m) => ({ value: meterKey.mix(m.id), label: `Output · ${m.name}` }))),
  ];
  return (
    <StackRow label={def.label} lead={lead} hint={hint}>
      {def.multiple ? (
        <MultiSelect value={value} onChange={onChange} options={options} label={def.label} />
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={def.label} className={SELECT}>
          <option value="">All meters</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
      {state.status === "absent" && options.length === 0 && (
        <span className="text-[11px] text-ui-4">
          Wave Link is not running — start the app and its meters appear here.
        </span>
      )}
    </StackRow>
  );
}

/**
 * Picker for the audio control widgets (`optionsFrom: "audio-control"`), by the row's key: `channels` / `channel` list the
 * Windows and Wave Link channels as they are now, `mix` Wave Link's mixes, `device` the Windows output devices. A stored
 * id that is not listed now (an app that is closed) stays selectable as typed.
 */
export function AudioControlPicker({ def, value, onChange, lead, hint }: PickerProps) {
  const audio = useAudio();
  const ids = (list: { id: string; name: string }[], prefix = "") => list.map((x) => ({ value: prefix + x.id, label: x.name }));
  let options: { value: string; label: string }[];
  let blank = "";
  if (def.key === "mix") {
    options = [{ value: "all", label: "All mixes (each channel's own level)" }, ...ids(audio.wavelink.mixes)];
    blank = "First mix";
  } else if (def.key === "device") {
    options = ids(audio.windows.outputs);
    blank = "Choose a device";
  } else {
    options = [
      ...allChannels(audio, "windows").map((c) => ({ value: c.id, label: `Windows � ${c.name}` })),
      ...allChannels(audio, "wavelink", "all").map((c) => ({ value: c.id, label: `Wave Link � ${c.name}` })),
    ];
    blank = def.multiple ? "" : "Master";
  }
  const stored = (def.multiple ? splitList(value) : value ? [value] : []).filter((v) => !options.some((o) => o.value === v));
  const all = [...options, ...stored.map((v) => ({ value: v, label: v }))];
  return (
    <StackRow label={def.label} lead={lead} hint={hint}>
      {def.multiple ? (
        <MultiSelect value={value} onChange={onChange} options={all} label={def.label} />
      ) : (
        <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={def.label} className={SELECT}>
          <option value="">{blank}</option>
          {all.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </StackRow>
  );
}

/** Picker for the OBS buttons' scene (`optionsFrom: "obs-scenes"`): the scenes OBS has now. A stored id that is not listed stays selectable as typed. */
export function ObsScenePicker({ def, value, onChange, lead, hint }: PickerProps) {
  const scenes = useExtras().obs.scenes;
  const options = scenes.map((s) => ({ value: s.id, label: s.name }));
  const all = value && !options.some((o) => o.value === value) ? [...options, { value, label: value }] : options;
  return (
    <StackRow label={def.label} lead={lead} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={def.label} className={SELECT}>
        <option value="">Choose a scene</option>
        {all.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </StackRow>
  );
}

/** One row of the device picker: a radio (one device) or a checkbox (several), the name and a muted detail. */
function DeviceRow({ on, multi, label, detail, onClick }: { on: boolean; multi: boolean; label: string; detail?: string; onClick: () => void }) {
  const Mark = multi ? (on ? SquareCheck : Square) : on ? CircleDot : Circle;
  return (
    <button
      type="button"
      role={multi ? "checkbox" : "radio"}
      aria-checked={on}
      onClick={onClick}
      className="flex w-full items-center gap-2 rounded-md px-0.5 py-1 text-left text-[12px] text-[#d4d4da] hover:bg-ui-hover"
    >
      <Mark className={cn("h-4 w-4 shrink-0", on ? "text-ui-accent" : "text-ui-4")} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {detail && <span className="max-w-[55%] shrink-0 truncate text-[11px] text-ui-4" title={detail}>{detail}</span>}
    </button>
  );
}

/**
 * Picker for a hardware / audio / drive device found in the live keys (SPEC §4.5): Auto first with its
 * rule and what it picks right now, then the live devices with a live reading. One device stores its id
 * (Auto: "auto"); `def.multiple` ticks several (`devices`, comma-separated, none = all). A stored device
 * that is not live right now stays listed, so opening the inspector never rewrites it.
 */
export function DevicePicker({ def, kind, value, onChange, lead, hint, flow }: PickerProps & { kind: DeviceKind; flow?: string }) {
  const { sensors } = useSensorCatalog();
  // audio devices: the widget's Show filter (Outputs / Inputs) narrows the list; each row says which it is
  const live = deviceOptions(kind, sensors).filter((o) => o.value !== "" && (flow !== "output" && flow !== "input" ? true : o.flow === flow));
  const labelOf = (id: string) => live.find((o) => o.value === id)?.label ?? `${id} (not live)`;
  const stored = def.multiple ? splitList(value) : value && value !== "auto" ? [value] : [];
  const listed = [...live.map((o) => o.value), ...stored.filter((id) => !live.some((o) => o.value === id))];
  const flowTag = (id: string) => {
    const f = live.find((o) => o.value === id)?.flow;
    return f ? (f === "input" ? "Input" : "Output") : undefined;
  };
  const rows = listed.map((id) => ({ id, label: labelOf(id), detail: [flowTag(id), deviceReading(kind, id, sensors)].filter(Boolean).join(" · ") || undefined }));
  if (def.multiple) {
    const toggle = (id: string) => onChange((stored.includes(id) ? stored.filter((v) => v !== id) : [...stored, id]).join(","));
    return (
      <StackRow label={def.label} lead={lead} hint={hint}>
        <div role="group" aria-label={def.label} className="flex flex-col">
          <DeviceRow on={stored.length === 0} multi label="All devices" detail="None ticked = every live device" onClick={() => onChange("")} />
          {rows.map((r) => (
            <DeviceRow key={r.id} on={stored.includes(r.id)} multi label={r.label} detail={r.detail} onClick={() => toggle(r.id)} />
          ))}
        </div>
      </StackRow>
    );
  }
  const shown = flow === "output" || flow === "input" ? flow : undefined;
  const auto = autoDevice(kind, sensors, shown);
  const now = live.some((o) => o.value === auto) ? auto : undefined;
  // a default-device container is named for the device it follows right now
  const nowName = (id: string) =>
    (id.startsWith("default-") && shortName(String(sensors[`plugins.audio-level-meter.${id}.device-name`]?.text ?? ""))) || labelOf(id);
  const ruleText = kind === "audio" && shown === "input" ? "Default input" : AUTO_RULES[kind];
  const rule = `${ruleText}${now ? ` · now ${nowName(now)}` : ""}`;
  return (
    <StackRow label={def.label} lead={lead} hint={hint}>
      <div role="radiogroup" aria-label={def.label} className="flex flex-col">
        <DeviceRow on={stored.length === 0} multi={false} label="Auto" detail={rule} onClick={() => onChange("auto")} />
        {rows.map((r) => (
          <DeviceRow key={r.id} on={stored[0] === r.id} multi={false} label={r.label} detail={r.detail} onClick={() => onChange(r.id)} />
        ))}
      </div>
    </StackRow>
  );
}

/** A list of names as chips (stored comma-separated), suggested from the names at `def.suggestKey`. */
export function NameListField({ def, value, onChange, ...label }: RowLabelProps & { def: ModuleSetting; value: string; onChange: (v: ModuleSettingValue) => void }) {
  const live = useSensors(def.suggestKey ? [def.suggestKey] : []);
  const raw = def.suggestKey ? live[def.suggestKey] : undefined;
  const suggestions = raw ? parseNameList(String(raw.text ?? raw.value ?? "")) : [];
  const values = value.split(",").map((s) => s.trim()).filter(Boolean);
  return (
    <StackRow {...label}>
      <ChipsField label={def.label} values={values} suggestions={suggestions} placeholder="App name" onChange={(list) => onChange(list.join(","))} />
    </StackRow>
  );
}
