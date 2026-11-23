import { Menu } from "@base-ui/react/menu";
import { ChevronDown, MoreHorizontal, FileInput, FileOutput } from "lucide-react";
import { FOCUS_RING } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ITEM, POPUP } from "../menu-styles";

interface FileMenuProps {
  onImport: () => void;
  /** The Export & back up sheet. */
  onExportSheet: () => void;
}

/**
 * The editor's File menu (02e, Q22): Import and Export & back up. Version history has no code behind it, so it is not
 * offered (Q22).
 */
export default function FileMenu({ onImport, onExportSheet }: FileMenuProps) {
  return (
    <Menu.Root>
      <Menu.Trigger
        data-testid="file-menu"
        title="File"
        className={cn("flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-ui-md border border-ui-strong bg-ui-raised pl-3 pr-2 text-body text-ui-1 transition-colors hover:bg-ui-hover data-popup-open:bg-ui-hover max-xl:w-8 max-xl:justify-center max-xl:px-0", FOCUS_RING)}
      >
        <span className="max-xl:sr-only">File</span> <ChevronDown className="h-4 w-4 text-ui-3 max-xl:hidden" aria-hidden />
        <MoreHorizontal className="hidden h-4 w-4 text-ui-3 max-xl:block" aria-hidden />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner className="z-[80]" sideOffset={6} align="end">
          <Menu.Popup className={cn(POPUP, "w-68")}>
            <Menu.Item className={ITEM} onClick={onImport}>
              <span className="flex items-center gap-2">
                <FileInput className="h-4 w-4 text-ui-3" aria-hidden /> Import…
              </span>
            </Menu.Item>
            <Menu.Item className={ITEM} onClick={onExportSheet}>
              <span className="flex items-center gap-2">
                <FileOutput className="h-4 w-4 text-ui-3" aria-hidden /> Export &amp; back up…
              </span>
            </Menu.Item>
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  );
}
