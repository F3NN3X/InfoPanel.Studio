/**
 * The icon set's searchable picker, shared by the Icon element, Row and the per-drive icons. It reads the
 * generated set itself (its own chunk, fetched on first use) rather than `icons.ts`, which the canvas zone
 * shares with the kiosk: importing that from a lazy chunk would give the kiosk a chunk of its own to load.
 */
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

const INPUT = "h-7 w-full min-w-0 rounded-ui-sm border border-ui-default bg-ui-raised px-2 font-ui-mono text-caption text-ui-1 outline-none focus:border-ui-accent";

/** A searchable list of the icon set: a preview grid and a search box. */
export function IconPicker({ value, onPick }: { value: string; onPick: (name: string) => void }) {
  const [query, setQuery] = useState("");
  const [markup, setMarkup] = useState<Readonly<Record<string, string>> | null>(null);
  useEffect(() => {
    let live = true;
    void import("@/lib/infopanel/elements/icons.generated").then((m) => live && setMarkup(m.ELEMENT_ICON_MARKUP));
    return () => {
      live = false;
    };
  }, []);
  const ready = markup !== null;
  const names = useMemo(() => {
    const all = markup ? Object.keys(markup).sort() : [];
    const q = query.trim().toLowerCase().replace(/\s+/g, "-");
    return q ? all.filter((n) => n.includes(q)) : all;
  }, [query, markup]);
  return (
    <div className="space-y-1.5">
      <label className="relative block">
        <Search className="pointer-events-none absolute left-2 top-1.5 h-4 w-4 text-ui-4" />
        <input aria-label="Search icons" placeholder="Search icons" value={query} onChange={(e) => setQuery(e.target.value)} className={cn(INPUT, "pl-7 font-ui")} />
      </label>
      <div role="listbox" aria-label="Icons" className="grid max-h-44 grid-cols-8 gap-1 overflow-y-auto">
        {names.map((n) => (
          <button
            key={n}
            type="button"
            role="option"
            aria-selected={n === value}
            title={n}
            aria-label={n}
            onClick={() => onPick(n)}
            className={cn("grid h-7 place-items-center rounded-ui-sm text-ui-2 hover:bg-ui-hover", n === value && "bg-ui-active text-ui-1")}
          >
            <svg
              viewBox="0 0 24 24"
              width={16}
              height={16}
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              // biome-ignore lint/security/noDangerouslySetInnerHtml: the icon set's own generated markup, never user text.
              dangerouslySetInnerHTML={{ __html: markup?.[n] ?? "" }}
            />
          </button>
        ))}
        {names.length === 0 && <p className="col-span-8 py-1 text-[11.5px] text-ui-4">{ready ? "No icon matches." : "Loading icons…"}</p>}
      </div>
    </div>
  );
}
