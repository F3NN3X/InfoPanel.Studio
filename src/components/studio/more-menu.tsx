import { Menu } from "@/components/ui/menu";
import { FileInput, FileOutput, MoreHorizontal, Radio, Redo2, Save, Undo2 } from "lucide-react";
import type { StudioTopBarProps } from "./studio-top-bar";


/** "⋯", on a phone only (the bar has no room there for Undo / Redo and the file actions). */
export default function MoreMenu({
  onExport,
  onImport,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onLiveOpenChange,
  onSave,
}: Pick<StudioTopBarProps, "onExport" | "onImport" | "canUndo" | "canRedo" | "onUndo" | "onRedo" | "onLiveOpenChange" | "onSave">) {
  return (
    <Menu.Root>
      <Menu.Trigger
        aria-label="More actions"
        title="More actions"
        className="flex h-8 w-8 items-center justify-center rounded-ui-md text-ui-3 transition-colors hover:bg-ui-hover hover:text-ui-1 data-popup-open:bg-ui-hover data-popup-open:text-ui-1"
      >
        <MoreHorizontal className="h-4 w-4" />
      </Menu.Trigger>
      <Menu.Content className="min-w-52" sideOffset={4} align="end">
        <Menu.Item className="justify-start gap-2" disabled={!canUndo} onClick={onUndo}>
          <Undo2 className="h-3.5 w-3.5" /> Undo
        </Menu.Item>
        <Menu.Item className="justify-start gap-2" disabled={!canRedo} onClick={onRedo}>
          <Redo2 className="h-3.5 w-3.5" /> Redo
        </Menu.Item>
        <Menu.Item className="justify-start gap-2" onClick={onSave}>
          <Save className="h-3.5 w-3.5" /> Save now
        </Menu.Item>
        <Menu.Separator />
        <Menu.Item className="justify-start gap-2" onClick={() => onLiveOpenChange(true)}>
          <Radio className="h-3.5 w-3.5" /> Live control…
        </Menu.Item>
        <Menu.Item className="justify-start gap-2" onClick={onImport}>
          <FileInput className="h-3.5 w-3.5" /> Import…
        </Menu.Item>
        <Menu.Item className="justify-start gap-2" onClick={onExport}>
          <FileOutput className="h-3.5 w-3.5" /> Export &amp; back up…
        </Menu.Item>
      </Menu.Content>
    </Menu.Root>
  );
}
