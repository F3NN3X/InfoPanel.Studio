import { useAccordionPref, useQuickBarPref, type AccordionMode } from "./inspector/inspector-prefs";
import { LEFT_MAX_WIDTH, LEFT_MIN_WIDTH } from "./design-left-panel";
import { SegmentedRow, SelectRow, SliderRow, ToggleRow } from "./setting-rows";
import { SettingsGroup } from "./settings-group";
import { ZOOM_STEPS } from "./studio-layout";

interface SettingsStudioProps {
  /** The canvas zoom: "fit", or a factor (what the studio opens with, since the zoom is remembered). */
  fitting: boolean;
  zoom: number;
  onFit: () => void;
  onZoom: (zoom: number) => void;
  showGrid: boolean;
  onShowGrid: (on: boolean) => void;
  showRulers: boolean;
  onShowRulers: (on: boolean) => void;
  leftWidth: number;
  onLeftWidth: (width: number) => void;
}

const ACCORDION_MODES = [
  { value: "one" as const, label: "One open" },
  { value: "many" as const, label: "Many open" },
];

const percent = (zoom: number): string => `${Math.round(zoom * 100)}%`;

/**
 * Settings › Studio (SPEC §10.1): the editor's preferences, saved with the Studio on this device (the studio.* keys of
 * localStorage). Nothing here is in the config, so nothing is in the undo history.
 */
export function SettingsStudio({ fitting, zoom, onFit, onZoom, showGrid, onShowGrid, showRulers, onShowRulers, leftWidth, onLeftWidth }: SettingsStudioProps) {
  const [quickBar, setQuickBar] = useQuickBarPref();
  const [accordion, setAccordion] = useAccordionPref();
  // A zoom that is not a step (a wheel zoom) still shows as itself.
  const steps = ZOOM_STEPS.some((s) => Math.abs(s - zoom) < 0.005) || fitting ? ZOOM_STEPS : [...ZOOM_STEPS, zoom].sort((a, b) => a - b);
  const current = fitting ? "fit" : String(steps.find((s) => Math.abs(s - zoom) < 0.005) ?? zoom);
  return (
    <SettingsGroup id="editor" title="Editor" scope="Saved with the Studio on this device, not in your dashboard.">
      <ToggleRow label="Quick bar" hint="The pinned settings of the selected widget, over the canvas" value={quickBar} onChange={setQuickBar} />
      <SegmentedRow
        label="Inspector sections"
        hint="One open: opening a section closes the others in its tab"
        options={ACCORDION_MODES}
        value={accordion}
        onChange={(m) => setAccordion(m as AccordionMode)}
      />
      <SelectRow
        label="Default zoom"
        hint="How the canvas opens: fitted to the window, or at a zoom. The zoom you leave the canvas at is kept."
        options={[{ value: "fit", label: "Fit" }, ...steps.map((s) => ({ value: String(s), label: percent(s) }))]}
        value={current}
        onChange={(v) => (v === "fit" ? onFit() : onZoom(Number(v)))}
      />
      <ToggleRow label="Show grid" value={showGrid} onChange={onShowGrid} />
      <ToggleRow label="Show rulers" value={showRulers} onChange={onShowRulers} />
      <SliderRow
        label="Left panel width"
        hint="Design's left panel (Layers and Add widget); you can also drag its edge"
        value={leftWidth}
        min={LEFT_MIN_WIDTH}
        max={LEFT_MAX_WIDTH}
        step={4}
        unit="px"
        fallback={LEFT_MIN_WIDTH}
        onChange={onLeftWidth}
      />
    </SettingsGroup>
  );
}
