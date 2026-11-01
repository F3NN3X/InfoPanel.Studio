import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useFound, useStore } from "./store";

/** Briefly true after `flash()`: the "Copied" label, also said through the toast's status region. */
export function useFlag(ms = 1500): [boolean, () => void] {
  const { toast } = useStore();
  const [on, setOn] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const flash = useCallback(() => {
    clearTimeout(timer.current);
    setOn(true);
    toast("Copied");
    timer.current = setTimeout(() => setOn(false), ms);
  }, [ms, toast]);
  return [on, flash];
}

type ButtonKind = "neutral" | "accent" | "green" | "quiet";

const BUTTON_KINDS: Record<ButtonKind, string> = {
  neutral: "border border-s-input-line bg-s-input text-s-t1 hover:bg-[#1c1c21]",
  accent: "border-0 bg-s-accent font-semibold text-[#0b0d14] hover:brightness-110",
  green: "border-0 bg-s-green font-semibold text-[#07130c] hover:brightness-110",
  quiet: "border-0 bg-transparent text-s-t2 hover:bg-s-nav-hover",
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
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg transition-colors disabled:cursor-default disabled:opacity-50",
        size === "md" ? "h-[34px] px-3.5 text-[13px]" : "h-8 px-3 text-[12.5px]",
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
        "relative h-[22px] w-[38px] shrink-0 cursor-pointer rounded-full border-0 p-0 transition-colors duration-150 disabled:cursor-default disabled:opacity-50",
        checked ? "bg-s-accent" : "bg-s-track-line"
      )}
    >
      <span
        className={cn(
          "absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white transition-transform duration-150",
          checked && "translate-x-4"
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
    <div role="radiogroup" aria-label={label} className={cn("flex gap-0.5 rounded-[9px] border border-s-track-line bg-s-win p-[3px]", className)}>
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
              "cursor-pointer rounded-md border-0 text-[12.5px] font-medium transition-colors",
              size === "lg" ? "h-[30px] px-3.5" : "h-[26px] px-2.5 text-xs",
              stretch && "flex-1 px-0",
              mono && "font-mono",
              on ? "bg-s-seg-on text-s-t1" : "bg-transparent text-s-muted hover:text-s-t1"
            )}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/** A group heading above a card. */
export function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="m-0 pl-0.5 text-xs font-medium text-s-muted">{title}</h2>
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
      className={cn("flex flex-wrap items-center gap-x-4 gap-y-2 px-[18px] py-3.5", found.className)}
    >
      <div className="flex min-w-[140px] flex-1 flex-col gap-[3px]">
        <span id={`${uid}-label`} className="text-[13.5px] font-medium">{label}</span>
        {hint && (
          <span id={`${uid}-hint`} role={hintAlert ? "alert" : undefined} className={cn("text-[12.5px] leading-[1.45] text-s-muted", hintClass)}>
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

const TONES = {
  green: { text: "text-s-green", tint: "bg-s-green/14", dot: "bg-s-green", halo: "shadow-[0_0_0_3px_oklch(0.78_0.16_150/0.18)]" },
  grey: { text: "text-s-dim", tint: "bg-[#6f6f79]/18", dot: "bg-s-dim", halo: "shadow-[0_0_0_3px_rgb(111_111_121/0.18)]" },
  red: { text: "text-s-red", tint: "bg-s-red/14", dot: "bg-s-red", halo: "shadow-[0_0_0_3px_oklch(0.7_0.18_25/0.18)]" },
  amber: { text: "text-s-amber", tint: "bg-s-amber/14", dot: "bg-s-amber", halo: "shadow-[0_0_0_3px_oklch(0.82_0.14_75/0.18)]" },
  blue: { text: "text-s-accent", tint: "bg-s-accent/14", dot: "bg-s-accent", halo: "shadow-[0_0_0_3px_oklch(0.72_0.15_255/0.18)]" },
} as const;

export type ToneName = keyof typeof TONES;

export const tone = (name: ToneName) => TONES[name];

/** The 44px state icon tile of the server and update cards. */
export function StateTile({ tone: name, children }: { tone: ToneName; children: ReactNode }) {
  return <div className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-xl", TONES[name].tint, TONES[name].text)}>{children}</div>;
}

/** A page's card of the status kind (server, updates, hero). */
export function HeroCard({ children, id, className }: { children: ReactNode; id?: string; className?: string }) {
  const found = useFound(id);
  return (
    <div ref={found.ref} className={cn("rounded-[14px] border border-s-card-line bg-s-card", found.className, className)}>
      {children}
    </div>
  );
}

export { Kbd } from "@/app-window/kbd";
