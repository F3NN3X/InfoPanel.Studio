import { useEffect, useState } from "react";
import { BadgeCheck, CircleAlert, Download, RefreshCw, RotateCw, Sparkles, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { errorText, ipc } from "../ipc";
import { updateCard, type UpdateAction, type UpdateIcon } from "../model/cards";
import { useStore } from "../store";
import type { Channel } from "../types";
import { Button, Card, HeroCard, Row, Segmented, StateTile, SwitchRow } from "../ui";

const ICONS: Record<UpdateIcon, LucideIcon> = {
  verified: BadgeCheck,
  checking: RefreshCw,
  available: Sparkles,
  downloading: Download,
  ready: RotateCw,
  error: CircleAlert,
};

/** Re-renders every `ms`, for "checked 4 min ago". */
function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
}

export function UpdatesSection() {
  const { update, setUpdate, settings, save, go, toast } = useStore();
  const now = useNow(30_000);
  const card = updateCard(update, now);
  const Icon = ICONS[card.icon];

  const run = async (action: UpdateAction) => {
    try {
      if (action === "install") return await ipc.installUpdate();
      const next = { check: ipc.checkForUpdate, download: ipc.downloadUpdate, cancel: ipc.cancelUpdate }[action];
      setUpdate(await next());
    } catch (e) {
      toast(errorText(e), true);
    }
  };

  return (
    <>
      <HeroCard id="update-card" className="flex flex-wrap items-center gap-4 p-5">
        <StateTile tone={card.tone}>
          <Icon className={cn("h-6 w-6", card.icon === "checking" && "animate-spin")} />
        </StateTile>
        <div className="flex min-w-[140px] flex-1 flex-col gap-[3px]">
          <span className="text-base font-semibold">{card.title}</span>
          <span className="text-[12.5px] text-s-muted">{card.detail}</span>
          {card.progress !== null && (
            <div role="progressbar" aria-valuenow={Math.round(card.progress * 100)} aria-valuemin={0} aria-valuemax={100} className="mt-1.5 h-1 max-w-[280px] overflow-hidden rounded-sm bg-s-track-line">
              <div className="h-full bg-s-accent" style={{ width: `${card.progress * 100}%` }} />
            </div>
          )}
        </div>
        <div className="flex gap-2">
          <Button size="md" onClick={() => go("changelog")}>
            What's new
          </Button>
          <Button kind={card.primary.kind} size="md" disabled={card.primary.disabled} onClick={() => void run(card.primary.action)}>
            {card.primary.label}
          </Button>
        </div>
      </HeroCard>

      <Card>
        <Row id="channel" label="Release channel" hint="Beta gets features a few weeks early.">
          <Segmented<Channel>
            label="Release channel"
            options={[
              { value: "stable", label: "Stable" },
              { value: "beta", label: "Beta" },
            ]}
            value={settings.updateChannel}
            onChange={(v) => void save("updateChannel", v)}
          />
        </Row>
        <SwitchRow id="check-updates" label="Check for updates at startup" checked={settings.checkForUpdates} onChange={(v) => void save("checkForUpdates", v)} />
        <SwitchRow
          id="auto-download"
          label="Download in the background"
          hint="Installs on the next restart. The kiosk is down for a few seconds."
          checked={settings.autoDownload}
          onChange={(v) => void save("autoDownload", v)}
        />
      </Card>
    </>
  );
}
