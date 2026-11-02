import { useState } from "react";
import { Menu } from "@base-ui/react/menu";
import { Check, MoreHorizontal, X } from "lucide-react";
import { ICON_BUTTON, ITEM, POPUP } from "./menu-styles";

/** The panel header's "⋯": panel-wide actions. */
export function PanelMenu({ onSavePreset }: { onSavePreset: () => void }) {
  return (
    <Menu.Root>
      <Menu.Trigger className={ICON_BUTTON} title="More panel actions">
        <MoreHorizontal className="h-3 w-3" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-50" sideOffset={4} align="end">
          <Menu.Popup className={POPUP}>
            <Menu.Item
              className={ITEM}
              onClick={onSavePreset}
              title="Keep this panel (widgets, layout and look) in Library › Panels"
            >
              Save as Panel
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}

/** The inline name input of "Save as Panel" (Enter saves, Esc cancels). */
export function PresetNameInput({
  initial,
  onSave,
  onCancel,
}: {
  initial: string;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(initial);
  const trimmed = name.trim();
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={name}
        onFocus={(e) => e.target.select()}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          // Keep Esc from also stepping the studio's selection out.
          e.stopPropagation();
          if (e.key === "Enter" && trimmed) onSave(trimmed);
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Panel name"
        aria-label="Panel name"
        className="min-w-0 flex-1 rounded-md border border-ui-default bg-ui-app px-2 py-0.5 text-caption text-ui-1 placeholder:text-ui-4 outline-none focus:border-ui-accent"
      />
      <button
        type="button"
        className={ICON_BUTTON}
        disabled={!trimmed}
        onClick={() => onSave(trimmed)}
        title="Save as Panel"
      >
        <Check className="h-3 w-3" />
      </button>
      <button type="button" className={ICON_BUTTON} onClick={onCancel} title="Cancel">
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
