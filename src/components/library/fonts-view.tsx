/**
 * Library › Fonts (spec §3): the fonts the profile requests, My fonts, Add fonts and Get a font.
 * Renders its main column and its own 320 px right pane (a selected font, or Get a font).
 * Switching a request to InfoPanel's fallback, and supplying faces after a download, are each one
 * config update (one undo step).
 */
import { useMemo, useState } from "react";
import { Plus, SearchCheck } from "lucide-react";
import { uploadBytes } from "@/lib/assets";
import type { HistorySetter } from "@/hooks/use-config-history";
import { canvasTitle, type Placement } from "@/lib/layout";
import type { LibraryItem } from "@/lib/library";
import type { FamilyFace } from "@/lib/infopanel/font-get";
import type { FontRequest } from "@/lib/infopanel/font-loader";
import { describeRequest, isMissing, supplyFonts, withUse, zoneRequests, type SuppliedFile } from "@/lib/infopanel/font-requests";
import { facesFromFile, type Use } from "@/lib/infopanel/font-supply";
import type { FontCandidate } from "@/lib/infopanel/font-sources";
import type { StoredCanvas } from "@/lib/infopanel/import/stored";
import { openImportDoor } from "@/components/studio/file-doors";
import { FontDetail } from "./fonts/font-detail";
import { GetFont } from "./fonts/get-font";
import { MyFonts } from "./fonts/my-fonts";
import { RequestedTable, type ZoneRequests } from "./fonts/requested-table";
import { useDeclaredLicences } from "./fonts/use-declared-licences";
import { useFontAnswers } from "./fonts/use-font-answers";
import { mapCanvas } from "./fonts/zone-canvas";
import type { MyLibrary } from "./use-my-library";

export interface FontsViewProps {
  /** The library's font items. */
  fonts: LibraryItem[];
  library: MyLibrary;
  /** The canvas zones on the page on the canvas: their font requests. */
  zones: (Placement & { canvas: StoredCanvas })[];
  setConfig: HistorySetter;
  /** Select a request's text items on the canvas (opens the canvas editor). */
  onSelectItems: (zoneId: string, paths: string[]) => void;
}

type Pane = { kind: "none" } | { kind: "font"; id: string } | { kind: "get"; family: string };

const mimeOf = (name: string) => (/\.otf$/i.test(name) ? "font/otf" : "font/ttf");

export function FontsView({ fonts, library, zones, setConfig, onSelectItems }: FontsViewProps) {
  const [pane, setPane] = useState<Pane>({ kind: "none" });

  const requested = useMemo<ZoneRequests[]>(
    () => zones.map((z) => ({ zoneId: z.id, title: canvasTitle(z) ?? "InfoPanel canvas", entries: zoneRequests(z.canvas) })),
    [zones],
  );
  const requests = useMemo(() => new Map(requested.flatMap((z) => z.entries.map((e): [string, FontRequest] => [e.key, e.request]))), [requested]);
  const answers = useFontAnswers(requests);
  const declared = useDeclaredLicences(useMemo(() => requested.flatMap((z) => z.entries), [requested]), answers);

  // Requests InfoPanel draws with another family and nothing supplied is drawing: what Get a font fills.
  const open = requested.flatMap((z) =>
    z.entries.filter((e) => {
      const missing = isMissing(answers.loader, e.request, answers.resolved.get(e.key));
      const s = describeRequest(e, answers.resolved.get(e.key), missing, answers.ready).status;
      return s === "missing" || s === "switched";
    }),
  );
  const needed = useMemo(() => {
    const byKey = new Map<string, { request: FontRequest; items: number }>();
    for (const e of open) byKey.set(e.key, { request: e.request, items: (byKey.get(e.key)?.items ?? 0) + e.paths.length });
    return [...byKey.values()];
  }, [open.map((e) => `${e.key}:${e.paths.length}`).join("|")]);
  const missingKeys = new Set(open.map((e) => e.key));
  const unsuppliedCount = new Set(open.filter((e) => !e.supplied).map((e) => e.key)).size;

  const setUse = (zoneId: string, key: string, use: Use) => setConfig((c) => mapCanvas(c, zoneId, (canvas) => withUse(canvas, key, use)));

  // The chosen faces into the store (their hashes), then to My library and, as one config update, to the requests.
  const addFaces = async (candidate: FontCandidate, picked: FamilyFace[]) => {
    const files: File[] = [];
    const uploaded = new Map<File, string>();
    const supplied: SuppliedFile[] = [];
    for (const face of picked) {
      const data = await face.load();
      const { id } = await uploadBytes(data, mimeOf(face.file));
      const { faces } = await facesFromFile(face.file, data, () => "");
      supplied.push({ hash: id.slice(0, 64), faces, license: candidate.license });
      const file = new File([data.slice()], face.file);
      files.push(file);
      uploaded.set(file, id);
    }
    const keys = new Set(missingKeys);
    setConfig((c) => zones.reduce((next, z) => mapCanvas(next, z.id, (canvas) => supplyFonts(canvas, keys, supplied)), c));
    // They are in the store already: My library only records the items.
    library.addFiles(files, uploaded);
  };

  const selected = pane.kind === "font" ? fonts.find((f) => f.id === pane.id) : undefined;
  const getFamily = (family: string) => setPane({ kind: "get", family });

  return (
    <>
      <div className="min-w-0 flex-1 overflow-y-auto p-6 font-ui">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-[14px] font-semibold text-ui-1">Fonts</h2>
          {unsuppliedCount > 0 && <span className="rounded-[5px] bg-ui-danger/15 px-1.5 py-0.5 text-[11px] text-ui-danger">{unsuppliedCount} missing</span>}
          <span className="flex-1" />
          <button
            type="button"
            onClick={() => openImportDoor()}
            className="flex h-[34px] items-center gap-1.5 rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover"
          >
            <Plus className="h-4 w-4" /> Add fonts
          </button>
          <button
            type="button"
            onClick={() => getFamily(open[0]?.request.font ?? "")}
            className="flex h-[34px] items-center gap-1.5 rounded-[8px] border border-ui-default px-3 text-[12.5px] text-ui-1 hover:bg-ui-hover"
          >
            <SearchCheck className="h-4 w-4" /> Get a font
          </button>
        </div>
        <div className="flex flex-col gap-4">
          {requested.length === 0 && <p className="text-[12.5px] text-ui-4">No canvas on this page asks for fonts.</p>}
          {requested.map((z) => (
            <RequestedTable key={z.zoneId} zone={z} answers={answers} fonts={fonts} declared={declared} onSelectItems={onSelectItems} onGet={getFamily} onUse={setUse} />
          ))}
        </div>
        <h3 className="mb-3 mt-6 text-[12.5px] font-semibold text-ui-1">My fonts</h3>
        <MyFonts fonts={fonts} selectedId={pane.kind === "font" ? pane.id : null} onSelect={(f) => setPane({ kind: "font", id: f.id })} />
      </div>
      {pane.kind === "get" ? (
        <GetFont key={pane.family} initialFamily={pane.family} needed={needed} onAdd={addFaces} onClose={() => setPane({ kind: "none" })} />
      ) : selected ? (
        <FontDetail item={selected} />
      ) : (
        <aside aria-label="Font details" className="w-[320px] shrink-0 border-l border-ui-subtle bg-ui-panel p-4 font-ui text-[12px] leading-snug text-ui-4">
          Select a font to see its licence and faces, or get one for a missing font.
        </aside>
      )}
    </>
  );
}
