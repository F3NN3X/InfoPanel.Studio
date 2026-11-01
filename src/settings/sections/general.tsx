import { useEffect, useState } from "react";
import { ZOOMS } from "@/app-window/zoom";
import { usePreviewDataSetting } from "@/hooks/use-preview-data-setting";
import { PREVIEW_DATA_HINT, PREVIEW_DATA_OPTIONS, parsePreviewData } from "@/lib/preview-data-pref";
import { errorText, ipc } from "../ipc";
import { useStore } from "../store";
import type { BrowserKind } from "../types";
import { Button, Card, Group, Kbd, Row, Segmented, SwitchRow } from "../ui";

export function GeneralSection() {
  const { settings, save, setZoom, toast } = useStore();
  const [previewData, setPreviewData] = usePreviewDataSetting();
  const inBrowser = settings.openStudioIn !== "appWindow";
  // Read only when it matters; a failed read shows no hint rather than a wrong one.
  const [browserKind, setBrowserKind] = useState<BrowserKind>("unknown");
  useEffect(() => {
    if (settings.openStudioIn !== "defaultBrowser") return;
    let alive = true;
    ipc.defaultBrowserKind().then(
      (kind) => alive && setBrowserKind(kind),
      () => {}
    );
    return () => {
      alive = false;
    };
  }, [settings.openStudioIn]);
  return (
    <>
      <Group title="Zoom">
        <Card className="divide-y-0 pb-[18px]">
          <Row id="zoom" label="App zoom" hint="Scales the Studio and the app window. Doesn't change the kiosk." />
          <div className="flex flex-col gap-4 px-[18px]">
            <Segmented
              label="App zoom"
              mono
              stretch
              options={ZOOMS.map((z) => ({ value: z, label: `${z}%` }))}
              value={settings.zoom}
              onChange={(z) => void setZoom(z)}
            />
            <div className="flex flex-wrap gap-3.5 text-xs text-s-dim">
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <Kbd>Ctrl +</Kbd>Zoom in
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <Kbd>Ctrl −</Kbd>Zoom out
              </span>
              <span className="flex items-center gap-1.5 whitespace-nowrap">
                <Kbd>Ctrl 0</Kbd>Reset
              </span>
            </div>
          </div>
        </Card>
      </Group>

      <Group title="Setup">
        <Card>
          <Row id="run-setup" label="Run setup" hint="Checks the link to InfoPanel and its Data API again, shows your kiosk address, and can add a screen. Your screens are kept.">
            <Button onClick={() => void ipc.runSetup().catch((e) => toast(errorText(e), true))}>Run setup</Button>
          </Row>
        </Card>
      </Group>

      <Group title="Startup">
        <Card>
          <SwitchRow id="start-at-login" label="Start at login" hint="Starts in the tray so the kiosk has a server after a reboot." checked={settings.startAtLogin} onChange={(v) => void save("startAtLogin", v)} />
          <SwitchRow
            id="open-studio"
            label="Open the studio on launch"
            hint={inBrowser ? "The studio opens in your browser, so with Start at login on, every login opens a new browser window." : "Off: the app starts quietly in the tray."}
            checked={settings.openStudioOnLaunch}
            onChange={(v) => void save("openStudioOnLaunch", v)}
          />
          <SwitchRow
            id="start-server"
            label="Start the server on launch"
            hint={settings.startServer ? "The kiosk works as soon as the app is up." : "Off: start it yourself from Server. The kiosk can't connect until then."}
            checked={settings.startServer}
            onChange={(v) => void save("startServer", v)}
          />
        </Card>
      </Group>

      <Group title="Window">
        <Card>
          <SwitchRow
            id="close-to-tray"
            label="Close to tray"
            hint={settings.closeToTray ? "Closing the window keeps the server running for the kiosk." : "Closing the window quits the app and stops the kiosk server."}
            checked={settings.closeToTray}
            onChange={(v) => void save("closeToTray", v)}
          />
          <SwitchRow id="remember-bounds" label="Remember window size and position" checked={settings.rememberBounds} onChange={(v) => void save("rememberBounds", v)} />
          <Row id="studio-refresh" label="Refresh the Studio" hint="Reloads the Studio page after saving, to give back memory a long session holds. Only while the window isn't focused.">
            <select
              aria-label="Refresh the Studio"
              className="h-[30px] cursor-pointer rounded-lg border border-s-input-line bg-s-input px-2.5 text-[12.5px] text-s-t1"
              value={settings.studioRefresh}
              onChange={(e) => void save("studioRefresh", e.target.value)}
            >
              <option value="idle">When idle for 30 minutes</option>
              <option value="daily">Daily at 04:00</option>
              <option value="off">Off</option>
            </select>
          </Row>
          <Row id="release-hidden-studio" label="Release the hidden studio" hint="Closes the hidden studio's page to give back its memory; it opens again from the tray in a moment.">
            <select
              aria-label="Release the hidden studio"
              className="h-[30px] cursor-pointer rounded-lg border border-s-input-line bg-s-input px-2.5 text-[12.5px] text-s-t1"
              value={settings.releaseHiddenStudio}
              onChange={(e) => void save("releaseHiddenStudio", e.target.value)}
            >
              <option value="after1m">After 1 minute</option>
              <option value="after10m">After 10 minutes</option>
              <option value="after60m">After an hour</option>
              <option value="never">Never</option>
            </select>
          </Row>
          <SwitchRow
            id="reduce-unfocused-animation"
            label="Reduce studio animation when unfocused"
            hint="After a minute in the background the studio's canvas moves at 5 frames a second and its weather, visualisers and other effects pause; they resume as soon as you come back."
            checked={settings.reduceUnfocusedAnimation}
            onChange={(v) => void save("reduceUnfocusedAnimation", v)}
          />
          <Row
            id="open-studio-in"
            label="Open the studio in"
            hint={
              settings.openStudioIn === "defaultBrowser" && browserKind === "other"
                ? "Your default browser isn't Chromium-based, so the preview may differ slightly from InfoPanel."
                : inBrowser
                  ? "The app then runs no window of its own for the studio; Settings and the kiosk view stay in the app."
                  : "The app's own window."
            }
          >
            <select
              aria-label="Open the studio in"
              className="h-[30px] cursor-pointer rounded-lg border border-s-input-line bg-s-input px-2.5 text-[12.5px] text-s-t1"
              value={settings.openStudioIn}
              onChange={(e) => void save("openStudioIn", e.target.value)}
            >
              <option value="appWindow">App window</option>
              <option value="edgeApp">Microsoft Edge (app mode)</option>
              <option value="defaultBrowser">Default browser</option>
            </select>
          </Row>
          <Row id="preview-data" label="Design preview data" hint={PREVIEW_DATA_HINT}>
            <select
              aria-label="Design preview data"
              className="h-[30px] cursor-pointer rounded-lg border border-s-input-line bg-s-input px-2.5 text-[12.5px] text-s-t1"
              value={previewData}
              onChange={(e) => setPreviewData(parsePreviewData(e.target.value))}
            >
              {PREVIEW_DATA_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Row>
        </Card>
      </Group>
    </>
  );
}
