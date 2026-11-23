import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { useToast } from "@/components/ui/toast";
import type { HistorySetter } from "@/hooks/use-config-history";
import { useSensorCatalog } from "@/lib/catalog";
import { getApiBase, subscribeApiBase } from "@/lib/data-api";
import { healthCounts, type DataPoint, type Health } from "@/lib/data-points";
import { useLiveData } from "@/lib/data-live";
import { bindPoint, computeUsage, screensUsing, unbindPoint, type Usage } from "@/lib/data-usage";
import { PANEL_ID, uid, type DashboardConfig, type ProfileView, type SourcePref } from "@/lib/layout";
import { useDataModel } from "@/lib/use-data-model";
import type { StatusBarData } from "./status-bar";
import { modules } from "@/modules";
import { cn } from "@/lib/utils";
import { addStatZone, withSourcePref } from "./explorer/explorer-actions";
import { ExplorerHeader } from "./explorer/explorer-header";
import { ConnectionCard } from "./connection-card";
import {
  ALL_SCOPE,
  alertsByKey,
  bindOptions,
  filterPoints,
  filterSources,
  flattenRows,
  pointDisplayName,
  resolveBindTarget,
  scopeContainers,
  scopeNote,
  scopeStats,
  streamPrefix,
  summaryHeading,
  usedKeys,
  type BindOption,
  type BindZone,
  type Scope,
  type TypeFilter,
} from "./explorer/explorer-model";
import { GroupSummary } from "./explorer/group-summary";
import { PointInspector } from "./explorer/point-inspector";
import { PointTable } from "./explorer/point-table";
import { SourceTree } from "./explorer/source-tree";
import { TypeFilters } from "./explorer/type-filters";
import { useViewportWidth } from "./explorer/use-viewport-width";
import { showsLive } from "./sidebar/data-api-model";
import { placementTitle } from "./studio-modules";

/** Below this window width the point inspector becomes an overlay drawer. */
const DRAWER_BELOW = 1400;
/** Below this window width the table drops its "Used in" column. */
const HIDE_USED_IN_BELOW = 1560;
/** Below this window width there is no sidebar, so the Connection card (the Data API's address) stays on this page. */
const PHONE_BELOW = 600;

interface SourcesPanelProps {
  config: DashboardConfig;
  /** The history-recording config setter (the optional key merges consecutive edits). */
  setConfig: HistorySetter;
  /** The active profile (for "Used by" and the zones a point can be bound to). */
  profile: ProfileView;
  /** The canvas zone selected in Design mode; the default target for binding. */
  selectedZoneId: string | null;
  /** Leave Sources mode and select a zone (and one of its panel widgets, on the Data tab) on the canvas. */
  onOpenZone: (zoneId: string, opts?: { widgetId?: string; dataTab?: boolean }) => void;
  /** Open Alerts (a link: nothing is written from here). */
  onOpenAlerts: (sensorKey?: string) => void;
  /** Select this data point (the inspector's Bound data rows open it); selects again whenever it changes. */
  focusPointKey?: string;
  /** The Data API's live state, for the Connection card's pill on a phone. */
  dataApi: StatusBarData["dataApi"];
}

/** The Data sources page: the header, the sources and filters, the point table and the point detail. Toasts come from the studio's provider. */
export function SourcesPanel({ config, setConfig, profile, selectedZoneId, onOpenZone, onOpenAlerts, focusPointKey, dataApi }: SourcesPanelProps) {
  const toast = useToast();
  const catalog = useSensorCatalog();
  const apiBase = useSyncExternalStore(subscribeApiBase, getApiBase);
  const width = useViewportWidth();

  const model = useDataModel();
  const usage = useMemo(
    () => computeUsage(profile, model.points.map((p) => p.key), modules),
    [profile, model.points]
  );

  const screens = useMemo(
    () => screensUsing(config.profiles, model.points.map((p) => p.key), modules),
    [config.profiles, model.points]
  );
  const alerts = useMemo(() => alertsByKey(config.alerts), [config.alerts]);
  const used = useMemo(() => usedKeys(screens, alerts), [screens, alerts]);
  const inUseCount = useMemo(() => model.points.filter((p) => used.has(p.key)).length, [model.points, used]);

  const [scope, setScope] = useState<Scope>(ALL_SCOPE);
  const [treeQuery, setTreeQuery] = useState("");
  const [health, setHealth] = useState<Health | null>(null);
  const [query, setQuery] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [hideEmpty, setHideEmpty] = useState(false);
  const [inUse, setInUse] = useState(false);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [bindChoice, setBindChoice] = useState<BindOption | null>(null);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [visible, setVisible] = useState<string[]>([]);

  // The rows in view and the selected point are the only keys the history records.
  const watched = useMemo(() => (selectedKey ? [...visible, selectedKey] : visible), [visible, selectedKey]);
  const { values, recorder } = useLiveData(watched);

  useEffect(() => {
    if (focusPointKey) setSelectedKey(focusPointKey);
  }, [focusPointKey]);

  // Esc closes the point inspector, unless it was meant for a field or an open popup.
  // (The studio shortcuts mark Esc handled before this runs, so it can't check defaultPrevented.)
  useEffect(() => {
    if (selectedKey === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('input, select, textarea, [role="dialog"], [role="menu"]')) return;
      setSelectedKey(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedKey]);

  const treeSources = useMemo(() => filterSources(model.sources, treeQuery, health), [model.sources, treeQuery, health]);
  const counts = useMemo(() => healthCounts(model.sources), [model.sources]);

  // The health chips and the tree filter only narrow the tree, never the table.
  const filtered = useMemo(
    () => filterPoints(model.points, { scope, query, type, hideEmpty, inUse, used }),
    [model.points, scope, query, type, hideEmpty, inUse, used]
  );
  const rows = useMemo(() => flattenRows(filtered, model.sources, collapsed), [filtered, model.sources, collapsed]);
  const toggleGroup = (id: string) =>
    setCollapsed((c) => {
      const next = new Set(c);
      if (!next.delete(id)) next.add(id);
      return next;
    });

  const scopePoints = useMemo(
    () => (scope.kind === "all" ? model.points : model.points.filter((p) => (scope.kind === "source" ? p.sourceId === scope.id : p.containerId === scope.id))),
    [model.points, scope]
  );
  const emptyCount = useMemo(() => scopePoints.filter((p) => p.type === "empty").length, [scopePoints]);
  const point = selectedKey ? (model.byKey.get(selectedKey) ?? null) : null;

  const zones = useMemo<BindZone[]>(
    () =>
      profile.placements.map((p) => ({
        id: p.id,
        title: placementTitle(p),
        widgets: p.panel?.widgets
          .filter((w) => w.kind !== "clock" && w.kind !== "shape")
          .map((w) => ({ id: w.id, label: w.label?.trim() || w.kind })),
      })),
    [profile.placements]
  );
  const options = useMemo(() => bindOptions(zones), [zones]);
  const target = resolveBindTarget(options, bindChoice, selectedZoneId);
  const zoneTitle = (id: string) => zones.find((z) => z.id === id)?.title ?? "widget";

  const bind = (key: string, zoneId: string, widgetId: string | undefined) => {
    const zone = zones.find((z) => z.id === zoneId);
    if (zone?.widgets && !widgetId) return toast("Select a widget in the panel first");
    if (bindPoint(config, zoneId, widgetId, key, modules, model) === config) {
      return toast(`${zone?.title ?? "That widget"} can't bind a single value`);
    }
    setConfig((c) => bindPoint(c, zoneId, widgetId, key, modules, model), `bind:${zoneId}:${widgetId ?? ""}:${key}`);
    toast(`Bound to ${zoneTitle(zoneId)}`);
  };

  const unbind = (key: string, zoneId: string, widgetId: string | undefined) => {
    if (unbindPoint(config, zoneId, widgetId, key, modules, model) === config) {
      return toast(`${zoneTitle(zoneId)} reads this data through its module; there is no binding to remove`);
    }
    setConfig((c) => unbindPoint(c, zoneId, widgetId, key, modules, model), `unbind:${zoneId}:${widgetId ?? ""}:${key}`);
    toast(`Unbound from ${zoneTitle(zoneId)}`);
  };

  const toggleBind = (p: DataPoint, bound: boolean) => {
    if (!target) return;
    (bound ? unbind : bind)(p.key, target.zoneId, target.widgetId);
  };

  /** Add a stat zone for the point, then leave Sources mode with that zone selected. */
  const newWidget = (p: DataPoint) => {
    const zoneId = uid(PANEL_ID);
    setConfig((c) => addStatZone(c, profile.id, p, zoneId, profile.pageId));
    toast(`Added ${p.name}`);
    onOpenZone(zoneId);
  };

  const openUsage = (u: Usage) => onOpenZone(u.zoneId, { widgetId: u.panelWidgetId, dataTab: true });

  const onPrefsChange = (key: string, pref: Partial<SourcePref>) => setConfig((c) => withSourcePref(c, key, pref), `source-pref:${key}`);

  const scopeSource = scope.kind === "all" ? null : (model.sources.find((s) => s.id === (scope.kind === "source" ? scope.id : scope.sourceId)) ?? null);
  const heading = summaryHeading(scope, model.sources);
  const containers = scopeContainers(model.sources, scope);
  const prefix = scope.kind === "all" ? "" : streamPrefix(scopePoints);
  const streamRoute = `/events?prefix=${encodeURIComponent(prefix)}`;
  const changeScope = (next: Scope) => {
    setScope(next);
    setSelectedKey(null);
  };

  const loading = model.points.length === 0 && (catalog.status === "loading" || catalog.status === "idle");
  const drawer = width < DRAWER_BELOW;
  const inspector = point ? (
    <PointInspector
      point={point}
      values={values}
      recorder={recorder}
      apiBase={apiBase}
      screenName={profile.name}
      usedBy={usage.byKey.get(point.key) ?? []}
      alertRules={alerts.get(point.key) ?? []}
      displayName={pointDisplayName(model.sources, point, config.sourcePrefs)}
      onDisplayName={(key, displayName) => onPrefsChange(key, { displayName })}
      options={options}
      target={target}
      onTarget={setBindChoice}
      onBind={(zoneId, widgetId) => bind(point.key, zoneId, widgetId)}
      onUnbind={(zoneId, widgetId) => unbind(point.key, zoneId, widgetId)}
      onNewWidget={() => newWidget(point)}
      onOpenUsage={openUsage}
      onOpenAlerts={onOpenAlerts}
      onClose={() => setSelectedKey(null)}
    />
  ) : (
    <GroupSummary
      title={heading.title}
      sub={heading.sub}
      stats={scopeStats(scopePoints, values, usage)}
      note={scopeNote(scope, model.sources)}
      containers={containers}
      stream={prefix ? { path: streamRoute, url: `${apiBase}${streamRoute}` } : null}
      prefPlugin={scopeSource?.category === "Plugins" ? scopeSource.id : null}
      sourcePrefs={config.sourcePrefs}
      onPrefsChange={onPrefsChange}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col bg-ui-app">
      <ExplorerHeader
        pointCount={model.points.length}
        sourceCount={model.sources.length}
        inUseCount={inUseCount}
        shownCount={query.trim() !== "" || type !== "all" || hideEmpty || inUse || scope.kind !== "all" ? filtered.length : null}
        query={query}
        onQuery={setQuery}
        apiBase={apiBase}
        config={config}
      />
      {loading ? (
        <div className="grid flex-1 place-items-center text-body text-ui-3">Loading data points…</div>
      ) : (
      <div className="relative flex min-h-0 flex-1 max-sm:flex-col">
        {/* On a phone the sources sit above the table. */}
        <div className="flex min-h-0 w-58 shrink-0 flex-col overflow-y-auto border-r border-ui-subtle bg-ui-panel max-sm:max-h-[48%] max-sm:w-full max-sm:border-b max-sm:border-r-0">
          {width < PHONE_BELOW && (
            <ConnectionCard
              value={config.dataApiUrl}
              onChange={(dataApiUrl) => setConfig((c) => ({ ...c, dataApiUrl }), "data-api-url")}
              dataApi={dataApi}
            />
          )}
          <SourceTree
            sources={treeSources}
            counts={counts}
            totalPoints={model.points.length}
            scope={scope}
            onScope={changeScope}
            query={treeQuery}
            onQuery={setTreeQuery}
            health={health}
            onHealth={setHealth}
            sourcePrefs={config.sourcePrefs}
            onPrefsChange={onPrefsChange}
          />
          <TypeFilters
            type={type}
            onType={setType}
            emptyCount={emptyCount}
            hideEmpty={hideEmpty}
            onHideEmpty={setHideEmpty}
            inUse={inUse}
            onInUse={setInUse}
          />
        </div>
        <PointTable
          key={`${scope.kind}:${scope.kind === "all" ? "" : scope.id}|${query}|${type}|${hideEmpty}|${inUse}`}
          rows={rows}
          values={values}
          recorder={recorder}
          usage={usage}
          selectedKey={selectedKey}
          onSelect={setSelectedKey}
          onToggleGroup={toggleGroup}
          onVisible={setVisible}
          target={target}
          onToggleBind={toggleBind}
          screens={screens}
          alerts={alerts}
          apiBase={apiBase}
          showUsedIn={width >= HIDE_USED_IN_BELOW}
          live={showsLive(dataApi.state)}
        />
        {(!drawer || point) && (
          <div
            className={cn(
              "w-90 shrink-0 border-l border-ui-subtle max-sm:w-full",
              drawer && "absolute inset-y-0 right-0 z-20 shadow-ui-drawer"
            )}
          >
            {inspector}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
