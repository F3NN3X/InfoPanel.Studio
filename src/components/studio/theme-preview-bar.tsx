import { useEffect, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Eye, SlidersHorizontal } from "lucide-react";
import { Button, FOCUS_RING } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";
import { Popover } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { scopeText, secondsLeft, type ScopeChoice } from "./theme-live-preview-model";
import type { LivePreview } from "./use-theme-live-preview";

interface ThemePreviewBarProps {
  live: LivePreview;
  screenName: string;
  pageName: string;
  /** Keep my background, the view's own option (remembered per screen). */
  keepBackground: boolean;
  onKeepBackground: (on: boolean) => void;
  /** Move the view's level when the bar's scope picks the screen or the page. */
  onLevel: (level: "screen" | "page") => void;
}

/** One option row of the Preview popover: its name, a line under it, and the switch. */
function OptionRow({ label, hint, checked, onChange }: { label: string; hint: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <div className="flex items-start gap-3 px-2 py-1.5">
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-body text-ui-1">{label}</span>
        <span className="text-caption text-ui-3">{hint}</span>
      </span>
      <Toggle label={label} checked={checked} onChange={onChange} className="mt-0.5" />
    </div>
  );
}

/** The kiosks' countdown, ticking once a second while they show the preview. */
function KioskCountdown({ until, children }: { until: number; children: (seconds: number) => ReactNode }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [until]);
  return <>{children(secondsLeft(until, now))}</>;
}

/**
 * The live preview's bar: what is previewed and where (announced), Previous and Next, the scope, the Preview options
 * (on hover, Keep my background, Compare, Show on the kiosks too), and Apply and Cancel. The announcement stays mounted
 * so a screen reader hears each change.
 */
export function ThemePreviewBar({ live, screenName, pageName, keepBackground, onKeepBackground, onLevel }: ThemePreviewBarProps) {
  const where = scopeText(live.choice, screenName, pageName);
  const name = live.shown?.name;
  const pick = (choice: ScopeChoice) => {
    live.setChoice(choice);
    if (choice !== "all") onLevel(choice);
  };
  return (
    <>
      <p aria-live="polite" className="sr-only">
        {name ? `Previewing ${name} on ${where}. Nothing is saved until you apply it.` : ""}
      </p>
      {name && (
        <section
          aria-label="Theme preview"
          data-theme-preview-bar
          className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-ui-lg border border-ui-accent/40 bg-ui-panel px-3 py-2 text-body"
        >
          <Eye className="h-4 w-4 shrink-0 text-ui-accent" aria-hidden />
          <span className="min-w-0 flex-1 truncate text-ui-2">
            Previewing <b className="font-medium text-ui-1">{name}</b> on {where}
          </span>
          <div role="group" aria-label="Step through themes" className="flex items-center gap-0.5">
            <IconButton label="Previous theme" onClick={() => live.step(-1)}>
              <ChevronLeft className="h-4 w-4" />
            </IconButton>
            <IconButton label="Next theme" onClick={() => live.step(1)}>
              <ChevronRight className="h-4 w-4" />
            </IconButton>
          </div>
          <Segmented
            label="Preview on"
            options={[
              { value: "all" as const, label: "All screens" },
              { value: "screen" as const, label: screenName },
              { value: "page" as const, label: `${pageName} page` },
            ]}
            value={live.choice}
            onChange={pick}
          />
          {live.kiosks &&
            (live.kioskUntil !== undefined ? (
              <span data-testid="kiosk-countdown" className="shrink-0 text-caption text-ui-3">
                <KioskCountdown until={live.kioskUntil}>{(s) => `On the kiosks · ${s} s`}</KioskCountdown>
              </span>
            ) : (
              <Button small onClick={live.kioskAgain}>
                Show on the kiosks again
              </Button>
            ))}
          <Popover
            trigger={<SlidersHorizontal className="h-4 w-4" aria-hidden />}
            triggerLabel="Preview options"
            triggerClassName={cn("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-ui-md text-ui-3 hover:bg-ui-hover hover:text-ui-1", FOCUS_RING)}
            align="end"
            className="flex w-72 flex-col gap-0.5"
          >
            <h2 className="px-2 pb-1 pt-0.5 text-caption font-medium text-ui-3">Preview</h2>
            <OptionRow label="Preview on hover" hint="Pointing at a theme shows it; moving away puts yours back." checked={live.onHover} onChange={live.setOnHover} />
            <OptionRow label="Keep my background" hint="Preview and apply without the theme's background." checked={keepBackground} onChange={onKeepBackground} />
            <OptionRow label="Compare" hint="Your theme beside the one you preview." checked={live.compare} onChange={live.setCompare} />
            <OptionRow label="Show on the kiosks too" hint="The connected screens show it for a minute. Nothing is saved." checked={live.kiosks} onChange={live.setKiosks} />
          </Popover>
          <span className="flex shrink-0 items-center gap-2">
            <Button small aria-label="Cancel" aria-keyshortcuts="Escape" onClick={live.cancel}>
              Cancel <Kbd>Esc</Kbd>
            </Button>
            <Button small variant="primary" aria-keyshortcuts="Enter" onClick={live.apply}>
              Apply
            </Button>
          </span>
        </section>
      )}
    </>
  );
}
