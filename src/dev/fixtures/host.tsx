import { lazy, Suspense } from "react";
import App from "@/App";
import { oneEditorFixture } from "./one-editor";

/** The pinned layer's design states (`?fixture=pinned/<state>`, ./pinned), a chunk of their own. */
const Pinned = lazy(() => import("./pinned"));

/**
 * `?fixture=one-editor/<name>`: the App on that fixture's config, opened in Edit; an unknown name shows the plain App.
 * `?fixture=pinned` or `pinned/<state>`: the pinned layer's design states, drawn without the App.
 */
export default function FixtureHost() {
  const value = new URLSearchParams(window.location.search).get("fixture") ?? "";
  const pinned = /^pinned(?:\/(.*))?$/.exec(value);
  if (pinned)
    return (
      <Suspense fallback={null}>
        <Pinned state={pinned[1] ?? ""} />
      </Suspense>
    );
  const fixture = oneEditorFixture(value.replace(/^one-editor\//, ""));
  return <App fixture={fixture} />;
}
