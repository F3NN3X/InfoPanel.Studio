import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import { actionsState, changeActions, runCommand, type ActionsState } from "@/lib/action-runner";
import { useAudio } from "@/lib/audio-control";
import { extras } from "@/lib/extras";
import { keptLabel, touchChoices, touchValue, type TouchChoice, type TouchSources } from "@/lib/pinned-edit";
import type { TouchAction, TouchGesture, TouchMap } from "@/lib/pinned";
import type { RailPage } from "@/lib/rail";
import { SelectRow, TextRow, ToggleRow } from "./setting-rows";

/*
 * The Touch rows of any widget and of a rail item (decision 10, P6): what a tap, a hold and a double tap run, from the safe
 * set (`touchChoices`). The hints are taken from Tessera Deck's editor (host/editor/app.js, `hints`, commit efca233, MIT,
 * Copyright (c) 2026 catorendal-a11y; licences/tessera-deck-MIT.txt), reworded from a key to an item, as the `rail-editor`
 * fixture has them (INVESTIGATION §10). P7 adds what is not in the safe set: a command (the action runner, off until Settings >
 * Actions turns it on, each command approved on the PC) and OBS's go live, each asking for a hold before it runs.
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

/** OBS's go live or stop (owner Q3): the one OBS action outside the safe set, refused unless its switch is on. */
export const OBS_STREAM: TouchAction = { op: "obs", body: { op: "stream", state: "toggle" } };

const isStream = (a: TouchAction | undefined): boolean => a?.op === "obs" && a.body.op === "stream";

/** The actions outside the safe set (P7), listed after it: a command and OBS's go live, each held to confirm. */
export const GUARDED_OPTIONS: readonly { value: string; label: string }[] = [
  { value: "run", label: "Run a command…" },
  { value: "obs:stream", label: "OBS: go live or stop" },
];

/** A row's value: a command or go live as themselves, any other action as the safe set reads it. */
export const rowValue = (a: TouchAction | undefined): string => (a?.op === "run" ? "run" : isStream(a) ? "obs:stream" : touchValue(a));

/** A row's options: none, the safe set, the guarded ones, and a stored action the list doesn't hold now, kept. */
export function rowOptions(choices: readonly TouchChoice[], none: string, stored: TouchAction | undefined): { value: string; label: string }[] {
  const guarded = stored?.op === "run" || isStream(stored);
  const base = actionOptions(choices, none, guarded ? undefined : stored);
  const kept = base.length > choices.length + 1 ? base.slice(choices.length + 1) : [];
  return [...base.slice(0, choices.length + 1), ...GUARDED_OPTIONS, ...kept];
}

/** The runner's state for the editor (`GET /api/actions`), read on open and after each change; null until read or when it can't be. */
export function useActionsState(): { state: ActionsState | null; set: (s: ActionsState) => void } {
  const [state, set] = useState<ActionsState | null>(null);
  useEffect(() => {
    let alive = true;
    void actionsState().then((s) => alive && set(s));
    return () => {
      alive = false;
    };
  }, []);
  return { state, set };
}

interface RunFieldsProps {
  /** The stored command, or undefined while one is being typed. */
  action: Extract<TouchAction, { op: "run" }> | undefined;
  onChange: (action: TouchAction) => void;
  runner: { state: ActionsState | null; set: (s: ActionsState) => void };
}

/**
 * A command's fields: the command, Hold to confirm, and whether it may run: the runner's switch, and its approval, given on
 * this PC only (Approve, and Remove approval). Test runs it dry: the server checks it all and says what would start.
 */
export function RunFields({ action, onChange, runner }: RunFieldsProps) {
  const [draft, setDraft] = useState(action?.command ?? "");
  const [note, setNote] = useState<string>();
  useEffect(() => setDraft(action?.command ?? ""), [action?.command]);
  const command = action?.command;
  const approved = !!command && !!runner.state?.approved.includes(command);
  const change = useCallback(
    async (c: { approve?: string[]; revoke?: string[] }) => {
      const r = await changeActions(c);
      if ("error" in r) setNote(r.error);
      else {
        runner.set(r);
        setNote(undefined);
      }
    },
    [runner]
  );
  const test = async () => {
    if (!command) return;
    const r = await runCommand(command, true);
    setNote(r.dry ? `Would run ${[r.program, ...(r.args ?? []).map((a) => (/\s/.test(a) || a === "" ? `"${a}"` : a))].join(" ")}` : (r.error ?? "It wouldn't run."));
  };
  return (
    <div className="space-y-1.5 pb-1">
      <TextRow
        label="Command"
        hint="A program and its arguments, such as notepad.exe notes.txt. No shell: & | > and %VARS% are plain text. Double quotes keep spaces in one argument."
        placeholder="notepad.exe"
        value={draft}
        onChange={(v) => {
          setDraft(v);
          if (v.trim()) onChange({ op: "run", command: v, ...(action ? (action.confirm ? { confirm: true } : {}) : { confirm: true }) });
        }}
      />
      {action && (
        <ToggleRow
          label="Hold to confirm"
          hint="Asks for a 0.6 s hold before it runs, unless the gesture was the hold. Use it for anything that can't be undone."
          value={action.confirm === true}
          onChange={(on) => onChange({ op: "run", command: action.command, ...(on ? { confirm: true } : {}) })}
        />
      )}
      {runner.state && !runner.state.runner && <p className="text-caption text-ui-warn">Running commands is off. Turn it on in Settings › Actions on the PC running InfoPanel Studio.</p>}
      {command && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={approved ? "text-caption text-ui-2" : "text-caption text-ui-warn"} aria-live="polite">
            {approved ? "Approved on this PC." : "Not approved: it won't run until it is approved on this PC."}
          </span>
          {runner.state && (approved ? (
            <Button small variant="ghost" onClick={() => void change({ revoke: [command] })}>
              Remove approval
            </Button>
          ) : (
            <Button small onClick={() => void change({ approve: [command] })}>
              Approve
            </Button>
          ))}
          <Button small variant="ghost" onClick={() => void test()}>
            Test
          </Button>
        </div>
      )}
      {note && (
        <p className="break-all text-caption text-ui-3" aria-live="polite">
          {note}
        </p>
      )}
    </div>
  );
}

interface TouchRowsProps {
  touch: TouchMap | undefined;
  pages: readonly RailPage[];
  onChange: (touch: TouchMap | undefined, g: TouchGesture) => void;
  /** What an unset tap does ("Nothing" on a widget, "What the item is" on a rail item). */
  tapNone?: string;
  /** What an unset hold does where it is not nothing (the profile chip's hold opens the picker). */
  holdNone?: string;
  /** The gestures listed; unset: all three (a folder key's tap opens it, so it lists two). */
  gestures?: readonly TouchGesture[];
}

/** The three gesture rows, each with its hint; a command or go live adds its own rows. */
export function TouchRows({ touch, pages, onChange, tapNone = "Nothing", holdNone = "Nothing", gestures }: TouchRowsProps) {
  const choices = touchChoices(pages, useTouchSources());
  const runner = useActionsState();
  // a gesture whose command is being typed: nothing is stored until it has one
  const [typing, setTyping] = useState<TouchGesture | null>(null);
  return GESTURES.filter(({ g }) => !gestures || gestures.includes(g)).map(({ g, label, hint }) => {
    const stored = touch?.[g];
    const value = typing === g && stored?.op !== "run" ? "run" : rowValue(stored);
    return (
      <div key={g}>
        <SelectRow
          label={label}
          value={value}
          onChange={(v) => {
            setTyping(v === "run" && stored?.op !== "run" ? g : null);
            if (v === "run") return;
            onChange(withGesture(touch, g, v === "obs:stream" ? OBS_STREAM : pickAction(choices, v, stored)), g);
          }}
          options={rowOptions(choices, g === "tap" ? tapNone : g === "hold" ? holdNone : "Nothing", stored)}
        />
        <p className="text-caption text-ui-3">{hint}</p>
        {value === "run" && (
          <RunFields
            action={stored?.op === "run" ? stored : undefined}
            runner={runner}
            onChange={(a) => {
              setTyping(null);
              onChange(withGesture(touch, g, a), g);
            }}
          />
        )}
        {value === "obs:stream" && (
          <p className="text-caption text-ui-3">
            Asks for a 0.6 s hold before OBS goes live or stops.
            {runner.state && !runner.state.obsStream && <span className="text-ui-warn"> Going live from the panel is off: turn it on in Settings › Actions.</span>}
          </p>
        )}
      </div>
    );
  });
}
