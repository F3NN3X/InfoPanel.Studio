import { useSyncExternalStore } from "react";
import { useAudio } from "@/lib/audio-control";
import { extras } from "@/lib/extras";
import { keptLabel, touchChoices, touchValue, type TouchChoice, type TouchSources } from "@/lib/pinned-edit";
import type { TouchAction, TouchGesture, TouchMap } from "@/lib/pinned";
import type { RailPage } from "@/lib/rail";
import { SelectRow } from "./setting-rows";

/*
 * The Touch rows of any widget and of a rail item (decision 10, P6): what a tap, a hold and a double tap run, from the safe
 * set (`touchChoices`). The hints are taken from Tessera Deck's editor (host/editor/app.js, `hints`, commit efca233, MIT,
 * Copyright (c) 2026 catorendal-a11y; licences/tessera-deck-MIT.txt), reworded from a key to an item, as the `rail-editor`
 * fixture has them (INVESTIGATION §10).
 */

export const GESTURES: { g: TouchGesture; label: string; hint: string }[] = [
  { g: "tap", label: "Tap", hint: "Runs when you tap the item." },
  { g: "hold", label: "Hold", hint: "Runs when you hold the item for about half a second instead of the tap." },
  { g: "doubleTap", label: "Double tap", hint: "Runs when you tap twice quickly. An item with a double tap waits a moment before its tap runs." },
];

/** What the audio and OBS actions can name now: this PC's devices and OBS's scenes. Reading it opens the audio stream. */
export function useTouchSources(): TouchSources {
  const audio = useAudio();
  const scenes = useSyncExternalStore(extras.subscribe, () => extras.getState().obs.scenes, () => extras.getState().obs.scenes);
  return { outputs: audio.windows.outputs, inputs: audio.windows.inputs, scenes };
}

/** A select's options for an action: none, the choices, and a stored one the list doesn't hold now, kept as it is. */
export function actionOptions(choices: readonly TouchChoice[], none: string, stored: TouchAction | undefined): { value: string; label: string }[] {
  const value = touchValue(stored);
  const kept = stored && value !== "" && !choices.some((c) => c.value === value);
  return [{ value: "", label: none }, ...choices.map((c) => ({ value: c.value, label: c.label })), ...(kept ? [{ value, label: keptLabel(stored) }] : [])];
}

/** The action a select's value stands for: a choice's, or the stored one when it was kept. */
export const pickAction = (choices: readonly TouchChoice[], value: string, stored: TouchAction | undefined): TouchAction | undefined =>
  choices.find((c) => c.value === value)?.action ?? (value !== "" && value === touchValue(stored) ? stored : undefined);

/** A touch map with one gesture set or cleared; none left = undefined. */
export function withGesture(touch: TouchMap | undefined, g: TouchGesture, action: TouchAction | undefined): TouchMap | undefined {
  const next: TouchMap = { ...touch };
  if (action) next[g] = action;
  else delete next[g];
  return Object.keys(next).length ? next : undefined;
}

interface TouchRowsProps {
  touch: TouchMap | undefined;
  pages: readonly RailPage[];
  onChange: (touch: TouchMap | undefined, g: TouchGesture) => void;
  /** What an unset tap does ("Nothing" on a widget, "What the item is" on a rail item). */
  tapNone?: string;
}

/** The three gesture rows, each with its hint. */
export function TouchRows({ touch, pages, onChange, tapNone = "Nothing" }: TouchRowsProps) {
  const choices = touchChoices(pages, useTouchSources());
  return GESTURES.map(({ g, label, hint }) => (
    <div key={g}>
      <SelectRow label={label} value={touchValue(touch?.[g])} onChange={(v) => onChange(withGesture(touch, g, pickAction(choices, v, touch?.[g])), g)} options={actionOptions(choices, g === "tap" ? tapNone : "Nothing", touch?.[g])} />
      <p className="text-caption text-ui-3">{hint}</p>
    </div>
  ));
}
