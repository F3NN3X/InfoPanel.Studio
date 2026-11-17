import { Menu } from "@base-ui/react/menu";
import { cn } from "@/lib/utils";
import { FOCUS_RING } from "@/components/ui/button";
import { ITEM, POPUP } from "../menu-styles";
import type { CardAction } from "./card-actions";

/**
 * The quiet line on a screen no display shows or is set to: "Not on a display · Show on…", which opens the same rows
 * as the screen menu's Show on.
 */
export function ShowOnHint({ rows }: { rows: readonly CardAction[] }) {
  return (
    <span onClick={(e) => e.stopPropagation()} className="contents">
      <Menu.Root>
        <Menu.Trigger className={cn("pointer-events-auto whitespace-nowrap rounded-sm text-micro text-ui-4 hover:text-ui-1", FOCUS_RING)}>Not on a display · Show on…</Menu.Trigger>
        <Menu.Portal>
          <Menu.Positioner className="z-[80]" sideOffset={4} align="start">
            <Menu.Popup className={POPUP} onClick={(e) => e.stopPropagation()}>
              {rows.map((r) => (
                <Menu.Item key={r.id} className={ITEM} disabled={r.disabled} title={r.title} onClick={r.run}>
                  <span className="flex items-center gap-2">
                    <r.icon className="h-3.5 w-3.5 text-ui-3" />
                    {r.label}
                  </span>
                </Menu.Item>
              ))}
            </Menu.Popup>
          </Menu.Positioner>
        </Menu.Portal>
      </Menu.Root>
    </span>
  );
}
