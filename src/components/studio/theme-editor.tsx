import { useState, type CSSProperties, type ReactNode } from "react";
import { Globe, LayoutDashboard, Link2, Lock, Monitor, Palette, SlidersHorizontal } from "lucide-react";
import type { HistorySetter } from "@/hooks/use-config-history";
import type { DashboardConfig, MonitorProfile } from "@/lib/layout";
import { pageOf } from "@/lib/pages";
import { themeVars, resolveTheme } from "@/lib/theme";
import { allLocked } from "@/lib/theme-model";
import { cn } from "@/lib/utils";
import { modules } from "@/modules";
import type { ModuleSettings } from "@/modules/types";
import { InspectorChromeProvider } from "./inspector-layout";
import { InspectorNote, InspectorView } from "./inspector/inspector-view";
import { inspectorNotes, isVisible, type FollowMode, type InspectorContext } from "./inspector-model";
import { shownValue, shownValues } from "./inspector/zone-fields";
import { pageIcon } from "./page-icons";
import { LivePlacement } from "./placement-content";
import { dropKeys } from "./settings-model";
import type { FieldsApi } from "./settings-panel";
import { THEME_EDITOR_SETTINGS } from "./theme-editor-settings";
import {
  overridesOf,
  previewZones,
  scopeAppearance,
  scopeId,
  scopeLookValues,
  sourceChips,
  themeFollowFields,
  validScope,
  withLock,
  withLockAll,
  withPageFollow,
  withScopeValues,
  withZonesFollowing,
  type ThemeScope,
} from "./theme-editor-model";
import { changedLabel, HeaderIcon } from "./zone-inspector-parts";
import { zoneName } from "./inspector/zone-meta";

interface ThemeEditorProps {
  config: DashboardConfig;
  /** The stored profile being themed. */
  profile: MonitorProfile;
  /** The page on the canvas (the profile and base scopes' previews and custom widgets). */
  currentPageId: string;
  scope: ThemeScope;
  onScope: (scope: ThemeScope) => void;
  setConfig: HistorySetter;
  /** Open, reveal and focus a section's row whenever `seq` changes (the palette's theme "Go to setting"). */
  jumpTo?: { id: string; key?: string; seq: number };
}

const CHIP: Record<FollowMode, { icon: typeof Link2; className: string; label: string }> = {
  theme: { icon: Link2, className: "bg-ui-raised text-ui-4", label: "Theme" },
  custom: { icon: SlidersHorizontal, className: "bg-ui-accent/[.16] text-ui-accent-text", label: "Custom" },
  locked: { icon: Lock, className: "bg-ui-raised text-ui-4", label: "Locked" },
};

/** One entry of the scope list. */
function ScopeItem({ icon, label, sub, active, onClick }: { icon: ReactNode; label: string; sub: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left",
        active ? "bg-[#1e1e24]" : "hover:bg-ui-hover"
      )}
    >
      <span className={cn("shrink-0 [&>svg]:h-4 [&>svg]:w-4", active ? "text-[oklch(0.84_0.12_255)]" : "text-ui-4")}>{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[12.5px] text-ui-1">{label}</span>
        <span className="block truncate text-[11px] text-ui-4">{sub}</span>
      </span>
    </button>
  );
}

/**
 * Studio › Theme (SPEC §7): the scope list (All profiles, the profile
 * theme, each page), the middle column's live previews with their source
 * chips and "Who doesn't follow the theme", and the inspector — the same
 * component as a zone's, without the Show tab — editing the scope's theme.
 */
export function ThemeEditor({ config, profile, currentPageId, scope: requested, onScope, setConfig, jumpTo }: ThemeEditorProps) {
  // A page of another profile (or a deleted one) reads as the profile theme.
  const scope = validScope(profile, requested);
  const [query, setQuery] = useState("");
  const page = scope.kind === "page" ? pageOf(profile, scope.pageId) : pageOf(profile, currentPageId);
  const appearance = scopeAppearance(config, profile, scope);
  const context: InspectorContext = { kind: "theme", scope: scope.kind };
  const values = scopeLookValues(appearance, scope.kind);
  const key = (what: string) => `theme:${profile.id}:${scopeId(scope)}:${what}`;
  const edit = (fn: (values: ModuleSettings) => ModuleSettings, what: string) =>
    setConfig((c) => withScopeValues(c, profile.id, scope, fn), key(what));
  const fields: FieldsApi = {
    values,
    shown: (k, def) => shownValue(values, k, def),
    onChange: (k, v, editKey) => edit((s) => ({ ...s, [k]: v }), editKey ?? k),
    onPatch: (patch) => edit((s) => ({ ...s, ...patch }), Object.keys(patch).join()),
    onClear: (keys) => edit((s) => dropKeys(s, new Set(keys)) ?? {}, "clear"),
    ...themeFollowFields(appearance, page, scope.kind, {
      onLock: (sec, on) => setConfig((c) => withLock(c, profile.id, sec, on), key(`lock:${sec}`)),
      onPageFollow: (sec, follows) =>
        scope.kind === "page" && setConfig((c) => withPageFollow(c, profile.id, scope.pageId, sec, follows), key(`follow:${sec}`)),
    }),
  };
  const effective = shownValues(values, THEME_EDITOR_SETTINGS);
  const lockedAll = allLocked(profile.widgetTheme);

  const title = scope.kind === "base" ? "All profiles" : scope.kind === "profile" ? "Profile theme" : `${page.name} page`;
  const icon = scope.kind === "base" ? <Globe /> : scope.kind === "profile" ? <Monitor /> : <Palette />;
  const header = (changed: number) => (
    <div className="flex items-center gap-2.5">
      <HeaderIcon>{icon}</HeaderIcon>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-semibold leading-4 text-ui-1">{title}</div>
        <div className="truncate text-[11px] text-[#8a8a94]">Theme · {changedLabel(changed)}</div>
      </div>
      {scope.kind === "profile" && (
        <button
          type="button"
          onClick={() => setConfig((c) => withLockAll(c, profile.id, !lockedAll), key("lock-all"))}
          title={lockedAll ? "Unlock every section" : "Lock every section: every widget uses the profile theme"}
          className="flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-ui-strong bg-ui-raised px-2 text-[12px] text-ui-2 hover:text-ui-1"
        >
          <Lock className="h-3.5 w-3.5" />
          {lockedAll ? "Unlock all" : "Lock all"}
        </button>
      )}
    </div>
  );

  const tokens = resolveTheme(config, profile);
  const stage = { ...themeVars(tokens.tokens, tokens.radius) } as CSSProperties;
  const overrides = overridesOf(page.placements, appearance);

  return (
    <div className="flex min-h-0 min-w-0 flex-1 bg-ui-app">
      <nav aria-label="Theme scope" className="flex w-60 shrink-0 flex-col gap-1 overflow-y-auto border-r border-ui-subtle bg-ui-panel p-3">
        <div className="px-1 pb-1 text-[11px] font-medium uppercase tracking-wide text-ui-4">Scope</div>
        <ScopeItem icon={<Globe />} label="All profiles" sub="Base layer · no locks" active={scope.kind === "base"} onClick={() => onScope({ kind: "base" })} />
        <ScopeItem
          icon={<Monitor />}
          label="Profile theme"
          sub={`${profile.name} · ${profile.width}×${profile.height}`}
          active={scope.kind === "profile"}
          onClick={() => onScope({ kind: "profile" })}
        />
        {profile.pages.map((pg) => {
          const Icon = pageIcon(pg.icon) ?? LayoutDashboard;
          return (
            <ScopeItem
              key={pg.id}
              icon={<Icon />}
              label={pg.name}
              sub="Page theme"
              active={scope.kind === "page" && scope.pageId === pg.id}
              onClick={() => onScope({ kind: "page", pageId: pg.id })}
            />
          );
        })}
        <p className="mt-2 px-1 text-[11px] leading-snug text-ui-4">
          The profile sets every themed value over the all-profiles base. A page follows it section by section or
          customizes one. Lock forces a section on every page and widget.
        </p>
      </nav>

      <main className="min-w-0 flex-1 overflow-y-auto px-6 py-5">
        <div className="mx-auto flex max-w-[640px] flex-col gap-5">
          <section aria-label="Previews" className="space-y-2">
            <div className="text-[11px] font-medium uppercase tracking-wide text-ui-4">Live preview · {page.name}</div>
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
              {previewZones(page.placements).map((zone) => {
                const mod = modules.find((m) => m.id === zone.module);
                return (
                  <figure key={zone.id} data-preview={zone.module} className="m-0 space-y-1.5">
                    <figcaption className="truncate text-[12px] text-ui-2">{mod ? zoneName(zone) : zone.module}</figcaption>
                    <div data-theme-scope="" className="h-[150px] overflow-hidden rounded-xl bg-background text-foreground" style={stage}>
                      <LivePlacement placement={zone} appearance={appearance}>
                        {(render) => (
                          <div className="h-full w-full" style={render.scope}>
                            {render.content}
                          </div>
                        )}
                      </LivePlacement>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {sourceChips(zone, appearance).map((chip) => {
                        const { icon: Icon, className, label } = CHIP[chip.mode];
                        return (
                          <span
                            key={chip.sec}
                            title={`${chip.title}: ${label}`}
                            className={cn("flex items-center gap-1 rounded-md px-1.5 py-px text-[10.5px]", className)}
                          >
                            <Icon className="h-3 w-3" aria-hidden />
                            {chip.title}
                          </span>
                        );
                      })}
                    </div>
                  </figure>
                );
              })}
            </div>
          </section>

          <section aria-label="Who doesn't follow the theme" className="overflow-hidden rounded-xl border border-ui-default bg-ui-panel">
            <div className="space-y-0.5 border-b border-ui-subtle px-4 py-3">
              <div className="text-[13px] font-semibold text-ui-1">Who doesn&apos;t follow the theme</div>
              <div className="text-[11.5px] text-ui-4">
                Per section, the widgets on {page.name} that are custom. Customize a section in the widget inspector to see it here.
              </div>
            </div>
            {overrides.map((o) => (
              <div key={o.sec} data-override={o.sec} className="flex items-center gap-3 border-t border-ui-subtle px-4 py-2 text-[12.5px] first:border-t-0">
                <div className="w-36 shrink-0 text-ui-2">{o.title}</div>
                <div className={cn("min-w-0 flex-1 truncate text-[12px]", o.zones.length > 0 ? "text-ui-accent-text" : "text-ui-5")}>
                  {o.zones.length > 0 ? o.zones.map(zoneName).join(", ") : "All follow"}
                </div>
                {o.locked && (
                  <span className="flex items-center gap-1 text-[10.5px] text-ui-4">
                    <Lock className="h-3 w-3" aria-hidden />
                    Locked
                  </span>
                )}
                {o.zones.length > 0 && !o.locked && (
                  <button
                    type="button"
                    onClick={() =>
                      setConfig(
                        (c) => withZonesFollowing(c, profile.id, page.id, o.sec, o.zones.map((z) => z.id)),
                        key(`reset:${o.sec}`)
                      )
                    }
                    className="h-6 shrink-0 rounded-md border border-ui-strong bg-ui-raised px-2 text-[11.5px] text-ui-2 hover:text-ui-1"
                  >
                    Reset to theme
                  </button>
                )}
              </div>
            ))}
          </section>
        </div>
      </main>

      <aside aria-label="Theme inspector" className="flex w-[320px] shrink-0 flex-col overflow-hidden border-l border-ui-subtle bg-ui-panel font-ui text-ui-2">
        <InspectorChromeProvider value={{ mode: "docked" }}>
          <InspectorView
            key={scopeId(scope)}
            context={context}
            contextKey="theme"
            header={header}
            fields={fields}
            visible={(def) => isVisible(def, effective)}
            parts={() => ({})}
            notes={(tab) => inspectorNotes(context, tab).map((n) => <InspectorNote key={n.kind}>{n.text}</InspectorNote>)}
            query={query}
            onQuery={setQuery}
            jumpTo={jumpTo}
            identity={{ icon, name: title, meta: (changed) => `Theme · ${changedLabel(changed)}` }}
          />
        </InspectorChromeProvider>
      </aside>
    </div>
  );
}
