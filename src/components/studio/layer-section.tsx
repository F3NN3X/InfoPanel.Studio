/**
 * The inspector's LAYER section (Edit v3 SPEC §10.2): bring to front, bring forward, send backward and send to back as
 * four buttons (their tooltips the layer menu's labels), and the group the selection sits in, with None and New
 * group…. The page's Layers host runs each, as the menu and the keys do.
 */
import { ArrowDown, ArrowUp, BringToFront, SendToBack, type LucideIcon } from "lucide-react";
import type { LayerAction } from "@/lib/page-model/layer-actions";

const SECTION_LABEL = "font-ui-mono text-micro uppercase tracking-[0.06em] text-ui-4";

const BUTTONS: { action: LayerAction; label: string; icon: LucideIcon }[] = [
  { action: "front", label: "Bring to front", icon: BringToFront },
  { action: "forward", label: "Bring forward", icon: ArrowUp },
  { action: "backward", label: "Send backward", icon: ArrowDown },
  { action: "back", label: "Send to back", icon: SendToBack },
];

const NEW = "\u0000new";

interface LayerSectionProps {
  onAction: (action: LayerAction) => void;
  /** The groups it can go into (not itself or one inside it), top first. */
  groups: readonly { id: string; name: string }[];
  /** The group it sits in; null at the page's top level. */
  inGroup: string | null;
  /** Into a group, out of every group (null), or into a new group around it ("new"). */
  onInGroup: (groupId: string | null | "new") => void;
}

export function LayerSection({ onAction, groups, inGroup, onInGroup }: LayerSectionProps) {
  return (
    <section data-testid="inspector-layer" className="flex flex-col gap-2.5 border-t border-ui-subtle px-4 py-3.5">
      <span className={SECTION_LABEL}>Layer</span>
      <div className="grid grid-cols-4 gap-1.5">
        {BUTTONS.map(({ action, label, icon: Icon }) => (
          <button
            key={action}
            type="button"
            title={label}
            aria-label={label}
            onClick={() => onAction(action)}
            className="grid h-7 place-items-center rounded-[7px] border border-ui-strong bg-ui-raised text-ui-2 transition-colors hover:bg-ui-hover hover:text-ui-1"
          >
            <Icon className="h-[14px] w-[14px]" />
          </button>
        ))}
      </div>
      <label className="flex min-h-7 items-center justify-between gap-2.5 text-caption text-ui-3">
        <span>In group</span>
        <select
          aria-label="In group"
          value={inGroup ?? ""}
          onChange={(e) => onInGroup(e.target.value === NEW ? "new" : e.target.value === "" ? null : e.target.value)}
          className="h-7 max-w-[60%] rounded-md border border-ui-strong bg-ui-app px-1.5 text-caption text-ui-1 outline-none focus:border-ui-accent"
        >
          <option value="">None</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
          <option value={NEW}>New group…</option>
        </select>
      </label>
    </section>
  );
}
