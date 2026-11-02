import { useState } from "react";
import { Link as LinkIcon } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { DEFAULT_SERVER_PORT } from "@/lib/dashboard-server";
import { isTauri } from "@/lib/desktop";
import type { ControlDisplay, ControlKiosk } from "@/lib/control";
import { DISPLAY_NAME_MAX, isDisplayName } from "@/lib/screens/display-name";
import { kioskLink } from "@/lib/screens/kiosk-link";

/** The address kiosks reach this dashboard at: this page's own in a browser, the local server from the desktop app. */
const serverOrigin = () => (isTauri() ? `http://127.0.0.1:${DEFAULT_SERVER_PORT}` : window.location.origin);

/** Copy the link that pins a kiosk to screen `id` (or names a display); the toast says if the clipboard refused. */
export function useCopyKioskLink(): (id: string, display?: string) => void {
  const toast = useToast();
  return (id, display) => {
    const link = kioskLink(serverOrigin(), id, display);
    navigator.clipboard.writeText(link).then(
      () => toast("Kiosk link copied"),
      () => toast(`Could not copy. The link is ${link}`),
    );
  };
}

interface ShownOnProps {
  screenId: string;
  /** The app opens on this screen whatever the window size. */
  isDefault: boolean;
  /** Best fit picks this one for the window now. */
  isBestFit: boolean;
  /** The kiosks connected now. */
  kiosks: readonly ControlKiosk[];
  /** Open Settings › Dashboard › Startup screen, where the default is chosen. */
  onChangeDefault: () => void;
  /** The named displays. */
  displays: readonly ControlDisplay[];
}

/**
 * "Shown on": the default (what the app opens on) apart from the active (what kiosks show now), and the link that
 * pins a kiosk to this screen. A named display takes its screen from the Displays list instead.
 */
export function ShownOn({ screenId, isDefault, isBestFit, kiosks, onChangeDefault, displays }: ShownOnProps) {
  const copy = useCopyKioskLink();
  const [display, setDisplay] = useState("");
  const named = display !== "" && isDisplayName(display);
  const showing = kiosks.filter((k) => k.profile === screenId);
  const onDisplays = displays.filter((d) => d.shows === screenId);
  return (
    <div className="flex flex-col gap-2 text-[12.5px] text-ui-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-ui-3">Default</span>
        <span className="flex items-center gap-2">
          {isDefault ? "The app opens on it" : isBestFit ? "Best fit picks it now" : "No"}
          <button type="button" onClick={onChangeDefault} className="rounded-sm text-[11.5px] text-ui-accent-text hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent">
            Settings ↗
          </button>
        </span>
      </div>
      <div className="flex items-start justify-between gap-2">
        <span className="text-ui-3">Active</span>
        {showing.length === 0 ? (
          <span>No kiosk shows it now</span>
        ) : (
          <ul className="flex flex-col items-end">
            {showing.map((k) => (
              <li key={k.id} className="font-ui-mono text-[11.5px]">
                {k.address ?? "A kiosk"}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex items-start justify-between gap-2">
        <span className="text-ui-3">Displays</span>
        {onDisplays.length === 0 ? (
          <span>None set to it</span>
        ) : (
          <ul className="flex flex-col items-end">
            {onDisplays.map((d) => (
              <li key={d.name} className="font-ui-mono text-[11.5px]">
                {d.name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <input
        type="text"
        aria-label="Display name (optional)"
        placeholder="Display name (optional)"
        maxLength={DISPLAY_NAME_MAX}
        value={display}
        onChange={(e) => setDisplay(e.target.value)}
        className="h-7 rounded-md border border-ui-strong bg-ui-hover px-2 text-caption text-ui-1 outline-none focus:border-ui-accent"
      />
      {display !== "" && !named && <span className="text-[11.5px] text-ui-4">Use letters, digits, - and _ only.</span>}
      <button
        type="button"
        disabled={display !== "" && !named}
        onClick={() => copy(screenId, named ? display : undefined)}
        className="inline-flex h-7 items-center justify-center gap-1.5 self-start rounded-[7px] disabled:opacity-50 border border-ui-strong px-2.5 text-caption text-ui-1 hover:bg-ui-hover"
      >
        <LinkIcon className="h-3.5 w-3.5" />
        Copy kiosk link
      </button>
      <p className="text-pretty text-[11.5px] leading-[1.4] text-ui-4">
        {named
          ? "Open the link on a kiosk. Choose its screen in the Displays list on this page."
          : "Open the link on a kiosk to pin it to this screen."}{" "}
        From another device, use this PC's address in place of 127.0.0.1.
      </p>
    </div>
  );
}
