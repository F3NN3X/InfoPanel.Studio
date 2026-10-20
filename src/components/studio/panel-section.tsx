import { useState, type ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { SettingSection } from "./setting-card";

/** The inspector's padding around a block of field rows (the left panels use it too). */
export function SectionPad({ children }: { children: ReactNode }) {
  return <div className="space-y-2 py-1 pl-4 pr-2.5">{children}</div>;
}

interface PanelSectionProps {
  id: string;
  title: string;
  icon: LucideIcon;
  defaultOpen?: boolean;
  /** Field rows get the inspector's padding; a list that pads itself passes false. */
  pad?: boolean;
  children: ReactNode;
}

/** The inspector's accordion section for a left panel: it keeps its own open state and has no count or reset. */
export function PanelSection({ id, title, icon, defaultOpen = true, pad = true, children }: PanelSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <SettingSection id={id} title={title} icon={icon} changed={0} open={open} onToggle={() => setOpen((o) => !o)}>
      {pad ? <SectionPad>{children}</SectionPad> : children}
    </SettingSection>
  );
}
