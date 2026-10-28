import { useState, type ReactNode } from "react";
import { ToastProvider, useToast } from "@/components/ui/toast";
import { useControl } from "@/lib/control";
import { valueText, type InheritPath, type InheritScope } from "@/lib/inheritance";
import { defaultConfig, type DashboardConfig } from "@/lib/layout";
import { withLock } from "./theme-editor-model";
import { InheritChip, InheritLockNote } from "./inherit-chip";
import { LinkRow } from "./link-row";
import { StatusBar, type StatusBarData } from "./status-bar";
import type { NavTarget } from "./studio-nav";
import { useInheritance } from "./use-inheritance";
import { useStatusBar } from "./use-status-bar";

/**
 * Dev-only checkpoint of the settings IA's shared pieces (`?ia-preview`,
 * IMPLEMENTATION_PLAN phase 1): every chip state, the chips resolved live
 * over a sample config, LinkRows and the status bar's states.
 */

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="space-y-3 border-b border-ui-subtle py-5">
      <h2 className="text-[12.5px] font-semibold text-ui-1">{title}</h2>
      {children}
    </section>
  );
}

/** A sample: All screens sets the accent, Desk bar locks Typography, Gaming customises Colors, one widget keeps own Typography. */
function sampleConfig(): DashboardConfig {
  const base = defaultConfig();
  const profile = base.profiles[0];
  return {
    ...base,
    style: { accent: "#3d8bff" },
    general: { font: "inter" },
    profiles: [
      {
        ...profile,
        id: "desk",
        name: "Desk bar",
        widgetTheme: { values: { font: "geist" }, locks: { type: true } },
        pages: [
          {
            id: "gaming",
            name: "Gaming",
            widgetTheme: { values: { accent: "#ff6a3d" }, follow: { colors: false } },
            placements: [
              { id: "cpu", module: "CpuMonitor", colStart: 1, rowStart: 1, colSpan: 2, rowSpan: 2, visible: true, follow: { type: false }, settings: { font: "mono" } },
            ],
          },
        ],
      },
    ],
  };
}

const SCOPES: { label: string; scope: InheritScope }[] = [
  { label: "All screens", scope: { level: "all" } },
  { label: "Screen · Desk bar", scope: { level: "screen", profileId: "desk" } },
  { label: "Page · Gaming", scope: { level: "page", profileId: "desk", pageId: "gaming" } },
  { label: "Widget · CPU", scope: { level: "widget", profileId: "desk", pageId: "gaming", zoneId: "cpu" } },
];

const PATHS: { path: InheritPath; label: string }[] = [
  { path: "colors", label: "Colors" },
  { path: "type", label: "Typography" },
  { path: "font", label: "Page font" },
  { path: "performance", label: "Performance" },
];

function LiveChip({ path, scope, config, setConfig, go }: {
  path: InheritPath;
  scope: InheritScope;
  config: DashboardConfig;
  setConfig: (fn: (c: DashboardConfig) => DashboardConfig) => void;
  go: (t: NavTarget) => void;
}) {
  const toast = useToast();
  const inh = useInheritance(path, scope, { config, setConfig, navigateTo: go });
  return (
    <div className="flex flex-col items-start gap-1">
      <InheritChip
        state={inh.state}
        from={inh.from}
        fromName={inh.fromName}
        parentText={valueText(path, inh.parentValue)}
        onReset={inh.reset}
        onCustomise={inh.customise}
        onJump={inh.jump}
        onMakeTheme={scope.level === "widget" ? (t) => toast(`Make this the theme for: ${t}`) : undefined}
      />
      <span className="font-ui-mono text-[10.5px] text-ui-5">{valueText(path, inh.resolvedValue)}</span>
      {inh.keptOverride && <InheritLockNote holder={scope.level === "widget" ? "widget" : "page"} section={PATHS.find((p) => p.path === path)?.label ?? path} />}
    </div>
  );
}

const STATIC_BARS: { title: string; data: StatusBarData }[] = [
  {
    title: "Desktop: connected, update, restart, unsaved",
    data: {
      dataApi: { state: "connected", latencyMs: 18, base: "http://127.0.0.1:3921" },
      server: { kind: "desktop", port: 8080, lan: true, phase: "running" },
      kiosks: 2,
      update: "1.3.0",
      restartNeeded: true,
      save: "unsaved",
    },
  },
  {
    title: "Desktop: slow, server restarting, one kiosk, saved",
    data: {
      dataApi: { state: "slow", latencyMs: 640, base: "http://127.0.0.1:3921" },
      server: { kind: "desktop", port: 8080, phase: "restarting" },
      kiosks: 1,
      restartNeeded: false,
      save: "saved",
    },
  },
  {
    title: "Browser: unreachable, no kiosks, offline",
    data: {
      dataApi: { state: "unreachable", latencyMs: null, base: "http://192.168.1.12:3921" },
      server: { kind: "browser", host: "192.168.1.12" },
      kiosks: 0,
      restartNeeded: false,
      save: "offline",
    },
  },
];

function Gallery() {
  const toast = useToast();
  const [config, setConfig] = useState(sampleConfig);
  const go = (t: NavTarget) => toast(`Navigate: ${JSON.stringify(t)}`);
  const control = useControl();
  const live = useStatusBar(control, "saved");
  const locked = config.profiles[0].widgetTheme?.locks?.type === true;
  return (
    <div className="min-h-screen bg-ui-panel p-6 font-ui text-[13px] text-ui-2">
      <div className="mx-auto max-w-[860px]">
        <h1 className="text-[14px] font-semibold text-ui-1">Settings IA · shared pieces</h1>
        <p className="text-[11px] text-ui-4">Inheritance chips, LinkRow and the status bar (IMPLEMENTATION_PLAN phase 1).</p>

        <Section title="InheritChip: every state">
          <div className="flex flex-wrap items-center gap-2">
            <InheritChip state="inherited" from="all" parentText="#3D8BFF" onCustomise={() => toast("Change here")} onJump={() => toast("Edit All screens")} />
            <InheritChip state="inherited" from="screen" fromName="Desk bar" parentText="#3D8BFF" onCustomise={() => toast("Change here")} onJump={() => toast("Edit Screen")} />
            <InheritChip state="inherited" from="page" fromName="Gaming" parentText="#FF6A3D" onCustomise={() => toast("Change here")} onJump={() => toast("Edit Page")} />
            <InheritChip state="custom" from="page" fromName="Gaming" parentText="#3D8BFF" onReset={() => toast("Reset")} onJump={() => toast("Edit Page")} onMakeTheme={(t) => toast(`Make theme: ${t}`)} />
            <InheritChip state="locked" from="screen" fromName="Desk bar" parentText="Geist" onJump={() => toast("Edit lock in Theme")} />
            <InheritChip state="base" parentText="auto" onReset={() => toast("Reset to built-in")} />
            <InheritChip state="builtin" parentText="auto" />
          </div>
          <InheritLockNote holder="widget" section="Typography" />
        </Section>

        <Section title="Resolved live over a sample config (click a chip; edits apply)">
          <div className="flex items-center gap-3 text-[11.5px]">
            <button type="button" className="rounded-md border border-ui-strong px-2 py-1 hover:bg-ui-hover" onClick={() => setConfig((c) => withLock(c, "desk", "type", !locked))}>
              {locked ? "Unlock" : "Lock"} Typography on Desk bar
            </button>
            <button type="button" className="rounded-md border border-ui-strong px-2 py-1 hover:bg-ui-hover" onClick={() => setConfig(sampleConfig())}>
              Reset sample
            </button>
          </div>
          <table className="w-full border-separate border-spacing-y-2 text-left text-[11.5px]">
            <thead>
              <tr className="text-ui-4">
                <th className="font-medium" />
                {SCOPES.map((s) => (
                  <th key={s.label} className="font-medium">
                    {s.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {PATHS.map((p) => (
                <tr key={p.path} className="align-top">
                  <td className="pr-3 text-ui-3">{p.label}</td>
                  {SCOPES.map((s) => (
                    <td key={s.label} className="pr-3">
                      <LiveChip path={p.path} scope={s.scope} config={config} setConfig={setConfig} go={go} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Section title="LinkRow">
          <div className="max-w-[320px] space-y-2">
            <LinkRow label="Frame-rate cap" value="60 fps" mono from="Dashboard" link="Settings" onNavigate={() => go({ view: "settings", tab: "dashboard", section: "performance" })} />
            <LinkRow label="Font" value="Geist" from="Theme" link="Theme" onNavigate={() => go({ view: "theme", section: "type" })} />
            <LinkRow label="Rotation" value="Included · every 20 s" note="Page order and rotation live in" link="Screens" onNavigate={() => go({ view: "screens", section: "pages" })} />
          </div>
        </Section>

        <Section title="StatusBar">
          {STATIC_BARS.map((bar) => (
            <div key={bar.title} className="space-y-1">
              <p className="text-[11px] text-ui-4">{bar.title}</p>
              <StatusBar {...bar.data} onNavigate={go} onOpenLive={() => toast("Open Live")} />
            </div>
          ))}
          <div className="space-y-1">
            <p className="text-[11px] text-ui-4">Live (this page's Data API ping, server and kiosks)</p>
            <StatusBar {...live} onNavigate={go} onOpenLive={() => toast(`Kiosks: ${JSON.stringify(control?.kiosks ?? [])}`)} />
          </div>
        </Section>
      </div>
    </div>
  );
}

export default function IaPreview() {
  return (
    <ToastProvider>
      <Gallery />
    </ToastProvider>
  );
}
