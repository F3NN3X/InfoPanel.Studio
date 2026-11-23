import { useId, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { selectedLabel } from "@/components/studio/selected-label";
import { useFound } from "./found";

/*
 * The settings pages' controls and rows. They take nothing from the store, so the Settings page in a browser tab (which
 * has no store, and must not load the desktop bridge) draws its Dashboard and Studio pages with them too. `ui.tsx`
 * re-exports them for the sections.
 */

type ButtonKind = "neutral" | "accent" | "green" | "quiet" | "danger";

const BUTTON_KINDS: Record<ButtonKind, string> = {
  neutral: "border border-s-input-line bg-s-input text-s-t1 hover:bg-s-divider",
  accent: "border-0 bg-s-strong font-medium text-s-on-accent hover:bg-white",
  green: "border-0 bg-s-green font-medium text-s-on-green hover:brightness-110",
  quiet: "border-0 bg-transparent text-s-t2 hover:bg-s-nav-hover",
  danger: "border border-s-input-line bg-s-input text-s-red hover:bg-s-divider",
};

interface ButtonProps {
  kind?: ButtonKind;
  /** `sm` is the 28-32px in-card button, `md` the 34px status-card one. */
  size?: "sm" | "md";
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
  children: ReactNode;
  className?: string;
}

export function Button({ kind = "neutral", size = "sm", disabled, onClick, title, children, className }: ButtonProps) {
  return (
    <button
      type="button"
      title={title}
      aria-description={title}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg transition-colors disabled:cursor-default disabled:opacity-50",
        size === "md" ? "h-(--ui-h-field) px-3.5 text-body" : "h-8 px-3 text-caption",
        BUTTON_KINDS[kind],
        className
      )}
    >
      {children}
    </button>
  );
}

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

/** The 38x22 switch (SPEC 4). */
export function Switch({ checked, onChange, label, disabled }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        "relative h-5.5 w-9.5 shrink-0 cursor-pointer rounded-full border-0 p-0 transition-colors duration-150 disabled:cursor-default disabled:opacity-50",
        "forced-colors:forced-color-adjust-none forced-colors:border forced-colors:border-[color:ButtonText] forced-colors:bg-[color:Canvas] disabled:forced-colors:border-[color:GrayText]",
        checked ? "bg-s-strong forced-colors:border-[color:Highlight] forced-colors:bg-[color:Highlight]" : "bg-s-track-line"
      )}
    >
      <span
        className={cn(
          "absolute left-0.75 top-0.75 h-4 w-4 rounded-full bg-s-t1 transition-transform duration-150",
          "forced-colors:bg-[color:ButtonText]",
          checked && "translate-x-4 bg-s-on-accent forced-colors:bg-[color:HighlightText]"
        )}
      />
    </button>
  );
}

/** Roving tabindex and arrow keys for the radio buttons of a group (the parent holds only them). */
export function radioProps<T>(values: T[], value: T, mine: T, onChange: (v: T) => void) {
  return {
    tabIndex: mine === value ? 0 : -1,
    onKeyDown: (e: KeyboardEvent<HTMLElement>) => {
      const step = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
      if (!step) return;
      e.preventDefault();
      const next = (values.indexOf(value) + step + values.length) % values.length;
      onChange(values[next]);
      e.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[role=radio]")[next]?.focus();
    },
  };
}

interface SegmentedProps<T extends string | number> {
  options: { value: T; label: ReactNode }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
  mono?: boolean;
  /** Spread the buttons over the whole width. */
  stretch?: boolean;
  /** `lg` is the 28-30px control of the settings rows, `sm` the 26px filters. */
  size?: "sm" | "lg";
  className?: string;
}

/** A radiogroup: the track with the active segment lit; arrow keys move the choice. */
export function Segmented<T extends string | number>({ options, value, onChange, label, mono, stretch, size = "lg", className }: SegmentedProps<T>) {
  const move = (e: KeyboardEvent, step: number) => {
    const i = options.findIndex((o) => o.value === value);
    const next = options[(i + step + options.length) % options.length];
    e.preventDefault();
    onChange(next.value);
    const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role=radio]");
    buttons?.[options.indexOf(next)]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className={cn("flex gap-0.5 rounded-ui-menu border border-s-track-line bg-s-win p-0.75", className)}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") move(e, 1);
              else if (e.key === "ArrowLeft" || e.key === "ArrowUp") move(e, -1);
            }}
            className={cn(
              "cursor-pointer rounded-md border-0 text-caption font-medium transition-colors",
              size === "lg" ? "h-7.5 px-3.5" : "h-6.5 px-2.5 text-caption",
              stretch && "flex-1 px-0",
              mono && "font-mono",
              on ? "bg-s-seg-on text-s-t1 forced-colors:forced-color-adjust-none forced-colors:bg-[color:Highlight] forced-colors:text-[color:HighlightText]" : "bg-transparent text-s-muted hover:text-s-t1"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A group heading above a card; `navSection` is the name a jump from search or a link scrolls to (`data-nav-section`). */
export function Group({ title, navSection, children }: { title: string; navSection?: string; children: ReactNode }) {
  return (
    <section data-nav-section={navSection} className="flex flex-col gap-2.5">
      <h2 className="m-0 pl-0.5 text-caption font-medium text-s-muted">{title}</h2>
      {children}
    </section>
  );
}

/** The rounded card rows sit in; dividers go between them. */
export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  const found = useFound(id);
  return (
    <div
      ref={found.ref}
      className={cn("divide-y divide-s-divider overflow-hidden rounded-xl border border-s-card-line bg-s-card", found.className, className)}
    >
      {children}
    </div>
  );
}

interface RowProps {
  /** The id search jumps to. */
  id?: string;
  label: string;
  hint?: ReactNode;
  hintClass?: string;
  /** The hint is a rejection: announced when it appears. */
  hintAlert?: boolean;
  /** The control, on the right. */
  children?: ReactNode;
}

/** Label and hint on the left, the control on the right. */
export function Row({ id, label, hint, hintClass, hintAlert, children }: RowProps) {
  const found = useFound(id);
  const uid = useId();
  return (
    <div
      ref={found.ref}
      role="group"
      aria-labelledby={`${uid}-label`}
      aria-describedby={hint ? `${uid}-hint` : undefined}
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-4.5 py-3.5", found.className)}
    >
      <div className="flex min-w-35 flex-1 flex-col gap-0.75">
        {/* Clicking the label works the row's control, as a <label for> would. The control is passed as children and has no id to point at. */}
        <span
          id={`${uid}-label`}
          className="text-body font-medium"
          onClick={(e) => {
            const control = e.currentTarget.closest<HTMLElement>('[role="group"]')?.querySelector<HTMLElement>('[role="switch"],input:not([type="hidden"]),select,textarea,button:not([disabled])');
            if (!control) return;
            if (control instanceof HTMLInputElement || control instanceof HTMLSelectElement || control instanceof HTMLTextAreaElement) control.focus();
            else control.click();
          }}
        >
          {label}
        </span>
        {hint && (
          <span id={`${uid}-hint`} role={hintAlert ? "alert" : undefined} className={cn("text-caption leading-[1.45] text-s-muted", hintClass)}>
            {hint}
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

/** A row with a switch. */
export function SwitchRow({ id, label, hint, checked, onChange, disabled }: Omit<RowProps, "children"> & SwitchProps) {
  return (
    <Row id={id} label={label} hint={hint}>
      <Switch checked={checked} onChange={onChange} label={label} disabled={disabled} />
    </Row>
  );
}

/** A row with a native select. */
export function SelectRow({ id, label, hint, options, value, onChange }: Omit<RowProps, "children"> & { options: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return (
    <Row id={id} label={label} hint={hint}>
      <select
        aria-label={label}
        title={selectedLabel(options, value)}
        className="h-7.5 max-w-full cursor-pointer rounded-lg border border-s-input-line bg-s-input px-2.5 text-caption text-s-t1"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Row>
  );
}

interface PageColumnProps {
  title: string;
  subtitle: string;
  /** A page that needs the room (a table, a log) lets its body use the whole column. */
  wide?: boolean;
  children: ReactNode;
}

/**
 * A page's title, subtitle and body. Every page has the same 1040px column and its title at the column's left edge,
 * so a page never moves when it is switched to; a page that is not wide keeps its body at 780px, to the left of it.
 */
export function PageColumn({ title, subtitle, wide, children }: PageColumnProps) {
  return (
    <div className="mx-auto flex w-full min-w-0 max-w-260 flex-col gap-7 px-8 pb-20 pt-8 max-sm:px-4">
      <div className="flex max-w-195 flex-col gap-1.5">
        <h1 className="m-0 text-display font-medium">{title}</h1>
        <p className="m-0 text-pretty text-body leading-normal text-s-muted">{subtitle}</p>
      </div>
      <div className={cn("flex min-w-0 flex-col gap-7", !wide && "max-w-195")}>{children}</div>
    </div>
  );
}
