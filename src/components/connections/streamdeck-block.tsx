import { useEffect, useState } from "react";
import { FIELD, ToggleRow } from "@/components/studio/setting-rows";
import type { Deck, DeckAction, DeckResult, DeckStatus, StreamDeckLink, StreamDeckState } from "@/lib/streamdeck";
import { cn } from "@/lib/utils";
import { BUTTON } from "./obs-block";

export interface StreamDeckBlockProps {
  /** The server's Stream Deck state (`useStreamDeck`). */
  state: StreamDeckState;
  /** Whether that state is live (`useStreamDeckLink`); unset counts as live. */
  link?: StreamDeckLink;
  /** Turns the connection on or off; resolves to whether the server kept it. */
  onEnable: (enabled: boolean) => Promise<boolean>;
  act: (body: DeckAction) => Promise<DeckResult>;
}

const DOT: Record<DeckStatus, string> = { off: "bg-zinc-600", absent: "bg-zinc-600", connecting: "bg-amber-400", pairing: "bg-amber-400", ready: "bg-emerald-400", error: "bg-red-400" };
const WORDS: Record<DeckStatus, string> = {
  off: "Off",
  absent: "The Stream Deck app isn't running",
  connecting: "Connecting",
  pairing: "Waiting for pairing",
  ready: "Ready",
  error: "Error",
};

/** The one line for the whole connection: the furthest state any device has reached, or that it isn't known now. */
function overall(state: StreamDeckState, link: StreamDeckLink): string {
  if (link === "lost") return "The dashboard server isn't answering";
  if (link === "connecting") return "Connecting to the dashboard server";
  if (!state.enabled) return "Off";
  if (state.devices.length === 0) return "On · add a device to connect";
  for (const s of ["ready", "pairing", "error", "connecting"] as const) if (state.devices.some((d) => d.status === s)) return WORDS[s];
  return WORDS.absent;
}

/** A device's name, edited in place: saved on Enter or when the field is left. */
function NameField({ deck, act, onError }: { deck: Deck; act: StreamDeckBlockProps["act"]; onError: (message: string) => void }) {
  const [draft, setDraft] = useState(deck.name);
  useEffect(() => setDraft(deck.name), [deck.name]);
  const commit = async () => {
    const name = draft.trim();
    if (!name || name === deck.name) return setDraft(deck.name);
    const res = await act({ op: "rename", device: deck.id, name });
    if (!res.ok) {
      onError(res.error ?? "Couldn't rename the device");
      setDraft(deck.name);
    }
  };
  return (
    <input
      aria-label={`Name of ${deck.name}`}
      value={draft}
      maxLength={40}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => void commit()}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      className={cn(FIELD, "h-[28px] min-w-0 flex-1")}
    />
  );
}

/**
 * The Stream Deck connection: on or off, the pairing code to confirm in the Stream Deck app, and the virtual decks the
 * dashboard holds there (one per widget). Everything but the switch goes straight to the server's act route.
 */
export function StreamDeckBlock({ state, link = "open", onEnable, act }: StreamDeckBlockProps) {
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [forgetting, setForgetting] = useState(false);
  const run = async (body: DeckAction) => {
    const res = await act(body);
    setError(res.ok ? "" : (res.error ?? "The server refused"));
    return res;
  };
  const showCode = state.enabled && state.pairingCode !== "" && !state.devices.some((d) => d.status === "ready");
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between text-[12px] font-semibold text-ui-1">
        Stream Deck
        <span className="text-[11px] font-normal text-ui-4">{overall(state, link)}</span>
      </div>
      <ToggleRow
        label="Connect to the Stream Deck app"
        hint="The dashboard server adds virtual decks to the Stream Deck app, one per Elgato Stream Deck widget."
        value={state.enabled}
        onChange={(on) => void onEnable(on).then((ok) => setError(ok ? "" : "Couldn't save the change"))}
      />
      {showCode && (
        <div className="space-y-1.5">
          <div aria-label="Pairing code" className="font-mono text-[22px] font-semibold tracking-[0.3em] text-ui-1">
            {state.pairingCode}
          </div>
          <button type="button" className={BUTTON} onClick={() => void run({ op: "pair" })}>
            Pair
          </button>
          <p className="text-[11px] leading-snug text-ui-4">Confirm the same code in the Stream Deck app. It only asks when a freshly started Stream Deck app meets a new client.</p>
        </div>
      )}
      <div role="list" aria-label="Stream Deck devices" className="space-y-1.5">
        {state.devices.map((d) => (
          <div key={d.id} role="listitem" className="space-y-1">
            <div className="flex items-center gap-2">
              <span title={WORDS[d.status]} className={cn("h-2 w-2 shrink-0 rounded-full", DOT[d.status])} />
              <NameField deck={d} act={act} onError={setError} />
              <span className="shrink-0 text-[11px] tabular-nums text-ui-4">
                {d.cols}×{d.rows}
              </span>
              {confirming === d.id ? null : (
                <button type="button" className={BUTTON} onClick={() => setConfirming(d.id)}>
                  Forget
                </button>
              )}
            </div>
            {d.error && state.enabled && <p className="m-0 pl-4 text-[11px] text-s-red">{d.error}</p>}
            {confirming === d.id && (
              <div className="flex flex-wrap items-center gap-2 pl-4 text-[11.5px] text-ui-3">
                <span>Forget {d.name}? A widget using it will ask for another device.</span>
                <button
                  type="button"
                  className={BUTTON}
                  disabled={forgetting}
                  onClick={async () => {
                    setForgetting(true);
                    const res = await run({ op: "forget", device: d.id });
                    setForgetting(false);
                    setConfirming(null);
                    setNote(res.ok && res.data?.appDevice === "kept" ? `${d.name} is forgotten here, but the Stream Deck app may still list it. Delete it there.` : "");
                  }}
                >
                  Confirm forget
                </button>
                <button type="button" className={BUTTON} onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
      {note && <p className="m-0 text-[11.5px] text-ui-3">{note}</p>}
      <div className="flex gap-2">
        <button type="button" className={BUTTON} onClick={() => void run({ op: "create" })}>
          Add device
        </button>
      </div>
      {error && <p className="m-0 text-[11.5px] text-s-red">{error}</p>}
    </div>
  );
}
