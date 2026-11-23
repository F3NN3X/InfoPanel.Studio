import { useState, type ComponentType, type ReactNode } from "react";
import { Copy, Eye, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ContextMenu } from "@/components/ui/context-menu";
import { Menu } from "@/components/ui/menu";
import { Popover } from "@/components/ui/popover";
import { Select } from "@/components/ui/select";
import { Slider, SliderField } from "@/components/ui/slider-field";
import { Tabs } from "@/components/ui/tabs";
import { useToast } from "@/components/ui/toast";
import { ToastCard } from "@/components/ui/toast-provider";
import { Tooltip, TooltipProvider } from "@/components/ui/tooltip";

const TABS = [
  { value: "rules", label: "Rules" },
  { value: "island", label: "Island" },
  { value: "empty", label: "History", disabled: true, title: "Nothing recorded yet" },
];

/** The gallery's overlays and inputs: menu, right-click menu, popover, tooltip, tabs, toast and slider, each with its states. */
export default function Overlays({ Section }: { Section: ComponentType<{ title: string; children: ReactNode }> }) {
  const toast = useToast();
  const [tab, setTab] = useState("rules");
  const [pill, setPill] = useState("rules");
  const [level, setLevel] = useState(40);
  const [page, setPage] = useState("p3");
  const [corners, setCorners] = useState(8);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  return (
    <>
      <Section title="Menu: hover, keyboard highlight, disabled, danger">
        <Menu.Root>
          <Menu.Trigger render={<Button icon={<MoreHorizontal />} />}>Actions</Menu.Trigger>
          <Menu.Content align="start">
            <Menu.Item onClick={() => toast("Renamed")}>
              <span className="flex items-center gap-2"><Pencil className="h-3.5 w-3.5" /> Rename</span>
            </Menu.Item>
            <Menu.Item disabled>
              <span className="flex items-center gap-2"><Copy className="h-3.5 w-3.5" /> Duplicate</span>
            </Menu.Item>
            <Menu.Separator />
            <Menu.Item danger>
              <span className="flex items-center gap-2"><Trash2 className="h-3.5 w-3.5" /> Delete</span>
            </Menu.Item>
          </Menu.Content>
        </Menu.Root>
      </Section>
      <Section title="Context menu: opens at the pointer, flyout, hints">
        <Button onClick={() => setPoint({ x: 140, y: 220 })}>Open at a point</Button>
        {point && (
          <ContextMenu
            x={point.x}
            y={point.y}
            onClose={() => setPoint(null)}
            entries={[
              { id: "show", label: "Show", icon: <Eye />, hint: "H", onSelect: () => toast("Shown") },
              { id: "locked", label: "Locked", icon: <Copy />, disabled: true, title: "Unlock it first" },
              { id: "move", label: "Move to", submenu: [{ id: "p1", label: "Page 1" }, { id: "p2", label: "Page 2" }] },
              "separator",
              { id: "del", label: "Delete", icon: <Trash2 />, danger: true },
            ]}
          />
        )}
      </Section>
      <Section title="Popover and tooltip">
        <TooltipProvider>
          <div className="flex items-center gap-2">
            <Popover trigger="Open popover" triggerClassName="h-8 rounded-ui-md border border-ui-strong bg-ui-raised px-3 text-body text-ui-1 hover:bg-ui-hover">
              Popover content
            </Popover>
            <Tooltip label="Duplicate" side="bottom">
              <Button small icon={<Copy />}>Hover me</Button>
            </Tooltip>
          </div>
        </TooltipProvider>
      </Section>
      <Section title="Select: closed, open, chosen row, disabled row">
        <div className="w-56">
          <Select
            label="Page"
            value={page}
            onChange={setPage}
            options={[1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ value: `p${n}`, label: `Page ${n}`, disabled: n === 5 }))}
          />
        </div>
      </Section>
      <Section title="Tabs: underline, pill, disabled">
        <Tabs label="Underline" value={tab} onChange={setTab} tabs={TABS} />
        <Tabs label="Pill" variant="pill" value={pill} onChange={setPill} tabs={TABS} className="mt-3" />
      </Section>
      <Section title="Toast card: plain, action, dismissible">
        <div className="space-y-2">
          <ToastCard>Style copied</ToastCard>
          <ToastCard actions={[{ label: "Undo", onClick: () => toast("Undone") }]}>Deleted Main</ToastCard>
          <ToastCard actions={[{ label: "Reset to Perf heavy", onClick: () => {}, accent: true }]} onDismiss={() => {}}>
            Theme applied
          </ToastCard>
        </div>
      </Section>
      <Section title="Slider: default, with value box, disabled">
        <Slider label="Corners" max={24} value={corners} onChange={setCorners} className="w-full" />
        <SliderField label="Opacity" value={level} onChange={setLevel} />
        <Slider label="Dim" value={60} onChange={() => {}} disabled className="w-full" />
      </Section>
    </>
  );
}
