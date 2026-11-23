import { useState, type ComponentType, type ReactNode } from "react";
import { Copy, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { Segmented } from "@/components/ui/segmented";
import { Toggle } from "@/components/ui/toggle";

/** The gallery's sections for the buttons, the toggle and the segmented control: every variant and state side by side. */
export default function Buttons({ Section }: { Section: ComponentType<{ title: string; children: ReactNode }> }) {
  const [on, setOn] = useState(true);
  const [pressed, setPressed] = useState(false);
  const [view, setView] = useState("grid");
  return (
    <>
      <Section title="Button: variants and states">
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon={<Plus />}>Primary</Button>
          <Button>Secondary</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Danger</Button>
          <Button small>Small</Button>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="primary" disabled>Primary disabled</Button>
          <Button disabled>Secondary disabled</Button>
          <Button variant="ghost" disabled>Ghost disabled</Button>
          <Button variant="danger" disabled>Danger disabled</Button>
        </div>
      </Section>
      <Section title="IconButton: sizes, states">
        <div className="flex flex-wrap items-center gap-2">
          <IconButton label="Copy" size={26}><Copy className="h-4 w-4" /></IconButton>
          <IconButton label="Copy"><Copy className="h-4 w-4" /></IconButton>
          <IconButton label="Copy" size={30} bordered><Copy className="h-4 w-4" /></IconButton>
          <IconButton label="Pinned" active={pressed} aria-pressed={pressed} onClick={() => setPressed(!pressed)}><Plus className="h-4 w-4" /></IconButton>
          <IconButton label="Delete" danger><Trash2 className="h-4 w-4" /></IconButton>
          <IconButton label="Disabled" disabled><Copy className="h-4 w-4" /></IconButton>
        </div>
      </Section>
      <Section title="Toggle: off, on, disabled">
        <div className="flex items-center gap-4">
          <Toggle label="Interactive" checked={on} onChange={setOn} />
          <Toggle label="Off" checked={false} onChange={() => {}} />
          <Toggle label="Disabled off" checked={false} onChange={() => {}} disabled />
          <Toggle label="Disabled on" checked onChange={() => {}} disabled />
        </div>
      </Section>
      <Section title="Segmented: field, bar, a disabled segment">
        <div className="flex flex-wrap items-center gap-4">
          <Segmented label="View" value={view} onChange={setView} options={[{ value: "grid", label: "Grid" }, { value: "shelves", label: "Shelves" }, { value: "list", label: "List", disabled: true }]} />
          <Segmented label="Mode" size="bar" value={view} onChange={setView} options={[{ value: "grid", label: "Grid" }, { value: "shelves", label: "Shelves" }]} />
        </div>
      </Section>
    </>
  );
}
