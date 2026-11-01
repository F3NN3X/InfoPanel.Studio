/**
 * The New page: New screen and New InfoPanel profile as one page (`new-wizard.tsx`), opened by Screens' + New and by
 * the InfoPanel home's Create cards. The kind switch changes what it makes in place (the studio moves the rail with it);
 * the size, name, search and filter start over, and the selection carries over when that template is in both kinds.
 * The gallery picks Blank, a template (in one of its palettes) or, for a profile, a saved Library profile; the inspector
 * beside it shows the preview, the size, colours, sensors and name; Create makes it from any state. The templates come
 * in their own chunk (`wizard-kit.ts`): until they arrive the gallery is a skeleton and the selection is Blank.
 *
 * A screen template is made for the size with its sensors found on this machine (`instantiate`); Blank is an empty
 * grid (`newProfile`). A profile template's sensors are matched the same way, each role open to a pick of another, and
 * what isn't found is left for Remap; Blank is made from scratch (`newStored`); a Library profile is copied as it is.
 */
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Bookmark, FileUp, LayoutGrid, LayoutTemplate, PenTool, Plus } from "lucide-react";
import { useSensorCatalog } from "@/lib/catalog";
import type { ChosenSensor } from "@/lib/infopanel/editor/bind";
import { newStored, type StoredCanvas } from "@/lib/infopanel/import/stored";
import { shapeClassOf } from "@/lib/infopanel/templates/layout";
import type { Role } from "@/lib/infopanel/templates/roles";
import { newProfile, type MonitorProfile } from "@/lib/layout";
import { listLibrary, type LibraryItem } from "@/lib/library";
import { canvasData, copyOfProfile } from "@/lib/my-library/canvas-link";
import { isProfileItem } from "@/lib/my-library/component-meta";
import { ProfileThumb } from "../infopanel/profile-thumb";
import { RoleSensors, type RoleOverrides } from "../infopanel/role-sensors";
import { gallerySections, type GalleryCard, type SortBy } from "./gallery-sections";
import { KIND_TITLES, NewWizard, WizardPreview, useNarrow, type WayIn, type WizardStep } from "./new-wizard";
import { pushRecent, readRecent, type WizardKind } from "./recent-templates";
import { SensorSummary } from "./sensor-summary";
import type { ShapeFilter } from "./shape-chips";
import { INPUT, SizePicker } from "./size-picker";
import { hintOf, presetIndexOf, type Size } from "./size-presets";
import { sizeFollowing, useSizeChoice } from "./use-size-choice";
import { VariantChips } from "./variant-chips";
import { WizardGallery, sectionId } from "./wizard-gallery";
import { useKit, type Kit, type SensorFit, type WizardEntry } from "./wizard-kit";
import { BlankPreview, ExpandedPreview, SensorBadge, ShapeWarning, classList } from "./wizard-parts";

export interface NewScreen {
  profile: MonitorProfile;
  /** The template's sensors not found on this machine, in plain words; empty for Blank. */
  unbound: string[];
}

export interface NewProfile {
  name: string;
  width: number;
  height: number;
  stored: StoredCanvas;
  /** The template's sensors left unbound (not found on this machine, or let go in Create), in plain words; empty for Blank. */
  unbound: string[];
  /** "Also save to Library" was ticked: the studio saves the new profile as a Library item. */
  toLibrary: boolean;
}

/** What the page opens on: Blank (null), a template in a palette, or a Library profile (the InfoPanel home's cards). */
export interface NewChoice {
  template: string | null;
  variant: string;
  library?: string;
}

interface NewPageProps {
  kind: WizardKind;
  /** The kind switch: the studio moves the rail and gives the new kind back. */
  onKind: (kind: WizardKind) => void;
  /** The screen selected in the studio: a blank screen opens at its size when that is a panel preset. */
  screen: Size;
  /** The InfoPanel home's Create card it opens on. */
  initial?: NewChoice;
  onCreateScreen: (made: NewScreen) => void;
  onCreateProfile: (made: NewProfile) => void;
  /** Cancel or Escape: back to where it was opened from. */
  onCancel: () => void;
  /** The ways in that leave the page. */
  onSample: () => void;
  onImport: (kind: WizardKind) => void;
}

/** The sizes Blank opens at: a 7″ panel for a screen (unless the selected screen is a preset), InfoPanel's usual panel for a profile. */
const SCREEN_START: Size = { width: 1024, height: 600 };
const PROFILE_START: Size = { width: 800, height: 480 };
/** The template selected when nothing else is (and when the other kind's isn't in this one). */
const FALLBACK: Record<WizardKind, string> = { screen: "general", ip: "graphite" };

type Selection = { type: "blank" } | { type: "template"; id: string; drawn?: Size } | { type: "library"; id: string };

const LIBRARY_ID = "lib:";
const savedOn = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "Saved" : `Saved ${d.toLocaleDateString(undefined, { day: "numeric", month: "short" })}`;
};
const libraryEntry = (item: LibraryItem): WizardEntry => {
  const size = { width: Number(item.meta.width) || 800, height: Number(item.meta.height) || 480 };
  return { id: LIBRARY_ID + item.id, name: item.name, blurb: savedOn(item.updatedAt), fits: [shapeClassOf(size.width, size.height)], size, palettes: [] };
};

export default function NewPage(props: NewPageProps) {
  // Each kind is its own page state; what was selected comes along when the other kind has it too.
  const [carry, setCarry] = useState<string | undefined>();
  return (
    <KindPage
      key={props.kind}
      {...props}
      carry={carry}
      onKind={(kind, selected) => {
        setCarry(selected);
        props.onKind(kind);
      }}
    />
  );
}

interface KindPageProps extends Omit<NewPageProps, "onKind"> {
  carry?: string;
  onKind: (kind: WizardKind, selected: string | undefined) => void;
}

function initialSelection(kind: WizardKind, initial: NewChoice | undefined, carry: string | undefined, recent: readonly string[]): Selection {
  if (kind === "ip" && initial) {
    if (initial.library) return { type: "library", id: LIBRARY_ID + initial.library };
    return initial.template ? { type: "template", id: initial.template } : { type: "blank" };
  }
  // A screen template picked in the Library opens on that template.
  if (initial?.template) return { type: "template", id: initial.template };
  return { type: "template", id: carry ?? recent[0] ?? FALLBACK[kind] };
}

function KindPage({ kind, onKind, screen, initial, carry, onCreateScreen, onCreateProfile, onCancel, onSample, onImport }: KindPageProps) {
  const ip = kind === "ip";
  const start = useMemo(() => (ip ? PROFILE_START : presetIndexOf(screen) === undefined ? SCREEN_START : { width: screen.width, height: screen.height }), [ip, screen.width, screen.height]);
  const kit = useKit(kind);
  const catalog = useSensorCatalog();
  const sensors = catalog.sensors;
  const hwinfo = catalog.sources?.hwinfo;
  const noData = Object.keys(sensors).length === 0;
  const [recent, setRecent] = useState(() => readRecent(kind));
  const [chosen, setChosen] = useState<Selection>(() => initialSelection(kind, initial, carry, recent));
  const [palettes, setPalettes] = useState<Record<string, string>>(() => (initial?.template ? { [initial.template]: initial.variant } : {}));
  const [name, setName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ShapeFilter>("all");
  const [sort, setSort] = useState<SortBy>("shape");
  const [overrides, setOverrides] = useState<RoleOverrides>({});
  const [toLibrary, setToLibrary] = useState(false);
  const [profiles, setProfiles] = useState<LibraryItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [step, setStep] = useState<WizardStep>(initial ? 1 : 0);
  const [formRef, narrow] = useNarrow<HTMLFormElement>();
  const scrollRef = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (!ip) return;
    listLibrary().then(
      (all) => setProfiles(all.filter(isProfileItem)),
      () => setProfiles([]),
    );
  }, [ip]);

  const library = useMemo(() => profiles.map(libraryEntry), [profiles]);
  const entryOf = (id: string): WizardEntry | undefined => (id.startsWith(LIBRARY_ID) ? library.find((e) => e.id === id) : kit?.entries.find((e) => e.id === id));
  // A template this kind doesn't have (carried over, or gone from Recent) falls back to the usual one.
  const selection: Selection = !kit
    ? { type: "blank" }
    : chosen.type === "template" && !entryOf(chosen.id)
      ? { type: "template", id: FALLBACK[kind] }
      : chosen.type === "library" && !entryOf(chosen.id)
        ? { type: "blank" }
        : chosen;
  const entry = selection.type === "blank" ? undefined : entryOf(selection.id);
  const template = selection.type === "template" ? entry : undefined;
  const saved = selection.type === "library" ? profiles.find((p) => LIBRARY_ID + p.id === selection.id) : undefined;
  const paletteOf = (e: WizardEntry) => palettes[e.id] ?? e.palettes[0]?.id ?? "";
  const palette = template ? paletteOf(template) : "";
  // A variant is named with its template ("Terminal · Amber"), never alone.
  const variantName = template?.palettes.find((v) => v.id === palette)?.name;

  const followed = selection.type === "template" && template ? (selection.drawn ?? sizeFollowing(template, start)) : (entry?.size ?? start);
  const sized = useSizeChoice(followed);
  const userSize = sized.touched ? sized.shown : null;
  // A Library profile keeps its own size.
  const size = saved && entry ? entry.size : sized.size;
  const shown = saved && entry ? entry.size : sized.shown;
  const shownName = name ?? (entry ? entry.name : ip ? "New profile" : "Blank");
  const canCreate = shownName.trim() !== "" && size.width !== null && size.height !== null;

  const gallery = useMemo(
    () =>
      kit
        ? gallerySections({ entries: kit.entries, library: ip ? library : [], recent, query, tagsOf: kit.tagsOf, filter, sort, start, user: userSize })
        : undefined,
    [kit, ip, library, recent, query, filter, sort, start, userSize?.width, userSize?.height],
  );

  const roles = useMemo(
    () => (kit?.kind === "ip" && template ? kit.roles(template, { palette, sensors, hwinfo, overrides }) : []),
    [kit, template, palette, sensors, hwinfo, overrides],
  );
  const fit: SensorFit | undefined =
    template && kit ? (kit.kind === "ip" ? { need: roles.length, found: roles.filter((r) => r.sensor).length } : kit.fitOf(template, sensors)) : undefined;

  const select = (next: Selection) => {
    setOverrides({});
    setError(null);
    setChosen(next);
  };
  const pickBlank = () => {
    select({ type: "blank" });
    setQuery("");
  };
  const pickCard = (card: GalleryCard, pal?: string) => {
    if (pal) setPalettes((p) => ({ ...p, [card.entry.id]: pal }));
    select(card.library ? { type: "library", id: card.entry.id } : { type: "template", id: card.entry.id, drawn: card.size });
  };
  /** Select by id at the template's own size (the arrow keys, Enter in search). */
  const pickId = (id: string) => select(id.startsWith(LIBRARY_ID) ? { type: "library", id } : { type: "template", id });
  const useOwn = () => {
    sized.reset();
    if (selection.type === "template") setChosen({ type: "template", id: selection.id });
  };

  /** Make `at`: at the size set here, else at `drawn` (the card double-clicked), else at the size shown. */
  const make = async (at: Selection, drawn?: Size) => {
    const target = at.type === "blank" ? undefined : entryOf(at.id);
    if (at.type !== "blank" && !target) return;
    const sz = at.type === "library" ? target!.size : !sized.touched && drawn ? drawn : size;
    const made = (name ?? target?.name ?? (ip ? "New profile" : "Blank")).trim();
    if (made === "" || sz.width === null || sz.height === null) return;
    const p = { name: made, width: sz.width, height: sz.height };
    if (at.type === "template") setRecent(pushRecent(kind, target!.id));
    if (!ip) {
      const screen = at.type === "template" && kit?.kind === "screen" ? kit.make(target!, { ...p, palette: paletteOf(target!), sensors }) : { profile: newProfile(p.name, p.width, p.height), unbound: [] };
      return onCreateScreen(screen);
    }
    if (at.type === "library") {
      const item = profiles.find((x) => LIBRARY_ID + x.id === at.id);
      const stored = item && (await canvasData(item).catch(() => undefined));
      if (!stored) return setError("That profile couldn’t be read from the Library.");
      return onCreateProfile({ ...p, stored: copyOfProfile(stored, p.name), unbound: [], toLibrary });
    }
    const instance =
      at.type === "template" && kit?.kind === "ip"
        ? kit.make(target!, { ...p, palette: paletteOf(target!), sensors, hwinfo, overrides: target === template ? overrides : undefined })
        : { stored: newStored(p), unbound: [] };
    onCreateProfile({ ...p, stored: instance.stored, unbound: instance.unbound, toLibrary });
  };
  const create = () => void make(selection);
  const createCard = (card: GalleryCard) => {
    pickCard(card);
    void make(card.library ? { type: "library", id: card.entry.id } : { type: "template", id: card.entry.id }, card.library ? undefined : card.size);
  };

  const focusCard = (id: string) => requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>(`[data-card="${CSS.escape(id)}"]`)?.focus());
  const stepBy = (id: string, by: 1 | -1) => {
    const order = gallery?.order ?? [];
    const next = order[Math.max(0, Math.min(order.length - 1, order.indexOf(id) + by))];
    if (!next) return;
    pickId(next);
    focusCard(next);
  };

  // The keyboard starts on the inspector's heading, or on the selected card when the gallery is a step of its own.
  useEffect(() => {
    if (narrow && step === 0) {
      if (selection.type !== "blank") focusCard(selection.id);
    } else heading.current?.focus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [narrow, step]);

  const switchKind = (k: WizardKind) => onKind(k, selection.type === "template" ? selection.id : undefined);
  const jumpToLibrary = () => {
    setQuery("");
    setFilter("all");
    setSort("shape");
    requestAnimationFrame(() => document.getElementById(sectionId("library"))?.scrollIntoView({ block: "start" }));
  };
  const blankWay = (title: string, note: string): WayIn => ({
    id: "blank",
    icon: Plus,
    title,
    note,
    does: "blank",
    checked: selection.type === "blank",
    onSelect: pickBlank,
    onCreate: () => void make({ type: "blank" }),
  });
  const ways: WayIn[] = ip
    ? [
        blankWay("Blank canvas", `${PROFILE_START.width} × ${PROFILE_START.height}, nothing on it`),
        {
          id: "library",
          icon: Bookmark,
          title: "From your Library",
          note: profiles.length > 0 ? `${profiles.length} saved ${profiles.length === 1 ? "profile" : "profiles"}` : "Nothing saved yet",
          does: "jump",
          disabled: profiles.length === 0,
          onSelect: jumpToLibrary,
        },
        { id: "import", icon: FileUp, title: "Import .infopanel", note: "A profile from the InfoPanel app", does: "leave", onSelect: () => onImport("ip") },
        { id: "screen", icon: LayoutGrid, title: "A screen instead", note: "Native widgets on a grid", does: "switch", onSelect: () => switchKind("screen") },
      ]
    : [
        blankWay("Blank grid", "An empty grid, add widgets after"),
        { id: "sample", icon: LayoutTemplate, title: "The sample layout", note: "A bit of everything, made at once", does: "leave", onSelect: onSample },
        { id: "infopanel", icon: PenTool, title: "An InfoPanel profile", note: "Free canvas, exports to .infopanel", does: "switch", onSelect: () => switchKind("ip") },
        { id: "import", icon: FileUp, title: "Import a file", note: "A screen or an .infopanel profile", does: "leave", onSelect: () => onImport("screen") },
      ];

  const tall = shapeClassOf(shown.width, shown.height) === "tall";
  const room = narrow ? (tall ? { width: 200, height: 520 } : { width: 728, height: 340 }) : tall ? { width: 150, height: 470 } : { width: 428, height: 280 };
  // The live preview draws a whole screen: it waits for the gallery's first paint, and trails a new pick by a frame.
  const painted = usePainted(!!kit);
  const laterTemplate = useDeferredValue(template);
  const laterPalette = useDeferredValue(palette);
  const laterWidth = useDeferredValue(shown.width);
  const laterHeight = useDeferredValue(shown.height);
  const previewBody = () =>
    template && kit ? (
      painted &&
      laterTemplate && (
        <kit.Preview entry={laterTemplate} palette={laterPalette} width={laterWidth} height={laterHeight} sensors={sensors} hwinfo={hwinfo} overrides={overrides} />
      )
    ) : saved ? (
      <ProfileThumb item={saved} />
    ) : (
      <BlankPreview size={shown} grid={!ip} />
    );
  const preview = (
    <WizardPreview
      width={shown.width}
      height={shown.height}
      max={room}
      hint={tall ? undefined : hintOf(shown)}
      onExpand={narrow ? undefined : () => setExpanded(true)}
      noData={noData && !!template}
    >
      {previewBody()}
    </WizardPreview>
  );
  const fields = (
    <div className="flex min-w-0 flex-1 flex-col gap-3.5">
      {template && !template.fits.includes(shapeClassOf(shown.width, shown.height)) && (
        <ShapeWarning name={template.name} fits={template.fits} size={shown} own={template.size} onUseOwn={useOwn} />
      )}
      {!saved && <SizePicker sized={sized} own={template?.size ?? (selection.type === "blank" ? start : undefined)} owner={template?.name} onUseOwn={useOwn} />}
      {template && template.palettes.length > 1 && (
        <VariantChips variants={template.palettes} value={palette} onChange={(v) => setPalettes((p) => ({ ...p, [template.id]: v }))} className="" />
      )}
      {template && fit && fit.need > 0 && (
        <SensorSummary kind={kind} fit={fit} noData={noData}>
          {ip && <RoleSensors roles={roles} onOverride={(role: Role, sensor: ChosenSensor | null) => setOverrides((o) => ({ ...o, [role]: sensor }))} />}
        </SensorSummary>
      )}
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] text-ui-2">Name</span>
        <input value={shownName} onChange={(e) => setName(e.target.value)} aria-label="Name" className={INPUT} />
      </label>
      {ip && (
        <label className="flex items-center gap-2 text-[12.5px] text-ui-2">
          <input type="checkbox" checked={toLibrary} onChange={(e) => setToLibrary(e.target.checked)} className="h-3.5 w-3.5 accent-[var(--ui-accent)]" />
          Also save to Library
        </label>
      )}
      {error && (
        <p role="alert" className="m-0 text-[11.5px] text-ui-danger">
          {error}
        </p>
      )}
      <p className="m-0 text-[11.5px] leading-normal text-ui-4">
        {ip
          ? "It comes in as a new screen and opens in Edit. You can change the size later in its profile settings."
          : "It comes in as a new screen. You can change its size and grid later on Screens."}
      </p>
    </div>
  );
  const inspector = (
    <>
      <div className="flex min-w-0 items-baseline gap-2">
        <h2 ref={heading} tabIndex={-1} className="m-0 shrink-0 text-[13px] font-semibold text-ui-1 outline-none">
          {entry ? entry.name : ip ? "Blank canvas" : "Blank grid"}
        </h2>
        <span className="min-w-0 truncate text-[11px] text-ui-4">{template ? `Made for ${classList(template.fits)}` : saved ? entry?.blurb : "Add widgets after you create it"}</span>
      </div>
      {tall ? (
        <div className="flex items-start gap-4">
          {preview}
          {fields}
        </div>
      ) : (
        <>
          {preview}
          {fields}
        </>
      )}
    </>
  );

  return (
    <NewWizard
      kind={kind}
      onKind={switchKind}
      helpArticle={ip ? "infopanel-editor" : "profiles"}
      formRef={formRef}
      narrow={narrow}
      step={step}
      onStep={setStep}
      onCancel={onCancel}
      onCreate={create}
      canCreate={canCreate}
      createLabel={ip ? "Create profile" : "Create screen"}
      onEscape={() => {
        if (!expanded) return false;
        setExpanded(false);
        return true;
      }}
      summary={
        <>
          <span className="truncate text-[12px] font-medium text-ui-1">{entry ? [entry.name, variantName].filter(Boolean).join(" · ") : KIND_TITLES[kind].replace("New", "Blank")}</span>
          <span className="shrink-0 font-ui-mono text-[11px] text-ui-3">
            {shown.width} × {shown.height}
          </span>
        </>
      }
      gallery={
        <WizardGallery
          query={query}
          onQuery={setQuery}
          onSearchEnter={() => gallery?.order[0] && pickId(gallery.order[0])}
          filter={filter}
          onFilter={setFilter}
          counts={gallery?.counts}
          sort={sort}
          onSort={setSort}
          ways={ways}
          loading={!kit}
          sections={gallery?.sections ?? []}
          onStartBlank={pickBlank}
          selected={selection.type === "blank" ? null : selection.id}
          paletteOf={(card) => paletteOf(card.entry)}
          onPick={pickCard}
          onCreate={createCard}
          onStep={stepBy}
          thumb={(card) => <CardThumb card={card} kit={kit} profiles={profiles} palette={paletteOf(card.entry)} selected={selection.type !== "blank" && selection.id === card.entry.id} />}
          badge={(card) => (card.library || !kit || !painted ? null : <SensorBadge fit={noData ? undefined : kit.fitOf(card.entry, sensors)} noData={noData} />)}
          tag={(card) =>
            card.library ? "Library" : userSize && !card.entry.fits.includes(shapeClassOf(userSize.width, userSize.height)) ? `${classTitle(card.entry.size)} only` : undefined
          }
          host={kit?.Host}
          scrollRef={scrollRef}
          overlay={
            expanded && !narrow ? (
              <ExpandedPreview size={shown} onCollapse={() => setExpanded(false)}>
                {previewBody()}
              </ExpandedPreview>
            ) : undefined
          }
        />
      }
      inspector={inspector}
    />
  );
}

const classTitle = (s: Size) => {
  const c = shapeClassOf(s.width, s.height);
  return c.charAt(0).toUpperCase() + c.slice(1);
};

function CardThumb({ card, kit, profiles, palette, selected }: { card: GalleryCard; kit?: Kit; profiles: readonly LibraryItem[]; palette: string; selected: boolean }) {
  if (card.library) {
    const item = profiles.find((p) => LIBRARY_ID + p.id === card.entry.id);
    return item ? <ProfileThumb item={item} /> : null;
  }
  if (!kit) return null;
  return <kit.Thumb entry={card.entry} palette={palette} width={card.size.width} height={card.size.height} selected={selected} />;
}

/** False until the page has painted once with `ready`: what is slow to draw waits for the gallery to show. */
function usePainted(ready: boolean): boolean {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    if (!ready || painted) return;
    let timer = 0;
    const frame = requestAnimationFrame(() => {
      timer = window.setTimeout(() => setPainted(true));
    });
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [ready, painted]);
  return painted;
}
