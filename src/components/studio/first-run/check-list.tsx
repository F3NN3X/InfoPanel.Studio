/**
 * The Data checks step's parts (SPEC §6): a check row (status, result, the fix steps and actions when it opens), the
 * groups of rows, the address bar above them and the kiosk card under them.
 */
import { useState, type ReactNode, type RefObject } from "react";
import {
  ChevronDown,
  ChevronUp,
  Circle,
  CircleCheck,
  CircleMinus,
  CircleX,
  Copy,
  Cpu,
  ExternalLink,
  Monitor,
  Music,
  Network,
  Play,
  Puzzle,
  RotateCcw,
  Thermometer,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import { cn } from "@/lib/utils";
import { CHECK_TITLES, checkingLine, type CheckAction, type CheckId, type CheckResult, type Chip, type Mode } from "./checks";
import { QrCode } from "./qr-code";

/** "**bold**" (UI names) and "`code`" (values) in the copy. */
export function Rich({ text }: { text: string }) {
  return (
    <>
      {text
        .split(/(\*\*[^*]+\*\*|`[^`]+`)/)
        .filter(Boolean)
        .map((part, i) =>
          part.startsWith("**") ? (
            <b key={i} className="font-medium text-ui-1">
              {part.slice(2, -2)}
            </b>
          ) : part.startsWith("`") ? (
            <code key={i} className="font-ui-mono text-micro text-ui-2">
              {part.slice(1, -1)}
            </code>
          ) : (
            part
          ),
        )}
    </>
  );
}

export const Spinner = ({ className }: { className?: string }) => (
  <span aria-hidden className={cn("block h-3.5 w-3.5 animate-spin rounded-full border-[1.5px] border-ui-strong border-t-ui-accent", className)} />
);

const STATUS_ICON: Record<"ok" | "warn" | "fail" | "skip" | "waiting", { icon: LucideIcon; className: string; label: string }> = {
  ok: { icon: CircleCheck, className: "text-ui-ok", label: "Passed" },
  warn: { icon: TriangleAlert, className: "text-ui-warn", label: "Warning" },
  fail: { icon: CircleX, className: "text-ui-danger", label: "Failed" },
  skip: { icon: CircleMinus, className: "text-ui-disabled", label: "Skipped" },
  waiting: { icon: Circle, className: "text-ui-edge", label: "Waiting" },
};

export function StatusIcon({ status }: { status: CheckResult["status"] }) {
  if (status === "checking") return <Spinner className="m-0.5" />;
  const { icon: Icon, className, label } = STATUS_ICON[status];
  return <Icon aria-label={label} className={cn("h-4.5 w-4.5 shrink-0", className)} strokeWidth={1.75} />;
}

/** Plugin chips shown before "n more": the hardware sources and the plugins with the most sensors. */
const CHIPS_SHOWN = 6;
const CHIP_ICON: Record<Chip["icon"], LucideIcon> = { hwinfo: Thermometer, system: Cpu, network: Network, media: Music, plugin: Puzzle };
const ACTION_ICON: Partial<Record<CheckAction["kind"], LucideIcon>> = { start: Play, show: ExternalLink, restart: RotateCcw };

function ActionButton({ action, primary, onClick, small }: { action: CheckAction; primary: boolean; onClick: () => void; small?: boolean }) {
  const Icon = ACTION_ICON[action.kind];
  return (
    <Button small variant={primary ? "primary" : "secondary"} icon={Icon && <Icon className="h-3.5 w-3.5" />} onClick={onClick} className={cn("text-caption", small && "h-6.5")}>
      {action.label}
    </Button>
  );
}

interface CheckRowProps {
  id: CheckId;
  result: CheckResult;
  address: string;
  fixed: boolean;
  /** Seconds the check has been running (shown from 1 s). */
  elapsed: number;
  narrow: boolean;
  first: boolean;
  onAction: (id: CheckId, action: CheckAction) => void;
  onAgain: (id: CheckId) => void;
  onHelp: (target: NonNullable<CheckResult["help"]>) => void;
}

export function CheckRow({ id, result, address, fixed, elapsed, narrow, first, onAction, onAgain, onHelp }: CheckRowProps) {
  const { status } = result;
  const title = CHECK_TITLES[id];
  const rich = status === "fail" || status === "warn";
  const more = !!(result.why || result.steps || result.details);
  // Failures and warnings open on their own; a person's toggle wins until the row runs again (the row's key).
  const [toggled, setToggled] = useState<boolean | null>(null);
  const open = more && (toggled ?? rich);
  const actions = result.actions ?? [];
  const line = status === "checking" ? checkingLine(id, address, elapsed * 1000) : status === "waiting" ? "Waiting" : result.result;
  const again: CheckAction = { kind: "default", label: "Check again" };
  return (
    <li className={cn("list-none", !first && "border-t border-s-divider", status === "fail" && "bg-ui-fail-row")}>
      <div
        className={cn("flex items-start gap-2.5 px-3 py-2.5", more && "cursor-pointer")}
        onClick={(e) => {
          if (!more || (e.target as HTMLElement).closest("button")) return;
          setToggled(!open);
        }}
      >
        <span className="mt-px grid h-4.5 w-4.5 shrink-0 place-items-center">
          <StatusIcon status={status} />
        </span>
        <div className="flex min-w-0 flex-1 flex-col gap-0.5">
          <div className="flex items-center gap-1.5">
            <span className={cn("text-body font-medium", status === "skip" || status === "waiting" ? "text-ui-3" : "text-ui-1")}>{title}</span>
            {fixed && status === "ok" && <span className="rounded-4 bg-ui-ok/15 px-1.25 py-px text-nano text-ui-ok">Fixed</span>}
            {status === "checking" && elapsed >= 1 && <span className="font-ui-mono text-micro text-ui-4">{elapsed} s</span>}
          </div>
          <span
            className={cn(
              "text-micro",
              status === "fail" ? "text-ui-danger" : status === "warn" ? "text-ui-warn" : status === "ok" ? "text-ui-2" : status === "checking" ? "text-ui-3" : "text-ui-4",
            )}
          >
            {line}
          </span>
          {result.chips && (
            <div className="mt-1 flex flex-wrap gap-1.5">
              {result.chips.slice(0, CHIPS_SHOWN).map((c) => {
                const Icon = CHIP_ICON[c.icon];
                const zero = c.count === 0;
                return (
                  <span
                    key={c.name}
                    className={cn("inline-flex h-5.5 items-center gap-1.5 rounded-ui-sm border bg-ui-panel px-2 text-micro", zero ? "border-ui-warn/40 text-ui-warn" : "border-ui-strong text-ui-2")}
                  >
                    <Icon className={cn("h-3 w-3", zero ? "text-ui-warn" : "text-ui-3")} />
                    {c.name}
                    <span className={cn("tabular-nums text-micro", zero ? "text-ui-warn" : "text-ui-3")}>{c.count}</span>
                  </span>
                );
              })}
              {result.chips.length > CHIPS_SHOWN && (
                <span className="inline-flex h-5.5 items-center rounded-ui-sm border border-ui-strong bg-ui-panel px-2 text-micro text-ui-3">
                  {result.chips.length - CHIPS_SHOWN} more
                </span>
              )}
            </div>
          )}
          {result.sample && <span className="mt-0.5 font-ui-mono text-micro text-ui-3">{result.sample}</span>}
        </div>
        {rich && !open && !narrow && actions[0] && <ActionButton small primary action={actions[0]} onClick={() => onAction(id, actions[0])} />}
        {more && (
          <button
            type="button"
            aria-expanded={open}
            aria-label={`${open ? "Hide" : "Show"} details: ${title}`}
            onClick={() => setToggled(!open)}
            className="grid h-6 w-6 shrink-0 place-items-center rounded-ui-sm text-ui-3 hover:bg-ui-hover hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
          >
            {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        )}
      </div>
      {open && (
        <div className="flex flex-col gap-2.5 pb-3 pl-10 pr-3">
          {result.why && (
            <p className="m-0 text-micro leading-[1.5] text-ui-2">
              <Rich text={result.why} />
            </p>
          )}
          {result.steps && (
            <div className="flex flex-col gap-1.5">
              <span className="text-micro text-ui-4">How to fix it</span>
              <ol className="m-0 flex list-none flex-col gap-1.5 p-0">
                {result.steps.map((s, i) => (
                  <li key={s} className="flex items-start gap-2 text-caption leading-[1.5] text-ui-2">
                    <span className="mt-px grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-ui-raised font-ui-mono text-micro text-ui-3">{i + 1}</span>
                    <span>
                      <Rich text={s} />
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}
          {result.tip && (
            <p className="m-0 text-micro text-ui-3">
              <Rich text={result.tip} />
            </p>
          )}
          {result.details && (
            <dl className="m-0 grid grid-cols-[140px_1fr] gap-x-3 gap-y-1 text-micro max-sm:grid-cols-[100px_1fr]">
              {result.details.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="text-ui-4">{k}</dt>
                  <dd className="m-0 min-w-0 break-words text-ui-2">
                    <Rich text={v} />
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {rich && (
            <div className="flex flex-wrap items-center gap-2">
              {actions.map((a, i) => (
                <ActionButton key={a.label} action={a} primary={i === 0} onClick={() => onAction(id, a)} />
              ))}
              <ActionButton action={again} primary={actions.length === 0} onClick={() => onAgain(id)} />
              {result.help && (
                <button type="button" onClick={() => result.help && onHelp(result.help)} className="rounded-sm text-caption text-ui-accent-text hover:underline">
                  Help: {result.help.label} ↗
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function CheckGroup({ title, note, children }: { title: string; note: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-1.5">
      <div className="flex items-baseline gap-2">
        <h2 className="m-0 text-caption font-medium text-ui-1">{title}</h2>
        <span className="text-micro text-ui-4">{note}</span>
      </div>
      <ul className="m-0 overflow-hidden rounded-ui-menu border border-ui-subtle bg-ui-panel p-0">{children}</ul>
    </section>
  );
}

interface AddressBarProps {
  mode: Mode;
  address: string;
  invalid: boolean;
  onMode: (mode: Mode) => void;
  onAddress: (address: string) => void;
  onDefault: () => void;
  isDefault: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function AddressBar({ mode, address, invalid, onMode, onAddress, onDefault, isDefault, inputRef }: AddressBarProps) {
  const modes: { value: Mode; label: string; icon: LucideIcon }[] = [
    { value: "local", label: "This PC", icon: Monitor },
    { value: "remote", label: "Another PC", icon: Network },
  ];
  return (
    <div className="flex flex-col gap-2.5 rounded-ui-menu border border-ui-subtle bg-ui-panel p-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <span className="w-29.5 shrink-0 text-caption text-ui-2">InfoPanel runs on</span>
        <Segmented
          label="InfoPanel runs on"
          value={mode}
          onChange={onMode}
          options={modes.map((m) => ({
            value: m.value,
            label: (
              <span className="flex items-center gap-1.5">
                <m.icon className="h-3.5 w-3.5" />
                {m.label}
              </span>
            ),
          }))}
        />
        <span className="text-micro text-ui-4">{mode === "local" ? "Studio can also read InfoPanel’s settings" : "Only the connection checks run"}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <label htmlFor="first-run-address" className="w-29.5 shrink-0 text-caption text-ui-2">
          Data API address
        </label>
        <div className={cn("flex h-7.5 min-w-0 max-w-95 flex-1 items-center gap-2 rounded-ui-md border bg-ui-app px-2.5", invalid ? "border-ui-error-edge" : "border-ui-default focus-within:border-ui-accent")}>
          <Network className="h-3.5 w-3.5 shrink-0 text-ui-4" />
          <input
            id="first-run-address"
            ref={inputRef}
            value={address}
            spellCheck={false}
            aria-invalid={invalid}
            placeholder="http://192.168.1.40:3921"
            onChange={(e) => onAddress(e.target.value)}
            className="h-full min-w-0 flex-1 bg-transparent font-ui-mono text-caption text-ui-1 outline-none placeholder:text-ui-hint focus-visible:shadow-none"
          />
        </div>
        {!isDefault && (
          <button type="button" onClick={onDefault} className="rounded-sm text-caption text-ui-accent-text hover:underline">
            Use default
          </button>
        )}
      </div>
    </div>
  );
}

interface KioskCardProps {
  url: string;
  local: string;
  onCopy: () => void;
  onOpen: () => void;
}

export function KioskCard({ url, local, onCopy, onOpen }: KioskCardProps) {
  return (
    <div className="flex items-start gap-4 rounded-ui-menu border border-ui-subtle bg-ui-panel p-3 max-sm:flex-col">
      <div className="shrink-0 rounded-ui-sm bg-white p-1.5">
        <QrCode text={url} size={80} />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <span className="text-body font-medium text-ui-1">Open your dashboard on a panel or another device</span>
        <span className="text-micro leading-[1.45] text-ui-3">
          Point the panel’s browser, a tablet or a phone on the same network at this address, or scan the code. Panels plugged into this PC can use the local address.
        </span>
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex h-7 min-w-0 max-w-full items-center truncate rounded-ui-md border border-ui-default bg-ui-app px-2.5 font-ui-mono text-micro text-ui-1">{url}</span>
          <Button small icon={<Copy className="h-3.5 w-3.5" />} onClick={onCopy} className="text-caption">
            Copy
          </Button>
          <Button small icon={<ExternalLink className="h-3.5 w-3.5" />} onClick={onOpen} className="text-caption">
            Open in browser
          </Button>
        </div>
        <span className="text-micro text-ui-4">On this PC: {local}</span>
      </div>
    </div>
  );
}

