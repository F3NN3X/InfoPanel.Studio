import { useEffect, useState } from "react";
import { Minus, Plus, ScanLine } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { SCROLL_ROW_H, type Placement, type ProfileView } from "@/lib/layout";
import { MAX_SPACING, normalizeSpacing, profileGap, profilePadding } from "@/lib/profile-grid";
import { cn } from "@/lib/utils";
import { FIELD, InlineRow, SegmentedRow, SelectRow } from "./setting-rows";
import { GRID_PREVIEW_BOX, GRID_REFUSED, gridPreview, parseSize, sizeChoice, sizeOfChoice, sizeOptions, stepGrid } from "./inspector/profile-grid";

/** Screens › detail: the screen's size and fit, and its grid (cells and spacing). */

type UpdateProfile = (fn: (p: ProfileView) => ProfileView, key?: string) => void;

const INPUT = cn(FIELD, "h-[30px] w-full");
const HELP = "text-pretty text-[11.5px] leading-[1.4] text-ui-4";

/** A design-size pixel field: a draft that commits on Enter or blur, and only when it is a size. */
function SizeInput({ label, value, onCommit }: { label: string; value: number; onCommit: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = parseSize(draft);
    if (n !== null && n !== value) onCommit(n);
    else setDraft(String(value));
  };
  return (
    <label className="block min-w-0 flex-1 space-y-1" title="Design size (px)">
      <span className="text-[12px] text-ui-4">{label}</span>
      <input
        type="number"
        min={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
        className={cn(INPUT, "font-ui-mono")}
      />
    </label>
  );
}

/** SIZE & FIT: the design size (with "Use this window's size") and what happens when the page doesn't fit. */
export function SizeFitSection({
  profile,
  updateProfile,
  windowSize,
}: {
  profile: ProfileView;
  updateProfile: UpdateProfile;
  /** The studio window, for "Use this window's size". */
  windowSize: { width: number; height: number };
}) {
  const patch = (p: Partial<ProfileView>) => updateProfile((cur) => ({ ...cur, ...p }), `profile:${Object.keys(p).join()}`);
  const differs = profile.width !== windowSize.width || profile.height !== windowSize.height;
  return (
    <div className="space-y-3">
      <SelectRow
        label="Size preset"
        options={sizeOptions(profile.width, profile.height)}
        value={sizeChoice(profile.width, profile.height)}
        onChange={(choice) => {
          const size = sizeOfChoice(choice);
          if (size) patch(size);
        }}
      />
      <div className="flex gap-2">
        <SizeInput label="Width" value={profile.width} onCommit={(width) => patch({ width })} />
        <SizeInput label="Height" value={profile.height} onCommit={(height) => patch({ height })} />
      </div>
      <InlineRow label="Match this window">
        <button
          type="button"
          disabled={!differs}
          onClick={() => patch({ width: windowSize.width, height: windowSize.height })}
          className="flex h-[26px] items-center gap-1.5 rounded-md border border-ui-strong bg-ui-raised px-2.5 text-[11.5px] text-ui-2 hover:bg-ui-hover hover:text-ui-1 disabled:pointer-events-none disabled:opacity-40"
        >
          <ScanLine className="h-3.5 w-3.5" />
          Use {windowSize.width} × {windowSize.height}
        </button>
      </InlineRow>
      <SegmentedRow
        label="When it doesn't fit"
        options={[
          { value: "fill", label: "Fill", title: "Fill the viewport" },
          { value: "scroll", label: "Scroll" },
        ]}
        value={profile.fit}
        onChange={(fit) => patch({ fit: fit as ProfileView["fit"] })}
      />
      <p className={HELP}>
        {profile.fit === "fill"
          ? "Rows stretch so the whole grid fits the screen height."
          : `Rows stay ${SCROLL_ROW_H} px tall and the page scrolls.`}
      </p>
    </div>
  );
}

/** The profile's screen as a box of its cells, gap and padding scaled to match. Render only. */
function GridPreview({ profile }: { profile: ProfileView }) {
  const view = gridPreview(profile);
  return (
    <div
      aria-hidden
      className="flex items-center justify-center rounded-lg border border-ui-subtle bg-[#0a0a0c]"
      style={{ height: GRID_PREVIEW_BOX.height }}
    >
      <div
        data-testid="grid-preview"
        className="grid rounded-[3px] border border-ui-strong bg-ui-raised"
        style={{
          width: view.width,
          height: view.height,
          gridTemplateColumns: `repeat(${profile.cols}, minmax(0, 1fr))`,
          gridTemplateRows: `repeat(${profile.rows}, minmax(0, 1fr))`,
          gap: view.gap,
          padding: view.padding,
        }}
      >
        {Array.from({ length: profile.cols * profile.rows }, (_, i) => (
          <div key={i} className="rounded-[1px] bg-ui-accent/[.16]" />
        ))}
      </div>
    </div>
  );
}

/** A count with − and + buttons. */
function Stepper({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const button = "flex h-[28px] w-[30px] items-center justify-center text-ui-2 hover:text-ui-1 disabled:pointer-events-none disabled:opacity-35";
  return (
    <div className="min-w-0 flex-1 space-y-1.5">
      <span className="text-[12px] text-ui-3">{label}</span>
      <div role="group" aria-label={label} className="flex h-[30px] items-center rounded-[7px] border border-ui-default bg-ui-app">
        <button type="button" aria-label={`Fewer ${label.toLowerCase()}`} disabled={value <= min} onClick={() => onChange(value - 1)} className={button}>
          <Minus className="h-3.5 w-3.5" />
        </button>
        <span className="flex-1 text-center font-ui-mono text-[12.5px] text-ui-1">{value}</span>
        <button type="button" aria-label={`More ${label.toLowerCase()}`} disabled={value >= max} onClick={() => onChange(value + 1)} className={button}>
          <Plus className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/** The spacing sliders' range; the box takes up to `MAX_SPACING`. */
const SPACING_SLIDER_MAX = 64;

/** A px field and slider for the grid spacing: an empty field = the default (the placeholder, where the slider rests). */
function SpacingField({
  label,
  hint,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  hint: string;
  value: number | undefined;
  placeholder: number;
  onChange: (value: number | undefined) => void;
}) {
  return (
    <div className="space-y-2">
      <InlineRow label={label} hint={hint}>
        <input
          type="number"
          min={0}
          max={MAX_SPACING}
          value={value ?? ""}
          placeholder={`${placeholder}`}
          aria-label={`${label} (px)`}
          onChange={(e) => onChange(e.target.value === "" ? undefined : normalizeSpacing(Number(e.target.value)))}
          className={cn(FIELD, "h-[26px] w-[64px] shrink-0 px-1.5 text-right font-ui-mono text-[11.5px]")}
        />
      </InlineRow>
      <input
        type="range"
        aria-label={label}
        min={0}
        max={Math.max(SPACING_SLIDER_MAX, value ?? 0)}
        value={value ?? placeholder}
        onChange={(e) => onChange(normalizeSpacing(e.currentTarget.valueAsNumber))}
        className="m-0 block h-4 w-full cursor-pointer accent-[var(--ui-accent)]"
      />
    </div>
  );
}

/** The live preview, Columns and Rows, Gap and Edge padding. */
export function GridSection({
  profile,
  updateProfile,
  otherZones,
}: {
  profile: ProfileView;
  updateProfile: UpdateProfile;
  /** The zones of the profile's other pages, which share the grid. */
  otherZones: readonly Placement[];
}) {
  const toast = useToast();
  const patch = (p: Partial<ProfileView>) => updateProfile((cur) => ({ ...cur, ...p }), `profile:${Object.keys(p).join()}`);
  // The refusal is decided on the profile as rendered; the update then applies the same step.
  const setGrid = (axis: "cols" | "rows", value: number) => {
    const delta = value - profile[axis];
    if (delta === 0) return;
    if (stepGrid(profile, axis, delta, otherZones) === null) toast(GRID_REFUSED);
    else updateProfile((p) => stepGrid(p, axis, value - p[axis], otherZones) ?? p);
  };
  return (
    <div className="space-y-3">
      <GridPreview profile={profile} />
      <div className="flex gap-2.5">
        <Stepper label="Columns" value={profile.cols} min={2} max={24} onChange={(v) => setGrid("cols", v)} />
        <Stepper label="Rows" value={profile.rows} min={1} max={24} onChange={(v) => setGrid("rows", v)} />
      </div>
      <SpacingField
        label="Gap"
        hint="Space between zones, in px"
        value={profile.gap}
        placeholder={profileGap({ fit: profile.fit })}
        onChange={(gap) => patch({ gap })}
      />
      <SpacingField
        label="Edge padding"
        hint="Space around the grid, in px (empty: 0 for a fill kiosk page, 24 for scroll)"
        value={profile.padding}
        placeholder={profilePadding({ fit: profile.fit }, true)}
        onChange={(padding) => patch({ padding })}
      />
    </div>
  );
}
