/**
 * The setup's Welcome, Your screen, Start and Finish steps (SPEC §7). They show what the page holds and hand changes
 * back; the page owns the state.
 */
import { useMemo, useState, type KeyboardEvent, type ReactNode, type Ref } from "react";
import { AppWindow, ArrowRight, Ban, Cast, CircleCheck, CircleX, FileUp, LayoutGrid, LayoutTemplate, Plus, Radar, Radio, Ratio, Server, TriangleAlert, type LucideIcon } from "lucide-react";
import { shapeClassOf, type ShapeClass } from "@/lib/infopanel/templates/layout";
import { cn } from "@/lib/utils";
import type { SensorMap } from "@/modules/types";
import { SCREEN_KIT } from "../../templates/screen-kit";
import { CLASS_NAMES, CLASS_ORDER, aspectOf } from "../../templates/shape-chips";
import { SIZE_PRESETS, hintOf, type Size } from "../../templates/size-presets";
import type { WizardEntry } from "../../templates/wizard-kit";
import { templatesFor, topPicks, validSize, type StartChoice } from "../first-run-model";
import { Rich, Spinner } from "./check-list";
import type { ProfileFile, Results } from "./checks";
import { sensorsLine, tally } from "./checks";

export const Heading = ({ children, headRef, large }: { children: ReactNode; headRef: Ref<HTMLHeadingElement>; large?: boolean }) => (
  <h1 ref={headRef} tabIndex={-1} className={cn("m-0 font-semibold text-ui-1 outline-none", large ? "text-[18px]" : "text-[15px]")}>
    {children}
  </h1>
);
export const Sub = ({ children }: { children: ReactNode }) => <p className="m-0 mt-1 max-w-[600px] text-[12.5px] leading-[1.5] text-ui-3">{children}</p>;

const CLASS_NOTES: Record<ShapeClass, string> = {
  standard: "Landscape up to about 2.4:1: small panels and monitors",
  wide: "Bar displays, about 2.4:1 to 4:1",
  strip: "Thin bars, 4:1 and wider",
  tall: "Portrait, taller than wide",
};
const GLYPHS: Record<ShapeClass, [number, number]> = { standard: [12, 8], wide: [15, 6], strip: [16, 4], tall: [6, 12] };
const Glyph = ({ cls }: { cls: ShapeClass }) => (
  <span aria-hidden className="inline-block rounded-[1.5px] border-[1.25px] border-current text-ui-3" style={{ width: GLYPHS[cls][0], height: GLYPHS[cls][1] }} />
);

// ---- Welcome ----

interface WelcomeProps {
  headRef: Ref<HTMLHeadingElement>;
  rerun: boolean;
  narrow: boolean;
  results: Results;
  onSeeChecks: () => void;
}

/** The Welcome step's progress strip: the checks' state in one line (SPEC §7.1). */
export function welcomeStrip(results: Results): { state: "running" | "ok" | "warn" | "fail"; title: string; note: string } {
  const t = tally(results);
  if (t.running) return { state: "running", title: `Checking your data… ${Math.min(t.done + 1, 8)} of 8`, note: "Already running. Results are waiting on the next step." };
  if (!t.api) return { state: "fail", title: "Studio can’t get live data yet", note: "The next step shows what’s wrong and how to fix it. You can also carry on without it." };
  const issues = t.fails + t.warns;
  if (issues > 0)
    return { state: "warn", title: issues === 1 ? "Connected, with a warning" : `Connected, with ${issues} warnings`, note: "Some readings will show placeholders. The next step says why." };
  const summary = results.reachable?.summary;
  return { state: "ok", title: summary ? `Connected · ${sensorsLine(summary)}` : "Connected", note: "Your templates will show real readings." };
}

export function WelcomeStep({ headRef, rerun, narrow, results, onSeeChecks }: WelcomeProps) {
  const cards: { icon: LucideIcon; title: string; text: string; meta: string }[] = [
    { icon: Radio, title: "InfoPanel", text: "Reads HWiNFO, system, network and media, and serves them through its Data API.", meta: "127.0.0.1:3921 · off by default" },
    { icon: LayoutGrid, title: "Studio", text: "Where you design screens from templates, widgets and your sensors.", meta: "This app" },
    { icon: Cast, title: "Your panels", text: "Studio’s own server shows your screens to panels and browsers on your network.", meta: "Kiosk · port 3922" },
  ];
  const strip = welcomeStrip(results);
  const StripIcon = strip.state === "ok" ? CircleCheck : strip.state === "warn" ? TriangleAlert : CircleX;
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Heading headRef={headRef} large>
          {rerun ? "Run setup again" : "Welcome to InfoPanel Studio"}
        </Heading>
        <p className="m-0 mt-1.5 max-w-[600px] text-body leading-[1.55] text-ui-2">
          {rerun
            ? "Check the link to InfoPanel again, see your kiosk address, or add a screen. Nothing changes until you finish, and your screens are kept."
            : "Design dashboards for the small screens on and around your PC: USB panels, case screens and bar displays. Studio reads your sensors from InfoPanel, a separate app, so it needs InfoPanel with the Data API installed. It’s already checking that link."}
        </p>
      </div>
      <ol className={cn("m-0 grid list-none items-stretch gap-0 p-0", narrow ? "grid-cols-1 gap-2" : "grid-cols-[1fr_auto_1fr_auto_1fr]")}>
        {cards.map((c, i) => (
          <li key={c.title} className="contents">
            {i > 0 && !narrow && (
              <span aria-hidden className="grid w-8 place-items-center text-ui-4">
                <ArrowRight className="h-3.5 w-3.5" />
              </span>
            )}
            <div className="flex flex-col gap-1.5 rounded-ui-menu border border-ui-subtle bg-ui-panel p-3">
              <span className="flex items-center gap-2 text-[12.5px] font-medium text-ui-1">
                <c.icon className="h-4 w-4 text-ui-3" />
                {c.title}
              </span>
              <span className="text-[11.5px] leading-[1.45] text-ui-3">{c.text}</span>
              <span className="mt-auto font-ui-mono text-micro text-ui-4">{c.meta}</span>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex items-center gap-3 rounded-ui-menu border border-ui-subtle bg-ui-panel px-3 py-2.5">
        {strip.state === "running" ? (
          <Spinner />
        ) : (
          <StripIcon className={cn("h-[18px] w-[18px] shrink-0", strip.state === "ok" ? "text-ui-success" : strip.state === "warn" ? "text-ui-warning" : "text-ui-danger")} strokeWidth={1.75} />
        )}
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-[12.5px] font-medium text-ui-1">{strip.title}</span>
          <span className="text-[11.5px] text-ui-3">{strip.note}</span>
        </span>
        <button type="button" onClick={onSeeChecks} className="h-7 shrink-0 rounded-[7px] border border-ui-strong bg-ui-raised px-2.5 text-caption text-ui-1 hover:bg-ui-hover">
          See the checks
        </button>
      </div>
    </div>
  );
}

// ---- Your screen ----

export type SizeSource = "preset" | "window" | "custom";

interface ScreenStepProps {
  headRef: Ref<HTMLHeadingElement>;
  narrow: boolean;
  size: Size;
  source: SizeSource;
  windowSize: Size;
  custom: { w: string; h: string };
  onPreset: (s: Size) => void;
  onWindow: () => void;
  onCustom: (c: { w: string; h: string }) => void;
}

const same = (a: Size, b: Size) => a.width === b.width && a.height === b.height;

/** "Standard", "Wide" … for a size. */
export const classNameOf = (s: Size): string => CLASS_NAMES[shapeClassOf(s.width, s.height)];
/** A size's physical panel, or its shape class. */
export const sizeNote = (s: Size, source: SizeSource): string => `${source === "window" ? "This window" : (hintOf(s) ?? `${(s.width / s.height).toFixed(2)}:1`)} · ${classNameOf(s)}`;

/** The custom size typed, when it is a valid one. */
export function customSize(c: { w: string; h: string }): Size | null {
  const width = Number(c.w.trim());
  const height = Number(c.h.trim());
  return c.w.trim() !== "" && c.h.trim() !== "" && validSize(width) && validSize(height) ? { width, height } : null;
}

function Preview({ size, source }: { size: Size; source: SizeSource }) {
  const scale = Math.min(196 / size.width, 166 / size.height);
  const w = Math.round(size.width * scale);
  const h = Math.round(size.height * scale);
  const n = templatesFor(SCREEN_KIT.entries, size.width, size.height);
  const cls = classNameOf(size);
  return (
    <>
      <div className="grid h-[166px] w-[196px] shrink-0 place-items-center">
        <div className="grid place-items-center rounded-[3px] border-[1.5px] border-ui-accent bg-ui-accent/[0.08]" style={{ width: w, height: h }}>
          {w > 56 && h > 22 && <span className="font-ui-mono text-micro text-ui-2">{(size.width / size.height).toFixed(2)}:1</span>}
        </div>
      </div>
      <div className="flex flex-col items-center gap-0.5 text-center">
        <span className="font-ui-mono text-body text-ui-1">
          {size.width} × {size.height}
        </span>
        <span className="text-[11.5px] text-ui-2">{sizeNote(size, source)}</span>
        <span className="text-micro text-ui-4">
          {n} of {SCREEN_KIT.entries.length} templates are made for {cls.toLowerCase()} screens
        </span>
      </div>
    </>
  );
}

/** Arrow keys move the selection inside a radiogroup (and focus the new one). */
export function arrowsMove(e: KeyboardEvent<HTMLElement>) {
  const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"];
  if (!keys.includes(e.key)) return;
  const radios = [...e.currentTarget.querySelectorAll<HTMLElement>('[role="radio"]')];
  const at = radios.indexOf(document.activeElement as HTMLElement);
  if (at < 0) return;
  e.preventDefault();
  const next = radios[(at + (e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 1) + radios.length) % radios.length];
  next.focus();
  next.click();
}

export function ScreenStep({ headRef, narrow, size, source, windowSize, custom, onPreset, onWindow, onCustom }: ScreenStepProps) {
  const typed = customSize(custom);
  const touched = custom.w !== "" || custom.h !== "";
  const tile = (on: boolean) =>
    cn("flex min-w-0 items-center gap-2.5 rounded-ui-md border px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60", on ? "border-ui-accent bg-ui-accent/10" : "border-ui-default bg-ui-raised hover:bg-ui-hover");
  const options = (
    <div role="radiogroup" aria-label="Screen size" onKeyDown={arrowsMove} className="flex min-w-0 flex-1 flex-col gap-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-2">
        <button type="button" role="radio" aria-checked={source === "window"} tabIndex={source === "window" ? 0 : -1} onClick={onWindow} className={cn(tile(source === "window"), "h-11")}>
          <AppWindow className="h-4 w-4 shrink-0 text-ui-3" />
          <span className="flex min-w-0 flex-col">
            <span className="text-[12.5px] font-medium text-ui-1">This window</span>
            <span className="font-ui-mono text-micro text-ui-3">
              {windowSize.width} × {windowSize.height}
            </span>
          </span>
        </button>
        <div className={cn(tile(source === "custom"), "h-11 cursor-default")}>
          <button
            type="button"
            role="radio"
            aria-checked={source === "custom"}
            tabIndex={source === "custom" ? 0 : -1}
            onClick={() => typed && onCustom(custom)}
            className="flex shrink-0 items-center gap-2.5 rounded-sm outline-none"
          >
            <Ratio className="h-4 w-4 text-ui-3" />
            <span className="text-[12.5px] font-medium text-ui-1">Custom</span>
          </button>
          <span className={cn("flex h-[26px] items-center rounded-ui-sm border bg-ui-app", touched && !typed ? "border-ui-danger" : "border-ui-default focus-within:border-ui-accent")}>
            {(["w", "h"] as const).map((k, i) => (
              <span key={k} className="flex items-center">
                {i === 1 && (
                  <span aria-hidden className="text-[10px] text-ui-4">
                    ×
                  </span>
                )}
                <input
                  inputMode="numeric"
                  aria-label={k === "w" ? "Custom width" : "Custom height"}
                  aria-invalid={touched && !typed}
                  value={custom[k]}
                  onChange={(e) => onCustom({ ...custom, [k]: e.target.value })}
                  className="h-full w-[50px] bg-transparent text-center font-ui-mono text-[11.5px] text-ui-1 outline-none focus-visible:shadow-none"
                />
              </span>
            ))}
          </span>
          <span className={cn("min-w-0 truncate text-micro", touched && !typed ? "text-ui-danger" : "text-ui-4")}>
            {!touched ? "Any size" : typed ? `${classNameOf(typed)} · ${(typed.width / typed.height).toFixed(2)}:1` : "Whole numbers, 100 to 8192"}
          </span>
        </div>
      </div>
      {CLASS_ORDER.map((cls) => (
        <section key={cls} aria-label={CLASS_NAMES[cls]} className="flex flex-col gap-1.5">
          <div className="flex items-center gap-2">
            <Glyph cls={cls} />
            <span className="text-caption font-medium text-ui-1">{CLASS_NAMES[cls]}</span>
            <span className="truncate text-micro text-ui-4">{CLASS_NOTES[cls]}</span>
          </div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-1.5">
            {SIZE_PRESETS.filter((p) => shapeClassOf(p.width, p.height) === cls).map((p) => {
              const on = source === "preset" && same(p, size);
              return (
                <button
                  key={`${p.width}x${p.height}`}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  tabIndex={on ? 0 : -1}
                  aria-label={`${p.width} × ${p.height}${hintOf(p) ? `, ${hintOf(p)}` : ""}`}
                  onClick={() => onPreset(p)}
                  className={cn(tile(on), "flex-col items-start justify-center gap-0 py-1.5")}
                >
                  <span className="font-ui-mono text-[11.5px] text-ui-1">
                    {p.width} × {p.height}
                  </span>
                  <span className="w-full truncate text-micro text-ui-3">{hintOf(p) ?? `${(p.width / p.height).toFixed(2)}:1`}</span>
                </button>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading headRef={headRef}>Your screen</Heading>
        <Sub>Pick the size of the display your dashboard runs on. You can add screens of other sizes later.</Sub>
      </div>
      {narrow ? (
        <>
          <div className="flex items-center gap-4 rounded-ui-menu border border-ui-subtle bg-ui-panel p-3">
            <Preview size={size} source={source} />
          </div>
          {options}
        </>
      ) : (
        <div className="flex items-start gap-5">
          {options}
          <aside className="sticky top-0 flex w-[240px] shrink-0 flex-col items-center gap-3 rounded-ui-menu border border-ui-subtle bg-ui-panel p-[18px]">
            <Preview size={size} source={source} />
          </aside>
        </div>
      )}
    </div>
  );
}

// ---- Start ----

interface StartStepProps {
  headRef: Ref<HTMLHeadingElement>;
  rerun: boolean;
  size: Size;
  start: StartChoice;
  onStart: (s: StartChoice) => void;
  pick: string | null;
  onPick: (id: string) => void;
  /** InfoPanel's profiles on this PC; null when Studio can't read them (no data folder, another PC, a browser). */
  profiles: ProfileFile[] | null;
  /** Why there are none, when `profiles` is null. */
  noProfiles: string;
  sensors: SensorMap | null;
  /** Check 6 warned that the hardware readings are missing. */
  noHardware: boolean;
}

/** The coverage line under a top pick (SPEC §7.4). */
export function coverageLine(fit: { need: number; found: number }, noData: boolean, noHardware: boolean): { text: string; tone: "ok" | "warn" | "off" } {
  if (noData) return { text: "Placeholders until data connects", tone: "off" };
  const missing = fit.need - fit.found;
  if (missing > 0 && noHardware) return { text: `${missing} ${missing === 1 ? "reading needs" : "readings need"} HWiNFO`, tone: "warn" };
  if (missing > 0) return { text: `${fit.found} of ${fit.need} sensors found`, tone: "warn" };
  return { text: `All ${fit.need} sensors found`, tone: "ok" };
}

const fmtBytes = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const fmtDate = (ms: number) => (ms > 0 ? new Date(ms).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "");

export function StartStep({ headRef, rerun, size, start, onStart, pick, onPick, profiles, noProfiles, sensors, noHardware }: StartStepProps) {
  // Browse all lists every template here, the ones made for the size first; Create stays on this page.
  const [all, setAll] = useState(false);
  const picks = useMemo(() => {
    const top = topPicks(SCREEN_KIT.entries, size.width, size.height, all ? SCREEN_KIT.entries.length : undefined);
    return all ? [...top, ...SCREEN_KIT.entries.filter((e) => !top.includes(e))] : top;
  }, [all, size.width, size.height]);
  const noData = !sensors || Object.keys(sensors).length === 0;
  const cards: { value: StartChoice; icon: LucideIcon; title: string; note: string }[] = [
    ...(rerun ? [{ value: "none" as const, icon: Ban, title: "Don’t add a screen", note: "Keep your screens as they are" }] : []),
    { value: "template", icon: LayoutTemplate, title: "A template", note: "Ready-made, filled with your sensors" },
    { value: "import", icon: FileUp, title: "Import from InfoPanel", note: profiles ? `${profiles.length} ${profiles.length === 1 ? "profile" : "profiles"} found on this PC` : "Choose a .infopanel file" },
    { value: "blank", icon: Plus, title: "Blank grid", note: "Empty, add widgets yourself" },
  ];
  const Host = SCREEN_KIT.Host;
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading headRef={headRef}>Start with</Heading>
        <Sub>{rerun ? "Add a screen now, or keep things as they are." : "Your first screen. Templates fill themselves with the sensors Studio just found."}</Sub>
      </div>
      <div role="radiogroup" aria-label="Start with" onKeyDown={arrowsMove} className="grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-2">
        {cards.map((c) => (
          <button
            key={c.value}
            type="button"
            role="radio"
            aria-checked={start === c.value}
            tabIndex={start === c.value ? 0 : -1}
            onClick={() => onStart(c.value)}
            className={cn(
              "flex h-12 min-w-0 items-center gap-2.5 rounded-ui-md border px-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60",
              start === c.value ? "border-ui-accent bg-ui-accent/10" : "border-ui-default bg-ui-raised hover:bg-ui-hover",
            )}
          >
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-ui-default bg-ui-app">
              <c.icon className="h-4 w-4 text-ui-2" />
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[12.5px] font-medium text-ui-1">{c.title}</span>
              <span className="truncate text-micro text-ui-3">{c.note}</span>
            </span>
            <span aria-hidden className={cn("grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border", start === c.value ? "border-ui-accent" : "border-ui-strong")}>
              {start === c.value && <span className="h-2 w-2 rounded-full bg-ui-accent" />}
            </span>
          </button>
        ))}
      </div>

      {start === "template" && (
        <section aria-label="Top picks" className="flex flex-col gap-2">
          {Host && <Host />}
          <div className="flex items-baseline gap-2">
            <h2 className="m-0 text-[12.5px] font-medium text-ui-1">
              {all ? `All ${SCREEN_KIT.entries.length} templates at` : "Top picks for"} {size.width} × {size.height}
            </h2>
            <span className="text-micro text-ui-4">{noData ? "Shown with placeholders: no live data yet" : "Shown with your readings"}</span>
          </div>
          <div role="radiogroup" aria-label="Template" onKeyDown={arrowsMove} className="grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-2">
            {picks.map((t: WizardEntry, i) => {
              const on = start === "template" && (pick ?? picks[0]?.id) === t.id;
              const fit = SCREEN_KIT.fitOf(t, sensors ?? {});
              // A template that reads no sensor of its own has no line, as on the New page.
              const cover = fit.need > 0 || noData ? coverageLine(fit, noData, noHardware) : null;
              return (
                <button
                  key={t.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={t.name}
                  tabIndex={on || (start !== "template" && i === 0) ? 0 : -1}
                  onClick={() => onPick(t.id)}
                  className={cn("flex min-w-0 flex-col overflow-hidden rounded-[10px] border text-left outline-none focus-visible:border-ui-accent", on ? "border-ui-accent bg-ui-accent/10" : "border-ui-default hover:bg-ui-hover")}
                >
                  <div className="relative w-full" style={{ aspectRatio: aspectOf(size.width, size.height) }}>
                    <SCREEN_KIT.Thumb entry={t} palette={t.palettes[0]?.id ?? ""} width={size.width} height={size.height} selected={on} />
                  </div>
                  <span className="truncate px-2 pt-1.5 text-caption font-medium text-ui-1">{t.name}</span>
                  <span className="truncate px-2 text-micro text-ui-4">{t.blurb}</span>
                  {cover ? (
                    <span className={cn("flex items-center gap-1 px-2 pb-2 pt-1 text-micro", cover.tone === "warn" ? "text-ui-warning" : cover.tone === "ok" ? "text-ui-3" : "text-ui-4")}>
                      <Radar className="h-3 w-3 shrink-0" />
                      {cover.text}
                    </span>
                  ) : (
                    <span className="pb-2" />
                  )}
                </button>
              );
            })}
            {!all && (
              <button
                type="button"
                onClick={() => setAll(true)}
                className="flex min-h-[120px] flex-col items-center justify-center gap-1.5 rounded-[10px] border border-dashed border-ui-strong p-3 text-center outline-none hover:bg-ui-hover focus-visible:border-ui-accent"
              >
                <LayoutGrid className="h-4 w-4 text-ui-3" />
                <span className="text-[12.5px] font-medium text-ui-1">Browse all {SCREEN_KIT.entries.length} templates</span>
                <span className="text-micro text-ui-3">The ones made for this size come first</span>
              </button>
            )}
          </div>
        </section>
      )}

      {start === "import" && (
        <section aria-label="InfoPanel profiles" className="flex flex-col gap-2">
          <div className="flex items-baseline gap-2">
            <h2 className="m-0 text-[12.5px] font-medium text-ui-1">
              {profiles && profiles.length > 0 ? `${profiles.length} InfoPanel ${profiles.length === 1 ? "profile" : "profiles"} on this PC` : "No InfoPanel profiles on this PC"}
            </h2>
            <span className="text-micro text-ui-4">{profiles ? "From %LOCALAPPDATA%\\InfoPanel\\profiles" : noProfiles}</span>
          </div>
          {profiles && profiles.length > 0 && (
            <ul className="m-0 overflow-hidden rounded-ui-menu border border-ui-subtle bg-ui-panel p-0">
              {profiles.map((p, i) => (
                <li key={p.guid} className={cn("flex items-center gap-3 px-3 py-2 text-caption", i > 0 && "border-t border-s-divider")}>
                  <span className="min-w-0 flex-1 truncate text-ui-1">{p.name || "Untitled"}</span>
                  <span className="hidden truncate text-micro text-ui-4 sm:block">{p.file}</span>
                  <span className="w-16 shrink-0 text-right font-ui-mono text-micro text-ui-3">{fmtBytes(p.bytes)}</span>
                  <span className="w-24 shrink-0 text-right text-micro text-ui-3">{fmtDate(p.modified)}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="m-0 text-[11.5px] text-ui-3">
            {profiles && profiles.length > 0
              ? "After setup, the import opens on these: pick a profile, and it comes in at its own size. Your files in InfoPanel aren’t changed."
              : "After setup, choose a .infopanel file. It comes in as an InfoPanel profile at its own size."}
          </p>
        </section>
      )}

      {start === "blank" && (
        <p className="m-0 rounded-ui-menu border border-ui-subtle bg-ui-panel px-3 py-2.5 text-caption text-ui-2">
          An empty {size.width} × {size.height} grid. Add widgets from the Add panel: it suggests the ones your sensors can fill.
        </p>
      )}
    </div>
  );
}

// ---- Finish ----

export interface SummaryRow {
  icon: LucideIcon;
  label: string;
  value: string;
  sub: string;
  tone?: "ok" | "warn" | "fail";
  /** The step Change jumps to. */
  step?: number;
}

export function Switch({ label, note, checked, onChange }: { label: string; note: string; checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-[12.5px] text-ui-1">{label}</span>
        <span className="text-micro text-ui-3">{note}</span>
      </span>
      <input type="checkbox" role="switch" aria-checked={checked} checked={checked} onChange={(e) => onChange(e.target.checked)} className="peer sr-only" />
      <span
        aria-hidden
        className={cn(
          "relative h-[18px] w-[30px] shrink-0 rounded-full transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ui-accent/60",
          checked ? "bg-ui-accent" : "bg-ui-strong",
        )}
      >
        <span className={cn("absolute top-[3px] h-3 w-3 rounded-full bg-white transition-[left]", checked ? "left-[15px]" : "left-[3px]")} />
      </span>
    </label>
  );
}

interface FinishStepProps {
  headRef: Ref<HTMLHeadingElement>;
  rerun: boolean;
  rows: SummaryRow[];
  onChange: (step: number) => void;
  /** The switches the build can back (the desktop app in a setup session); the kiosk one always. */
  options: ReactNode;
}

export function FinishStep({ headRef, rerun, rows, onChange, options }: FinishStepProps) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Heading headRef={headRef}>{rerun ? "Review changes" : "Ready to go"}</Heading>
        <Sub>Here’s what Studio will set up. Change anything now, or later in Settings.</Sub>
      </div>
      <ul className="m-0 overflow-hidden rounded-ui-menu border border-ui-subtle bg-ui-panel p-0">
        {rows.map((r, i) => (
          <li key={r.label} className={cn("flex items-start gap-3 px-3 py-2.5", i > 0 && "border-t border-s-divider")}>
            <r.icon className={cn("mt-px h-4 w-4 shrink-0", r.tone === "ok" ? "text-ui-success" : r.tone === "warn" ? "text-ui-warning" : r.tone === "fail" ? "text-ui-danger" : "text-ui-3")} />
            <span className="w-24 shrink-0 text-caption text-ui-2">{r.label}</span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className="break-words text-[12.5px] text-ui-1">{r.value}</span>
              <span className={cn("text-micro", r.tone === "warn" ? "text-ui-warning" : r.tone === "fail" ? "text-ui-danger" : "text-ui-3")}>
                <Rich text={r.sub} />
              </span>
            </span>
            {r.step !== undefined && (
              <button type="button" onClick={() => r.step !== undefined && onChange(r.step)} className="shrink-0 rounded-sm text-caption text-ui-accent-text hover:underline">
                Change
              </button>
            )}
          </li>
        ))}
      </ul>
      <section aria-label="Options" className="flex flex-col gap-1.5">
        <h2 className="m-0 text-caption font-medium text-ui-1">Options</h2>
        <div className="divide-y divide-s-divider overflow-hidden rounded-ui-menu border border-ui-subtle bg-ui-panel">{options}</div>
      </section>
      <p className="m-0 text-micro text-ui-4">Run setup again any time from Settings → General → Run setup.</p>
    </div>
  );
}

export const SUMMARY_ICONS = { data: Radar, screen: AppWindow, start: LayoutTemplate, kiosk: Server };
