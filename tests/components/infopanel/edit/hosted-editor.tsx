// The canvas editor as Edit hosts it: in the studio's shell, with Design's layout, a left panel on one tab and a
// docked inspector; the page tabs are just the Export check pill the editor puts in them. The editor tests render it
// through this, as the studio does.
import { useState } from "react";
import CanvasEditorView, { type CanvasEditorProps } from "@/components/infopanel/edit/canvas-editor";
import type { LeftTab } from "@/components/studio/design-left-panel";
import { useStudioLayout } from "@/components/studio/use-studio-layout";

const PAGE = { width: 800, height: 480 };

export function HostedEditor({ tab = "add", ...props }: Omit<CanvasEditorProps, "shell"> & { tab?: LeftTab }) {
  const [leftTab, setLeftTab] = useState<LeftTab>(tab);
  const layout = useStudioLayout({ page: PAGE, rail: 72, windowWidth: 1600, drawer: 280, quickBar: false });
  return <CanvasEditorView {...props} shell={{ layout, rail: null, railWidth: 72, leftOpen: true, leftTab, onLeftTab: setLeftTab, leftWidth: 280, pageTabs: (pill) => pill }} />;
}
