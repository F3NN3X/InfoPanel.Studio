import { Toggle } from "@/components/ui/toggle";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import type { PackMotion } from "@/looks/motion";
import type { FxLevel } from "@/looks/pack-json";
import { cn } from "@/lib/utils";
import type { ModuleSettings } from "@/modules/types";
import type { LookValues } from "./inspector-model";
import { Choice, Knob, SEGMENT, SEGMENT_ON } from "./look-knobs";
import { choiceOf, declared, EFFECT_LABELS, effectsOn, effectsPatch, INTENSITIES, LEVELS, levelOf, motionCustom, SPEEDS } from "./motion-knobs-model";

export interface MotionKnobsProps {
  /** The pack's motion block: the group draws only for a pack that has one. */
  motion: PackMotion;
  values: LookValues;
  /** What a knob that is not set here follows. */
  from: string;
  /** The screen's own FX level (unset: it follows the system). */
  fx?: FxLevel;
  /** The screen's name, where Level is stored. */
  screen: string;
  /** Set while the screen locks the Motion section. */
  locked?: string;
  onSet: (patch: ModuleSettings) => void;
  onClear: (keys: readonly string[]) => void;
  /** Writes the screen's FX level (undefined: follow the system again). */
  onLevel: (fx: FxLevel | undefined) => void;
}

/**
 * The Motion group (L117): Level (the screen's FX level, the same as Screens › Effects), Intensity and Speed over the pack's own,
 * and a switch per effect the pack declares. Intensity, Speed and the effects are Look values at the level; Reset clears them.
 */
export function MotionKnobs({ motion, values, from, fx, screen, locked, onSet, onClear, onLevel }: MotionKnobsProps) {
  const reduce = useReducedMotion();
  const level = levelOf(fx, reduce);
  const intensity = choiceOf(values, "motionIntensity", INTENSITIES);
  const speed = choiceOf(values, "motionSpeed", SPEEDS);
  const on = effectsOn(values, motion);
  const choices = (key: "motionIntensity" | "motionSpeed", label: string, options: readonly { id: string; label: string }[], value: string) => (
    <Knob label={label} custom={motionCustom(values, [key])} from={from} onReset={() => onClear([key])} locked={locked}>
      <Choice label={label}>
        {options.map((o) => (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={value === o.id}
            tabIndex={value === o.id ? 0 : -1}
            // the pack's own is no value of the level's: picking it clears the knob
            onClick={() => (o.id === "auto" ? onClear([key]) : onSet({ [key]: o.id }))}
            className={cn(SEGMENT, value === o.id && SEGMENT_ON)}
          >
            {o.label}
          </button>
        ))}
      </Choice>
    </Knob>
  );
  return (
    <section aria-label="Motion" data-nav-section="motion-knobs" className="flex flex-col gap-1 px-5 pb-4">
      <h2 className="pb-1 text-caption font-medium text-ui-3">Motion</h2>
      <Knob label="Level" custom={fx !== undefined} from={`the system, for ${screen}`} onReset={() => onLevel(undefined)}>
        <Choice label="Level">
          {LEVELS.map((l) => (
            <button key={l.id} type="button" role="radio" aria-checked={level === l.id} tabIndex={level === l.id ? 0 : -1} onClick={() => onLevel(l.id)} className={cn(SEGMENT, level === l.id && SEGMENT_ON)}>
              {l.label}
            </button>
          ))}
        </Choice>
      </Knob>
      {choices("motionIntensity", "Intensity", INTENSITIES, intensity)}
      {choices("motionSpeed", "Speed", SPEEDS, speed)}
      {/* the effects as a list under their row, one switch per line like the rows above; the row's right side counts them */}
      <Knob
        label="Effects"
        custom={motionCustom(values, ["motionEffects"])}
        from={from}
        onReset={() => onClear(["motionEffects"])}
        locked={locked}
        note={
          locked ? undefined : (
            <ul aria-label="Effects" className="flex flex-col">
              {declared(motion).map((effect) => (
                <li key={effect} className="flex min-h-8 items-center justify-between gap-3 pl-4 text-caption text-ui-2">
                  {EFFECT_LABELS[effect]}
                  <Toggle
                label={EFFECT_LABELS[effect]}
                checked={on.includes(effect)}
                onChange={(next) => {
                  const patch = effectsPatch(values, motion, effect, next);
                  if (patch) onSet(patch);
                  else onClear(["motionEffects"]);
                }}
              />
                </li>
              ))}
            </ul>
          )
        }
      >
        <span className="text-caption text-ui-3">
          {on.length} of {declared(motion).length} on
        </span>
      </Knob>
    </section>
  );
}
