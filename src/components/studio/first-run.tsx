import { lazy, Suspense, useEffect, useMemo, useState, type ReactNode } from "react";
import { Dialog } from "@base-ui/react/dialog";
import { Check, CircleAlert, FileInput, LayoutTemplate, Loader2, Square, type LucideIcon } from "lucide-react";
import { useSensorCatalog, type ApiSources } from "@/lib/catalog";
import { DEFAULT_API_BASE, normalizeApiBase } from "@/lib/data-api";
import { openHelp } from "@/lib/desktop";
import { cn } from "@/lib/utils";
import {
  connectedText,
  detectWidgets,
  looksLike,
  screenChoices,
  summariseSources,
  validSize,
  type FirstRunChoices,
  type FirstWidgetId,
  type ScreenChoice,
  type StartChoice,
} from "./first-run-model";

const STEPS = ["Connect", "Screen", "Start", "First page"] as const;

/** The screen templates' gallery and data load at the last step, never with the studio. */
const gallery = () => import("../templates/screen-template-gallery");
const ScreenTemplateGallery = lazy(() => gallery().then((m) => ({ default: m.ScreenTemplateGallery })));

const PRIMARY = "h-8 shrink-0 rounded-[7px] bg-ui-inverse px-3.5 text-[12.5px] font-semibold text-ui-inverse-fg hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40";
const OUTLINE = "h-8 shrink-0 rounded-[7px] border border-ui-strong px-3 text-[12.5px] font-medium text-ui-2 hover:bg-ui-hover hover:text-ui-1 disabled:cursor-not-allowed disabled:opacity-40";
const FIELD = "h-8 rounded-[7px] border border-ui-default bg-ui-app px-2.5 text-[12.5px] text-ui-1 outline-none focus:border-ui-accent";

type Probe = { state: "testing" } | { state: "ok"; text: string } | { state: "fail" };

/** Ask a Data API for its sources: what "Connected — N sensors from …" reads from. */
async function probe(base: string): Promise<Probe> {
  try {
    const res = await fetch(`${base}/api/sources`, { cache: "no-store" });
    if (!res.ok) return { state: "fail" };
    const sources = (await res.json()) as Partial<ApiSources>;
    return { state: "ok", text: connectedText(summariseSources({ plugins: sources.plugins ?? [] })) };
  } catch {
    return { state: "fail" };
  }
}

/** A choice card in a radio group (or, with `check`, a toggle card): the selected one has the accent border. */
function Card({
  selected,
  onSelect,
  title,
  note,
  icon: Icon,
  check,
  children,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  note?: string;
  icon?: LucideIcon;
  check?: boolean;
  children?: ReactNode;
}) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border px-3 py-2.5", selected ? "border-ui-accent/50 bg-ui-accent-soft" : "border-ui-strong hover:bg-ui-hover")}>
      <button
        type="button"
        role={check ? "checkbox" : "radio"}
        aria-checked={selected}
        onClick={onSelect}
        className="flex items-start gap-2.5 rounded-md text-left outline-none focus-visible:ring-2 focus-visible:ring-ui-accent/60"
      >
        {Icon && <Icon className="mt-px h-[18px] w-[18px] shrink-0 text-ui-3" strokeWidth={1.75} />}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="text-[12.5px] font-medium text-ui-1">{title}</span>
          {note && <span className="text-pretty text-[11.5px] leading-[1.4] text-ui-4">{note}</span>}
        </span>
        {check && (selected ? <Check className="h-4 w-4 text-ui-accent-text" /> : <Square className="h-4 w-4 text-ui-5" />)}
      </button>
      {children}
    </div>
  );
}

const Heading = ({ children }: { children: ReactNode }) => <h3 className="m-0 text-[15px] font-semibold text-ui-1">{children}</h3>;
const Lead = ({ children }: { children: ReactNode }) => <p className="m-0 text-[12.5px] leading-snug text-ui-3">{children}</p>;

function Stepper({ step }: { step: number }) {
  return (
    <ol aria-label="Setup steps" className="m-0 flex list-none items-center gap-2 p-0">
      {STEPS.map((label, i) => (
        <li key={label} aria-current={i === step ? "step" : undefined} className="flex items-center gap-2">
          {i > 0 && <span aria-hidden className="h-px w-5 bg-ui-default max-sm:w-2" />}
          <span
            className={cn(
              "grid h-5 w-5 place-items-center rounded-full border text-[11px] font-medium",
              i === step ? "border-ui-1 bg-ui-1 text-ui-inverse-fg" : i < step ? "border-ui-accent/60 text-ui-accent-text" : "border-ui-strong text-ui-4"
            )}
          >
            {i < step ? <Check className="h-3 w-3" /> : i + 1}
          </span>
          <span className={cn("text-[12px]", i === step ? "text-ui-1" : "text-ui-4 max-sm:hidden")}>{label}</span>
        </li>
      ))}
    </ol>
  );
}

interface FirstRunProps {
  open: boolean;
  /** The Data API URL the config holds (the default when none). */
  dataApiUrl?: string;
  /** The studio window's size: the first screen card. */
  windowSize: { width: number; height: number };
  /** Skip or Esc: nothing is changed. */
  onSkip: () => void;
  /** Open Studio: the choices, and the URL when it was changed. */
  onFinish: (choices: FirstRunChoices, dataApiUrl: string | undefined) => void;
}

/**
 * First-run setup (SPEC §10.5): a 720 px modal, `1 Connect — 2 Screen — 3 Start — 4 First page`. It collects the
 * choices; `applyFirstRun` makes the config from them.
 */
export function FirstRun({ open, dataApiUrl, windowSize, onSkip, onFinish }: FirstRunProps) {
  const [step, setStep] = useState(0);
  const saved = dataApiUrl ?? DEFAULT_API_BASE;
  const [url, setUrl] = useState(saved);
  const [result, setResult] = useState<Probe>({ state: "testing" });
  const [screenId, setScreenId] = useState<ScreenChoice["id"]>("detected");
  const [custom, setCustom] = useState({ width: windowSize.width, height: windowSize.height });
  const [start, setStart] = useState<StartChoice>("template");
  const [pageName, setPageName] = useState("Main");
  // The template the setup starts on fits every shape.
  const [templateId, setTemplateId] = useState("general");
  /** The cards the person ticked or unticked; the rest follow what the sensors offer. */
  const [overrides, setOverrides] = useState<ReadonlyMap<FirstWidgetId, boolean>>(new Map());
  /** Sensors the widget cards are preselected from; the catalog loads once the Data API is known. */
  const catalog = useSensorCatalog();

  const base = normalizeApiBase(url);
  const test = (target: string | null = base) => {
    if (!target) return setResult({ state: "fail" });
    setResult({ state: "testing" });
    void probe(target).then((r) => setResult((now) => (now.state === "testing" ? r : now)));
  };
  // Auto-test the prefilled URL when the setup opens.
  useEffect(() => {
    if (!open) return;
    setStep(0);
    test(normalizeApiBase(saved));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const choices = useMemo(() => screenChoices(windowSize.width, windowSize.height, custom), [windowSize.width, windowSize.height, custom]);
  const screen = choices.find((c) => c.id === screenId) ?? choices[0];
  const sizeOk = validSize(screen.width) && validSize(screen.height);
  const widgets = useMemo(() => detectWidgets(catalog.sensors), [catalog.sensors]);
  const on = (id: FirstWidgetId, detected: boolean) => overrides.get(id) ?? detected;
  const toggle = (id: FirstWidgetId, detected: boolean) => setOverrides((m) => new Map(m).set(id, !on(id, detected)));

  const last = step === STEPS.length - 1;
  const finish = async () => {
    const template = start === "template" ? (await gallery()).templateScreen(templateId, screen, catalog.sensors) : undefined;
    onFinish(
      { width: screen.width, height: screen.height, start, pageName, widgets: widgets.filter((w) => on(w.id, w.detected)), template },
      base && base !== normalizeApiBase(saved) ? base : undefined
    );
  };
  const looks = looksLike(windowSize.width, windowSize.height);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => !next && onSkip()}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-black/70" />
        <Dialog.Popup
          data-help-article="quickstart"
          className="fixed left-1/2 top-1/2 z-50 flex max-h-[calc(100vh-24px)] w-[min(720px,calc(100vw-24px))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-[12px] border border-ui-strong bg-ui-panel font-ui text-ui-1 shadow-ui-modal outline-none"
        >
          <div className="flex flex-col gap-3 border-b border-ui-subtle px-6 pb-3.5 pt-4">
            <Dialog.Title className="text-[16px] font-semibold text-ui-1">Set up InfoPanel Studio</Dialog.Title>
            <Dialog.Description className="sr-only">Four short steps: connect your sensors, pick your screen, choose how to start and name your first page.</Dialog.Description>
            <Stepper step={step} />
          </div>

          <div className="flex min-h-[300px] flex-1 flex-col gap-3 overflow-y-auto px-6 py-5">
            {step === 0 && (
              <>
                <Heading>Connect your sensors.</Heading>
                <Lead>Studio reads sensors from InfoPanel&rsquo;s Data API. It&rsquo;s usually already running on the PC that runs InfoPanel Studio.</Lead>
                <div className="flex items-center gap-2">
                  <input
                    value={url}
                    aria-label="Data API URL"
                    spellCheck={false}
                    onChange={(e) => setUrl(e.target.value)}
                    onBlur={() => test()}
                    onKeyDown={(e) => e.key === "Enter" && test()}
                    className={cn(FIELD, "min-w-0 flex-1 font-ui-mono text-[11.5px]", !base && "border-ui-danger")}
                  />
                  <button type="button" onClick={() => test()} className={OUTLINE}>
                    Test
                  </button>
                </div>
                <div role="status" className="min-h-6 text-[12.5px]">
                  {result.state === "testing" && (
                    <span className="flex items-center gap-1.5 text-ui-3">
                      <Loader2 className="h-4 w-4 animate-spin" /> Testing the connection…
                    </span>
                  )}
                  {result.state === "ok" && (
                    <span className="flex items-center gap-1.5 text-ui-success">
                      <Check className="h-4 w-4" /> {result.text}
                    </span>
                  )}
                  {result.state === "fail" && (
                    <div className="flex flex-col gap-1.5 rounded-lg border border-ui-danger/40 bg-ui-danger/10 px-3 py-2.5 text-ui-2">
                      <span className="flex items-center gap-1.5 font-medium text-ui-danger">
                        <CircleAlert className="h-4 w-4" /> {base ? "Can’t reach the Data API" : "That isn’t a web address"}
                      </span>
                      <span className="text-[12px] leading-snug text-ui-3">
                        Start InfoPanel and turn its web server on, or enter the address of the PC that runs it. You can also carry on and set this later in Data.
                      </span>
                      <button type="button" onClick={() => void openHelp({ article: "sensors" }).catch(() => {})} className="self-start rounded-sm text-[12px] text-ui-accent-text hover:underline">
                        Set up the Data API ↗
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}

            {step === 1 && (
              <>
                <Heading>Which screen is this for?</Heading>
                <Lead>
                  This window is {windowSize.width}×{windowSize.height} — that looks like {looks.text}.
                </Lead>
                <div role="radiogroup" aria-label="Screen" className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
                  {choices.map((c) => (
                    <Card
                      key={c.id}
                      selected={c.id === screenId}
                      onSelect={() => setScreenId(c.id)}
                      title={c.id === "custom" ? c.label : `${c.label} · ${c.width}×${c.height}`}
                      note={c.id === "detected" ? `Detected: ${looks.text}` : undefined}
                    >
                      {c.id === "custom" && c.id === screenId && (
                        <div className="flex items-center gap-2 pl-7">
                          {(["width", "height"] as const).map((k) => (
                            <label key={k} className="flex items-center gap-1.5 text-[11.5px] text-ui-3">
                              {k === "width" ? "W" : "H"}
                              <input
                                type="number"
                                min={100}
                                max={8192}
                                value={custom[k]}
                                aria-label={k === "width" ? "Width" : "Height"}
                                onChange={(e) => setCustom((cur) => ({ ...cur, [k]: Number(e.target.value) }))}
                                className={cn(FIELD, "w-[88px] font-ui-mono", !validSize(custom[k]) && "border-ui-danger")}
                              />
                            </label>
                          ))}
                        </div>
                      )}
                    </Card>
                  ))}
                </div>
              </>
            )}

            {step === 2 && (
              <>
                <Heading>How do you want to start?</Heading>
                <div role="radiogroup" aria-label="Start" className="grid grid-cols-3 gap-2.5 max-sm:grid-cols-1">
                  <Card selected={start === "template"} onSelect={() => setStart("template")} icon={LayoutTemplate} title="Start from a template" note="A ready-made layout to take apart and make your own." />
                  <Card selected={start === "import"} onSelect={() => setStart("import")} icon={FileInput} title="Import from InfoPanel" note="Bring in a canvas from an .infopanel file. The Import door opens next." />
                  <Card selected={start === "blank"} onSelect={() => setStart("blank")} icon={Square} title="Blank screen" note="An empty grid. You choose the first widgets next." />
                </div>
              </>
            )}

            {step === 3 && (
              <>
                <Heading>Your first page.</Heading>
                <label className="flex flex-col gap-1.5 text-[12px] text-ui-3">
                  Page name
                  <input value={pageName} onChange={(e) => setPageName(e.target.value)} aria-label="Page name" className={cn(FIELD, "max-w-[320px]")} />
                </label>
                {start === "blank" ? (
                  <>
                    <Lead>Tick what to show. They are laid out on the grid for you, and you can move them in the studio.</Lead>
                    <div className="grid grid-cols-2 gap-2.5 max-sm:grid-cols-1">
                      {widgets.map((w) => (
                        <Card
                          key={w.id}
                          check
                          selected={on(w.id, w.detected)}
                          onSelect={() => toggle(w.id, w.detected)}
                          title={w.label}
                          note={w.detected ? (w.id === "clock" ? undefined : "Found in your sensors") : "Not found in your sensors yet"}
                        />
                      ))}
                    </div>
                  </>
                ) : start === "template" ? (
                  <>
                    <Lead>Pick a template. It fills this screen with a ready-made layout and look, and everything on it can be changed.</Lead>
                    <Suspense fallback={null}>
                      <ScreenTemplateGallery choice={templateId} onChoice={(id) => id && setTemplateId(id)} width={screen.width} height={screen.height} blank={false} />
                    </Suspense>
                  </>
                ) : (
                  <Lead>Next, the Import door opens: choose your .infopanel file and it lands on this screen.</Lead>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2 border-t border-ui-subtle px-6 py-3">
            <button type="button" onClick={onSkip} className="rounded-sm text-[12.5px] text-ui-3 hover:text-ui-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent">
              Skip setup
            </button>
            <span className="flex-1" />
            <button type="button" className={OUTLINE} disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
              Back
            </button>
            <button type="button" className={PRIMARY} disabled={step === 1 && !sizeOk} onClick={() => (last ? void finish() : setStep((s) => s + 1))}>
              {last ? "Open Studio" : "Continue"}
            </button>
          </div>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
