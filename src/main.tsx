import React, { lazy, Suspense } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { startDesktopDebug } from "./lib/desktop-debug";
import { isTauri } from "./lib/desktop";
import { suppressNativeMenu } from "./lib/native-menu";

// ?ui-preview: a gallery of the studio chrome primitives (a lazy chunk, never linked).
const UiPreview = lazy(() => import("@/components/ui/ui-preview"));
const preview = new URLSearchParams(window.location.search).has("ui-preview");
// ?widget-qa: every module at a set of spans from fixture sensors, with an overflow probe (a lazy chunk, never linked).
const WidgetQa = lazy(() => import("@/widgets/widget-qa"));
const widgetQa = new URLSearchParams(window.location.search).has("widget-qa");
// ?viz-gallery: every visualiser style and look from a deterministic test signal (a lazy chunk, never linked).
const VizGallery = lazy(() => import("@/widgets/core/viz/viz-gallery"));
const vizGallery = new URLSearchParams(window.location.search).has("viz-gallery");
// ?ia-preview: the settings IA's chips, LinkRow and status bar in every state (a lazy chunk, never linked).
const IaPreview = lazy(() => import("@/components/studio/ia-preview"));
const iaPreview = new URLSearchParams(window.location.search).has("ia-preview");
// ?settings: the Settings window (PLAN decision 21), in the desktop app's Settings window or a browser tab (a lazy chunk).
const SettingsWindow = lazy(() => import("@/settings/window"));
const settings = new URLSearchParams(window.location.search).has("settings");

// Desktop app: forward the studio's errors and (in debug mode) sample its health, once per page load. The Settings
// window has the App pages' own Diagnostics and Logs.
const stopDesktopDebug = settings ? () => {} : startDesktopDebug();
import.meta.hot?.dispose(stopDesktopDebug);
// Desktop app: only the studio's own right-click menus (text fields keep the native one).
const stopNativeMenu = isTauri() ? suppressNativeMenu() : undefined;
import.meta.hot?.dispose(() => stopNativeMenu?.());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {settings ? (
      <Suspense fallback={null}>
        <SettingsWindow />
      </Suspense>
    ) : preview ? (
      <Suspense fallback={null}>
        <UiPreview />
      </Suspense>
    ) : widgetQa ? (
      <Suspense fallback={null}>
        <WidgetQa />
      </Suspense>
    ) : vizGallery ? (
      <Suspense fallback={null}>
        <VizGallery />
      </Suspense>
    ) : iaPreview ? (
      <Suspense fallback={null}>
        <IaPreview />
      </Suspense>
    ) : (
      <App />
    )}
  </React.StrictMode>
);
