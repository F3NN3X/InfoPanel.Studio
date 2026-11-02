import { useState, type ReactNode } from "react";
import { Copy, Eye, Plus, Sun, Trash2, Zap } from "lucide-react";
import { Toggle } from "@/components/ui/toggle";
import { Segmented } from "@/components/ui/segmented";
import { IconButton } from "@/components/ui/icon-button";
import { Kbd } from "@/components/ui/kbd";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { ContextMenu } from "@/components/ui/context-menu";
import { Popover } from "@/components/ui/popover";
import { IconGrid } from "@/components/ui/icon-grid";
import { DeviceChecklist } from "@/components/ui/device-checklist";
import { SliderField } from "@/components/ui/slider-field";
import { ColorField } from "@/components/ui/color-field";

/**
 * Dev-only gallery of the studio chrome primitives (`?ui-preview`), for
 * comparing the look to the prototype.
 */

const ICONS = [
  { id: "", label: "None", icon: <span className="text-[10px]">none</span> },
  { id: "zap", label: "Zap", icon: <Zap /> },
  { id: "sun", label: "Sun", icon: <Sun /> },
  { id: "eye", label: "Eye", icon: <Eye /> },
  { id: "plus", label: "Plus", icon: <Plus /> },
];

const DEVICES = [
  { id: "a", label: "Speakers (Realtek)" },
  { id: "b", label: "Headset (Wave Link)" },
  { id: "c", label: "Microphone" },
];

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-2 border-b border-ui-subtle py-4">
      <h2 className="text-[12.5px] font-semibold text-ui-1">{title}</h2>
      {children}
    </section>
  );
}

function Gallery() {
  const toast = useToast();
  const [on, setOn] = useState(true);
  const [seg, setSeg] = useState("solid");
  const [icon, setIcon] = useState("zap");
  const [devices, setDevices] = useState(["a"]);
  const [slider, setSlider] = useState(40);
  const [color, setColor] = useState("");
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);

  return (
    <div
      className="min-h-screen bg-ui-panel p-6 font-ui text-body text-ui-2"
      onContextMenu={(e) => {
        e.preventDefault();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <div className="mx-auto max-w-[340px]">
        <h1 className="text-[14px] font-semibold text-ui-1">UI primitives</h1>
        <p className="text-micro text-ui-4">Right-click anywhere for the context menu.</p>
        <Section title="Toggle">
          <Toggle checked={on} onChange={setOn} label="Example" />
        </Section>
        <Section title="Segmented">
          <Segmented
            label="Fill"
            value={seg}
            onChange={setSeg}
            options={[
              { value: "solid", label: "Solid" },
              { value: "pattern", label: "Pattern" },
              { value: "none", label: "None" },
            ]}
          />
        </Section>
        <Section title="IconButton 28 / 32, Kbd">
          <div className="flex items-center gap-1">
            <IconButton label="Duplicate"><Copy className="h-4 w-4" /></IconButton>
            <IconButton label="Delete" danger><Trash2 className="h-4 w-4" /></IconButton>
            <IconButton label="Hide" size={32} active><Eye className="h-4 w-4" /></IconButton>
            <Kbd>Ctrl</Kbd>
            <Kbd>D</Kbd>
          </div>
        </Section>
        <Section title="Toast / Popover">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => toast("Style copied")}
              className="h-7 rounded-md border border-ui-strong bg-ui-raised px-2.5 text-caption text-ui-1 hover:bg-ui-hover"
            >
              Show toast
            </button>
            <Popover
              trigger="Open popover"
              triggerClassName="h-7 rounded-md border border-ui-strong bg-ui-raised px-2.5 text-caption text-ui-1 hover:bg-ui-hover"
            >
              Popover content
            </Popover>
          </div>
        </Section>
        <Section title="IconGrid">
          <IconGrid label="Icon" icons={ICONS} value={icon} onChange={setIcon} />
        </Section>
        <Section title="DeviceChecklist">
          <DeviceChecklist label="Devices" devices={DEVICES} value={devices} onChange={setDevices} />
        </Section>
        <Section title="SliderField">
          <SliderField label="Opacity" value={slider} onChange={setSlider} />
        </Section>
        <Section title="ColorField">
          <ColorField label="Text color" value={color} onChange={setColor} />
        </Section>
      </div>
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          entries={[
            { id: "dup", label: "Duplicate", icon: <Copy />, hint: "Ctrl D", onSelect: () => toast("Duplicated") },
            { id: "hide", label: "Hide", icon: <Eye />, hint: "H", onSelect: () => toast("Hidden") },
            "separator",
            { id: "del", label: "Delete", icon: <Trash2 />, hint: "Del", danger: true, onSelect: () => toast("Deleted") },
          ]}
        />
      )}
    </div>
  );
}

export default function UiPreview() {
  return (
    <ToastProvider>
      <Gallery />
    </ToastProvider>
  );
}
