import { useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { PopoverParts } from "@/components/ui/popover";
import { Segmented } from "@/components/ui/segmented";
import { Tooltip } from "@/components/ui/tooltip";
import type { ResolvedVariant } from "@/looks/look";
import { ClaudeButton } from "./ClaudeButton";
import { overrideCount } from "./changes";
import { GridPanel } from "./GridPanel";
import { tipOf } from "./help-text";
import { LookPanel } from "./LookPanel";
import { OverridesPanel } from "./OverridesPanel";
import { PageMenu } from "./PageMenu";
import { DATA, parseSpans, type QaData, type QaState } from "./params";
import { useTally } from "./tally";

/** A top-bar button: the chrome's raised field, open while its popover is. */
export const BAR_BUTTON =
  "inline-flex h-7 items-center gap-1.5 whitespace-nowrap rounded-ui-md border border-ui-strong bg-ui-raised px-2.5 text-caption text-ui-2 hover:border-ui-hover-edge hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent data-popup-open:bg-ui-active data-popup-open:text-ui-1";

const DATA_LABEL: Record<QaData, string> = { fixtures: "Fixtures", stress: "Stress", live: "Live" };

/** The bar's popovers, by name. */
export type BarPanel = "look" | "overrides" | "grid";

interface BarPopoverProps {
  name: string;
  value?: ReactNode;
  tip: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  children: ReactNode;
}

/** One of the bar's popovers: its button (a name, then what is set) with the group's tooltip, and its panel. */
function BarPopover({ name, value, tip, open, onOpen, children }: BarPopoverProps) {
  return (
    <PopoverParts.Root open={open} onOpenChange={onOpen}>
      <Tooltip label={<span className="block max-w-72">{tip}</span>} side="bottom">
        <PopoverParts.Trigger className={BAR_BUTTON}>
          <span className={value === undefined ? "" : "text-ui-3"}>{name}</span>
          {value}
          <ChevronDown aria-hidden className="h-3.5 w-3.5 text-ui-3" strokeWidth={1.75} />
        </PopoverParts.Trigger>
      </Tooltip>
      <PopoverParts.Content align="end" className="p-3" data-qa-ui="">
        {children}
      </PopoverParts.Content>
    </PopoverParts.Root>
  );
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

interface SummaryProps {
  widgets: number;
  frames: number;
  /** Whether the theme check runs (a Look other than Classic or a skin is worn). */
  flagsChecked: boolean;
  flagged: boolean;
  onFlagged: () => void;
  onCheckAll: () => void;
}

/**
 * "76 widgets · 497 frames · 3 issues · 5 theme flags in 40 checked · Check all": the counts are of the frames checked so far
 * (frames mount as they scroll into view), so the line says how many; Check all mounts the rest. The theme flags count turns on the
 * "flagged only" filter. Every part stays in the DOM, only its text changes, so the page's settle wait is not reset by the bar.
 */
function Summary({ widgets, frames, flagsChecked, flagged, onFlagged, onCheckAll }: SummaryProps) {
  const t = useTally();
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 text-caption text-ui-3">
      <span>{plural(widgets, "widget")}</span>·<span>{plural(frames, "frame")}</span>·
      <span className={t.issues ? "font-medium text-ui-danger-text" : ""} title={t.withIssues ? `${plural(t.withIssues, "frame")} with issues` : undefined}>
        {plural(t.issues, "issue")}
      </span>
      {flagsChecked && (
        <>
          ·
          <button type="button" aria-pressed={flagged} title={tipOf("flagged")} onClick={onFlagged} className={`rounded-ui-sm underline decoration-current/40 underline-offset-2 hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-ui-accent ${t.flags ? "font-medium text-ui-warn-text" : ""} ${flagged ? "bg-ui-active px-1" : ""}`}>
            {plural(t.flags, "theme flag")}
          </button>
        </>
      )}
      <span>in {t.checked >= frames ? "every frame" : `${t.checked} checked`}</span>
      <button type="button" hidden={t.checked >= frames} title={tipOf("mountAll")} onClick={onCheckAll} className="rounded-ui-sm text-ui-2 underline decoration-current/40 underline-offset-2 hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-ui-accent">
        Check all
      </button>
    </p>
  );
}

interface TopBarProps {
  state: QaState;
  widgets: number;
  frames: number;
  looks: readonly string[];
  variants: readonly ResolvedVariant[];
  /** The worn Look's name and its variant's, for the Look button. */
  lookName?: string;
  flagsChecked: boolean;
  imported: string;
  onImport: (files: FileList) => void;
  onChange: (patch: Partial<QaState>) => void;
  onReset: () => void;
  onHelp: () => void;
  onCopyLink: () => Promise<boolean>;
  onMountAll: () => Promise<boolean>;
  /** The page's Copy for Claude text (the frames checked so far). */
  claude: () => Promise<string>;
  /**
   * The open popover, held above the page's screen (`QaScreen`): wearing the first Look wraps the page in the screen's providers,
   * which mounts the bar again, and the Look popover stays open across it.
   */
  panel: BarPanel | "";
  onPanel: (panel: BarPanel | "") => void;
}

/**
 * The top bar: the title and summary, then what the page wears (Look), what goes over every placement (Overrides), the geometry
 * (Grid), the data, Copy for Claude and the ⋯ menu. Every change goes through `onChange`, which updates the state and the URL.
 */
export function TopBar(p: TopBarProps) {
  const { state, onChange } = p;
  const [notice, setNotice] = useState("");
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const say = (text: string) => {
    setNotice(text);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNotice(""), 2000);
  };
  const variant = p.variants.find((v) => v.id === state.lookVariant)?.name ?? state.lookVariant;
  const look = state.look ? `${p.lookName ?? state.look}${state.lookVariant ? ` · ${variant}` : ""}` : "";
  const overrides = overrideCount(state);
  const sizes = parseSpans(state.spans).length;
  const pop = (panel: BarPanel) => ({ open: p.panel === panel, onOpen: (open: boolean) => p.onPanel(open ? panel : "") });
  const mountAll = async () => {
    clearTimeout(timer.current);
    setNotice("Mounting every frame…");
    say((await p.onMountAll()) ? "Every frame checked" : "The page did not settle");
  };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex min-w-0 flex-1 items-baseline gap-3">
        <h1 className="shrink-0 text-body font-semibold text-ui-1">Widget QA</h1>
        <Summary widgets={p.widgets} frames={p.frames} flagsChecked={p.flagsChecked} flagged={state.flagged} onFlagged={() => onChange({ flagged: !state.flagged })} onCheckAll={() => void mountAll()} />
        <span role="status" className="shrink-0 text-caption text-ui-2">
          {notice}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <BarPopover name={look ? "Look" : "No look"} value={look ? <span className="max-w-48 truncate text-ui-1">{look}</span> : undefined} tip={tipOf("look")} {...pop("look")}>
          <LookPanel state={state} looks={p.looks} variants={p.variants} imported={p.imported} onImport={p.onImport} onChange={onChange} />
        </BarPopover>
        <BarPopover name="Overrides" value={overrides ? <span className="rounded-ui-sm bg-ui-accent-soft px-1 font-ui-mono text-micro text-ui-accent-text">{overrides}</span> : undefined} tip="Skin, density, surface, graph and meter styles, accent, corners and raw settings, over every widget." {...pop("overrides")}>
          <OverridesPanel state={state} onChange={onChange} />
        </BarPopover>
        <BarPopover name="Grid" value={<span className="tabular-nums text-ui-1">{`${state.cell} · ${state.gap} · ${plural(sizes, "size")}`}</span>} tip="Cell size, gap, the sizes every widget is drawn at, and the grid overlay." {...pop("grid")}>
          <GridPanel state={state} onChange={onChange} />
        </BarPopover>
        <Tooltip label={<span className="block max-w-72">{tipOf("data")}</span>} side="bottom">
          <div className="flex items-center gap-1.5">
            <span className="text-caption text-ui-3">Data</span>
            <Segmented label="Data (changing it reloads the page)" options={DATA.map((d) => ({ value: d, label: DATA_LABEL[d], title: `${DATA_LABEL[d]}: reloads the page` }))} value={state.data} onChange={(data) => onChange({ data })} />
          </div>
        </Tooltip>
        <ClaudeButton text={p.claude} title="Copy the frames checked so far, with what they found, as text for Claude" className={BAR_BUTTON} />
        <PageMenu
          state={state}
          onChange={onChange}
          onReset={p.onReset}
          onHelp={p.onHelp}
          onMountAll={() => void mountAll()}
          onCopyLink={() => void p.onCopyLink().then((ok) => say(ok ? "Link copied" : "Copy failed"))}
        />
      </div>
    </div>
  );
}
