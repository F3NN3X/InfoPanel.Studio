/**
 * The first-run setup (SPEC §2–§11): a full-window page over the studio, in five steps (Welcome, Data checks, Your
 * screen, Start, Finish). The data checks start as it opens and run while the person reads; nothing they find blocks
 * Next. A rail (a stepper under 1100 px), a footer with Back and the primary button, and a status bar. Run again
 * (`rerun`) keeps the screens: Don't add a screen is the default and nothing is saved until Finish. Loaded on its own,
 * never with the studio.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, RefreshCw, X } from "lucide-react";
import { DEFAULT_API_BASE, normalizeApiBase } from "@/lib/data-api";
import { appSettings, isTauri, openHelp } from "@/lib/desktop";
import type { MonitorProfile } from "@/lib/layout";
import { SCREEN_TEMPLATES } from "@/lib/screen-templates/catalog";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";
import { SCREEN_KIT } from "../../templates/screen-kit";
import type { Size } from "../../templates/size-presets";
import { WindowControls } from "../window-controls";
import { DEFAULT_SIZE, needsHardware, type FirstRunChoices, type StartChoice } from "../first-run-model";
import { AddressBar, CheckGroup, CheckRow, KioskCard, OUTLINE_BUTTON, PRIMARY_BUTTON } from "./check-list";
import {
  CHECK_IDS,
  DEFAULT_ADDRESS,
  hostPort,
  progressLabel,
  sensorsLine,
  tally,
  type CheckAction,
  type CheckId,
  type CheckResult,
  type Mode,
  type Probes,
} from "./checks";
import { infopanelRestart, infopanelStart, setupEnd, setupOptions } from "./commands";
import { realProbes } from "./probes";
import { FinishStep, ScreenStep, StartStep, Switch, SUMMARY_ICONS, WelcomeStep, classNameOf, customSize, sizeNote, welcomeStrip, type SizeSource, type SummaryRow } from "./steps";
import { useChecks } from "./use-checks";

const STEPS = ["Welcome", "Data checks", "Your screen", "Start", "Finish"] as const;
const DATA = 1;
const FINISH = 4;
/** The rail shows from this window width; under it, the stepper. */
const WIDE_FROM = 1100;
/** An address edit reruns from check 5 this long after the last keystroke. */
const ADDRESS_DEBOUNCE_MS = 700;

/** What the setup asks the studio to do when it finishes. */
export interface SetupOutcome {
  choices: FirstRunChoices;
  /** The Data API address to save; undefined keeps the config's. */
  dataApiUrl?: string;
  /** What opens next: the new screen, the New page at the size, the import (InfoPanel's list or a file), or nothing. */
  next: "screen" | "import-installed" | "import-file" | "none";
  /** The kiosk to open in the browser. */
  openKiosk?: string;
}

export interface FirstRunPageProps {
  rerun: boolean;
  /** The Data API URL the config holds (the default when none). */
  dataApiUrl?: string;
  windowSize: Size;
  /** Finish: the outcome. */
  onFinish: (outcome: SetupOutcome) => void;
  /** Skip (first run): the address to save when it answered. Close (run again): nothing. */
  onSkip: (dataApiUrl: string | undefined) => void;
  /** The checks' probes; the real ones unless a test passes fakes. */
  probes?: Probes;
}

const isLoopback = (address: string) => {
  const hp = hostPort(address);
  return hp === null || hp.startsWith("127.") || hp.startsWith("[::1]");
};

export default function FirstRunPage({ rerun, dataApiUrl, windowSize, onFinish, onSkip, probes = realProbes }: FirstRunPageProps) {
  const toast = useToast();
  const saved = dataApiUrl ?? DEFAULT_API_BASE;
  const [step, setStep] = useState(0);
  const [visited, setVisited] = useState<ReadonlySet<number>>(() => new Set(rerun ? [0, 1, 2, 3, 4] : [0]));
  const [mode, setMode] = useState<Mode>(() => (isLoopback(saved) ? "local" : "remote"));
  const [address, setAddress] = useState(saved);
  const remembered = useRef(isLoopback(saved) ? "" : saved);
  const [size, setSize] = useState<Size>(DEFAULT_SIZE);
  const [source, setSource] = useState<SizeSource>("preset");
  const [custom, setCustom] = useState({ w: "", h: "" });
  const [start, setStart] = useState<StartChoice>(rerun ? "none" : "template");
  const [pick, setPick] = useState<string | null>(null);
  const [options, setOptions] = useState({ login: true, updates: true, kiosk: false });
  const [askSkip, setAskSkip] = useState(false);
  const [width, setWidth] = useState(() => window.innerWidth);
  const [now, setNow] = useState(() => Date.now());
  const head = useRef<HTMLHeadingElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const addressInput = useRef<HTMLInputElement>(null);
  const keepButton = useRef<HTMLButtonElement>(null);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);
  const narrow = width < WIDE_FROM;

  const hardwareNeeded = useMemo(
    () => needsHardware(SCREEN_TEMPLATES.flatMap((t) => Object.values(t.layouts).flatMap((l) => l?.pages.flat() ?? [])).flatMap((z) => Object.values(z.roles ?? {}))),
    [],
  );
  const checks = useChecks(probes, { mode, address, hardwareNeeded });
  const { results } = checks;
  const t = tally(results);
  const local = results.installed?.local ?? null;
  const canAct = isTauri() && local?.setup === true;

  // The checks start as the setup opens; the session's rights end when it closes.
  useEffect(() => {
    checks.run("installed");
    return () => {
      clearTimeout(debounce.current);
      void setupEnd();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Run again shows the current switches.
  useEffect(() => {
    if (!rerun) return;
    void appSettings().then((s) => s && setOptions((o) => ({ ...o, login: s.startAtLogin, updates: s.checkForUpdates })));
  }, [rerun]);
  useEffect(() => {
    const resize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  // The elapsed counters tick while a check runs.
  useEffect(() => {
    if (!t.running) return;
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, [t.running]);
  // Each step change focuses its heading and scrolls to the top.
  const firstFocus = useRef(true);
  useEffect(() => {
    if (firstFocus.current) {
      firstFocus.current = false;
      return;
    }
    head.current?.focus({ preventScroll: true });
    scroller.current?.scrollTo({ top: 0 });
  }, [step]);
  useEffect(() => {
    if (askSkip) keepButton.current?.focus();
  }, [askSkip]);

  const go = (n: number) => {
    const to = Math.max(0, Math.min(FINISH, n));
    setStep(to);
    setVisited((v) => new Set(v).add(to));
    setAskSkip(false);
  };

  const editAddress = (value: string) => {
    setAddress(value);
    if (mode === "remote") remembered.current = value;
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => checks.run("reachable", { address: value }), ADDRESS_DEBOUNCE_MS);
  };
  const applyAddress = (value: string, nextMode: Mode = mode, from: CheckId = "installed") => {
    clearTimeout(debounce.current);
    setAddress(value);
    setMode(nextMode);
    checks.run(from, { address: value, mode: nextMode });
  };
  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === "remote") {
      applyAddress(remembered.current, "remote");
      setTimeout(() => addressInput.current?.focus(), 0);
    } else applyAddress(DEFAULT_ADDRESS, "local");
  };

  const act = async (id: CheckId, action: CheckAction) => {
    switch (action.kind) {
      case "default":
        return applyAddress(DEFAULT_ADDRESS, "local");
      case "address":
        return applyAddress(action.address ?? DEFAULT_ADDRESS, mode, "switch");
      case "show":
      case "start":
      case "restart": {
        toast(action.kind === "restart" ? "Restarting InfoPanel…" : action.kind === "start" ? "Starting InfoPanel…" : "Opening InfoPanel…");
        try {
          await (action.kind === "restart" ? infopanelRestart() : infopanelStart());
          checks.run(id);
        } catch (err) {
          toast(action.kind === "restart" ? "InfoPanel didn’t close. Exit it from its tray icon, then choose Start InfoPanel." : `InfoPanel didn’t start: ${String(err)}`);
          checks.run(id);
        }
      }
    }
  };
  const help = (target: NonNullable<CheckResult["help"]>) => void openHelp({ article: target.article, heading: target.heading }).catch(() => {});

  // ---- what the steps show ----
  const answered = results.reachable?.status === "ok";
  const where = hostPort(address);
  const summary = results.reachable?.summary;
  const server = results.server?.server;
  const kioskUrl = server ? (server.network ?? server.local) : null;
  const sensors = results.live?.sensors ?? null;
  const noHardware = results.sensors?.status === "warn";
  const profiles = mode === "local" && local?.settings ? local.profiles : null;
  const noProfiles = mode === "remote" ? "Studio can only read profiles on this PC" : local === null && results.installed ? "Studio reads them from its desktop app" : "InfoPanel isn’t installed here";
  const templateName = SCREEN_KIT.entries.find((e) => e.id === (pick ?? SCREEN_KIT.entries.find((x) => x.fits.includes(shapeOf(size)))?.id))?.name;
  const importCount = profiles?.length ?? 0;
  const dataSub = t.running ? `Checking… ${Math.min(t.done + 1, 8)} of 8` : !t.api ? "Without live data" : t.fails > 0 ? `${t.fails} failed` : t.warns > 0 ? `${t.warns} ${t.warns === 1 ? "warning" : "warnings"}` : "All good";
  const startSub =
    start === "template" ? (templateName ?? "A template") : start === "import" ? (importCount > 0 ? `Import ${importCount} ${importCount === 1 ? "profile" : "profiles"}` : "Import a file") : start === "blank" ? "Blank grid" : "Keep my screens";
  const railSub = [rerun ? "Re-check and review" : "What Studio needs", dataSub, `${size.width} × ${size.height} · ${sizeNote(size, source).split(" · ")[0]}`, startSub, "Summary and options"];

  const primaryLabel =
    step === FINISH ? "Go to the studio" : step === DATA && !t.running && !t.api ? "Continue without live data" : "Next";

  const finish = () => {
    let template: MonitorProfile | undefined;
    if (start === "template") {
      const entry = SCREEN_KIT.entries.find((e) => e.id === (pick ?? topPick(size)));
      if (entry) template = SCREEN_KIT.make(entry, { name: entry.name, width: size.width, height: size.height, palette: entry.palettes[0]?.id ?? "", sensors: sensors ?? {} }).profile;
    }
    if (canAct) void setupOptions(options.login, options.updates).catch(() => {});
    const changedAddress = answered && normalizeApiBase(address) !== normalizeApiBase(saved) ? (normalizeApiBase(address) ?? undefined) : undefined;
    onFinish({
      choices: { width: size.width, height: size.height, start, template },
      dataApiUrl: changedAddress,
      next: start === "import" ? (profiles && profiles.length > 0 ? "import-installed" : "import-file") : start === "none" ? "none" : "screen",
      openKiosk: options.kiosk && kioskUrl ? kioskUrl : undefined,
    });
  };
  const primary = () => (step === FINISH ? finish() : go(step + 1));
  const skip = () => onSkip(rerun ? undefined : answered ? (normalizeApiBase(address) ?? undefined) : undefined);

  // ---- keyboard (SPEC §10) ----
  const keys = useRef({ primary, go, step, askSkip });
  keys.current = { primary, go, step, askSkip };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const k = keys.current;
      if (e.key === "Escape") {
        e.preventDefault();
        setAskSkip((open) => !open);
        return;
      }
      if (k.askSkip) return;
      if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
        e.preventDefault();
        k.go(k.step + (e.key === "ArrowLeft" ? -1 : 1));
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        if (k.step === DATA) checks.run("installed");
        return;
      }
      if (e.key === "Enter" && !e.altKey && !e.ctrlKey) {
        const target = e.target as HTMLElement;
        if (target.closest("input, button, a, textarea, select, [role='radio'], [role='switch']")) return;
        e.preventDefault();
        k.primary();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [checks]);

  // ---- the steps ----
  const finishRows: SummaryRow[] = [
    answered
      ? {
          icon: SUMMARY_ICONS.data,
          label: "Data",
          value: `Connected to ${where}`,
          sub: t.warns > 0 ? CHECK_IDS.filter((id) => results[id]?.status === "warn").map((id) => results[id]?.result ?? "").join(" · ") : summary ? sensorsLine(summary) : "",
          tone: t.warns > 0 ? "warn" : "ok",
          step: DATA,
        }
      : { icon: SUMMARY_ICONS.data, label: "Data", value: "No live data", sub: "Templates show placeholders. Fix it later in Data, or run setup again.", tone: "fail", step: DATA },
    { icon: SUMMARY_ICONS.screen, label: "Screen", value: `${size.width} × ${size.height}`, sub: sizeNote(size, source), step: 2 },
    {
      icon: SUMMARY_ICONS.start,
      label: "Start",
      value:
        start === "template"
          ? `${templateName ?? "Template"} at ${size.width} × ${size.height}`
          : start === "import"
            ? importCount > 0
              ? `Import from ${importCount} InfoPanel ${importCount === 1 ? "profile" : "profiles"}`
              : "Import a .infopanel file"
            : start === "blank"
              ? `A blank ${size.width} × ${size.height} grid`
              : "Nothing new",
      sub: start === "template" || start === "blank" ? (rerun ? "Added to Screens" : "Added to Screens as your first screen") : start === "none" ? "Your screens stay as they are" : "Opens next, with this size picked",
      step: 3,
    },
    server?.state === "running"
      ? { icon: SUMMARY_ICONS.kiosk, label: "Kiosk", value: kioskUrl ?? "", sub: `On this PC: ${server.local}` }
      : { icon: SUMMARY_ICONS.kiosk, label: "Kiosk", value: "Not serving yet", sub: "Studio’s server is still starting", tone: "warn" },
  ];
  if (start === "import" && importCount === 0) finishRows[2].sub = "Opens next: choose the file";

  const row = (id: CheckId, i: number) => (
    <CheckRow
      key={`${id}-${checks.runs[id] ?? 0}`}
      id={id}
      first={i === 0}
      result={results[id] ?? { status: "waiting", result: "Waiting" }}
      address={address}
      fixed={checks.fixed.has(id)}
      elapsed={results[id]?.status === "checking" ? Math.max(0, Math.floor((now - (checks.started[id] ?? now)) / 1000)) : 0}
      narrow={narrow}
      onAction={(cid, a) => void act(cid, a)}
      onAgain={(cid) => checks.run(cid)}
      onHelp={help}
    />
  );

  const body = [
    <WelcomeStep key="welcome" headRef={head} rerun={rerun} narrow={narrow} results={results} onSeeChecks={() => go(DATA)} />,
    <div key="data" className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <h1 ref={head} tabIndex={-1} className="m-0 text-[15px] font-semibold text-ui-1 outline-none">
            Check your data
          </h1>
          <p className="m-0 mt-1 max-w-[560px] text-[12.5px] leading-[1.5] text-ui-3">
            Studio checks each link between InfoPanel and your screens, in order. Nothing here blocks you: you can carry on without live data.
          </p>
        </div>
        <span aria-live="polite" className={cn("self-center text-[11.5px]", t.running ? "text-ui-3" : t.fails > 0 ? "text-ui-danger" : t.warns > 0 ? "text-ui-warning" : "text-ui-success")}>
          {progressLabel(results)}
        </span>
        <button type="button" title="Check again (F5)" onClick={() => checks.run("installed")} className={OUTLINE_BUTTON}>
          <RefreshCw className="h-3.5 w-3.5" />
          Check again
        </button>
      </div>
      <AddressBar
        mode={mode}
        address={address}
        invalid={address.trim() !== "" && where === null}
        onMode={switchMode}
        onAddress={editAddress}
        onDefault={() => applyAddress(DEFAULT_ADDRESS, "local")}
        isDefault={normalizeApiBase(address) === DEFAULT_ADDRESS}
        inputRef={addressInput}
      />
      <CheckGroup title="InfoPanel" note={mode === "local" ? "On this PC" : "Checks 1 to 4 need InfoPanel on this PC"}>
        {(["installed", "running", "version", "switch", "reachable"] as const).map(row)}
      </CheckGroup>
      <CheckGroup title="Data" note="What the templates will read">
        {(["sensors", "live"] as const).map(row)}
      </CheckGroup>
      <CheckGroup title="Studio" note="Shows your dashboards to panels and browsers">
        {row("server", 0)}
      </CheckGroup>
      {server?.state === "running" && kioskUrl && (
        <KioskCard
          url={kioskUrl}
          local={server.local}
          onCopy={() => void navigator.clipboard?.writeText(kioskUrl).then(() => toast(`Copied ${kioskUrl}`), () => {})}
          onOpen={() => void window.open(kioskUrl, "_blank", "noopener,noreferrer")}
        />
      )}
    </div>,
    <ScreenStep
      key="screen"
      headRef={head}
      narrow={narrow}
      size={size}
      source={source}
      windowSize={windowSize}
      custom={custom}
      onPreset={(s) => {
        setSize(s);
        setSource("preset");
      }}
      onWindow={() => {
        setSize(windowSize);
        setSource("window");
      }}
      onCustom={(c) => {
        setCustom(c);
        const typed = customSize(c);
        // The previous valid size stays while the typed one isn't.
        if (typed) {
          setSize(typed);
          setSource("custom");
        }
      }}
    />,
    <StartStep
      key="start"
      headRef={head}
      rerun={rerun}
      size={size}
      start={start}
      onStart={setStart}
      pick={pick}
      onPick={(id) => {
        setPick(id);
        setStart("template");
      }}
      profiles={profiles}
      noProfiles={noProfiles}
      sensors={sensors}
      noHardware={noHardware}
    />,
    <FinishStep
      key="finish"
      headRef={head}
      rerun={rerun}
      rows={finishRows}
      onChange={go}
      options={
        <>
          {canAct && (
            <>
              <Switch label="Start Studio with Windows" note="Studio starts minimised so your panels show the dashboard after you sign in." checked={options.login} onChange={(login) => setOptions((o) => ({ ...o, login }))} />
              <Switch label="Check for updates" note="Studio checks once a day and asks before installing." checked={options.updates} onChange={(updates) => setOptions((o) => ({ ...o, updates }))} />
            </>
          )}
          <Switch label="Open the kiosk in the browser" note="When you finish, opens your dashboard in a browser tab on this PC." checked={options.kiosk} onChange={(kiosk) => setOptions((o) => ({ ...o, kiosk }))} />
        </>
      }
    />,
  ];

  const apiDot = t.api ? "bg-ui-success" : results.reachable && results.reachable.status !== "checking" ? "bg-ui-danger" : "bg-ui-4";
  const strip = welcomeStrip(results);
  return (
    <div data-help-article="quickstart" className="fixed inset-0 z-50 flex flex-col bg-ui-app font-ui text-ui-1">
      <header data-tauri-drag-region className="flex h-10 shrink-0 items-center gap-2.5 border-b border-ui-subtle pl-3">
        <span aria-hidden className="h-5 w-5 rounded-[6px] bg-ui-accent" />
        <span data-tauri-drag-region className="text-[12.5px] font-semibold">
          {rerun ? "Run setup again" : "Set up InfoPanel Studio"}
        </span>
        <span data-tauri-drag-region className="text-[11.5px] text-ui-4">
          Step {step + 1} of {STEPS.length}
        </span>
        <span data-tauri-drag-region className="flex-1 self-stretch" />
        {isTauri() ? (
          <WindowControls />
        ) : (
          <button type="button" aria-label={rerun ? "Close setup" : "Skip setup"} onClick={() => setAskSkip(true)} className="mr-2 grid h-7 w-7 place-items-center rounded-[7px] text-ui-3 hover:bg-ui-hover hover:text-ui-1">
            <X className="h-4 w-4" />
          </button>
        )}
      </header>
      {narrow && (
        <nav aria-label="Setup steps" className="flex shrink-0 gap-1.5 overflow-x-auto border-b border-ui-subtle px-4 py-2">
          {STEPS.map((label, i) => (
            <button
              key={label}
              type="button"
              aria-current={i === step ? "step" : undefined}
              onClick={() => go(i)}
              className={cn("flex h-7 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-[12px]", i === step ? "bg-[#1d1d22] text-ui-1" : "text-ui-3 hover:text-ui-1")}
            >
              <StepNumber n={i} current={i === step} done={visited.has(i) && i !== step} />
              {label}
              {i === DATA && !t.running && (t.fails > 0 || t.warns > 0) && <span aria-label="Has issues" className={cn("h-1.5 w-1.5 rounded-full", t.fails > 0 ? "bg-ui-danger" : "bg-ui-warning")} />}
            </button>
          ))}
        </nav>
      )}
      <div className="flex min-h-0 flex-1">
        {!narrow && (
          <nav aria-label="Setup steps" className="flex w-[228px] shrink-0 flex-col border-r border-ui-subtle bg-ui-panel p-2.5">
            <ol className="m-0 flex list-none flex-col gap-1 p-0">
              {STEPS.map((label, i) => (
                <li key={label}>
                  <button
                    type="button"
                    aria-current={i === step ? "step" : undefined}
                    onClick={() => go(i)}
                    className={cn("flex w-full items-start gap-2.5 rounded-[8px] px-2.5 py-2 text-left", i === step ? "bg-[#1d1d22]" : "hover:bg-ui-hover")}
                  >
                    <StepNumber n={i} current={i === step} done={visited.has(i) && i !== step} />
                    <span className="flex min-w-0 flex-col">
                      <span className={cn("text-[12.5px] font-medium", i === step ? "text-ui-1" : "text-ui-2")}>{label}</span>
                      <span
                        className={cn(
                          "truncate text-[11px]",
                          i === DATA ? (t.running ? "text-ui-3" : !t.api || t.fails > 0 ? "text-ui-danger" : t.warns > 0 ? "text-ui-warning" : "text-ui-success") : "text-ui-4",
                        )}
                      >
                        {railSub[i]}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="m-0 mt-auto px-2.5 pb-1 text-[11px] leading-[1.5] text-ui-4">
              {rerun ? "Your screens and settings are kept. Only what you change here is saved." : "Skip any step. You can run setup again from Settings → General."}
            </p>
          </nav>
        )}
        <main ref={scroller} className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden">
          <div className={cn("mx-auto max-w-[880px]", narrow ? "px-4 pb-7 pt-[18px]" : "px-8 py-6")}>{body[step]}</div>
        </main>
      </div>
      <footer className="flex h-[52px] shrink-0 items-center gap-3 border-t border-ui-subtle px-4">
        <button type="button" onClick={() => setAskSkip(true)} className="rounded-sm px-1.5 text-[12.5px] text-ui-2 hover:text-ui-1">
          {rerun ? "Close" : "Skip setup"}
        </button>
        {!narrow && (
          <span className="flex items-center gap-3 text-[11px] text-ui-4">
            <Hint k="Enter" text="next" />
            <Hint k="Alt+←" text="back" />
            {step === DATA && <Hint k="F5" text="check again" />}
          </span>
        )}
        <span className="flex-1" />
        {step > 0 && (
          <button type="button" onClick={() => go(step - 1)} className={cn(OUTLINE_BUTTON, "h-8 px-3.5 text-[12.5px]")}>
            Back
          </button>
        )}
        <button type="button" onClick={primary} className={cn(PRIMARY_BUTTON, "h-8 rounded-[8px] px-4 text-[12.5px]")}>
          {primaryLabel}
        </button>
      </footer>
      <div className="flex h-[26px] shrink-0 items-center gap-4 border-t border-ui-subtle px-3 text-[11px] text-ui-3">
        <span className="flex items-center gap-1.5" title={strip.title}>
          <span className={cn("h-1.5 w-1.5 rounded-full", apiDot)} />
          {t.api ? `Data API · ${where}` : results.reachable && results.reachable.status !== "checking" ? "Data API · not connected" : "Data API · checking…"}
        </span>
        <span className="flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", server?.state === "running" ? "bg-ui-success" : "bg-ui-4")} />
          {server?.state === "running" ? `Server · :${server.port}` : "Server · starting"}
        </span>
      </div>
      {askSkip && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/60 p-4">
          <div role="alertdialog" aria-modal="true" aria-labelledby="first-run-skip-title" aria-describedby="first-run-skip-body" className="flex w-[420px] max-w-full flex-col gap-3 rounded-[12px] border border-ui-strong bg-ui-panel p-5 shadow-ui-modal">
            <h2 id="first-run-skip-title" className="m-0 text-[14px] font-semibold text-ui-1">
              {rerun ? "Close setup?" : "Skip setup?"}
            </h2>
            <p id="first-run-skip-body" className="m-0 text-[12.5px] leading-[1.5] text-ui-2">
              {rerun
                ? "Nothing has changed. Your data address, screens and options stay as they were."
                : `Studio opens with a blank screen${answered ? "" : " and no live data"}. You can run setup again from Settings → General → Run setup.`}
            </p>
            <div className="flex justify-end gap-2">
              <button ref={keepButton} type="button" onClick={() => setAskSkip(false)} className={cn(OUTLINE_BUTTON, "h-8 px-3.5 text-[12.5px]")}>
                {rerun ? "Keep going" : "Keep setting up"}
              </button>
              <button type="button" onClick={skip} className={cn(PRIMARY_BUTTON, "h-8 px-3.5 text-[12.5px]")}>
                {rerun ? "Close" : "Skip setup"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const shapeOf = (s: Size) => classNameOf(s).toLowerCase() as "standard" | "wide" | "strip" | "tall";
/** The first top pick for a size: what the Start step preselects. */
const topPick = (s: Size) => SCREEN_KIT.entries.find((e) => e.fits.includes(shapeOf(s)))?.id;

function StepNumber({ n, current, done }: { n: number; current: boolean; done: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid h-5 w-5 shrink-0 place-items-center rounded-full border text-[11px]",
        current ? "border-ui-1 bg-ui-1 font-medium text-ui-inverse-fg" : "border-ui-strong text-ui-3",
      )}
    >
      {done ? <Check className="h-3 w-3" /> : n + 1}
    </span>
  );
}

const Hint = ({ k, text }: { k: string; text: string }) => (
  <span className="flex items-center gap-1">
    <kbd className="rounded-[4px] border border-ui-strong px-1 font-ui-mono text-[10.5px] text-ui-3">{k}</kbd>
    {text}
  </span>
);
