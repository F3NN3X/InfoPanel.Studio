import { FolderOpen, Plus } from "lucide-react";
import { FOCUS_RING } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface NewScreenCardProps {
  /** The New page: Blank, the templates, a size preset and every other way to start. */
  onNew: () => void;
  /** Import an .infopanel file: the import flow, with its "canvas from an .infopanel file" choice selected. */
  onImportInfoPanel: () => void;
}

/** The last card of the grid: start a screen, or bring in an .infopanel file. */
export function NewScreenCard({ onNew, onImportInfoPanel }: NewScreenCardProps) {
  return (
    <li className="flex min-h-62.5 min-w-0 flex-col items-center justify-center gap-1 rounded-ui-lg border border-dashed border-ui-strong p-4 text-center">
      <button
        type="button"
        onClick={onNew}
        aria-label="New screen: from a template, a size preset or an .infopanel file"
        className={cn("flex flex-col items-center gap-1 rounded-ui-md p-2 text-ui-1 transition-colors duration-(--ui-dur-fast) ease-ui hover:text-ui-1", FOCUS_RING)}
      >
        <span className="mb-1 grid h-10 w-10 place-items-center rounded-full bg-ui-raised text-ui-2">
          <Plus className="h-4 w-4" strokeWidth={1.5} aria-hidden />
        </span>
        <span className="text-body font-medium">New screen</span>
        <span className="max-w-52.5 text-caption text-ui-3">From a template, a size preset or an .infopanel file</span>
      </button>
      <button
        type="button"
        title="Import an InfoPanel profile (.infopanel); it opens in Edit"
        onClick={onImportInfoPanel}
        className={cn("mt-1 inline-flex h-7 items-center gap-1.5 rounded-ui-md px-2 text-caption text-ui-2 hover:bg-ui-raised hover:text-ui-1", FOCUS_RING)}
      >
        <FolderOpen className="h-3.5 w-3.5" strokeWidth={1.5} aria-hidden />
        Import .infopanel
      </button>
    </li>
  );
}
