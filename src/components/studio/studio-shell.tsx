import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { BottomSheet } from "./bottom-sheet";
import { CollapseTab, ExpandStrip } from "./dock-toggle";
import { FloatingInspector } from "./floating-inspector";
import type { useStudioLayout } from "./use-studio-layout";

interface StudioShellProps {
  layout: ReturnType<typeof useStudioLayout>;
  /** The labelled rail. */
  rail: ReactNode;
  /** The rail's width (px): an overlaid left panel starts after it. */
  railWidth: number;
  /** Design's left panel when it is open (null = none). */
  drawer: ReactNode;
  /** The canvas (or the Sources view). */
  main: ReactNode;
  /** The floating zoom bar over the canvas (null in the Sources view). */
  bar: ReactNode;
  /** The inspector `<aside>` (null in the Sources view). */
  inspector: ReactNode;
}

/**
 * The studio body below the title bar: rail, left panel, then the canvas (the
 * zoom bar floats over it) and the inspector. Docked (a wide studio) the
 * inspector is a column beside the canvas that Ctrl+\ collapses to a slim
 * strip; on a narrow window it is a card floating over the canvas's right
 * side (draggable by its header), closed until asked for; on a phone it is a bottom sheet. It stays
 * mounted while hidden, so its tab, scroll and search survive.
 */
export function StudioShell({ layout, rail, railWidth, drawer, main, bar, inspector }: StudioShellProps) {
  const { mode, collapsed, floatOpen } = layout;
  const docked = mode === "docked";
  return (
    <div ref={layout.bodyRef} className="relative flex min-h-0 flex-1 overflow-x-auto">
      {rail}
      {drawer && layout.leftOverlay ? (
        // Too narrow to sit beside the canvas: the left panel floats over it as a drawer.
        <div className="absolute inset-y-0 z-40 flex shadow-ui-drawer" style={{ left: railWidth }}>
          {drawer}
        </div>
      ) : (
        drawer
      )}
      <main className={cn("relative flex flex-1 flex-col", mode === "sheet" ? "min-w-0" : "min-w-[420px]")}>
        {main}
        {bar}
        {inspector !== null && mode === "sheet" && (
          <BottomSheet
            snap={layout.sheet.snap}
            onSnap={layout.sheet.setSnap}
            height={layout.sheet.height}
            area={layout.sheet.area}
            selected={layout.sheet.hasSelection}
            drag={layout.sheet.drag}
            onDrag={layout.sheet.setDrag}
          >
            {inspector}
          </BottomSheet>
        )}
        {inspector !== null && mode === "floating" && (
          <FloatingInspector open={floatOpen} onClose={() => layout.setFloatOpen(false)}>
            {inspector}
          </FloatingInspector>
        )}
      </main>
      {inspector !== null && docked && (
        <>
          <div className={collapsed ? "hidden" : "relative flex shrink-0"}>
            {inspector}
            <CollapseTab onToggle={layout.toggleInspector} className="absolute -left-4 top-1/2 z-30 -translate-y-1/2" />
          </div>
          {collapsed && <ExpandStrip onToggle={layout.toggleInspector} />}
        </>
      )}
    </div>
  );
}
