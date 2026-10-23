import { Minus, Plus } from "lucide-react";
import { stepZoom, ZOOMS } from "@/app-window/zoom";
import { useStore } from "../store";
import { Card, Group, Kbd, Row, Segmented, SwitchRow } from "../ui";

export function GeneralSection() {
  const { settings, save, setZoom } = useStore();
  const step = (s: -1 | 1) => void setZoom(stepZoom(settings.zoom, s));
  const stepButton = "grid h-8 w-8 cursor-pointer place-items-center rounded-lg border border-s-input-line bg-s-input text-s-t2 hover:bg-[#1c1c21] disabled:cursor-default disabled:opacity-40";
  return (
    <>
      <Group title="Zoom">
        <Card className="divide-y-0 pb-[18px]">
          <Row id="zoom" label="App zoom" hint="Scales the Studio and the app window. Doesn't change the kiosk.">
              <div className="flex items-center gap-1.5">
                <button type="button" aria-label="Zoom out" className={stepButton} disabled={settings.zoom <= ZOOMS[0]} onClick={() => step(-1)}>
                  <Minus className="h-[18px] w-[18px]" />
                </button>
                <div className="w-16 text-center font-mono text-sm font-medium" aria-live="polite">
                  {settings.zoom}%
                </div>
                <button type="button" aria-label="Zoom in" className={stepButton} disabled={settings.zoom >= ZOOMS[ZOOMS.length - 1]} onClick={() => step(1)}>
                  <Plus className="h-[18px] w-[18px]" />
                </button>
              </div>
          </Row>
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

      <Group title="Startup">
        <Card>
          <SwitchRow id="start-at-login" label="Start at login" hint="Starts in the tray so the kiosk has a server after a reboot." checked={settings.startAtLogin} onChange={(v) => void save("startAtLogin", v)} />
          <SwitchRow id="open-studio" label="Open the studio on launch" hint="Off: the app starts quietly in the tray." checked={settings.openStudioOnLaunch} onChange={(v) => void save("openStudioOnLaunch", v)} />
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
        </Card>
      </Group>
    </>
  );
}
