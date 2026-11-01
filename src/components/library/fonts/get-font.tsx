/**
 * Get a font (spec §3 Fonts, right pane): a source [Fontsource | Font Squirrel], a search, the
 * result with a preview and its licence, and the faces to take (those the profile needs are
 * checked and say how many items need them). "Add" hands the chosen faces to the view, which
 * stores them, supplies them to the requests and redraws.
 */
import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { reviewFont } from "@/lib/infopanel/font-licence";
import { listFaces, neededBy, proxiedFetch, type FamilyFace } from "@/lib/infopanel/font-get";
import { LICENCE_LABEL } from "@/lib/infopanel/font-requests";
import type { FontRequest } from "@/lib/infopanel/font-loader";
import { fetchCatalogs, findCandidates, searchName, type Catalogs, type FontCandidate, type SourceId } from "@/lib/infopanel/font-sources";
import { PreviewBox } from "./font-detail";
import { VERDICT_TONE } from "./requested-table";

type Source = "fontsource" | "fontsquirrel";
const SOURCES: { id: Source; label: string; ids: SourceId[] }[] = [
  { id: "fontsource", label: "Fontsource", ids: ["google", "fontsource"] },
  { id: "fontsquirrel", label: "Font Squirrel", ids: ["fontsquirrel"] },
];

export interface GetFontProps {
  /** The family to look for (a missing request's), or empty. */
  initialFamily: string;
  /** The missing requests, with how many items each serves. */
  needed: readonly { request: FontRequest; items: number }[];
  onAdd: (candidate: FontCandidate, faces: FamilyFace[]) => Promise<void>;
  onClose: () => void;
}

type Loaded = { state: "loading" } | { state: "error"; message: string } | { state: "ready"; faces: FamilyFace[] };

/** A face of the family drawn in the preview: one a request needs, else the regular one. */
function previewFace(faces: readonly FamilyFace[], need: ReadonlyMap<string, number>): FamilyFace | undefined {
  return faces.find((f) => need.has(f.id)) ?? faces.find((f) => f.weight === 400 && !f.italic) ?? faces[0];
}

let previews = 0;

export function GetFont({ initialFamily, needed, onAdd, onClose }: GetFontProps) {
  const [source, setSource] = useState<Source>("fontsource");
  const [query, setQuery] = useState(searchName(initialFamily));
  const [catalogs, setCatalogs] = useState<Catalogs | null>(null);
  const [pick, setPick] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const [preview, setPreview] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    let stop = false;
    fetchCatalogs(proxiedFetch).then(
      (c) => !stop && setCatalogs(c),
      () => !stop && setCatalogs({ fontsource: [], fontsquirrel: [], unavailable: ["The font sources could not be reached"] }),
    );
    return () => {
      stop = true;
    };
  }, []);

  const ids = SOURCES.find((s) => s.id === source)!.ids;
  const candidates = useMemo(() => (catalogs && query.trim() ? findCandidates(query, catalogs, ids) : []), [catalogs, query, ids]);
  const candidate = candidates.find((c) => `${c.source}:${c.id}` === pick) ?? candidates[0];
  const candidateKey = candidate && `${candidate.source}:${candidate.id}`;
  const need = useMemo(() => (candidate && loaded.state === "ready" ? neededBy(candidate.family, loaded.faces, needed) : new Map<string, number>()), [candidate, loaded, needed]);

  useEffect(() => {
    setMessage(null);
    setPreview(null);
    if (!candidate) return;
    let stop = false;
    setLoaded({ state: "loading" });
    listFaces(candidate, proxiedFetch).then(
      (faces) => {
        if (stop) return;
        const wanted = neededBy(candidate.family, faces, needed);
        const first = previewFace(faces, wanted);
        setLoaded({ state: "ready", faces });
        setChecked(new Set(wanted.size > 0 ? wanted.keys() : first ? [first.id] : []));
      },
      (e: unknown) => !stop && setLoaded({ state: "error", message: e instanceof Error ? e.message : String(e) }),
    );
    return () => {
      stop = true;
    };
  }, [candidateKey]);

  // The preview is a face read from the source's own bytes, registered under a private name.
  useEffect(() => {
    if (loaded.state !== "ready") return;
    const face = previewFace(loaded.faces, need);
    if (!face || typeof FontFace === "undefined") return;
    let stop = false;
    (async () => {
      const alias = `get-font-${previews++}`;
      const font = new FontFace(alias, await face.load());
      document.fonts.add(await font.load());
      if (!stop) setPreview(alias);
    })().catch(() => undefined);
    return () => {
      stop = true;
    };
  }, [loaded]);

  const review = candidate && reviewFont({ license: candidate.license });
  const chosen = loaded.state === "ready" ? loaded.faces.filter((f) => checked.has(f.id)) : [];

  const add = async () => {
    if (!candidate || chosen.length === 0) return;
    setAdding(true);
    setMessage(null);
    try {
      await onAdd(candidate, chosen);
      setMessage({ tone: "ok", text: `Added ${candidate.family}: ${chosen.length} face${chosen.length === 1 ? "" : "s"} are in My fonts and the profile's requests use them.` });
    } catch (e) {
      setMessage({ tone: "error", text: e instanceof Error ? e.message : String(e) });
    } finally {
      setAdding(false);
    }
  };

  return (
    <aside aria-label="Get a font" className="flex w-[320px] shrink-0 flex-col gap-3.5 overflow-y-auto border-l border-ui-subtle bg-ui-panel p-4 font-ui">
      <div className="flex items-center justify-between">
        <div className="text-[14px] font-semibold text-ui-1">Get a font</div>
        <button type="button" onClick={onClose} className="text-[12px] text-ui-4 hover:text-ui-1">
          Close
        </button>
      </div>
      <div role="group" aria-label="Source" className="flex h-[32px] rounded-[8px] border border-ui-default p-0.5">
        {SOURCES.map((s) => (
          <button
            key={s.id}
            type="button"
            aria-pressed={source === s.id}
            onClick={() => setSource(s.id)}
            className={cn("flex-1 rounded-[6px] text-[12.5px] text-ui-3 hover:text-ui-1", source === s.id && "bg-ui-active text-ui-1")}
          >
            {s.label}
          </button>
        ))}
      </div>
      <label className="flex h-[34px] items-center gap-2 rounded-[8px] border border-ui-default px-2.5 text-ui-4 focus-within:border-ui-accent">
        <Search className="h-4 w-4 shrink-0" />
        <input
          aria-label="Font family"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Family name"
          className="min-w-0 flex-1 bg-transparent text-[12.5px] text-ui-1 outline-none placeholder:text-ui-hint"
        />
      </label>
      {catalogs && catalogs.unavailable.length > 0 && <p className="text-[11.5px] leading-snug text-ui-warning">Some sources are unavailable: {catalogs.unavailable.join("; ")}</p>}
      {!catalogs && <p className="text-[12px] text-ui-4">Reading the font catalogues…</p>}
      {catalogs && !candidate && (
        <p className="text-[12px] leading-snug text-ui-4">
          {query.trim() ? "No free source has this family. Ask the profile's author for the file, then use Add fonts." : "Type a family name."}
        </p>
      )}
      {candidates.length > 1 && (
        <div role="listbox" aria-label="Matches" className="flex flex-wrap gap-1">
          {candidates.slice(0, 6).map((c) => (
            <button
              key={`${c.source}:${c.id}`}
              type="button"
              role="option"
              aria-selected={c === candidate}
              onClick={() => setPick(`${c.source}:${c.id}`)}
              className={cn("rounded-full border border-ui-default px-2 py-0.5 text-[11.5px] text-ui-2 hover:bg-ui-hover", c === candidate && "border-ui-accent text-ui-1")}
            >
              {c.family}
            </button>
          ))}
        </div>
      )}
      {candidate && review && (
        <>
          <PreviewBox family={preview} />
          <div className="rounded-[10px] border border-ui-subtle p-3 text-[12px] leading-snug">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-medium text-ui-1">{candidate.family}</span>
              <a href={candidate.page} target="_blank" rel="noreferrer" aria-label={`${candidate.family} on its source`} className="text-ui-4 hover:text-ui-1">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </div>
            <div className={cn("mt-1", VERDICT_TONE[review.verdict])}>{LICENCE_LABEL[review.verdict]}</div>
            <div className="text-ui-3">{candidate.license}</div>
          </div>
          <div>
            <div className="mb-1.5 text-[11px] font-medium uppercase tracking-[.06em] text-ui-4">Faces</div>
            {loaded.state === "loading" && <p className="text-[12px] text-ui-4">Reading the faces…</p>}
            {loaded.state === "error" && <p className="text-[12px] leading-snug text-ui-danger">{loaded.message}</p>}
            {loaded.state === "ready" && (
              <div className="flex flex-col gap-0.5">
                {loaded.faces.map((f) => (
                  <label key={f.id} className="flex items-center gap-2 rounded-[6px] px-1.5 py-1 text-[12.5px] text-ui-2 hover:bg-ui-hover">
                    <input
                      type="checkbox"
                      checked={checked.has(f.id)}
                      onChange={(e) => setChecked((s) => (e.target.checked ? new Set(s).add(f.id) : new Set([...s].filter((x) => x !== f.id))))}
                      className="h-3.5 w-3.5 accent-[var(--ui-accent)]"
                    />
                    <span className="min-w-0 flex-1 truncate">{f.style}</span>
                    {need.has(f.id) && (
                      <span className="shrink-0 text-[11px] text-ui-accent-text">
                        needed by {need.get(f.id)} item{need.get(f.id) === 1 ? "" : "s"}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            disabled={adding || chosen.length === 0}
            onClick={() => void add()}
            className="h-[34px] w-full rounded-[8px] bg-ui-inverse text-[12.5px] font-medium text-ui-inverse-fg hover:opacity-90 disabled:pointer-events-none disabled:opacity-40"
          >
            {adding ? "Adding…" : `Add ${candidate.family} · ${chosen.length} face${chosen.length === 1 ? "" : "s"}`}
          </button>
        </>
      )}
      {message && (
        <p role="status" className={cn("text-[12px] leading-snug", message.tone === "ok" ? "text-ui-success" : "text-ui-danger")}>
          {message.text}
        </p>
      )}
    </aside>
  );
}
