import { useRef, useState } from "react";
import { deckAct, GRID_PRESETS, MAX_SIDE, useStreamDeck, type DeckResult } from "@/lib/streamdeck";
import { cn } from "@/lib/utils";
import type { ModuleSetting, ModuleSettingValue } from "@/modules/types";
import { SELECT as SELECT_BASE, StackRow, type RowLabelProps } from "./setting-rows";

const SELECT = cn(SELECT_BASE, "w-full max-w-none");
const BUTTON = "flex h-[28px] items-center gap-1.5 rounded-[6px] border border-ui-default px-2.5 text-[12px] text-ui-2 hover:bg-ui-hover hover:text-ui-1 disabled:opacity-50";

interface PickerProps {
  def: ModuleSetting;
  value: string;
  onChange: (value: ModuleSettingValue) => void;
  lead?: RowLabelProps["lead"];
  hint?: string;
}

/**
 * Picker for the Elgato Stream Deck widget's device (`optionsFrom: "streamdeck-devices"`): the virtual devices the server
 * holds now, each with its grid, and a button that creates a new one and picks it. A stored id the server no longer lists
 * stays selectable as typed.
 */
export function StreamDeckDevicePicker({ def, value, onChange, lead, hint }: PickerProps) {
  const { devices } = useStreamDeck();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  // The device just created: the server's next state lists it, until then it is new, not gone.
  const [created, setCreated] = useState("");
  // The create answers after a render or two: its pick goes through the newest onChange, built on the newest placement.
  const latest = useRef(onChange);
  latest.current = onChange;
  const options = devices.map((d) => ({ value: d.id, label: `${d.name} · ${d.cols}×${d.rows}` }));
  const all = value && !options.some((o) => o.value === value) ? [...options, { value, label: value === created ? "New device…" : `${value} (gone)` }] : options;
  const create = async () => {
    setBusy(true);
    const res = await deckAct({ op: "create" });
    setBusy(false);
    if (res.ok && res.data?.id) {
      setError("");
      setCreated(res.data.id);
      latest.current(res.data.id);
    } else setError(res.error ?? "Couldn't create a device");
  };
  return (
    <StackRow label={def.label} lead={lead} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={def.label} className={SELECT}>
        <option value="">Choose a device</option>
        {all.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <button type="button" className={BUTTON} disabled={busy} onClick={() => void create()}>
        New device
      </button>
      {error && <span className="block text-[11px] text-s-red">{error}</span>}
    </StackRow>
  );
}

const sides = Array.from({ length: MAX_SIDE }, (_, i) => i + 1);

/**
 * The Grid row (`optionsFrom: "streamdeck-grid"`). The grid belongs to the device the Device row picks (`deviceId`), so the
 * row shows that device's grid from the server's stream and changes it with a grid action; nothing is stored in the
 * widget's settings.
 */
export function StreamDeckGridPicker({ def, deviceId, lead, hint }: Omit<PickerProps, "value" | "onChange"> & { deviceId: string }) {
  const deck = useStreamDeck().devices.find((d) => d.id === deviceId);
  const [error, setError] = useState("");
  const set = async (cols: number, rows: number) => {
    if (!deck) return;
    const res: DeckResult = await deckAct({ op: "grid", device: deck.id, cols, rows });
    setError(res.ok ? "" : (res.error ?? "Couldn't change the grid"));
  };
  if (!deck)
    return (
      <StackRow label={def.label} lead={lead} hint={hint}>
        <span className="block text-[11px] text-ui-4">Pick a device first</span>
      </StackRow>
    );
  return (
    <StackRow label={def.label} lead={lead} hint={hint}>
      <div className="flex items-center gap-2">
        <select value={deck.cols} onChange={(e) => void set(Number(e.target.value), deck.rows)} aria-label="Columns" className={cn(SELECT_BASE, "w-16")}>
          {sides.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <span className="text-ui-4">×</span>
        <select value={deck.rows} onChange={(e) => void set(deck.cols, Number(e.target.value))} aria-label="Rows" className={cn(SELECT_BASE, "w-16")}>
          {sides.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {GRID_PRESETS.map(([c, r]) => (
          <button key={`${c}x${r}`} type="button" aria-pressed={deck.cols === c && deck.rows === r} className={cn(BUTTON, deck.cols === c && deck.rows === r && "border-ui-accent text-ui-1")} onClick={() => void set(c, r)}>
            {c}×{r}
          </button>
        ))}
      </div>
      {error && <span className="block text-[11px] text-s-red">{error}</span>}
    </StackRow>
  );
}
