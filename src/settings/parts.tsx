import type { KeyboardEvent, ReactNode } from "react";
import { SelectField } from "@/components/ui/field";
import { Segmented as UiSegmented } from "@/components/ui/segmented";
import { SettingCard, SettingRow } from "@/components/ui/setting-row";
import { Toggle } from "@/components/ui/toggle";
import { cn } from "@/lib/utils";
import { useFound } from "./found";

/*
 * What the settings pages add to the shared controls in components/ui: the row and card that search can jump to, the
 * switch and select rows, the group heading and the page column. They take nothing from the store, so the Settings page
 * in a browser tab (which has no store, and must not load the desktop bridge) draws its Dashboard and Studio pages with
 * them too. `ui.tsx` re-exports them for the sections.
 */

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
  className?: string;
}

/**
 * P5-merge: `ui/Segmented` takes string values only; the settings' options include numbers (rotation, panel counts) and
 * two want a mono face or the whole width. This turns values to strings and back and adds the two as classes. It goes
 * once `ui/Segmented` takes `string | number` and those two props.
 */
export function Segmented<T extends string | number>({ options, value, onChange, label, mono, stretch, className }: SegmentedProps<T>) {
  return (
    <UiSegmented
      label={label}
      options={options.map((o) => ({ value: String(o.value), label: o.label }))}
      value={String(value)}
      onChange={(v) => onChange(options.find((o) => String(o.value) === v)?.value ?? options[0].value)}
      className={cn(mono && "font-mono", stretch && "[&>button]:flex-1", className)}
    />
  );
}

/** A group heading above a card; `navSection` is the name a jump from search or a link scrolls to (`data-nav-section`). */
export function Group({ title, navSection, children }: { title: string; navSection?: string; children: ReactNode }) {
  return (
    <section data-nav-section={navSection} className="flex flex-col gap-2.5">
      <h2 className="m-0 pl-0.5 text-caption font-medium text-ui-hint">{title}</h2>
      {children}
    </section>
  );
}

/** The card rows sit in; `id` is what search jumps to. */
export function Card({ children, className, id }: { children: ReactNode; className?: string; id?: string }) {
  const found = useFound(id);
  return (
    <SettingCard ref={found.ref} className={cn(found.className, className)}>
      {children}
    </SettingCard>
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

/** Label and hint on the left, the control on the right: a card row that search can jump to. */
export function Row({ id, children, ...props }: RowProps) {
  const found = useFound(id);
  return (
    <SettingRow card ref={found.ref} className={found.className} {...props}>
      {children}
    </SettingRow>
  );
}

/** A row with a switch. */
export function SwitchRow({ checked, onChange, disabled, ...props }: Omit<RowProps, "children"> & { checked: boolean; onChange: (checked: boolean) => void; disabled?: boolean }) {
  return (
    <Row {...props}>
      <Toggle checked={checked} onChange={onChange} label={props.label} disabled={disabled} />
    </Row>
  );
}

/** A row with a native select. */
export function SelectRow({ id, label, hint, options, value, onChange }: Omit<RowProps, "children"> & { options: { value: string; label: string }[]; value: string; onChange: (value: string) => void }) {
  return (
    <Row id={id} label={label} hint={hint}>
      <SelectField aria-label={label} options={options} value={value} onChange={(e) => onChange(e.target.value)} />
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
        <p className="m-0 text-pretty text-body leading-normal text-ui-hint">{subtitle}</p>
      </div>
      <div className={cn("flex min-w-0 flex-col gap-7", !wide && "max-w-195")}>{children}</div>
    </div>
  );
}
