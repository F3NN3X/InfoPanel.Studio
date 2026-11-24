import type { ReactNode } from "react";
import { SelectField } from "@/components/ui/field";
import { Toggle } from "@/components/ui/toggle";
import { Tooltip } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { CONTROL_HELP, tipOf, type ControlId } from "./help-text";

/** A field in a top-bar popover: 28 px on the chrome tokens. */
export const BAR_FIELD = "h-7 w-full text-caption";

/** A popover's heading: what its controls go over. */
export function PanelHead({ title, line }: { title: string; line: string }) {
  return (
    <div className="mb-2 space-y-0.5">
      <p className="text-caption font-semibold text-ui-1">{title}</p>
      <p className="text-micro text-ui-3">{line}</p>
    </div>
  );
}

/**
 * One control in a popover: its UI name and the control, with the control's help as a tooltip on hover and on focus (`help-text.ts`).
 * `as="div"` for a control a label cannot name (a segmented row, swatches): the control carries its own `aria-label`.
 */
export function Row({ id, as = "label", children, className }: { id: ControlId; as?: "label" | "div"; children: ReactNode; className?: string }) {
  const Tag = as;
  return (
    <Tooltip label={<span className="block max-w-72">{tipOf(id)}</span>} side="right" sideOffset={14}>
      <Tag className={cn("grid grid-cols-[6.5rem_minmax(0,1fr)] items-center gap-2 text-caption", className)}>
        <span className="text-ui-3">{CONTROL_HELP[id].name}</span>
        {children}
      </Tag>
    </Tooltip>
  );
}

/** A native choice in the field's box; the blank option first (its label says what blank means). */
export function Pick({ id, value, options, blank, onChange, label = (o) => o }: { id: ControlId; value: string; options: readonly string[]; blank: string; onChange: (v: string) => void; label?: (o: string) => string }) {
  return (
    <Row id={id}>
      <SelectField aria-label={CONTROL_HELP[id].name} className={BAR_FIELD} value={value} onChange={(e) => onChange(e.target.value)} options={[{ value: "", label: blank }, ...options.map((o) => ({ value: o, label: label(o) }))]} />
    </Row>
  );
}

/** A labelled switch row: the chrome's switch, its name beside it (a click on the name flips it too). */
export function Switch({ id, checked, onChange }: { id: ControlId; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <Tooltip label={<span className="block max-w-72">{tipOf(id)}</span>} side="right" sideOffset={14}>
      <label className="flex cursor-pointer items-center justify-between gap-2 py-0.5 text-caption">
        <span className="text-ui-2">{CONTROL_HELP[id].name}</span>
        <Toggle checked={checked} onChange={onChange} label={CONTROL_HELP[id].name} />
      </label>
    </Tooltip>
  );
}
