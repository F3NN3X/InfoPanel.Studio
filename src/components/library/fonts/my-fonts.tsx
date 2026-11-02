/**
 * My fonts (spec §3 Fonts): a card per font in the library with a live sample in its own face,
 * the family and licence, and the faces · size · origin line. The selected card's details are in
 * the right pane.
 */
import { cn } from "@/lib/utils";
import type { LibraryItem } from "@/lib/library";
import { LICENCE_LABEL } from "@/lib/infopanel/font-requests";
import { metaLine, metaOf } from "@/lib/my-library/model";
import { useLibraryFont } from "../asset-thumb";
import { VERDICT_TONE } from "./requested-table";

export const SAMPLE = "14:32 54°C";

function FontCard({ item, selected, onSelect }: { item: LibraryItem; selected: boolean; onSelect: () => void }) {
  const m = metaOf(item);
  const face = useLibraryFont(item);
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex min-w-0 flex-col gap-1.5 rounded-ui-lg border border-ui-subtle bg-ui-panel p-3.5 text-left outline-none hover:border-ui-default focus-visible:border-ui-accent",
        selected && "border-ui-accent bg-ui-accent/[.06] hover:border-ui-accent",
      )}
    >
      <span className="truncate text-[26px] leading-tight text-ui-1" style={{ fontFamily: face ? `"${face}"` : undefined }}>
        {SAMPLE}
      </span>
      <span className="flex min-w-0 items-baseline justify-between gap-2">
        <span className="truncate text-[12.5px] font-medium text-ui-1">{m.family ?? item.name}</span>
        {m.licence && <span className={cn("shrink-0 text-[11.5px]", VERDICT_TONE[m.licence])}>{LICENCE_LABEL[m.licence]}</span>}
      </span>
      <span className="truncate font-ui-mono text-micro text-ui-4">{metaLine(item)}</span>
    </button>
  );
}

export function MyFonts({ fonts, selectedId, onSelect }: { fonts: LibraryItem[]; selectedId: string | null; onSelect: (item: LibraryItem) => void }) {
  if (fonts.length === 0) return <div className="text-[12.5px] text-ui-4">No fonts yet. Add font files or get one for a missing font.</div>;
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
      {fonts.map((f) => (
        <FontCard key={f.id} item={f} selected={f.id === selectedId} onSelect={() => onSelect(f)} />
      ))}
    </div>
  );
}
