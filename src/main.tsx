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

// Desktop app: forward errors and (in debug mode) sample health, once per page load.
const stopDesktopDebug = startDesktopDebug();
import.meta.hot?.dispose(stopDesktopDebug);
// Desktop app: only the studio's own right-click menus (text fields keep the native one).
const stopNativeMenu = isTauri() ? suppressNativeMenu() : undefined;
import.meta.hot?.dispose(() => stopNativeMenu?.());

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {preview ? (
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
    ) : (
      <App />
    )}
  </React.StrictMode>
);
