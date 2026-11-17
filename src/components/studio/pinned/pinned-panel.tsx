import { ArrowDown, ArrowUp, Eye, EyeOff, Pin, Plus } from "lucide-react";
import { Menu } from "@base-ui/react/menu";
import { IconButton } from "@/components/ui/icon-button";
import { FOCUS_RING } from "@/components/ui/button";
import type { MonitorProfile, ProfilePage } from "@/lib/layout";
import { PIN_KINDS, type PinKind } from "@/lib/pinned-edit";
import type { PinnedItem } from "@/lib/pinned";
import { cn } from "@/lib/utils";
import { zoneName } from "../inspector/zone-meta";
import { ITEM, POPUP } from "../menu-styles";

interface PinnedPanelProps {
  profile: MonitorProfile;
  page: ProfilePage;
  width: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAdd: (kind: PinKind) => void;
  onToggleVisible: (id: string) => void;
  onMove: (id: string, by: -1 | 1) => void;
}

const EDGE_NAMES = { left: "Left edge", right: "Right edge", top: "Top", bottom: "Bottom" } as const;

/** A row's line: its edge, and the pages it shows on. */
function lineOf(it: PinnedItem, pages: readonly ProfilePage[]): string {
  const on = it.show === "all" ? "all pages" : it.show.pages.map((id) => pages.find((p) => p.id === id)?.name).filter(Boolean).join(", ") || "no page";
  return `${EDGE_NAMES[it.edge]} · ${it.mode === "float" ? "floats · " : ""}${on}`;
}

/**
 * Layers while Edit shows the pinned layer (mockup 08, the `editor` fixture): the profile's pinned items, top first, each
 * with its edge and pages, its eye and its place in the list; Add pins another; the Island's agent prompt is listed
 * read-only (decision 1: it is the Island's, not stored here); the page's widgets under it, dimmed as on the canvas.
 */
export function PinnedPanel({ profile, page, width, selectedId, onSelect, onAdd, onToggleVisible, onMove }: PinnedPanelProps) {
  const items = profile.pinned?.items ?? [];
  const agentPrompt = profile.island?.enabled === true && profile.island.notices.agents;
  return (
    <aside aria-label="Pinned layer" className="flex shrink-0 flex-col overflow-y-auto border-r border-ui-subtle bg-ui-panel font-ui" style={{ width }}>
      <section className="border-b border-ui-subtle px-3 py-3">
        <h2 className="mb-2 flex items-center gap-2 px-1 text-body font-semibold text-ui-1">
          <Pin aria-hidden size={14} />
          Pinned layer
          <span className="ml-auto text-caption font-normal text-ui-3">{items.length}</span>
          <Menu.Root>
            <Menu.Trigger aria-label="Pin a widget" title="Pin a widget" className={cn("inline-flex h-7 w-7 items-center justify-center rounded-ui-md text-ui-3 hover:bg-ui-hover hover:text-ui-1", FOCUS_RING)}>
              <Plus aria-hidden size={16} />
            </Menu.Trigger>
            <Menu.Portal>
              <Menu.Positioner side="bottom" align="end" sideOffset={4} className="z-[80]">
                <Menu.Popup className={POPUP}>
                  {PIN_KINDS.map((k) => (
                    <Menu.Item key={k.id} className={ITEM} onClick={() => onAdd(k)}>
                      {k.name}
                    </Menu.Item>
                  ))}
                </Menu.Popup>
              </Menu.Positioner>
            </Menu.Portal>
          </Menu.Root>
        </h2>
        {items.length === 0 && <p className="px-1 text-caption text-ui-3">Nothing is pinned. Pin a page rail or a widget to an edge with +; it stays put on every page.</p>}
        <ul className="flex flex-col gap-0.5">
          {items.map((it, i) => (
            <li key={it.id} className={cn("group flex items-center gap-1 rounded-ui-md pr-1", it.id === selectedId ? "bg-ui-blue-bg outline outline-1 outline-ui-accent" : "hover:bg-ui-hover")}>
              <button type="button" aria-pressed={it.id === selectedId} onClick={() => onSelect(it.id)} className={cn("min-w-0 flex-1 rounded-ui-md px-2 py-1.5 text-left", FOCUS_RING, !it.visible && "text-ui-3")}>
                <span className="block truncate text-body">{it.name ?? zoneName({ ...it.placement, colStart: 1, rowStart: 1, colSpan: 1, rowSpan: 1, visible: true })}</span>
                <span className="block truncate text-caption text-ui-3">{lineOf(it, profile.pages)}</span>
              </button>
              <IconButton label={i === 0 ? "Already first" : "Move up"} size={26} disabled={i === 0} onClick={() => onMove(it.id, -1)}>
                <ArrowUp className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label={i === items.length - 1 ? "Already last" : "Move down"} size={26} disabled={i === items.length - 1} onClick={() => onMove(it.id, 1)}>
                <ArrowDown className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label={it.visible ? "Hide" : "Show"} size={26} onClick={() => onToggleVisible(it.id)}>
                {it.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </IconButton>
            </li>
          ))}
          {agentPrompt && (
            <li className="px-2 py-1.5 text-ui-3" title="The Island shows it; set it in Alerts & Island">
              <span className="block text-body">Agent prompt</span>
              <span className="block text-caption">From the Island · while an agent waits</span>
            </li>
          )}
        </ul>
      </section>
      <section className="px-3 py-3">
        <h2 className="mb-1 flex items-center px-1 text-body font-semibold text-ui-1">
          Page · {page.name}
          <span className="ml-auto text-caption font-normal text-ui-3">{page.placements.length}</span>
        </h2>
        <ul aria-label={`Widgets on ${page.name}, shown under the pinned layer`}>
          {page.placements.map((z) => (
            <li key={z.id} className="truncate px-1 py-1 text-body text-ui-3">
              {zoneName(z)}
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
