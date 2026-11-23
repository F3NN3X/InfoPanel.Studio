import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "./button";

/**
 * A field's box: 32 px on the panel colour, a control border that turns accent with the cursor in it, and the shared 2 px
 * focus ring. No `outline-none`: it sets the outline style to none, and the ring would draw nothing.
 */
export const FIELD_BOX = cn(
  "h-8 rounded-ui-md border border-ui-control bg-ui-chrome px-3 text-body text-ui-1 transition-colors duration-(--ui-dur-fast) ease-ui placeholder:text-ui-disabled focus:border-ui-accent disabled:opacity-40 aria-invalid:border-ui-danger",
  FOCUS_RING,
);

interface FieldProps extends InputHTMLAttributes<HTMLInputElement> {
  /** A value (a reading, an address, a size): Geist Mono with tabular figures. */
  mono?: boolean;
}

/** The chrome's text field; the caller names it (`aria-label` or a `<label>`). */
export function Field({ mono, className, ...props }: FieldProps) {
  return <input type="text" spellCheck={false} className={cn(FIELD_BOX, mono && "font-ui-mono tabular-nums", className)} {...props} />;
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly { value: string; label: string }[];
}

/** The chrome's native select, in the field's box; the caller names it. Its hover text is the whole selected label, since the box can cut it. */
export function SelectField({ options, className, ...props }: SelectFieldProps) {
  return (
    <select title={options.find((o) => o.value === props.value)?.label} className={cn(FIELD_BOX, "max-w-full cursor-pointer px-2.5 text-caption", className)} {...props}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
