import { LayoutDashboard } from "lucide-react";

interface EmptyLayoutCardProps {
  /** Open the Add tab. */
  onBrowse: () => void;
  /** Import an .infopanel file onto this page. */
  onImport: () => void;
  /** Load the shipped sample layout into this profile. */
  onUseSample: () => void;
}

/** The card over an empty page (Edit v3 SPEC §15): Add, Import .infopanel, and the sample layout. */
export function EmptyLayoutCard({ onBrowse, onImport, onUseSample }: EmptyLayoutCardProps) {
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
      <div className="flex max-w-85 flex-col items-center gap-2.5 rounded-xl border border-ui-default bg-ui-panel px-7 py-6 text-center font-ui">
        <LayoutDashboard className="h-7 w-7 text-ui-hint" strokeWidth={1.5} />
        <div className="text-lead font-medium text-ui-1">Drop widgets or InfoPanel items here</div>
        <div className="pointer-events-auto mt-1.5 flex gap-2">
          <button
            type="button"
            onClick={onBrowse}
            className="h-7.5 rounded-7 bg-ui-inverse px-3 text-caption font-medium text-ui-inverse-fg transition-opacity hover:opacity-90"
          >
            Add
          </button>
          <button
            type="button"
            onClick={onImport}
            className="h-7.5 rounded-7 border border-ui-strong bg-ui-raised px-3 text-caption text-ui-1 transition-colors hover:bg-ui-hover"
          >
            Import .infopanel
          </button>
        </div>
        <button type="button" onClick={onUseSample} className="pointer-events-auto text-micro text-ui-4 underline-offset-2 hover:text-ui-2 hover:underline">
          Use sample layout
        </button>
      </div>
    </div>
  );
}
