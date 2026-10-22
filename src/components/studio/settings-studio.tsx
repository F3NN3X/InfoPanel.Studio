import { useState } from "react";
import { useAccordionPref, useAdvancedPref, useQuickBarPref, type AccordionMode } from "./inspector/inspector-prefs";
import { useAddListDensity, useAddPreviewOnHover, useLeftPanelWidth, type AddListDensity, type LeftPanelWidth } from "./add-prefs";
import { SegmentedRow, SelectRow, ToggleRow } from "./setting-rows";
import { SettingsGroup } from "./settings-group";
import { ZOOM_STEPS } from "./studio-layout";
import { GRID_KEY, RULERS_KEY, useStorageKey, useStoredFlag } from "./use-stored-flag";
import { loadZoomPref, parseZoomPref, saveZoomPref, ZOOM_KEY, type ZoomPref } from "./zoom-pref";

const ACCORDION_MODES = [
  { value: "one" as const, label: "One open" },
  { value: "many" as const, label: "Many open" },
];

const LEFT_WIDTHS = [
  { value: "narrow" as const, label: "Narrow" },
  { value: "default" as const, label: "Default" },
  { value: "wide" as const, label: "Wide" },
];

const DENSITIES = [
  { value: "comfortable" as const, label: "Comfortable" },
  { value: "compact" as const, label: "Compact" },
];

const percent = (zoom: number): string => `${Math.round(zoom * 100)}%`;

/** The canvas zoom the Studio opens with (it remembers the one it is left at), followed across windows. */
function useZoomPref(): [ZoomPref, (pref: ZoomPref) => void] {
  const [pref, setPref] = useState(loadZoomPref);
  useStorageKey(ZOOM_KEY, (raw) => setPref(parseZoomPref(raw)));
  const set = (next: ZoomPref) => {
    setPref(next);
    saveZoomPref(next);
  };
  return [pref, set];
}

/**
 * Settings › Studio (SPEC §10.1), in the Settings window: the editor's preferences, saved with the Studio on this
 * device (the studio.* keys of localStorage, which the Studio window follows as they change). Nothing here is in the
 * config.
 */
export function SettingsStudio() {
  const [quickBar, setQuickBar] = useQuickBarPref();
  const [accordion, setAccordion] = useAccordionPref();
  const [advanced, setAdvanced] = useAdvancedPref();
  const [{ fitting, manual: zoom }, setZoomPref] = useZoomPref();
  const [showGrid, setShowGrid] = useStoredFlag(GRID_KEY, true);
  const [showRulers, setShowRulers] = useStoredFlag(RULERS_KEY, true);
  const [leftWidth, setLeftWidth] = useLeftPanelWidth();
  const [density, setDensity] = useAddListDensity();
  const [previewOnHover, setPreviewOnHover] = useAddPreviewOnHover();
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
      <ToggleRow label="Advanced settings" hint="Show every inspector setting, including ones the theme controls" value={advanced} onChange={setAdvanced} />
      <SelectRow
        label="Default zoom"
        hint="How the canvas opens: fitted to the window, or at a zoom. The zoom you leave the canvas at is kept."
        options={[{ value: "fit", label: "Fit" }, ...steps.map((s) => ({ value: String(s), label: percent(s) }))]}
        value={current}
        onChange={(v) => setZoomPref(v === "fit" ? { fitting: true, manual: zoom } : { fitting: false, manual: Number(v) })}
      />
      <ToggleRow label="Show grid" value={showGrid} onChange={setShowGrid} />
      <ToggleRow label="Show rulers" value={showRulers} onChange={setShowRulers} />
      <SegmentedRow
        label="Left panel width"
        hint="Design's left panel, Layers and Add"
        options={LEFT_WIDTHS}
        value={leftWidth}
        onChange={(v) => setLeftWidth(v as LeftPanelWidth)}
      />
      <SegmentedRow
        label="Widget list"
        hint="Compact hides the one-line description."
        options={DENSITIES}
        value={density}
        onChange={(v) => setDensity(v as AddListDensity)}
      />
      <ToggleRow
        label="Preview on hover"
        hint="The preview always shows while browsing with the arrow keys."
        value={previewOnHover}
        onChange={setPreviewOnHover}
      />
    </SettingsGroup>
  );
}
