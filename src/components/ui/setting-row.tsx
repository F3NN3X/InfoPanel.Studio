import { useId, type ComponentProps, type MouseEvent, type ReactNode } from "react";
import { PopoverParts } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Button, FOCUS_RING } from "./button";

interface InheritDotProps {
  /** The level above ("Perf heavy"): a hollow dot follows it. */
  from: string;
  /** The value is set here: the dot is filled and clicking it offers Reset. */
  set?: boolean;
  onReset?: () => void;
}

/** The 7 px dot before a setting's label. Hollow follows the level above; filled accent is set here. */
export function InheritDot({ from, set, onReset }: InheritDotProps) {
  if (!set || !onReset) return <span role="img" aria-label={`From ${from}`} title={`From ${from}`} className="h-1.75 w-1.75 shrink-0 rounded-full border border-ui-hint" />;
  return (
    <PopoverParts.Root>
      <PopoverParts.Trigger aria-label={`Set here, reset to ${from}`} title={`Set here, reset to ${from}`} className={cn("relative h-1.75 w-1.75 shrink-0 rounded-full bg-ui-accent after:absolute after:-inset-1.5 after:content-['']", FOCUS_RING)} />
      <PopoverParts.Content className="flex items-center gap-2 p-1 pl-3 text-caption text-ui-3">
        From {from}
        <PopoverParts.Close render={<Button small variant="ghost" onClick={onReset} />}>Reset</PopoverParts.Close>
      </PopoverParts.Content>
    </PopoverParts.Root>
  );
}

interface SettingRowProps extends Omit<ComponentProps<"div">, "children" | "className"> {
  label: ReactNode;
  /** The inheritance dot, when the setting has a level above. */
  dot?: ReactNode;
  /** A line of help under the label. */
  hint?: ReactNode;
  hintClass?: string;
  /** The hint is a rejection: announced when it appears. */
  hintAlert?: boolean;
  /**
   * A row of a settings page's card: roomier, the label may wrap and the control drops under it in a narrow window, and
   * the row is a labelled group whose label, when clicked, works the control (as a `<label for>` would).
   */
  card?: boolean;
  children?: ReactNode;
  className?: string;
}

/** Works the control of the row a label sits in: focus a field, click a switch or button. */
function workControl(e: MouseEvent<HTMLElement>) {
  const control = e.currentTarget.closest<HTMLElement>('[role="group"]')?.querySelector<HTMLElement>('[role="switch"],input:not([type="hidden"]),select,textarea,button:not([disabled])');
  if (!control) return;
  if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) control.focus();
  else control.click();
}

/** A setting: label left, control right, at least 36 px high. */
export function SettingRow({ label, dot, hint, hintClass, hintAlert, card, children, className, ...props }: SettingRowProps) {
  const uid = useId();
  return (
    <div
      {...(card ? { role: "group", "aria-labelledby": `${uid}-label`, "aria-describedby": hint ? `${uid}-hint` : undefined } : {})}
      className={cn("flex min-h-9 items-center gap-3", card && "flex-wrap gap-x-4 gap-y-2 px-4.5 py-3.5", className)}
      {...props}
    >
      {dot}
      <div className={cn("min-w-0 flex-1", (card || hint) && "flex flex-col gap-0.75", card && "min-w-35")}>
        <span id={`${uid}-label`} onClick={card ? workControl : undefined} className={cn("text-body text-ui-2", card ? "font-medium text-ui-1" : "truncate")}>
          {label}
        </span>
        {hint && (
          <span id={`${uid}-hint`} role={hintAlert ? "alert" : undefined} className={cn("text-caption leading-[1.45] text-ui-hint", hintClass)}>
            {hint}
          </span>
        )}
      </div>
      {/* A card row's controls are the row's own flex items, so each wraps under the label on its own. */}
      {card ? children : children && <div className="flex shrink-0 items-center gap-2">{children}</div>}
    </div>
  );
}

/** The rounded card a settings page's rows sit in; dividers go between them. */
export function SettingCard({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("divide-y divide-ui-hover overflow-hidden rounded-xl border border-ui-subtle bg-ui-panel", className)} {...props} />;
}

