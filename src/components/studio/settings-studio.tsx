import { useState } from "react";
import { usePreviewDataSetting } from "@/hooks/use-preview-data-setting";
import { PREVIEW_DATA_HINT, PREVIEW_DATA_OPTIONS, parsePreviewData } from "@/lib/preview-data-pref";
import { useAccordionPref, useAdvancedPref } from "./inspector/inspector-prefs";
import { useAddListDensity, useAddPreviewOnHover, useLeftPanelWidth } from "./add-prefs";
import { Card, Group, Row, Segmented, SelectRow, SwitchRow } from "@/settings/parts";
import { ZOOM_STEPS } from "./studio-layout";
import { GRID_KEY, RULERS_KEY, useStorageKey, useStoredFlag } from "./use-stored-flag";
import { loadZoomPref, parseZoomPref, saveZoomPref, ZOOM_KEY, type ZoomPref } from "./zoom-pref";

const ACCORDION_MODES = [
  { value: "one" as const, label: "One open" },
  { value: "many" as const, label: "Many open" },
];

const LEFT_WIDTHS = [
  { value: "narrow" as const, label: "272 px" },
  { value: "default" as const, label: "300 px" },
  { value: "wide" as const, label: "340 px" },
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
 * config. The canvas's settings, then the panels'.
 */
export function SettingsStudio() {
  const [accordion, setAccordion] = useAccordionPref();
  const [advanced, setAdvanced] = useAdvancedPref();
  const [{ fitting, manual: zoom }, setZoomPref] = useZoomPref();
  const [showGrid, setShowGrid] = useStoredFlag(GRID_KEY, true);
  const [showRulers, setShowRulers] = useStoredFlag(RULERS_KEY, false);
  const [leftWidth, setLeftWidth] = useLeftPanelWidth();
  const [density, setDensity] = useAddListDensity();
  const [previewOnHover, setPreviewOnHover] = useAddPreviewOnHover();
  const [previewData, setPreviewData] = usePreviewDataSetting();
  // A zoom that is not a step (a wheel zoom) still shows as itself.
  const steps = ZOOM_STEPS.some((s) => Math.abs(s - zoom) < 0.005) || fitting ? ZOOM_STEPS : [...ZOOM_STEPS, zoom].sort((a, b) => a - b);
  const current = fitting ? "fit" : String(steps.find((s) => Math.abs(s - zoom) < 0.005) ?? zoom);
  return (
    <>
      <Group navSection="canvas" title="Canvas">
        <Card>
          <SwitchRow label="Show grid" checked={showGrid} onChange={setShowGrid} />
          <SwitchRow label="Show rulers" checked={showRulers} onChange={setShowRulers} />
          <SelectRow
            label="Default zoom"
            hint="How the canvas opens: fitted to the window, or at a zoom. The zoom you leave the canvas at is kept."
            options={[{ value: "fit", label: "Fit" }, ...steps.map((s) => ({ value: String(s), label: percent(s) }))]}
            value={current}
            onChange={(v) => setZoomPref(v === "fit" ? { fitting: true, manual: zoom } : { fitting: false, manual: Number(v) })}
          />
          <SelectRow label="Design preview data" hint={PREVIEW_DATA_HINT} options={PREVIEW_DATA_OPTIONS} value={previewData} onChange={(v) => setPreviewData(parsePreviewData(v))} />
        </Card>
      </Group>

      <Group navSection="panels" title="Panels">
        <Card>
          <Row label="Inspector sections" hint="One open: opening a section closes the others in its tab">
            <Segmented label="Inspector sections" options={ACCORDION_MODES} value={accordion} onChange={setAccordion} />
          </Row>
          <SwitchRow label="Advanced settings" hint="Show every inspector setting, including ones the theme controls" checked={advanced} onChange={setAdvanced} />
          <Row label="Left panel width" hint="Design's left panel, Layers and Add">
            <Segmented label="Left panel width" options={LEFT_WIDTHS} value={leftWidth} onChange={setLeftWidth} />
          </Row>
          <Row label="Widget list" hint="Compact hides the one-line description">
            <Segmented label="Widget list" options={DENSITIES} value={density} onChange={setDensity} />
          </Row>
          <SwitchRow label="Preview on hover" hint="The preview always shows while browsing with the arrow keys" checked={previewOnHover} onChange={setPreviewOnHover} />
        </Card>
      </Group>
    </>
  );
}
