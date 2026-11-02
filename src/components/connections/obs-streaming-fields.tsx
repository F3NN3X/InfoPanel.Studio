import type { ObsScene } from "@/lib/extras";
import type { SceneLooks } from "@/lib/integrations";
import { cn } from "@/lib/utils";
import { FIELD, SELECT, StackRow } from "@/components/studio/setting-rows";

interface Props {
  /** The mic input saved; "" = none. */
  mic: string;
  /** The audio inputs OBS has now (empty while OBS isn't connected). */
  inputs: string[];
  scenes: ObsScene[];
  looks: SceneLooks;
  onMic: (mic: string) => void;
  onLook: (id: string, look: { sub: string; icon: string }) => void;
}

/** The Streaming widgets' OBS settings: the mic Stream Control follows and each scene's line and icon. */
export function ObsStreamingFields({ mic, inputs, scenes, looks, onMic, onLook }: Props) {
  // A saved mic that OBS doesn't list now (OBS is closed) stays selectable.
  const options = mic && !inputs.includes(mic) ? [...inputs, mic] : inputs;
  return (
    <div className="space-y-2">
      <StackRow label="Mic input" hint="The OBS input Stream Control shows and mutes. Connect OBS to list its inputs.">
        <select aria-label="OBS mic input" value={mic} onChange={(e) => onMic(e.target.value)} className={cn(SELECT, "h-[30px] w-full")}>
          <option value="">None</option>
          {options.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </StackRow>
      {scenes.length > 0 && (
        <StackRow label="Scenes" hint="The line under each scene's name, and its Material Symbols icon name.">
          <div className="space-y-1.5">
            {scenes.map((s) => {
              const look = looks[s.id] ?? { sub: "", icon: "" };
              return (
                <div key={s.id} className="flex items-center gap-1.5">
                  <span className="w-[72px] shrink-0 truncate text-caption text-ui-2" title={s.name}>
                    {s.name}
                  </span>
                  <input aria-label={`${s.name} line`} value={look.sub} placeholder="Line" maxLength={60} onChange={(e) => onLook(s.id, { ...look, sub: e.target.value })} className={cn(FIELD, "h-(--ui-h-control) min-w-0 flex-1")} />
                  <input aria-label={`${s.name} icon`} value={look.icon} placeholder="movie" maxLength={40} onChange={(e) => onLook(s.id, { ...look, icon: e.target.value })} className={cn(FIELD, "h-(--ui-h-control) w-[84px] shrink-0")} />
                </div>
              );
            })}
          </div>
        </StackRow>
      )}
    </div>
  );
}
