import { Menu } from "@/components/ui/menu";
import { ChevronRight } from "lucide-react";
import type { WidgetKind } from "@/lib/panel-model";
import { ALL_KINDS, KIND_INFO } from "./widget-kinds";

/** One menu item per widget kind: icon and name. */
function KindItems({ current, onPick }: { current?: WidgetKind; onPick: (kind: WidgetKind) => void }) {
  return ALL_KINDS.map((kind) => {
    const { label, icon: Icon } = KIND_INFO[kind];
    return (
      <Menu.Item
        key={kind}
        className="justify-start"
        disabled={kind === current}
        onClick={() => onPick(kind)}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-ui-3" />
        <span className="min-w-0 flex-1">{label}</span>
      </Menu.Item>
    );
  });
}

/** The "+ Add panel widget…" select: one option per widget kind, added after the selected widget. */
export function AddWidgetSelect({ onAdd }: { onAdd: (kind: WidgetKind) => void }) {
  return (
    <select
      value=""
      onChange={(e) => e.target.value && onAdd(e.target.value as WidgetKind)}
      aria-label="Add panel widget"
      title="Add a widget after the selected one"
      className="mt-1 h-7.5 w-full cursor-pointer rounded-8 border border-dashed border-ui-menu bg-ui-raised px-2 text-caption text-ui-2 outline-none focus:border-ui-accent"
    >
      <option value="">+ Add panel widget…</option>
      {ALL_KINDS.map((kind) => (
        <option key={kind} value={kind}>
          {KIND_INFO[kind].label}
        </option>
      ))}
    </select>
  );
}

/** "Change kind ▸" inside another menu (a layer's "⋯"). */
export function ChangeKindSubmenu({ kind, onChange }: { kind: WidgetKind; onChange: (kind: WidgetKind) => void }) {
  return (
    <Menu.SubmenuRoot>
      <Menu.SubmenuTrigger>
        Change kind <ChevronRight className="h-3 w-3" />
      </Menu.SubmenuTrigger>
      <Menu.Content sideOffset={4} alignOffset={-4}>
        <KindItems current={kind} onPick={onChange} />
      </Menu.Content>
    </Menu.SubmenuRoot>
  );
}
