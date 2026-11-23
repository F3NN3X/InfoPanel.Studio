import { Select as BaseSelect } from "@base-ui/react/select";
import { Check, ChevronDown } from "lucide-react";
import { MENU_ITEM, MENU_POPUP } from "@/components/ui/menu";
import { FIELD_BOX } from "@/components/ui/field";
import { cn } from "@/lib/utils";

interface SelectOption<T extends string> {
  value: T;
  label: string;
  disabled?: boolean;
}

interface SelectProps<T extends string> {
  options: SelectOption<T>[];
  value: T | null;
  onChange: (value: T) => void;
  /** Accessible name of the trigger. */
  label: string;
  /** Shown while nothing is chosen. */
  placeholder?: string;
  disabled?: boolean;
  /** Added to the trigger (a width). */
  className?: string;
}

/** The up-to-a-screenful list; a longer one scrolls inside the popup. */
const SELECT_POPUP = "max-h-(--available-height) min-w-(--anchor-width) overflow-y-auto";

/**
 * A dropdown choice on the chrome tokens: Base UI's Select, its trigger a field box and its popup the menu's card and rows.
 * For a list too long for a Segmented row (more than about 7 options). Arrow keys, Home / End, type-ahead, Enter and
 * Escape come from Base UI; the chosen row carries a check.
 */
export function Select<T extends string>({ options, value, onChange, label, placeholder, disabled, className }: SelectProps<T>) {
  return (
    <BaseSelect.Root
      value={value}
      onValueChange={(next) => next !== null && onChange(next as T)}
      items={options.map((o) => ({ value: o.value, label: o.label }))}
      disabled={disabled}
    >
      <BaseSelect.Trigger aria-label={label} className={cn(FIELD_BOX, "flex w-full items-center justify-between gap-2 text-left", className)}>
        <BaseSelect.Value placeholder={placeholder} className="min-w-0 flex-1 truncate" />
        <BaseSelect.Icon className="shrink-0 text-ui-3">
          <ChevronDown className="h-3.5 w-3.5" strokeWidth={1.75} />
        </BaseSelect.Icon>
      </BaseSelect.Trigger>
      <BaseSelect.Portal>
        <BaseSelect.Positioner className="z-80" sideOffset={4} alignItemWithTrigger={false}>
          <BaseSelect.Popup className={cn(MENU_POPUP, SELECT_POPUP)}>
            <BaseSelect.List>
              {options.map((o) => (
                <BaseSelect.Item key={o.value} value={o.value} disabled={o.disabled} className={cn(MENU_ITEM, "justify-start data-selected:text-ui-1")}>
                  <span className="w-3.5 shrink-0">
                    <BaseSelect.ItemIndicator>
                      <Check className="h-3.5 w-3.5" strokeWidth={2} />
                    </BaseSelect.ItemIndicator>
                  </span>
                  <BaseSelect.ItemText className="min-w-0 flex-1 truncate">{o.label}</BaseSelect.ItemText>
                </BaseSelect.Item>
              ))}
            </BaseSelect.List>
          </BaseSelect.Popup>
        </BaseSelect.Positioner>
      </BaseSelect.Portal>
    </BaseSelect.Root>
  );
}
