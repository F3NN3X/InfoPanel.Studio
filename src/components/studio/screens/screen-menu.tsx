import { useRef } from "react";
import { Menu } from "@base-ui/react/menu";
import { ArrowDown, ArrowUp, Copy, Link, MoreHorizontal, Pencil, Rocket, Share, Shuffle, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ITEM, POPUP, SEPARATOR } from "../menu-styles";

interface ScreenMenuProps {
  /** Any screen but the last one can be deleted. */
  canDelete: boolean;
  canMoveEarlier: boolean;
  canMoveLater: boolean;
  onRename: () => void;
  onDuplicate: () => void;
  onAlwaysOpen: () => void;
  /** Move in the list by this many places (the "Your order" sort). */
  onMove: (by: number) => void;
  onCopyLink: () => void;
  onExport: () => void;
  /** Opens the screen on the canvas and the Convert to InfoPanel profile dialog. */
  onConvert: () => void;
  onDelete: () => void;
}

const Row = ({ icon: Icon, children }: { icon: typeof Copy; children: string }) => (
  <span className="flex items-center gap-2">
    <Icon className="h-3.5 w-3.5 text-ui-3" />
    {children}
  </span>
);

/** The screen card's actions. */
export function ScreenMenu({ canDelete, canMoveEarlier, canMoveLater, onRename, onDuplicate, onAlwaysOpen, onMove, onCopyLink, onExport, onConvert, onDelete }: ScreenMenuProps) {
  // Rename hands the cursor to the card's name field: the menu must not take it back.
  const renaming = useRef(false);
  return (
    <Menu.Root>
      <Menu.Trigger
        title="Screen actions"
        aria-label="Screen actions"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-ui-4 hover:bg-ui-active hover:text-ui-1 data-popup-open:bg-ui-active data-popup-open:text-ui-1"
      >
        <MoreHorizontal className="h-3.5 w-3.5" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" sideOffset={4} align="end">
          <Menu.Popup
            className={POPUP}
            onClick={(e) => e.stopPropagation()}
            finalFocus={() => {
              const skip = renaming.current;
              renaming.current = false;
              return !skip;
            }}
          >
            <Menu.Item
              className={ITEM}
              onClick={() => {
                renaming.current = true;
                onRename();
              }}
            >
              <Row icon={Pencil}>Rename</Row>
            </Menu.Item>
            <Menu.Item className={ITEM} onClick={onDuplicate}>
              <Row icon={Copy}>Duplicate</Row>
            </Menu.Item>
            <Menu.Item className={ITEM} onClick={onAlwaysOpen}>
              <Row icon={Rocket}>Always open this one</Row>
            </Menu.Item>
            <Menu.Item className={ITEM} disabled={!canMoveEarlier} onClick={() => onMove(-1)}>
              <Row icon={ArrowUp}>Move earlier</Row>
            </Menu.Item>
            <Menu.Item className={ITEM} disabled={!canMoveLater} onClick={() => onMove(1)}>
              <Row icon={ArrowDown}>Move later</Row>
            </Menu.Item>
            <Menu.Item className={ITEM} onClick={onCopyLink}>
              <Row icon={Link}>Copy kiosk link</Row>
            </Menu.Item>
            <Menu.Item className={ITEM} onClick={onExport}>
              <Row icon={Share}>Export screen</Row>
            </Menu.Item>
            <Menu.Item className={ITEM} onClick={onConvert}>
              <Row icon={Shuffle}>Convert to InfoPanel profile (experimental)</Row>
            </Menu.Item>
            <Menu.Separator className={SEPARATOR} />
            <Menu.Item className={cn(ITEM, "text-ui-danger data-disabled:text-ui-5")} disabled={!canDelete} onClick={onDelete}>
              <span className="flex items-center gap-2">
                <Trash2 className="h-3.5 w-3.5" />
                Delete
              </span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
