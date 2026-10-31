import { audioAct, type AudioDevice } from "@/lib/audio-control";
import { Icon } from "../kit";

interface OutputPickerProps {
  outputs: AudioDevice[];
  onDone: () => void;
}

/** The popover under the mixer's chevron: the output devices, the default one ticked; a pick makes it the default. */
export function OutputPicker({ outputs, onDone }: OutputPickerProps) {
  return (
    <ul className="absolute right-0 top-full z-20 mt-1 max-h-64 min-w-[200px] max-w-[320px] overflow-auto rounded-lg bg-zinc-900/95 p-1 text-[12px] text-zinc-100 shadow-xl ring-1 ring-white/10">
      {outputs.map((d) => (
        <li key={d.id}>
          <button
            type="button"
            aria-pressed={d.default}
            className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/[0.08]"
            onClick={() => {
              void audioAct({ target: "windows", op: "default", id: d.id });
              onDone();
            }}
          >
            <Icon name="volume_up" className={`text-[15px] ${d.default ? "" : "opacity-0"}`} />
            <span className="min-w-0 flex-1 truncate">{d.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
