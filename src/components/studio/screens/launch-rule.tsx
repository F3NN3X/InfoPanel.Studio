import { Circle, CircleDot } from "lucide-react";
import type { DashboardConfig } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { launchRule, withLaunch } from "../screens-model";
import type { HistorySetter } from "@/hooks/use-config-history";

/** One of the two "When the app opens" choices. */
function LaunchChoice({
  selected,
  title,
  note,
  onSelect,
  children,
}: {
  selected: boolean;
  title: string;
  note: string;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  const Radio = selected ? CircleDot : Circle;
  return (
    <div
      className={cn(
        "flex min-w-[220px] flex-1 items-start gap-2.5 rounded-lg border px-3 py-2.5",
        selected ? "border-ui-accent/50 bg-ui-accent-soft" : "border-ui-strong"
      )}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={title}
        onClick={onSelect}
        className="mt-px rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60"
      >
        <Radio className={cn("h-[18px] w-[18px]", selected ? "text-ui-accent-text" : "text-ui-4")} />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <button type="button" onClick={onSelect} className="self-start text-left text-[12.5px] font-medium text-ui-1 outline-none">
          {title}
        </button>
        <span className="text-pretty text-[11.5px] leading-[1.4] text-ui-4">{note}</span>
        {children}
      </div>
    </div>
  );
}

interface LaunchRuleProps {
  config: DashboardConfig;
  setConfig: HistorySetter;
  windowSize: { width: number; height: number };
  /** The screen "Best fit" resolves to for the current window. */
  autoProfileId: string;
  /** The screen being edited: what "Always the same screen" starts on. */
  editedId: string;
}

/** "When the app opens" (`config.activeProfile`): the default screen. The kiosks' current screens are shown separately, as Active. */
export function LaunchRule({ config, setConfig, windowSize, autoProfileId, editedId }: LaunchRuleProps) {
  const rule = launchRule(config);
  const nameOf = (id: string) => config.profiles.find((p) => p.id === id)?.name ?? "—";
  const open = (id: string) => setConfig((c) => withLaunch(c, id));
  return (
    <div role="radiogroup" aria-label="When the app opens" className="flex flex-col gap-2 rounded-[10px] border border-ui-default bg-ui-panel p-3.5">
      <span className="text-[13px] font-medium text-ui-1">When the app opens</span>
      <div className="flex flex-wrap gap-2">
        <LaunchChoice
          selected={rule === "auto"}
          title="Best fit for the window"
          note={`Picks the screen whose size matches the kiosk window. This ${windowSize.width} × ${windowSize.height} window opens ${nameOf(autoProfileId)}.`}
          onSelect={() => open("auto")}
        />
        <LaunchChoice
          selected={rule === "fixed"}
          title="Always the same screen"
          note={rule === "fixed" ? `Always open ${nameOf(config.activeProfile)}` : "Ignore the window size."}
          onSelect={() => rule === "auto" && open(editedId)}
        >
          {rule === "fixed" && (
            <select
              aria-label="Screen to open"
              value={config.activeProfile}
              onChange={(e) => open(e.target.value)}
              className="mt-1.5 h-7 max-w-[200px] cursor-pointer rounded-md border border-ui-strong bg-ui-hover px-1.5 text-[12px] text-ui-1 outline-none focus:border-ui-accent"
            >
              {config.profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
        </LaunchChoice>
      </div>
    </div>
  );
}
