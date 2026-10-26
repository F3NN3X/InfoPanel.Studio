/**
 * The New wizards' size: a preset or a custom size, and whether the person set it themselves here. Until they do, it
 * follows the pick alone, whatever was picked before: a template's own size (`presetForChoice`), else Blank's starting
 * size when the template fits its shape, else the first preset of a shape it does fit.
 */
import { useState } from "react";
import { shapeClassOf } from "@/lib/infopanel/templates/layout";
import { choiceOfSize, sizeOfChoice, type SizeChoice } from "./size-picker";
import { SIZE_PRESETS, presetForChoice, type Fitting, type Size } from "./size-presets";

/** The size a template is made at in a wizard that started at `start` (Blank's size). */
export function sizeFollowing(t: Fitting, start: Size): Size {
  const made = presetForChoice(t, shapeClassOf(start.width, start.height));
  return made !== undefined ? SIZE_PRESETS[made] : (t.size ?? start);
}

/** `start` is Blank's size; `first`, the template the wizard opens on, if any. */
export function useSizeChoice(start: Size, first?: Fitting) {
  const [initial] = useState(() => (first ? sizeFollowing(first, start) : start));
  const [choice, setChoice] = useState<SizeChoice>(() => choiceOfSize(initial));
  const [w, setW] = useState(String(initial.width));
  const [h, setH] = useState(String(initial.height));
  const [touched, setTouched] = useState(false);
  const size = sizeOfChoice(choice, w, h);
  // A custom one being typed keeps the last good shape for the thumbnails and the preview.
  const shown = { width: size.width ?? initial.width, height: size.height ?? initial.height };
  const set = (s: Size) => {
    setChoice(choiceOfSize(s));
    setW(String(s.width));
    setH(String(s.height));
  };
  return {
    size,
    shown,
    /** The props of `SizePicker`: any change there is the person's own. */
    picker: {
      choice,
      w,
      h,
      onChoice: (c: SizeChoice) => {
        setTouched(true);
        setChoice(c);
      },
      onW: (v: string) => {
        setTouched(true);
        setW(v);
      },
      onH: (v: string) => {
        setTouched(true);
        setH(v);
      },
    },
    /** A template was picked (undefined: Blank): take its size, unless the size was set here. */
    follow: (t: Fitting | undefined) => {
      if (touched) return;
      set(t ? sizeFollowing(t, start) : start);
    },
  };
}
