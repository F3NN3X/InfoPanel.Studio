import { useEffect, useRef, useState, type ReactNode } from "react";
import { Pipette } from "lucide-react";
import { FOCUS_RING } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider-field";
import { InheritDot } from "@/components/ui/setting-row";
import { onRovingKeyDown } from "@/lib/roving";
import { loadLook } from "@/looks";
import { resolveVariants, type ResolvedVariant } from "@/looks/look";
import type { Appearance } from "@/lib/style-resolve";
import { cn } from "@/lib/utils";
import type { ModuleSettings } from "@/modules/types";
import type { LookValues } from "./inspector-model";
import { lookName } from "./look-gallery-model";
import {
  ACCENTS,
  CORNER_STEPS,
  cornerStep,
  DENSITIES,
  densityOf,
  KNOB_KEYS,
  knobCustom,
  knobValue,
  lockedKnobs,
  modeCustom,
  modeOf,
  modePatch,
  MODES,
  type KnobMode,
  surfaceChip,
  SURFACES,
  type KnobId,
  variantCustom,
  variantKeys,
  variantKnobs,
  variantOf,
} from "./look-knobs-model";

/** One Corners control for a level whose screen holds the corners too: the value in px, and the writes that keep both stores equal. */
export interface CornersControl {
  px: number;
  custom: boolean;
  set: (px: number) => void;
  reset: () => void;
}

export interface LookKnobsProps {
  /** What the knobs show: the values where they edit over what that inherits (the theme's included, as the renderer resolves it). */
  values: LookValues;
  /** What a knob that is not set here follows ("Field Kit", "the page"). */
  from: string;
  /** Write values (the caller detaches what it must). */
  onSet: (patch: ModuleSettings) => void;
  /** Clear keys, back to what the knob follows. */
  onClear: (keys: readonly string[]) => void;
  /** The heading; none for no heading. */
  title?: string;
  /** The knobs a screen's lock holds read-only, with the reason (`lockedKnobs`). */
  locked?: Partial<Record<KnobId, string>>;
  /** Under Accent: the live contrast readout. */
  accentNote?: ReactNode;
  /** The one Corners control of Theme's page (the widget inspector's Corners keeps its steps). */
  corners?: CornersControl;
  /** The knobs drawn (unset: every one, Variant for a theme that has variants); a panel item has only Accent. */
  knobs?: readonly KnobId[];
}

/** The inline controls' height: 32 px (rules §3). */
export const SEGMENT = cn("h-8 flex-1 whitespace-nowrap rounded-ui-sm px-2 text-caption text-ui-3 hover:text-ui-1 disabled:opacity-50", FOCUS_RING);
export const SEGMENT_ON = "bg-ui-active text-ui-1";
const RING = "shadow-[0_0_0_2px_var(--ui-bg-chrome),0_0_0_4px_#ededf0]";

const same = (a: unknown, b: string) => typeof a === "string" && a.trim().toLowerCase() === b.toLowerCase();

/** The control Reset hands focus to: the checked option, else the first control. */
const RESET_FOCUS = ["[aria-pressed=true]", "[role=radio][tabindex='0']", "button", "input"];

/** One knob as a setting row: the inheritance dot (filled and a Reset when set here, hollow when it follows), the name, the control on the right (under the name when the row is too narrow for both, so neither is cut). */
export function Knob({ label, custom, from, onReset, locked, children, note }: { label: string; custom: boolean; from: string; onReset: () => void; locked?: string; children: ReactNode; note?: ReactNode }) {
  const controls = useRef<HTMLDivElement>(null);
  // Reset goes away with the dot's fill: focus moves to the knob's control, not the page.
  const reset = () => {
    onReset();
    requestAnimationFrame(() => {
      const el = controls.current;
      RESET_FOCUS.map((q) => el?.querySelector<HTMLElement>(q)).find((x) => x)?.focus();
    });
  };
  return (
    <div role="group" aria-label={label} title={locked} className="flex flex-col gap-1.5">
      <div className="flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
        <span className="flex shrink-0 items-center gap-2 text-body text-ui-2">
          {!locked && <InheritDot from={from} set={custom} onReset={reset} />}
          {label}
        </span>
        <div ref={controls} className="ml-auto flex min-w-0 items-center justify-end">
          {locked ? <span className="text-caption text-ui-3">{locked}</span> : children}
        </div>
      </div>
      {note}
    </div>
  );
}

/** A segmented choice on the row's right: a radiogroup with a roving tab stop. */
export function Choice({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div role="radiogroup" aria-label={label} onKeyDown={(e) => onRovingKeyDown(e, "[role=radio]:not(:disabled)")} className={cn("flex gap-0.5 rounded-ui-md border border-ui-strong bg-ui-chrome p-0.5", className)}>
      {children}
    </div>
  );
}

interface LookInfo {
  modes: readonly KnobMode[];
  variants: readonly ResolvedVariant[];
}

const NO_INFO: LookInfo = { modes: [], variants: [] };

/** The most Variant choices (the theme's own included) a segmented row holds in the panel; more are a dropdown. */
export const VARIANT_SEGMENTS = 3;
/** The dropdown's value for the theme's own (an option value is never empty). */
const OWN = "own";

/** The modes a theme supports (its `modes.supported`) and its variants; none while it loads. */
function useLookInfo(lookId: unknown): LookInfo {
  const [info, setInfo] = useState<LookInfo>(NO_INFO);
  useEffect(() => {
    let live = true;
    // The previous theme's modes don't stand while this one loads (a click would write against the wrong native mode).
    setInfo(NO_INFO);
    loadLook(typeof lookId === "string" ? lookId : "classic").then(
      (look) => live && setInfo(look ? { modes: look.modes.supported, variants: resolveVariants(look) } : NO_INFO),
      () => live && setInfo(NO_INFO)
    );
    return () => {
      live = false;
    };
  }, [lookId]);
  return info;
}

/**
 * Quick changes (D15): Accent, Mode, Cards, Corners, Density and Variant over the theme, each a setting row whose dot is
 * filled while the level holds a value of its own and resets it when pressed. Mode shows for a theme that supports light
 * (D3), Variant for a theme that has variants.
 */
export function LookKnobs({ values, from, onSet, onClear, title, locked = {}, accentNote, corners, knobs }: LookKnobsProps) {
  const custom = (id: KnobId) => knobCustom(values, id);
  const reset = (id: KnobId) => () => onClear(KNOB_KEYS[id]);
  const accent = knobValue(values, "accent");
  const surface = surfaceChip(values);
  const corner = cornerStep(knobValue(values, "radius"));
  const density = densityOf(values);
  const { modes, variants } = useLookInfo(knobValue(values, "lookId"));
  const native = modes[0];
  const mode = native && modeOf(values, native);
  const shows = (id: KnobId) => knobs === undefined || knobs.includes(id);
  const variant = variants.length > 0 && knobs === undefined ? variantOf(values, variants) : undefined;
  const variantLock = variantKnobs(variants)
    .map((id) => locked[id])
    .find((reason) => reason !== undefined);
  const customAccent = typeof accent === "string" && accent !== "" && !ACCENTS.some((a) => same(accent, a.value));
  return (
    <section aria-label="Quick changes" data-nav-section="knobs" className="flex flex-col gap-1 px-5 pb-4">
      <h2 className="pb-1 text-caption font-medium text-ui-3">{title ?? "Quick changes"}</h2>
      {shows("accent") && (
        <Knob label="Accent" custom={custom("accent")} from={from} onReset={reset("accent")} locked={locked.accent} note={accentNote}>
          <div className="flex items-center">
            {ACCENTS.map((a) => (
              <button
                key={a.value}
                type="button"
                aria-label={a.name}
                title={a.name}
                aria-pressed={same(accent, a.value)}
                disabled={locked.accent !== undefined}
                onClick={() => onSet({ accent: a.value })}
                className={cn("flex h-8 w-7 items-center justify-center rounded-full disabled:opacity-50", FOCUS_RING)}
              >
                <span className={cn("h-5 w-5 rounded-full", same(accent, a.value) && RING)} style={{ background: a.value }} />
              </button>
            ))}
            <label title="Custom accent" className="relative flex h-8 w-7 cursor-pointer items-center justify-center rounded-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ui-accent">
              <span className={cn("flex h-5 w-5 items-center justify-center rounded-full border border-ui-strong text-ui-3", customAccent && RING)} style={customAccent ? { background: accent as string } : undefined}>
                {!customAccent && <Pipette className="h-3 w-3" aria-hidden />}
              </span>
              <input
                type="color"
                aria-label="Accent: custom colour"
                disabled={locked.accent !== undefined}
                value={typeof accent === "string" && /^#[0-9a-f]{6}$/i.test(accent) ? accent : "#000000"}
                onChange={(e) => onSet({ accent: e.currentTarget.value })}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              />
            </label>
          </div>
        </Knob>
      )}
      {shows("mode") && native && modes.includes("light") && (
        <Knob label="Mode" custom={modeCustom(values, native)} from={from} onReset={reset("mode")} locked={locked.mode}>
          <Choice label="Mode">
            {MODES.map((m) => {
              const supported = modes.includes(m.id);
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={mode === m.id}
                  tabIndex={mode === m.id || (mode === undefined && m.id === native) ? 0 : -1}
                  disabled={!supported}
                  title={supported ? undefined : "Not in this theme"}
                  // The theme's own mode is no value of the level's: picking it clears the knob.
                  onClick={() => (m.id === native ? onClear(KNOB_KEYS.mode) : onSet(modePatch(m.id, native)))}
                  className={cn(SEGMENT, mode === m.id && SEGMENT_ON)}
                >
                  {m.label}
                </button>
              );
            })}
          </Choice>
        </Knob>
      )}
      {shows("surface") && (
        <Knob label="Cards" custom={custom("surface")} from={from} onReset={reset("surface")} locked={locked.surface}>
          <Choice label="Cards">
            {SURFACES.map((s) => {
              const on = surface === s.value;
              return (
                <button
                  key={s.value || "look"}
                  type="button"
                  role="radio"
                  aria-label={s.name}
                  title={s.name}
                  aria-checked={on}
                  tabIndex={on || (s.value === "" && !SURFACES.some((x) => x.value === surface)) ? 0 : -1}
                  // The theme's own card is no value of the level's: picking it clears the knob.
                  onClick={() => (s.value === "" ? onClear(KNOB_KEYS.surface) : onSet({ surface: s.value }))}
                  className={cn(SEGMENT, on && SEGMENT_ON)}
                >
                  {s.label}
                </button>
              );
            })}
          </Choice>
        </Knob>
      )}
      {!shows("corners") ? null : corners ? (
        <Knob label="Corners" custom={corners.custom} from={from} onReset={corners.reset} locked={locked.corners}>
          <div className="flex items-center gap-3">
            <Slider label="Corners" max={24} value={corners.px} valueText={`${corners.px} px`} onChange={corners.set} className="w-28" />
            <span className="w-10 shrink-0 text-right font-ui-mono text-caption text-ui-1">{corners.px} px</span>
          </div>
        </Knob>
      ) : (
        <Knob label="Corners" custom={custom("corners")} from={from} onReset={reset("corners")} locked={locked.corners}>
          <div className="flex items-center gap-3">
            {/* -1 is the theme's corners (no value stored), so every step can be picked from it. */}
            <Slider
              label="Corners"
              min={-1}
              max={CORNER_STEPS.length - 1}
              value={corner ?? -1}
              valueText={corner === undefined ? `${from}'s` : `${CORNER_STEPS[corner]} px`}
              onChange={(step) => {
                if (step < 0) onClear(KNOB_KEYS.corners);
                else onSet({ radius: String(CORNER_STEPS[step]) });
              }}
              className="w-28"
            />
            <span className="w-14 shrink-0 text-right font-ui-mono text-caption text-ui-1">{corner === undefined ? "Theme's" : `${CORNER_STEPS[corner]} px`}</span>
          </div>
        </Knob>
      )}
      {shows("density") && (
        <Knob label="Density" custom={custom("density")} from={from} onReset={reset("density")} locked={locked.density}>
          <Choice label="Density">
            {DENSITIES.map((d) => (
              <button
                key={d.id}
                type="button"
                role="radio"
                aria-checked={density === d.id}
                tabIndex={density === d.id || (density === "custom" && d.id === "normal") ? 0 : -1}
                onClick={() => (d.id === "normal" ? onClear(KNOB_KEYS.density) : onSet(d.values))}
                className={cn(SEGMENT, density === d.id && SEGMENT_ON)}
              >
                {d.label}
              </button>
            ))}
          </Choice>
        </Knob>
      )}
      {variants.length > 0 && knobs === undefined && (
        <Knob label="Variant" custom={variantCustom(values, variants)} from={from} onReset={() => onClear(variantKeys(variants))} locked={variantLock}>
          <VariantChoice variants={variants} variant={variant} onPick={(v) => {
            // The theme's own is no value of the level's; a variant replaces the keys of the others it does not set.
            const stale = variantKeys(variants).filter((key) => !(key in v.values));
            if (stale.length > 0) onClear(stale);
            if (v.id !== "") onSet(v.values);
          }} />
        </Knob>
      )}
    </section>
  );
}

/** The Variant control: a segmented row while the choices fit the panel (`VARIANT_SEGMENTS`), else a dropdown; Custom (`variant` undefined) checks none. */
function VariantChoice({ variants, variant, onPick }: { variants: readonly ResolvedVariant[]; variant: string | undefined; onPick: (v: ResolvedVariant) => void }) {
  const all: ResolvedVariant[] = [{ id: "", name: "Theme's own", values: {} }, ...variants];
  if (all.length > VARIANT_SEGMENTS)
    return (
      <Select
        label="Variant"
        placeholder="Custom"
        className="w-40"
        options={all.map((v) => ({ value: v.id || OWN, label: v.name }))}
        value={variant === undefined ? null : variant || OWN}
        onChange={(id) => {
          const v = all.find((x) => (x.id || OWN) === id);
          if (v) onPick(v);
        }}
      />
    );
  return (
    <Choice label="Variant">
      {all.map((v) => {
        const on = variant === v.id;
        return (
          <button
            key={v.id || OWN}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on || (variant === undefined && v.id === "") ? 0 : -1}
            onClick={() => onPick(v)}
            className={cn(SEGMENT, on && SEGMENT_ON)}
          >
            {v.name}
          </button>
        );
      })}
    </Choice>
  );
}

/**
 * The knobs over a widget's theme (the inspector's Style tab and several selected zones, lazy): an edit detaches that
 * knob only (`withKnob`), Reset follows the page again (`withKnobReset`); a knob whose section the screen locks is read-only.
 */
export default function WidgetLookKnobs({ values, appearance, onSet, onClear }: Pick<LookKnobsProps, "values" | "onSet" | "onClear"> & { appearance: Appearance }) {
  const lookId = knobValue(values, "lookId");
  const locked = lockedKnobs(appearance, appearance.profileName ?? "the screen");
  const name = appearance.profileName ?? "the page";
  return <LookKnobs title={`Theme: ${lookName(lookId)} · Follows ${name}`} values={values} from={name} onSet={onSet} onClear={onClear} locked={locked} />;
}

/** The knobs over a panel widget (its inspector's Style tab, lazy): Accent only, over its panel's (L46). */
export function ItemLookKnobs({ values, panelName, appearance, onSet, onClear }: Pick<LookKnobsProps, "values" | "onSet" | "onClear"> & { panelName: string; appearance: Appearance }) {
  const locked = lockedKnobs(appearance, appearance.profileName ?? "the screen");
  return <LookKnobs title={`Theme: ${lookName(knobValue(values, "lookId"))} · Follows ${panelName}`} values={values} from={panelName} onSet={onSet} onClear={onClear} locked={locked} knobs={["accent"]} />;
}
