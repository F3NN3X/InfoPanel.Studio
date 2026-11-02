import { Minus, Plus } from "lucide-react";
import { joinTracks, splitTracks } from "./grid-tracks";

/** Examples shown on a chip's tooltip. */
const EXAMPLES = "1fr, 2fr, auto, 120px, minmax(0, 1fr)";

const CHIP =
  "h-6 rounded-md border border-ui-default bg-ui-app px-1.5 font-ui-mono text-micro text-ui-1 outline-none focus:border-ui-accent";
const STEP =
  "flex h-6 w-6 items-center justify-center rounded-md border border-ui-default text-ui-3 hover:bg-ui-hover hover:text-ui-1 disabled:pointer-events-none disabled:opacity-40";

interface TrackEditorProps {
  /** Accessible name prefix ("Column", "Row"). */
  name: string;
  /** The grid template (`undefined` = equal tracks). */
  value: string | undefined;
  /** Tracks shown while `value` is unset (equal split), e.g. 3 → 1fr 1fr 1fr. */
  equalCount: number;
  onChange: (value: string | undefined) => void;
}

/**
 * A grid template as editable chips (1fr / auto / Npx / any CSS track):
 * a chip commits on Enter or blur (empty removes it), + adds a 1fr track,
 * − drops the last. "Equal" goes back to the equal split.
 */
export function TrackEditor({ name, value, equalCount, onChange }: TrackEditorProps) {
  const custom = value !== undefined;
  const tracks = custom ? splitTracks(value) : Array<string>(equalCount).fill("1fr");

  const commit = (i: number, text: string) => {
    const next = tracks.map((t, j) => (j === i ? text : t));
    if (next.join(" ") !== tracks.join(" ")) onChange(joinTracks(next));
  };

  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center gap-1">
        {tracks.length === 0 && <span className="px-1 text-micro text-ui-4">auto</span>}
        {tracks.map((t, i) => (
          <input
            key={`${i}:${t}`}
            defaultValue={t}
            title={`Any CSS track size: ${EXAMPLES}`}
            aria-label={`${name} ${i + 1} size`}
            spellCheck={false}
            onBlur={(e) => commit(i, e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
            style={{ width: `calc(${Math.max(3, t.length)}ch + 16px)` }}
            className={CHIP}
          />
        ))}
        <button
          type="button"
          className={STEP}
          aria-label={`Remove the last ${name.toLowerCase()}`}
          disabled={tracks.length <= (custom ? 0 : 1)}
          onClick={() => onChange(joinTracks(tracks.slice(0, -1)))}
        >
          <Minus className="h-3 w-3" />
        </button>
        <button
          type="button"
          className={STEP}
          aria-label={`Add a ${name.toLowerCase()}`}
          onClick={() => onChange(joinTracks([...tracks, "1fr"]))}
        >
          <Plus className="h-3 w-3" />
        </button>
        {custom && (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="text-micro text-ui-3 hover:text-ui-1"
            title="Back to equal tracks"
          >
            Equal
          </button>
        )}
      </div>
    </div>
  );
}
