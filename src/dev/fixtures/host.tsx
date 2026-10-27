import App from "@/App";
import { oneEditorFixture } from "./one-editor";

/** `?fixture=one-editor/<name>`: the App on that fixture's config, opened in Edit; an unknown name shows the plain App. */
export default function FixtureHost() {
  const value = new URLSearchParams(window.location.search).get("fixture") ?? "";
  const fixture = oneEditorFixture(value.replace(/^one-editor\//, ""));
  return <App fixture={fixture} />;
}
