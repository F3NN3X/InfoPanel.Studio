import type { ReactNode } from "react";
import {
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Copy,
  BoxSelect,
  Eye,
  EyeOff,
  Minimize2,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { IconButton } from "@/components/ui/icon-button";
import { BLANK_MODULE, type Placement } from "@/lib/layout";
import { cn } from "@/lib/utils";
import { useInspectorChrome } from "./inspector-layout";
import { FIELD, InlineRow, SELECT } from "./setting-rows";
import { placementTitle } from "./studio-modules";
import { KEYS } from "./use-studio-shortcuts";

/** The 32 px icon box of a header (the glyph in the accent text colour). */
export function HeaderIcon({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#1c1c21] text-[oklch(0.78_0.12_255)] [&>svg]:h-[19px] [&>svg]:w-[19px]">
      {children}
    </span>
  );
}

const META = "truncate text-[11px] text-[#8a8a94]";

/** The sub line's count: "3 changed", or "defaults" when nothing is set here. */
export const changedLabel = (changed: number) => (changed > 0 ? `${changed} changed` : "defaults");

/** Close the floating inspector, or collapse the phone sheet to half; nothing when docked. */
export function CloseButton() {
  const { mode, onClose } = useInspectorChrome();
  if (!onClose || mode === "docked") return null;
  const sheet = mode === "sheet";
  return (
    <IconButton label={sheet ? "Collapse" : "Close"} onClick={onClose} className={sheet ? TOUCH : undefined}>
      {sheet ? <Minimize2 className="h-4 w-4" /> : <X className="h-[18px] w-[18px]" />}
    </IconButton>
  );
}
/** The phone sheet's 44 px touch targets. */
const TOUCH = "h-11 w-11";
const TITLE = "truncate text-[14px] font-semibold leading-4 text-ui-1";

/** Hide / Duplicate / Delete (28×28; delete turns red on hover). */
function ZoneActions({
  hidden,
  onToggleVisible,
  onDuplicate,
  onRemove,
  zoneKeys = true,
  onHelp,
  stateIcon = true,
}: {
  /** Every zone acted on is hidden (the eye shows them again). */
  hidden: boolean;
  /** The eye shows the state (open when visible); false: always open (several zones). */
  stateIcon?: boolean;
  onToggleVisible: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** Ctrl+D / Del act on the zone (not on a selected panel widget). */
  zoneKeys?: boolean;
  /** A Help icon (F1) before the actions. */
  onHelp?: () => void;
}) {
  const touch = useInspectorChrome().mode === "sheet" ? TOUCH : undefined;
  return (
    <span className="flex shrink-0 items-center">
      {onHelp && (
        <IconButton label="Help (F1)" onClick={onHelp} className={touch}>
          <CircleHelp className="h-4 w-4" />
        </IconButton>
      )}
      <IconButton label={`${hidden ? "Show" : "Hide"} (${KEYS.hide})`} onClick={onToggleVisible} className={touch}>
        {hidden && stateIcon ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </IconButton>
      <IconButton label={zoneKeys ? `Duplicate (${KEYS.duplicate})` : "Duplicate zone"} onClick={onDuplicate} className={touch}>
        <Copy className="h-4 w-4" />
      </IconButton>
      <IconButton label={zoneKeys ? `Delete (${KEYS.remove})` : "Delete zone"} danger onClick={onRemove} className={touch}>
        <Trash2 className="h-4 w-4" />
      </IconButton>
      <CloseButton />
    </span>
  );
}

/**
 * "Panel › Widget" when a panel widget is selected: the zone crumb goes
 * back to the panel, the widget crumb brings its editor into view.
 */
function Breadcrumb({
  title,
  widget,
  onZone,
  onWidget,
}: {
  title: string;
  widget: string;
  onZone: () => void;
  onWidget: () => void;
}) {
  const crumb = "min-w-0 truncate rounded hover:text-ui-1 hover:underline";
  return (
    <nav aria-label="Selection" className="flex min-w-0 items-center gap-1 text-[12px]">
      <button
        type="button"
        onClick={onZone}
        title={`Select the panel (${KEYS.deselect})`}
        className={cn(crumb, "max-w-[45%] shrink-0 text-ui-4")}
      >
        {title}
      </button>
      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ui-5" />
      <button type="button" onClick={onWidget} title="Show the widget's settings" className={cn(crumb, "text-ui-2")}>
        {widget}
      </button>
    </nav>
  );
}

/** The single-zone header: icon, editable name, meta line, zone actions, panel crumbs. */
export function ZoneHeader({
  icon,
  name,
  placeholder,
  onName,
  meta,
  kind,
  details,
  visible,
  widget,
  onZoneCrumb,
  onWidgetCrumb,
  onToggleVisible,
  onDuplicate,
  onRemove,
  onHelp,
}: {
  icon: ReactNode;
  name: string;
  /** Shown while the name is empty (the widget's own name). */
  placeholder?: string;
  /** Rename; omitted when the zone has no name of its own (a blank zone). */
  onName?: (name: string) => void;
  /** The sub line: the widget type and its count of values set here. */
  meta: string;
  /** The sub line as the part's kind (Edit v3 SPEC §10.2, `Studio widget` in the accent) in place of `meta`. */
  kind?: string;
  /** Shown on hover over the sub line (size, minimum, data points). */
  details?: string;
  visible: boolean;
  /** The selected panel widget's name (a breadcrumb under the header). */
  widget?: string;
  onZoneCrumb: () => void;
  onWidgetCrumb: () => void;
  onToggleVisible: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
  /** The Help icon: F1's article for this zone. */
  onHelp: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <HeaderIcon>{icon}</HeaderIcon>
        <div className="min-w-0 flex-1">
          {onName ? (
            <input
              value={name}
              placeholder={placeholder}
              aria-label="Zone name"
              spellCheck={false}
              onChange={(e) => onName(e.target.value)}
              className={cn(
                TITLE,
                "-ml-1 block h-[21px] w-full rounded-[5px] border border-transparent bg-transparent px-1 outline-none placeholder:text-ui-4 hover:border-ui-strong focus:border-ui-accent"
              )}
            />
          ) : (
            <div className={TITLE}>{name}</div>
          )}
          {kind ? (
            <div data-testid="inspector-kind" className="truncate text-[10.5px] text-ui-accent" title={details}>
              {kind}
            </div>
          ) : (
            <div className={META} title={details}>
              {meta}
            </div>
          )}
        </div>
        <ZoneActions
          hidden={!visible}
          onToggleVisible={onToggleVisible}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
          onHelp={onHelp}
          zoneKeys={widget === undefined}
        />
      </div>
      {widget !== undefined && (
        <Breadcrumb title={name || placeholder || ""} widget={widget} onZone={onZoneCrumb} onWidget={onWidgetCrumb} />
      )}
    </div>
  );
}

/** Several zones: the count, removable chips and the shared actions. */
export function MultiHeader({
  zones,
  onDeselect,
  onToggleVisible,
  onDuplicate,
  onRemove,
}: {
  zones: { id: string; name: string; visible: boolean }[];
  /** Drop one zone from the selection. */
  onDeselect: (id: string) => void;
  onToggleVisible: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2.5">
        <HeaderIcon>
          <BoxSelect />
        </HeaderIcon>
        <div className="min-w-0 flex-1">
          <div className={TITLE}>{zones.length} zones selected</div>
          <div className={META}>Style changes apply to all of them</div>
        </div>
        <ZoneActions
          hidden={zones.every((z) => !z.visible)}
          stateIcon={false}
          onToggleVisible={onToggleVisible}
          onDuplicate={onDuplicate}
          onRemove={onRemove}
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {zones.map((z) => (
          <button
            key={z.id}
            type="button"
            onClick={() => onDeselect(z.id)}
            aria-label={`Remove ${z.name} from the selection`}
            title="Remove from the selection"
            className="inline-flex h-6 max-w-full items-center gap-1 rounded-xl border border-ui-strong bg-ui-raised pl-2 pr-1 text-[11.5px] text-[#d4d4da]"
          >
            <span className="truncate">{z.name}</span>
            <X className="h-3.5 w-3.5 shrink-0 text-ui-4" />
          </button>
        ))}
      </div>
    </div>
  );
}

/** The zone's widget as an inline select-style button that opens the widget picker. */
export function WidgetPicker({ placement, onPickWidget }: { placement: Placement; onPickWidget: () => void }) {
  const blank = placement.module === BLANK_MODULE;
  return (
    <div className="space-y-2">
      <InlineRow label="Widget type" hint="Change keeps the general settings">
        <button
          type="button"
          onClick={onPickWidget}
          title="Pick a widget for this zone"
          className={cn(SELECT, "flex min-w-0 items-center gap-1 text-left hover:border-ui-menu")}
        >
          <span className={cn("min-w-0 flex-1 truncate", blank && "text-ui-4")}>
            {blank ? "Blank — no widget" : placement.panel ? "Panel" : placementTitle(placement)}
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ui-4" />
        </button>
      </InlineRow>
      {placement.panel && (
        <p className="text-[11px] leading-snug text-ui-5">
          Edit the panel&apos;s widgets in Content; picking another widget replaces the panel.
        </p>
      )}
    </div>
  );
}

/** The settings search box; Esc clears it. */
export function SettingsSearch({ query, onQuery }: { query: string; onQuery: (query: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-ui-4" />
      <input
        type="text"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== "Escape" || query === "") return;
          e.stopPropagation();
          onQuery("");
        }}
        placeholder="Search all settings"
        aria-label="Search settings"
        className={cn(FIELD, "h-8 w-full rounded-[7px] pl-[30px] pr-7")}
      />
      {query !== "" && (
        <button
          type="button"
          onClick={() => onQuery("")}
          title="Clear search (Esc)"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ui-4 hover:text-ui-1"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
