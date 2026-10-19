/**
 * "Requested by <profile>" (spec §3 Fonts): one row per font request of a canvas zone: status
 * dot, the requested family and style, what it draws with, how it got there, its text items
 * (click to select them), the licence, and the action (Get a missing font, or switch a supplied
 * one to InfoPanel's fallback and back).
 */
import { cn } from "@/lib/utils";
import type { LibraryItem } from "@/lib/library";
import { reviewFont, type Declared, type Verdict } from "@/lib/infopanel/font-licence";
import type { FontRequest } from "@/lib/infopanel/font-loader";
import { describeRequest, isMissing, LICENCE_LABEL, type RequestEntry } from "@/lib/infopanel/font-requests";
import type { Use } from "@/lib/infopanel/font-supply";
import { metaOf } from "@/lib/my-library/model";
import type { FontAnswers } from "./use-font-answers";

export interface ZoneRequests {
  zoneId: string;
  /** The canvas's name. */
  title: string;
  entries: RequestEntry[];
}

export const VERDICT_TONE: Record<Verdict, string> = { share: "text-ui-success", check: "text-ui-warning", keep: "text-ui-danger" };

const DOT = { ok: "bg-ui-success", missing: "bg-ui-danger", switched: "bg-ui-warning", unknown: "bg-ui-5" } as const;
const COLUMNS = "grid grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,1.4fr)_52px_minmax(0,1fr)_minmax(0,1.1fr)] items-center gap-x-3";

/**
 * "Orbitron · Bold", "Rajdhani · Medium": the named style, else the weight and slant flags. A flag
 * set on top of a named style is a request of its own ("Barlow · Bold + bold"), so it shows.
 */
export function requestLabel(r: FontRequest): string {
  if (!r.style) return `${r.font} · ${[r.bold ? "Bold" : "Regular", r.italic ? "Italic" : ""].filter(Boolean).join(" ")}`;
  const flags = [r.bold && "bold", r.italic && "italic"].filter(Boolean).join(" ");
  return `${r.font} · ${r.style}${flags ? ` + ${flags}` : ""}`;
}

/**
 * The licence a request's font is under: a library font of that family, else the supplied face's
 * source licence. Without either, the table shows what the font file declares, else a supplied
 * face's "check".
 */
function licenceOf(entry: RequestEntry, fonts: readonly LibraryItem[]): { verdict: Verdict; embedding?: string } | null {
  const family = (entry.supplied?.family ?? entry.request.font).toLowerCase();
  const own = fonts.find((f) => metaOf(f).family?.toLowerCase() === family);
  const m = own && metaOf(own);
  if (m?.licence) return { verdict: m.licence, embedding: m.embedding };
  if (entry.supplied?.license) return { verdict: reviewFont({ license: entry.supplied.license }).verdict };
  return null;
}

export interface RequestedTableProps {
  zone: ZoneRequests;
  answers: FontAnswers;
  fonts: readonly LibraryItem[];
  /** What each request's font file declares about its licence, once read. */
  declared?: ReadonlyMap<string, Declared | null>;
  onSelectItems: (zoneId: string, paths: string[]) => void;
  onGet: (family: string) => void;
  onUse: (zoneId: string, key: string, use: Use) => void;
}

export function RequestedTable({ zone, answers, fonts, declared, onSelectItems, onGet, onUse }: RequestedTableProps) {
  return (
    <div role="table" aria-label={`Fonts requested by ${zone.title}`} className="overflow-hidden rounded-[12px] border border-ui-subtle bg-ui-panel text-[12.5px]">
      <div role="row" className={cn(COLUMNS, "border-b border-ui-subtle px-3.5 py-2 text-[11px] text-ui-4")}>
        <span role="columnheader">Requested by {zone.title}</span>
        <span role="columnheader">Drawn with</span>
        <span role="columnheader">How</span>
        <span role="columnheader">Items</span>
        <span role="columnheader">Licence</span>
        <span role="columnheader" />
      </div>
      {zone.entries.length === 0 && <div className="px-3.5 py-3 text-[12px] text-ui-4">This canvas has no text.</div>}
      {zone.entries.map((entry) => {
        const r = answers.resolved.get(entry.key);
        const missing = isMissing(answers.loader, entry.request, r);
        const s = describeRequest(entry, r, missing, answers.ready);
        const licence = licenceOf(entry, fonts);
        const own = licence ? null : (declared?.get(entry.key) ?? null);
        const shown = licence ?? (!own && entry.supplied ? { verdict: "check" as Verdict, embedding: undefined } : null);
        return (
          <div key={entry.key} role="row" className={cn(COLUMNS, "border-b border-ui-subtle px-3.5 py-2.5 last:border-b-0", s.status === "missing" && "bg-ui-hover")}>
            <span role="cell" className="flex min-w-0 items-center gap-2 text-ui-1">
              <span aria-hidden className={cn("h-[7px] w-[7px] shrink-0 rounded-full", DOT[s.status])} />
              <span className="truncate">{requestLabel(entry.request)}</span>
            </span>
            <span role="cell" className={cn("truncate", s.status === "missing" ? "text-ui-danger" : "text-ui-1")}>
              {s.drawn}
            </span>
            <span role="cell" className="truncate text-ui-3">
              {s.how}
            </span>
            <span role="cell">
              <button
                type="button"
                onClick={() => onSelectItems(zone.zoneId, entry.paths)}
                title="Select these text items on the canvas"
                className="min-w-[26px] rounded-[5px] bg-ui-active px-1.5 py-0.5 font-ui-mono text-[11px] text-ui-1 hover:bg-ui-strong"
              >
                {entry.paths.length}
              </button>
            </span>
            <span role="cell" className="min-w-0">
              {shown ? (
                <span className={cn("block truncate", VERDICT_TONE[shown.verdict])} title={shown.embedding ? `Embedding: ${shown.embedding}` : undefined}>
                  {LICENCE_LABEL[shown.verdict]}
                </span>
              ) : own ? (
                <span className="block truncate text-ui-3" title={own.full}>
                  {own.label}
                </span>
              ) : (
                <span className="text-ui-5">—</span>
              )}
            </span>
            <span role="cell" className="flex items-center justify-end gap-2">
              {s.status === "missing" && (
                <button
                  type="button"
                  onClick={() => onGet(entry.request.font)}
                  className="h-[28px] truncate rounded-[7px] bg-ui-inverse px-2.5 text-[12px] font-medium text-ui-inverse-fg hover:opacity-90"
                >
                  Get {entry.request.font}
                </button>
              )}
              {s.status === "switched" && <span className="text-[12px] text-ui-4">InfoPanel fallback</span>}
              {entry.supplied && missing && (
                <button
                  type="button"
                  onClick={() => onUse(zone.zoneId, entry.key, entry.use === "supplied" ? "infopanel" : "supplied")}
                  title={entry.use === "supplied" ? "Draw this request with InfoPanel's fallback, as InfoPanel shows it" : `Draw this request with the supplied ${entry.supplied.family}`}
                  className="h-[28px] truncate rounded-[7px] border border-ui-default px-2 text-[12px] text-ui-2 hover:bg-ui-hover"
                >
                  {entry.use === "supplied" ? "Use fallback" : `Use ${entry.supplied.family}`}
                </button>
              )}
            </span>
          </div>
        );
      })}
    </div>
  );
}
