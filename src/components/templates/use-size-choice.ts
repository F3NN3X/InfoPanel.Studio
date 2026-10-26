/**
 * The New wizards' size: the one the selection brings (`followed`: Blank's starting size, a template's own size, or
 * the size its card was drawn at), until the person sets one here, by a preset or by typing a width and a height.
 * Once set, it stays whatever is picked after; `reset` lets the selection's size lead again. A typed size that isn't
 * whole pixels from 1 to 8192 makes nothing (Create waits) and the pictures keep the last good one.
 */
import { useState } from "react";
import { shapeClassOf } from "@/lib/infopanel/templates/layout";
import { sideOf } from "./size-picker";
import { SIZE_PRESETS, presetForChoice, type Fitting, type Size } from "./size-presets";

/** The size a template is made at in a wizard that started at `start` (Blank's size). */
export function sizeFollowing(t: Fitting, start: Size): Size {
  const made = presetForChoice(t, shapeClassOf(start.width, start.height));
  return made !== undefined ? SIZE_PRESETS[made] : (t.size ?? start);
}

export interface SizeChoice {
  /** What Create makes: null sides while the typed size isn't valid. */
  size: { width: number | null; height: number | null };
  /** The size drawn: the last valid one. */
  shown: Size;
  /** The person set the size here (a preset or a valid typed one). */
  touched: boolean;
  /** A typed side isn't a whole number from 1 to 8192. */
  invalid: boolean;
  /** The width and height fields, which always show the size unless being typed. */
  w: string;
  h: string;
  onW: (v: string) => void;
  onH: (v: string) => void;
  /** A preset was picked. */
  pick: (s: Size) => void;
  /** Let the selection's size lead again. */
  reset: () => void;
}

/** `followed` is the size the selection brings while the person hasn't set one. */
export function useSizeChoice(followed: Size): SizeChoice {
  const [user, setUser] = useState<Size | null>(null);
  const [typed, setTyped] = useState<{ w: string; h: string } | null>(null);
  const shown = user ?? followed;
  const w = typed?.w ?? String(shown.width);
  const h = typed?.h ?? String(shown.height);
  const invalid = typed !== null && (sideOf(typed.w) === null || sideOf(typed.h) === null);
  const type = (next: { w: string; h: string }) => {
    setTyped(next);
    const width = sideOf(next.w);
    const height = sideOf(next.h);
    if (width !== null && height !== null) setUser({ width, height });
  };
  return {
    size: invalid ? { width: null, height: null } : shown,
    shown,
    touched: user !== null,
    invalid,
    w,
    h,
    onW: (v) => type({ w: v, h }),
    onH: (v) => type({ w, h: v }),
    pick: (s) => {
      setTyped(null);
      setUser(s);
    },
    reset: () => {
      setTyped(null);
      setUser(null);
    },
  };
}
