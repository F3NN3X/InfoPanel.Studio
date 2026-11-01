import { useEffect, useMemo, useState } from "react";
import { PanelsTopLeft, Pencil } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import { deleteLines, deletePlan } from "@/lib/screens/delete-plan";
import { FILTERS, filterEntries, KIND_LABEL, savedEntries, screenEntries, screenKind, sortEntries, type ListFilter, type ListSort } from "@/lib/screens/list";
import { moveProfile } from "@/lib/screens/order";
import { withPlaceName } from "@/components/infopanel/edit/place-actions";
import type { LibraryItem } from "@/lib/library";
import { openExportSheet, openImportDoor } from "./file-doors";
import { RenameInput } from "./rename-input";
import { ScreenDetail } from "./screen-detail";
import { DeleteDialog } from "./screens/delete-dialog";
import { DisplaysList } from "./screens/displays-list";
import { CARD_GRID, LIST_COLUMN, ListEmpty, ListSection, ListTitle } from "./screens/list-frame";
import { aspectOf, Badge, CARD_BUTTON, ProfileCard } from "./screens/profile-card";
import { SavedCard } from "./screens/saved-card";
import { screenActions } from "./screens/screen-menu";
import { ScreenThumb } from "./screens/screen-thumb";
import { ScreensToolbar } from "./screens/screens-toolbar";
import { useCopyKioskLink } from "./screens/shown-on";
import { useSavedProfiles } from "./screens/use-saved-profiles";
import { launchTag, screenMeta, withLaunch } from "./screens-model";

type DetailProps = Parameters<typeof ScreenDetail>[0];

interface ScreensViewProps
  extends Pick<
    DetailProps,
    | "config"
    | "profile"
    | "windowSize"
    | "updateProfile"
    | "setConfig"
    | "onRotate"
    | "onPerformance"
    | "onMovePage"
    | "onAddPage"
    | "onOpenPage"
    | "onOpenLive"
    | "navigateTo"
    | "kiosks"
    | "displays"
    | "autoProfileId"
    | "onOpenScreen"
  > {
  /** Open a screen, then its Convert to InfoPanel dialog once the screen is the edited one. */
  onConvertScreen: (id: string) => void;
  /** Select a screen for editing (never changes what the app opens on). */
  onSelectProfile: (id: string) => void;
  onDuplicateProfile: (id: string) => void;
  /** Delete a screen (after the confirm dialog); one undo step. */
  onRemoveProfile: (id: string) => void;
  /** Undo the last step (the Undo on the delete toast). */
  onUndo: () => void;
  /** A saved Library profile: place it as a screen and open it in Edit. */
  onOpenSaved: (item: LibraryItem) => void;
  /** "+ New": the New page, on the screen kind. */
  onNew: () => void;
  /** A link to Screens that names a filter (the old InfoPanel view lands on InfoPanel); `seq` makes a repeat count. */
  filterRequest?: { filter: ListFilter; seq: number };
}

const TAGS = {
  "best-fit": { text: "Default · best fit", title: "No screen is pinned: the app opens on the one closest to the studio window's size" },
  launch: { text: "Default", title: "The app opens on this screen whatever the window size" },
} as const;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * Screens (SPEC §8): the manager for every screen and InfoPanel profile, placed or saved in the Library. Cards with
 * thumbnails you can search, filter (All, Studio, InfoPanel) and sort; import an .infopanel; create (blank, sample layout, InfoPanel template), rename, duplicate, reorder, export and
 * delete with a confirm that names what goes, then an Undo. The default screen is chosen in Settings › Dashboard; the kiosks'
 * current screens are the active ones. A click selects a card for editing (the detail panel, the canvas, the page tabs); it
 * never changes what the app opens on.
 */
export function ScreensView({
  config,
  profile,
  windowSize,
  autoProfileId,
  kiosks,
  displays,
  onSelectProfile,
  onDuplicateProfile,
  onRemoveProfile,
  onUndo,
  onOpenSaved,
  onNew,
  filterRequest,
  ...detail
}: ScreensViewProps) {
  const toast = useToast();
  const copyLink = useCopyKioskLink();
  const savedApi = useSavedProfiles(config);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ListFilter>(filterRequest?.filter ?? "all");
  useEffect(() => {
    if (filterRequest) setFilter(filterRequest.filter);
  }, [filterRequest?.seq]);
  const [sort, setSort] = useState<ListSort>("edited");
  const { setConfig, onOpenScreen, onConvertScreen } = detail;
  const stored = config.profiles.find((p) => p.id === profile.id) ?? config.profiles[0];

  const screens = useMemo(
    () => sortEntries(filterEntries(screenEntries(config.profiles), query, filter), sort).flatMap((e) => config.profiles.find((p) => p.id === e.id) ?? []),
    [config.profiles, query, filter, sort],
  );
  const saved = useMemo(
    () => sortEntries(filterEntries(savedEntries(savedApi.saved), query, filter), sort).flatMap((e) => savedApi.saved.find((i) => i.id === e.id) ?? []),
    [savedApi.saved, query, filter, sort],
  );

  const rename = (id: string, name: string | null) => {
    setRenamingId(null);
    if (!name) return;
    // An InfoPanel screen's canvas carries the name too (the editor and the export read it).
    const target = config.profiles.find((p) => p.id === id);
    const canvases = target && screenKind(target) === "infopanel" ? target.pages.flatMap((pg) => pg.placements.filter((z) => z.canvas).map((z) => z.id)) : [];
    setConfig((c) => canvases.reduce((next, zoneId) => withPlaceName(next, zoneId, name), { ...c, profiles: c.profiles.map((p) => (p.id === id ? { ...p, name } : p)) }), `profile-name:${id}`);
  };
  const plan = deletingId ? deletePlan(config, deletingId, kiosks.map((k) => k.profile)) : null;
  const remove = (id: string, name: string) => {
    onRemoveProfile(id);
    toast(`Deleted ${name}`, { action: { label: "Undo", onClick: onUndo }, ms: 8000 });
  };
  const empty = screens.length === 0 && saved.length === 0;

  return (
    // On a phone the cards and the detail panel stack, and the view scrolls.
    <div className="flex min-h-0 flex-1 bg-ui-app/40 font-ui max-[899px]:flex-col max-[899px]:overflow-y-auto">
      <div className={LIST_COLUMN}>
        <ListTitle title="Screens" count={plural(config.profiles.length, "screen")} />

        <ScreensToolbar
          query={query}
          onQuery={setQuery}
          filter={filter}
          onFilter={setFilter}
          filters={FILTERS}
          sort={sort}
          onSort={setSort}
          onImport={() => openImportDoor()}
          onImportInfoPanel={() => openImportDoor({ prefer: "canvas-zone" })}
          onNew={onNew}
        />

        <DisplaysList displays={displays} profiles={config.profiles} />

        {empty && <ListEmpty>{query ? `Nothing matches "${query}".` : "Nothing here yet."}</ListEmpty>}

        {screens.length > 0 && (
          <ul aria-label="Your screens" className={CARD_GRID}>
            {screens.map((p) => {
              const tag = launchTag(config, p.id, autoProfileId);
              const live = kiosks.filter((k) => k.profile === p.id).length;
              const kind = screenKind(p);
              const index = config.profiles.findIndex((x) => x.id === p.id);
              return (
                <ProfileCard
                  key={p.id}
                  name={p.name}
                  nameField={renamingId === p.id ? <RenameInput initial={p.name} onDone={(name) => rename(p.id, name)} /> : undefined}
                  badges={
                    <>
                      {kind === "infopanel" ? (
                        <Badge title="An InfoPanel profile: it opens in Edit and exports to .infopanel">
                          <PanelsTopLeft className="mr-1 h-3 w-3" />
                          InfoPanel
                        </Badge>
                      ) : (
                        <Badge>{KIND_LABEL[kind]}</Badge>
                      )}
                      {tag && (
                        <Badge tone="accent" title={TAGS[tag].title}>
                          {TAGS[tag].text}
                        </Badge>
                      )}
                      {live > 0 && (
                        <Badge tone="live" title="Kiosks showing this screen now">
                          Live on {plural(live, "kiosk")}
                        </Badge>
                      )}
                    </>
                  }
                  meta={screenMeta(p)}
                  aspect={aspectOf(p.width, p.height)}
                  thumb={<ScreenThumb profile={p} />}
                  selected={p.id === stored.id}
                  onClick={() => onSelectProfile(p.id)}
                  label={`Select ${p.name}`}
                  actionsLabel="Screen actions"
                  actions={screenActions({
                    onOpen: () => onOpenScreen(p.id),
                    canDelete: config.profiles.length > 1,
                    canMoveEarlier: index > 0,
                    canMoveLater: index < config.profiles.length - 1,
                    onRename: () => setRenamingId(p.id),
                    onDuplicate: () => {
                      onDuplicateProfile(p.id);
                      toast(`Duplicated ${p.name}`);
                    },
                    onAlwaysOpen: () => {
                      setConfig((c) => withLaunch(c, p.id));
                      toast(`The app now always opens ${p.name}`);
                    },
                    onMove: (by) => setConfig((c) => moveProfile(c, p.id, by)),
                    onCopyLink: () => copyLink(p.id),
                    onExport: () => openExportSheet({ row: "screen", screenId: p.id }),
                    // The conversion reads the zones where they are drawn, so the screen opens on the canvas first.
                    onConvert: () => onConvertScreen(p.id),
                    onDelete: () => setDeletingId(p.id),
                  })}
                >
                  <button type="button" onClick={() => onOpenScreen(p.id)} className={CARD_BUTTON}>
                    <Pencil className="h-3.5 w-3.5" />
                    Open
                  </button>
                </ProfileCard>
              );
            })}
          </ul>
        )}

        {saved.length > 0 && (
          <>
            <ListSection title="Saved in your Library" />
            <ul aria-label="Saved InfoPanel profiles" className={CARD_GRID}>
              {saved.map((item) => (
                <SavedCard key={item.id} item={item} api={savedApi} action="Place" detail="Becomes a new screen" renamable onOpen={() => onOpenSaved(item)} />
              ))}
            </ul>
          </>
        )}
      </div>

      <ScreenDetail
        config={config}
        profile={profile}
        stored={stored}
        windowSize={windowSize}
        kiosks={kiosks}
        displays={displays}
        autoProfileId={autoProfileId}
        {...detail}
      />

      <DeleteDialog name={plan?.name ?? null} lines={plan ? deleteLines(plan) : []} onConfirm={() => deletingId && remove(deletingId, plan?.name ?? "")} onClose={() => setDeletingId(null)} />
    </div>
  );
}
