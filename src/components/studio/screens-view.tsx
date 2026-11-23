import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Maximize, PanelsTopLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/status-chip";
import { useToast } from "@/components/ui/toast";
import { postControl, type ControlState } from "@/lib/control";
import { deleteLines, deletePlan } from "@/lib/screens/delete-plan";
import { FILTERS, filterEntries, KIND_LABEL, savedEntries, screenEntries, screenKind, sortEntries, type ListFilter, type ListSort } from "@/lib/screens/list";
import { moveProfile } from "@/lib/screens/order";
import { withPlaceName } from "@/components/infopanel/edit/place-actions";
import type { LibraryItem } from "@/lib/library";
import { openExportSheet, openImportDoor } from "./file-doors";
import { RenameInput } from "./rename-input";
import { ScreenDetail } from "./screen-detail";
import { AddDisplayCard } from "./screens/add-display-card";
import { DeleteDialog } from "./screens/delete-dialog";
import { DisplayCard } from "./screens/display-card";
import { displayEntries, distinctDisplays, onNoDisplay, screenPlaces, screensCountLine, screenSummary, showOnTargets } from "./screens/display-model";
import { CARD_GRID, ListEmpty, ListSection } from "./screens/list-frame";
import { NewScreenCard } from "./screens/new-screen-card";
import { aspectOf, Badge, ProfileCard } from "./screens/profile-card";
import { SavedCard } from "./screens/saved-card";
import { ScreenRow } from "./screens/screen-row";
import { screenActions, showOnRows } from "./screens/screen-menu";
import { ShowOnHint } from "./screens/show-on-hint";
import { PageStrip } from "./screens/page-strip";
import { ScreenThumb } from "./screens/screen-thumb";
import { ScreensBar, ScreensHeader } from "./screens/screens-toolbar";
import { useCopyKioskLink } from "./screens/shown-on";
import { useSavedProfiles } from "./screens/use-saved-profiles";
import { useTouchPanels } from "./screens/use-touch-panels";
import { launchTag, withLaunch } from "./screens-model";
import { useStoredFlag } from "./use-stored-flag";
import { hasOverlay } from "./use-studio-shortcuts";

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
  > {
  /** Open the screen in Design, or in the InfoPanel editor when it is one InfoPanel profile. */
  onOpenScreen: (id: string) => void;
  /** Open a screen in Edit on one of its pages (a page strip's mini-map). */
  onOpenScreenPage: (id: string, pageId: string) => void;
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
  /** The runtime state the Live column reads (null while the server is unreachable). */
  control: ControlState | null;
  /** Show the kiosk in this window. */
  onOpenKioskView: () => void;
  /** A link that names a screen (the breadcrumb's Screen settings…, an inheritance chip's jump) opens its settings. */
  settingsRequest?: { id: string; seq: number };
  /** The request has opened the settings: clear it, so coming back to Screens later does not open them again. */
  onSettingsHandled: () => void;
}

const TAGS = {
  "best-fit": { text: "Default · best fit", title: "No screen is pinned: the app opens on the one closest to the studio window's size" },
  launch: { text: "Default", title: "The app opens on this screen whatever the window size" },
} as const;

/** Whether a key press is for a field: `/` is then a character, not a shortcut. */
const typing = (t: EventTarget | null) => t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

/**
 * Screens (SPEC §8): the manager for every screen and InfoPanel profile, placed or saved in the Library. "Displays"
 * has a card for each display, online or not, with its touch panel; "Your screens" is a grid or a list you can search, filter (Show),
 * sort and reorder, with a card to start a new one. A card opens its screen in Edit; its menu has Screen settings…
 * (a drawer with size and fit, rotation, performance and the pages), Rename, Duplicate, Always open this one,
 * Move earlier and later, Show on a display or touch panel, Copy kiosk link, Export, Convert and Delete (a confirm that
 * names what goes, then an Undo).
 * The default screen is chosen in Settings › Dashboard.
 */
export function ScreensView({
  config,
  profile,
  windowSize,
  autoProfileId,
  kiosks,
  displays,
  control,
  onOpenKioskView,
  settingsRequest,
  onSettingsHandled,
  onOpenScreen,
  onOpenScreenPage,
  onDuplicateProfile,
  onRemoveProfile,
  onUndo,
  onOpenSaved,
  onNew,
  filterRequest,
  ...detail
}: ScreensViewProps) {
  const toast = useToast();
  // The strips are memoised: a callback that keeps its identity while the studio re-renders.
  const openPageRef = useRef(onOpenScreenPage);
  useEffect(() => {
    openPageRef.current = onOpenScreenPage;
  });
  const openPage = useCallback((id: string, pageId: string) => openPageRef.current(id, pageId), []);
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
  const [list, setList] = useStoredFlag("screens.list", false);
  const searchRef = useRef<HTMLInputElement>(null);
  const { setConfig, navigateTo } = detail;
  const stored = config.profiles.find((p) => p.id === profile.id) ?? config.profiles[0];

  // The settings drawer: a modal dialog opened by a card's menu or a link, closed by its X, Esc or a click outside; the
  // page behind it is inert while it is open and focus goes back to what opened it.
  const [settingsId, setSettingsId] = useState<string | null>(null);
  // The view itself: the drawer is drawn inside it, over the view and not the whole window.
  const [viewEl, setViewEl] = useState<HTMLDivElement | null>(null);
  // The menu button that was last used: the menu has closed by the time the request arrives, and focus goes back to it.
  const lastMenu = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const remember = (e: FocusEvent) => {
      if (e.target instanceof HTMLElement && e.target.matches('[aria-haspopup="menu"]')) lastMenu.current = e.target;
    };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, []);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!settingsRequest) return;
    // The last menu button used, when it is on the card of this screen (a right-click or a link leaves an older one);
    // else the screen's own card, else nothing and the dialog puts focus back where it was.
    const name = config.profiles.find((p) => p.id === settingsRequest.id)?.name;
    const card = [...document.querySelectorAll<HTMLElement>("button")].find((b) => b.getAttribute("aria-label") === `Open ${name}`);
    const menu = lastMenu.current;
    opener.current = menu?.isConnected && card && menu.closest("li")?.contains(card) ? menu : (card ?? null);
    setSettingsId(settingsRequest.id);
    onSettingsHandled();
  }, [settingsRequest?.seq]);
  const closeSettings = () => setSettingsId(null);
  // The drawer shows the screen being edited, which the request has selected by the time the view re-renders.
  const settingsOpen = settingsId !== null && settingsId === stored.id;
  // Another screen becoming the edited one (the palette) takes the drawer away; coming back must not reopen it.
  const wasOpen = useRef(false);
  useEffect(() => {
    if (settingsOpen) wasOpen.current = true;
    else if (wasOpen.current) {
      wasOpen.current = false;
      setSettingsId(null);
    }
  }, [settingsOpen]);
  const openSettings = (id: string, section?: string) => navigateTo({ view: "screens", profileId: id, section });

  // `/` and Ctrl+F go to the search (Ctrl+K stays the command palette everywhere); not while a dialog or menu is open.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || hasOverlay()) return;
      const find = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "f";
      const slash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !typing(e.target);
      if (!find && !slash) return;
      e.preventDefault();
      searchRef.current?.focus();
      searchRef.current?.select();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const screens = useMemo(
    () => sortEntries(filterEntries(screenEntries(config.profiles), query, filter), sort).flatMap((e) => config.profiles.find((p) => p.id === e.id) ?? []),
    [config.profiles, query, filter, sort],
  );
  const saved = useMemo(
    () => sortEntries(filterEntries(savedEntries(savedApi.saved), query, filter), sort).flatMap((e) => savedApi.saved.find((i) => i.id === e.id) ?? []),
    [savedApi.saved, query, filter, sort],
  );
  const touch = useTouchPanels();
  const panels = touch.view?.effective.panels;
  const entries = useMemo(() => displayEntries(kiosks, displays, config.profiles, panels), [kiosks, displays, config.profiles, panels]);
  const targets = useMemo(() => showOnTargets(displays, panels ?? []), [displays, panels]);
  // A screen's "On 1 display" leads to the display's card and lights it for a moment.
  const [lit, setLit] = useState<string | null>(null);
  const litTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(litTimer.current), []);
  const showDisplay = (key: string) => {
    setLit(key);
    document.querySelector(`[data-display="${CSS.escape(key)}"]`)?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
    clearTimeout(litTimer.current);
    litTimer.current = setTimeout(() => setLit(null), 1600);
  };
  const showOn = (screenId: string, name: string) => {
    const target = targets.find((t) => t.name === name);
    void postControl("display", { action: "assign", display: name, screen: screenId });
    toast(`${target?.label ?? name} now shows ${config.profiles.find((p) => p.id === screenId)?.name ?? "it"}`);
  };
  const hasInfoPanel = config.profiles.some((p) => screenKind(p) !== "dashboard") || savedApi.saved.length > 0;

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
  const now = Date.now();

  /** One screen's card (grid) or row (list): the same name, size, chip and actions. */
  const screenItem = (p: (typeof screens)[number]) => {
    const tag = launchTag(config, p.id, autoProfileId);
    const places = screenPlaces(p.id, entries);
    const rows = showOnRows(targets, p.id, (name) => showOn(p.id, name));
    const kind = screenKind(p);
    const index = config.profiles.findIndex((x) => x.id === p.id);
    const common = {
      name: p.name,
      nameField: renamingId === p.id ? <RenameInput initial={p.name} onDone={(name) => rename(p.id, name)} /> : undefined,
      badges: (
        <>
          {kind === "infopanel" ? (
            <Badge title="An InfoPanel profile: it opens in Edit">
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
        </>
      ),
      meta: screenSummary(p),
      aspect: aspectOf(p.width, p.height),
      thumb: <ScreenThumb profile={p} />,
      chip: places ? (
        <button
          type="button"
          title="Show its display"
          onClick={(e) => {
            e.stopPropagation();
            showDisplay(places.key);
          }}
          className="pointer-events-auto rounded-full focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent"
        >
          <StatusChip tone="ok" className="h-5 bg-ui-panel/80 text-micro underline-offset-2 hover:underline">
            {places.text}
          </StatusChip>
        </button>
      ) : !tag && onNoDisplay(p.id, entries) && targets.some((t) => t.known) ? (
        <ShowOnHint rows={rows.showOn} />
      ) : undefined,
      onClick: () => onOpenScreen(p.id),
      label: `Open ${p.name}`,
      actions: screenActions({
        onOpen: () => onOpenScreen(p.id),
        onSettings: () => openSettings(p.id),
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
        onDelete: () => setDeletingId(p.id),
        showOn: rows.showOn,
        touchPanels: rows.touchPanels,
      }),
    };
    return list ? <ScreenRow key={p.id} {...common} pages={<PageStrip profile={p} onOpen={openPage} inline />} /> : <ProfileCard key={p.id} {...common} strip={<PageStrip profile={p} onOpen={openPage} />} actionsLabel="Screen actions" />;
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col font-ui">
      <ScreensHeader
        count={screensCountLine(config.profiles.length, distinctDisplays(kiosks))}
        query={query}
        onQuery={setQuery}
        searchRef={searchRef}
        onImport={() => openImportDoor()}
        onExportAll={() => openExportSheet()}
        onNew={onNew}
      />

      <div ref={setViewEl} className="relative flex min-h-0 flex-1 flex-col bg-ui-app/40">
      {/* On a phone the two columns stack, and the view scrolls. */}
      <div className="flex min-h-0 flex-1 items-start gap-6 overflow-y-auto px-6 py-5 max-narrow:flex-col max-narrow:px-3">
        <section aria-label="Displays" className="flex w-100 shrink-0 flex-col gap-3 max-[1199px]:w-85 max-narrow:w-full">
          <div className="flex min-h-8 items-center gap-2">
            <h2 className="m-0 text-body font-medium text-ui-1">Displays</h2>
            <span className="text-caption text-ui-3">{entries.length}</span>
            <Button small variant="ghost" className="ml-auto" icon={<Maximize strokeWidth={1.5} />} title="Show the kiosk in this window" onClick={onOpenKioskView}>
              Open kiosk view
            </Button>
          </div>
          {entries.length === 0 && <ListEmpty>No display yet.</ListEmpty>}
          {entries.length > 0 && (
            <ul aria-label="Displays" className="flex flex-col gap-3">
              {entries.map((d) => (
                <DisplayCard
                  key={d.key}
                  entry={d}
                  profiles={config.profiles}
                  control={control}
                  touch={touch}
                  now={now}
                  highlighted={lit === d.key}
                  onRotationSettings={(id) => openSettings(id, "rotation")}
                />
              ))}
            </ul>
          )}
          <AddDisplayCard />
        </section>

        <section aria-label="Your screens" className="flex min-w-0 flex-1 flex-col gap-3 max-narrow:w-full">
          <div className="flex min-h-8 flex-wrap items-center gap-2">
            <h2 className="m-0 text-body font-medium text-ui-1">Your screens</h2>
            <span className="text-caption text-ui-3">{config.profiles.length}</span>
            <div className="ml-auto">
              <ScreensBar layout={list ? "list" : "grid"} onLayout={(l) => setList(l === "list")} sort={sort} onSort={setSort} showFilter={hasInfoPanel || filter !== "all"} filter={filter} onFilter={setFilter} filters={FILTERS} />
            </div>
          </div>

          {empty && <ListEmpty>{query ? `Nothing matches “${query}”.` : "No screens yet. Use New screen to start one."}</ListEmpty>}

          {list ? (
            <ul aria-label="Your screens" className="flex flex-col gap-2">
              {screens.map(screenItem)}
            </ul>
          ) : (
            <ul aria-label="Your screens" className={CARD_GRID}>
              {screens.map(screenItem)}
              <NewScreenCard onNew={onNew} onImportInfoPanel={() => openImportDoor({ prefer: "canvas-zone" })} />
            </ul>
          )}
          {list && (
            <div className="flex items-center gap-2 self-start">
              <Button onClick={onNew}>New screen</Button>
              <Button variant="ghost" title="Import an InfoPanel profile (.infopanel); it opens in Edit" onClick={() => openImportDoor({ prefer: "canvas-zone" })}>
                Import .infopanel
              </Button>
            </div>
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
        </section>
      </div>

      <Dialog.Root open={settingsOpen} onOpenChange={(open) => !open && closeSettings()}>
        <Dialog.Portal container={viewEl}>
          <Dialog.Backdrop className="absolute inset-0 z-20 bg-black/40" />
          <Dialog.Popup
            aria-label="Screen settings"
            finalFocus={() => (opener.current?.isConnected ? opener.current : true)}
            className="absolute inset-y-0 right-0 z-30 flex w-100 max-w-full flex-col border-l border-ui-subtle shadow-ui-drawer outline-none"
          >
            <ScreenDetail config={config} profile={profile} stored={stored} windowSize={windowSize} kiosks={kiosks} displays={displays} showOn={targets} autoProfileId={autoProfileId} onClose={closeSettings} {...detail} />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      </div>

      <DeleteDialog name={plan?.name ?? null} lines={plan ? deleteLines(plan) : []} onConfirm={() => deletingId && remove(deletingId, plan?.name ?? "")} onClose={() => setDeletingId(null)} />
    </div>
  );
}
