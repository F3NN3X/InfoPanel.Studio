/**
 * The InfoPanel home page, which the rail's InfoPanel button always shows. It is Screens' page for InfoPanel profiles:
 * the same title, toolbar (search, Show, sort, Import, New), cards and menus. Continue editing leads with the open
 * document, then every profile placed in the dashboard (a canvas zone, on any screen and page), then the saved
 * profiles in the Library that aren't placed here. Each card's ⋯ menu and right-click menu offer its actions.
 */
import { useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { HistorySetter } from "@/hooks/use-config-history";
import type { LibraryItem } from "@/lib/library";
import type { DashboardConfig } from "@/lib/layout";
import { linkedItem } from "@/lib/my-library/canvas-link";
import { filterEntries, savedEntries, sortEntries, type ListEntry, type ListSort } from "@/lib/screens/list";
import { RenameInput } from "../../studio/rename-input";
import { DeleteDialog } from "../../studio/screens/delete-dialog";
import { CARD_GRID, LIST_COLUMN, ListEmpty, ListSection, ListTitle } from "../../studio/screens/list-frame";
import { aspectOf, Badge, CARD_BUTTON, ProfileCard } from "../../studio/screens/profile-card";
import { SavedCard } from "../../studio/screens/saved-card";
import { ScreensToolbar } from "../../studio/screens/screens-toolbar";
import { useSavedProfiles } from "../../studio/screens/use-saved-profiles";
import { CanvasThumb } from "../profile-thumb";
import { canvasPlaces, type CanvasPlace } from "./canvas-places";
import { placeActions, placeDeletion, withoutPlace, withPlaceCopy, withPlaceName } from "./place-actions";
import { saveToLibrary } from "./use-library-link";

export { canvasPlaces, type CanvasPlace } from "./canvas-places";

interface InfoPanelStartProps {
  config: DashboardConfig;
  /** Rename, Duplicate and Delete write here, one undo step each. */
  setConfig: HistorySetter;
  /** The open document, when there is one: it leads, with one click back into it. */
  current?: CanvasPlace;
  onContinue: () => void;
  onOpen: (place: CanvasPlace) => void;
  /** A Library profile with no zone here: place it and open it in the editor. */
  onOpenLibrary: (item: LibraryItem) => void;
  /** "+ New": the New page, on the InfoPanel profile kind. */
  onNew: () => void;
  onImport: () => void;
  /** Delete a screen that holds only the profile (Screens' delete); one undo step. */
  onRemoveProfile: (id: string) => void;
  /** Undo the last step (the Undo on the delete toast). */
  onUndo: () => void;
  /** The screens the connected kiosks show, for the delete confirm. */
  shown?: readonly string[];
  /** A profile card's "Export as .infopanel…" and "Show in Screens" (its screen selected there). */
  onExport?: (place: CanvasPlace) => void;
  onShowInScreens?: (place: CanvasPlace) => void;
}

type HomeFilter = "all" | "placed" | "saved";
const HOME_FILTERS: readonly { id: HomeFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "placed", label: "On screens" },
  { id: "saved", label: "Saved" },
];

const counted = (n: number) => `${n} ${n === 1 ? "item" : "items"}`;
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

export function InfoPanelStart({
  config,
  setConfig,
  current,
  onContinue,
  onOpen,
  onOpenLibrary,
  onNew,
  onImport,
  onRemoveProfile,
  onUndo,
  shown,
  onExport,
  onShowInScreens,
}: InfoPanelStartProps) {
  const toast = useToast();
  const savedApi = useSavedProfiles(config);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<HomeFilter>("all");
  const [sort, setSort] = useState<ListSort>("edited");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<CanvasPlace | null>(null);

  const all = useMemo(() => canvasPlaces(config), [config]);
  // A placed profile sorts by its screen's last edit, and searches like a screen: by name and size.
  const places = useMemo(() => {
    if (filter === "saved") return [];
    const entries = all.map(
      (c, order): ListEntry => ({
        id: c.zoneId,
        source: "screen",
        name: c.name,
        kind: "infopanel",
        width: c.width,
        height: c.height,
        pages: 0,
        updatedAt: config.profiles.find((p) => p.id === c.profileId)?.updatedAt,
        order,
      }),
    );
    return sortEntries(filterEntries(entries, query, "all"), sort).flatMap((e) => all.find((c) => c.zoneId === e.id) ?? []);
  }, [all, config.profiles, query, filter, sort]);
  const saved = useMemo(
    () => (filter === "placed" ? [] : sortEntries(filterEntries(savedEntries(savedApi.saved), query, "all"), sort).flatMap((e) => savedApi.saved.find((i) => i.id === e.id) ?? [])),
    [savedApi.saved, query, filter, sort],
  );
  const continuing = current && !query && filter !== "saved" ? current : undefined;
  const empty = places.length === 0 && saved.length === 0;

  const open = (c: CanvasPlace) => (c.zoneId === current?.zoneId ? onContinue() : onOpen(c));
  const rename = (c: CanvasPlace, name: string | null) => {
    setRenamingId(null);
    if (name && name !== c.name) setConfig((cfg) => withPlaceName(cfg, c.zoneId, name), `canvas-name:${c.zoneId}`);
  };
  const toLibrary = (c: CanvasPlace) =>
    saveToLibrary(linkedItem(savedApi.items, c.canvas, c.zoneId), c.canvas, c.name).then(
      (message) => {
        toast(message);
        return savedApi.refresh();
      },
      (e: Error) => toast(`Not saved to the Library: ${e.message}`),
    );
  const deletion = deleting ? placeDeletion(config, deleting, shown) : null;
  const remove = (c: CanvasPlace) => {
    if (deletion?.screen) onRemoveProfile(c.profileId);
    else setConfig((cfg) => withoutPlace(cfg, c.zoneId));
    toast(`Deleted ${c.name}`, { action: { label: "Undo", onClick: onUndo }, ms: 8000 });
  };

  const card = (c: CanvasPlace, key: string) => {
    const isCurrent = c.zoneId === current?.zoneId;
    const openLabel = isCurrent ? "Continue editing" : "Open";
    return (
      <ProfileCard
        key={key}
        name={c.name}
        nameField={renamingId === key ? <RenameInput initial={c.name} label="Profile name" onDone={(name) => rename(c, name)} /> : undefined}
        badges={
          <>
            <Badge>InfoPanel</Badge>
            {isCurrent && (
              <Badge tone="live" title="Open in the editor, with your selection and undo as you left them">
                Open
              </Badge>
            )}
          </>
        }
        detail={c.where === c.name ? "" : c.where}
        meta={`${c.width}×${c.height} · ${counted(c.items)}`}
        aspect={aspectOf(c.width, c.height)}
        thumb={<CanvasThumb canvas={c.canvas} />}
        selected={isCurrent}
        onClick={() => open(c)}
        label={`${openLabel} ${c.name}`}
        actionsLabel="Profile actions"
        actions={placeActions({
          openLabel,
          onOpen: () => open(c),
          onRename: () => setRenamingId(key),
          onDuplicate: () => {
            setConfig((cfg) => withPlaceCopy(cfg, c));
            toast(`Duplicated ${c.name}`);
          },
          libraryLabel: linkedItem(savedApi.items, c.canvas, c.zoneId) ? "Update in Library" : "Save to Library",
          onLibrary: () => void toLibrary(c),
          onExport: onExport && (() => onExport(c)),
          onShowInScreens: onShowInScreens && (() => onShowInScreens(c)),
          onDelete: () => setDeleting(c),
        })}
      >
        <button type="button" onClick={() => open(c)} className={CARD_BUTTON}>
          <Pencil className="h-3.5 w-3.5" />
          {openLabel}
        </button>
      </ProfileCard>
    );
  };

  return (
    <div className="flex min-h-0 flex-1 bg-ui-app/40 font-ui max-[899px]:flex-col max-[899px]:overflow-y-auto" data-help-article="infopanel-editor">
      <div className={LIST_COLUMN}>
        <ListTitle title="InfoPanel profiles" count={plural(all.length + savedApi.saved.length, "profile")} />

        <ScreensToolbar
          query={query}
          onQuery={setQuery}
          filter={filter}
          onFilter={setFilter}
          filters={HOME_FILTERS}
          sort={sort}
          onSort={setSort}
          onImport={onImport}
          onNew={onNew}
          noun="profiles"
          placeholder="Search by name or size"
          importTitle="Import an .infopanel file"
        />

        {empty && <ListEmpty>{query ? `Nothing matches "${query}".` : "No InfoPanel profiles yet. Make one with New, or import an .infopanel file."}</ListEmpty>}

        {continuing && (
          <>
            <ListSection title="Continue editing" />
            <ul aria-label="Continue editing" className={CARD_GRID}>
              {card(continuing, `current:${continuing.zoneId}`)}
            </ul>
          </>
        )}

        {places.length > 0 && (
          <>
            {continuing && <ListSection title="On your screens" />}
            <ul aria-label="Your InfoPanel profiles" className={CARD_GRID}>
              {places.map((c) => card(c, c.zoneId))}
            </ul>
          </>
        )}

        {saved.length > 0 && (
          <>
            <ListSection title="Saved in your Library" />
            <ul aria-label="Saved InfoPanel profiles" className={CARD_GRID}>
              {saved.map((item) => (
                <SavedCard key={item.id} item={item} api={savedApi} action="Open" detail="Opens as a new screen" renamable onOpen={() => onOpenLibrary(item)} />
              ))}
            </ul>
          </>
        )}
      </div>

      <DeleteDialog
        name={deleting?.name ?? null}
        lines={deletion?.lines ?? []}
        confirmLabel={deletion?.screen ? "Delete screen" : "Delete profile"}
        onConfirm={() => deleting && remove(deleting)}
        onClose={() => setDeleting(null)}
      />
    </div>
  );
}
