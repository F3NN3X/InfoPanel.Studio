import { lazy, Suspense, useMemo, useState } from "react";
import { Pencil } from "lucide-react";
import { useToast } from "@/components/ui/toast";
import type { MonitorProfile } from "@/lib/layout";
import { deletePlan } from "@/lib/screens/delete-plan";
import { sampleScreen } from "@/lib/screens/create";
import { filterEntries, KIND_LABEL, savedEntries, screenEntries, screenKind, sortEntries, type ListFilter, type ListSort } from "@/lib/screens/list";
import { moveProfile } from "@/lib/screens/order";
import type { LibraryItem } from "@/lib/library";
import { openConvertDialog, openExportSheet, openImportDoor, openNewInfoPanel } from "./file-doors";
import { RenameInput } from "./rename-input";
import { ScreenDetail } from "./screen-detail";
import { DeleteDialog } from "./screens/delete-dialog";
import { DisplaysList } from "./screens/displays-list";
import { aspectOf, Badge, CARD_BUTTON, ProfileCard } from "./screens/profile-card";
import { SavedCard } from "./screens/saved-card";
import { ScreenMenu } from "./screens/screen-menu";
import { ScreenThumb } from "./screens/screen-thumb";
import { ScreensToolbar } from "./screens/screens-toolbar";
import { useCopyKioskLink } from "./screens/shown-on";
import { useSavedProfiles } from "./screens/use-saved-profiles";
import { launchTag, screenMeta, withLaunch } from "./screens-model";
import { uniqueProfileName } from "./profile-actions";
import type { NewScreen } from "./screens/new-screen-dialog";

/** The New screen dialog and the template data load when it opens, never with the studio. */
const NewScreenDialog = lazy(() => import("./screens/new-screen-dialog"));

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
  /** Select a screen for editing (never changes what the app opens on). */
  onSelectProfile: (id: string) => void;
  onAddProfile: () => void;
  /** Add a screen made here (the sample layout) and edit it. */
  onAddMadeProfile: (profile: MonitorProfile) => void;
  onDuplicateProfile: (id: string) => void;
  /** Delete a screen (after the confirm dialog); one undo step. */
  onRemoveProfile: (id: string) => void;
  /** Undo the last step (the Undo on the delete toast). */
  onUndo: () => void;
  /** A saved Library profile: place it as a screen and open it in the InfoPanel editor. */
  onOpenSaved: (item: LibraryItem) => void;
}

const TAGS = {
  "best-fit": { text: "Default · best fit", title: "No screen is pinned: the app opens on the one closest to the studio window's size" },
  launch: { text: "Default", title: "The app opens on this screen whatever the window size" },
} as const;

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;

/**
 * Screens (SPEC §8): the manager for every screen and saved InfoPanel profile. Cards with thumbnails you can search,
 * filter by kind and sort; create (blank, sample layout, InfoPanel template), rename, duplicate, reorder, export and
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
  onAddProfile,
  onAddMadeProfile,
  onDuplicateProfile,
  onRemoveProfile,
  onUndo,
  onOpenSaved,
  ...detail
}: ScreensViewProps) {
  const toast = useToast();
  const copyLink = useCopyKioskLink();
  const savedApi = useSavedProfiles(config);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ListFilter>("all");
  const [sort, setSort] = useState<ListSort>("edited");
  const [newScreenOpen, setNewScreenOpen] = useState(false);
  const { setConfig, onOpenScreen } = detail;
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
    if (name) setConfig((c) => ({ ...c, profiles: c.profiles.map((p) => (p.id === id ? { ...p, name } : p)) }), `profile-name:${id}`);
  };
  const plan = deletingId ? deletePlan(config, deletingId, kiosks.map((k) => k.profile)) : null;
  const remove = (id: string, name: string) => {
    onRemoveProfile(id);
    toast(`Deleted ${name}`, { action: { label: "Undo", onClick: onUndo }, ms: 8000 });
  };
  const empty = screens.length === 0 && saved.length === 0;
  const addScreen = ({ profile: made, unbound }: NewScreen) => {
    const name = uniqueProfileName(config.profiles, made.name);
    onAddMadeProfile({ ...made, name });
    toast(unbound.length > 0 ? `${name} created. Not found on this PC: ${unbound.join(", ")}` : `${name} created`);
  };

  return (
    // On a phone the cards and the detail panel stack, and the view scrolls.
    <div className="flex min-h-0 flex-1 bg-ui-app/40 font-ui max-[899px]:flex-col max-[899px]:overflow-y-auto">
      <div className="flex min-w-0 flex-1 flex-col gap-4 overflow-auto px-6 py-5 max-[899px]:shrink-0 max-[899px]:overflow-visible max-[899px]:px-3">
        <div className="flex items-baseline gap-2">
          <h1 className="m-0 text-[15px] font-semibold text-ui-1">Screens</h1>
          <span className="text-[12px] text-ui-4">{plural(config.profiles.length, "screen")}</span>
        </div>

        <ScreensToolbar
          query={query}
          onQuery={setQuery}
          filter={filter}
          onFilter={setFilter}
          sort={sort}
          onSort={setSort}
          onImport={() => openImportDoor()}
          onNewBlank={() => {
            onAddProfile();
            toast("Screen created");
          }}
          onNewTemplate={() => setNewScreenOpen(true)}
          onNewSample={() => {
            onAddMadeProfile(sampleScreen(uniqueProfileName(config.profiles, "Sample layout")));
            toast("Screen created from the sample layout");
          }}
          onNewInfoPanel={() => openNewInfoPanel()}
        />

        <DisplaysList displays={displays} profiles={config.profiles} />

        {empty && (
          <p className="rounded-[10px] border border-dashed border-ui-default px-4 py-8 text-center text-[12.5px] text-ui-4">
            {query ? `Nothing matches "${query}".` : "Nothing here yet."}
          </p>
        )}

        {screens.length > 0 && (
          <ul aria-label="Your screens" className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
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
                      <Badge>{KIND_LABEL[kind]}</Badge>
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
                  thumb={<ScreenThumb profile={p} dashboard={config} />}
                  selected={p.id === stored.id}
                  onClick={() => onSelectProfile(p.id)}
                  label={`Select ${p.name}`}
                  menu={
                    <ScreenMenu
                      canDelete={config.profiles.length > 1}
                      canMoveEarlier={index > 0}
                      canMoveLater={index < config.profiles.length - 1}
                      onRename={() => setRenamingId(p.id)}
                      onDuplicate={() => {
                        onDuplicateProfile(p.id);
                        toast(`Duplicated ${p.name}`);
                      }}
                      onAlwaysOpen={() => {
                        setConfig((c) => withLaunch(c, p.id));
                        toast(`The app now always opens ${p.name}`);
                      }}
                      onMove={(by) => setConfig((c) => moveProfile(c, p.id, by))}
                      onCopyLink={() => copyLink(p.id)}
                      onExport={() => openExportSheet({ row: "screen", screenId: p.id })}
                      // The conversion reads the zones where they are drawn, so the screen opens on the canvas first.
                      onConvert={() => {
                        onOpenScreen(p.id);
                        window.setTimeout(() => openConvertDialog("screen"), 300);
                      }}
                      onDelete={() => setDeletingId(p.id)}
                    />
                  }
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
            <h2 className="m-0 mt-1 text-[13px] font-semibold text-ui-1">Saved in your Library</h2>
            <ul aria-label="Saved InfoPanel profiles" className="grid grid-cols-[repeat(auto-fill,minmax(230px,1fr))] gap-3">
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

      {newScreenOpen && (
        <Suspense fallback={null}>
          <NewScreenDialog open onOpenChange={setNewScreenOpen} onCreate={addScreen} size={windowSize} />
        </Suspense>
      )}

      <DeleteDialog plan={plan} onConfirm={() => deletingId && remove(deletingId, plan?.name ?? "")} onClose={() => setDeletingId(null)} />
    </div>
  );
}
