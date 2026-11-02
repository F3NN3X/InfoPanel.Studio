/**
 * The Library's detail pane for a Style: a preview, the name (renamed in place for the saved ones), the actions and
 * a readable summary of its keys.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { LibraryItem } from "@/lib/library";
import { KIND_LABEL, metaLine } from "@/lib/my-library/model";
import type { ModuleSettings } from "@/modules/types";
import { AssetThumb } from "./asset-thumb";
import type { DetailAction } from "./library-detail";
import { isUserPreset } from "./preset-actions";
import { styleRows } from "./preset-summary";

export interface PresetDetailProps {
  item: LibraryItem;
  /** Shown in a bottom sheet (a narrow viewport): fills it instead of a 320 px side column. */
  sheet?: boolean;
  primary: DetailAction | null;
  secondary: DetailAction[];
  /** Focus and select the name field (Rename). */
  focusName?: boolean;
  onFocusedName?: () => void;
  onRename: (name: string) => void;
}

const BUTTON = "flex h-(--ui-h-field) items-center justify-center gap-2 rounded-ui-md px-3 text-[12.5px] disabled:pointer-events-none disabled:opacity-40";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="border-t border-ui-subtle pt-3">
      <div className="mb-1.5 text-micro font-medium uppercase tracking-[.06em] text-ui-4">{title}</div>
      {children}
    </div>
  );
}

function Rows({ rows }: { rows: { label: string; value: string }[] }) {
  return (
    <>
      {rows.map((r) => (
        <div key={r.label} className="flex gap-3 py-[3px] text-caption">
          <span className="w-[110px] shrink-0 text-ui-4">{r.label}</span>
          <span className="min-w-0 flex-1 truncate font-ui-mono text-ui-2">{r.value}</span>
        </div>
      ))}
    </>
  );
}

export function PresetDetail(p: PresetDetailProps) {
  const { item } = p;
  const user = isUserPreset(item);
  const [name, setName] = useState(item.name);
  const nameRef = useRef<HTMLInputElement>(null);
  const { focusName, onFocusedName } = p;
  useEffect(() => {
    if (!focusName || !nameRef.current) return;
    nameRef.current.focus();
    nameRef.current.select();
    onFocusedName?.();
  }, [focusName, onFocusedName]);

  const rows = styleRows((item.data as { settings: ModuleSettings }).settings);
  const button = (a: DetailAction, primary?: boolean) => (
    <button
      key={a.label}
      type="button"
      onClick={a.run}
      disabled={a.disabled}
      title={a.title}
      className={cn(BUTTON, primary ? "w-full bg-ui-inverse font-medium text-ui-inverse-fg hover:opacity-90" : "border border-ui-default text-ui-1 hover:bg-ui-hover")}
    >
      <a.icon className="h-4 w-4" strokeWidth={1.75} />
      {a.label}
    </button>
  );
  return (
    <aside aria-label="Item details" className={cn("flex flex-col gap-4 overflow-y-auto bg-ui-panel p-4 font-ui", p.sheet ? "min-w-0 flex-1" : "w-[320px] shrink-0 border-l border-ui-subtle")}>
      <AssetThumb item={item} size="lg" className="aspect-[16/10] w-full border border-ui-subtle" />
      <div>
        <input
          aria-label="Name"
          value={name}
          disabled={!user}
          ref={nameRef}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name !== item.name && p.onRename(name.trim())}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="-mx-1 w-full rounded-ui-sm border border-transparent bg-transparent px-1 py-0.5 text-[14px] font-semibold text-ui-1 outline-none hover:border-ui-default focus:border-ui-accent disabled:hover:border-transparent"
        />
        <div className="font-ui-mono text-micro text-ui-4">{metaLine(item) || KIND_LABEL[item.kind]}</div>
      </div>
      <div className="flex flex-col gap-2">
        {p.primary && button(p.primary, true)}
        {p.secondary.length > 0 && <div className="grid grid-cols-2 gap-2 [&>*:last-child:nth-child(odd)]:col-span-2">{p.secondary.map((a) => button(a))}</div>}
      </div>
      <Section title="Settings">
        {rows.length > 0 ? <Rows rows={rows} /> : <span className="text-caption text-ui-4">No settings: it clears the widget’s own look.</span>}
      </Section>
      <Section title="Kept in">
        <span className="text-caption text-ui-2">{user ? "this dashboard’s config" : "the Studio (built in)"}</span>
      </Section>
    </aside>
  );
}
