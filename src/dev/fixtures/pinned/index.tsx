import { registerSampleCards } from "@/looks/sample-materials";
import { installDemoStreams } from "@/widgets/widget-qa/demo-streams";
import { FIXTURE_SIZES, isFixtureLook, isFixtureSize } from "./look";
import { LookProvider, PanelStage } from "./stage";
import { SCENES, SCENE_NAMES, type SceneName } from "./states";
import { EditorScreen, RailEditorScreen } from "./studio";

/*
 * `?fixture=pinned/<state>&look=classic|paper&size=1024x600|1920x550`: the pinned layer's design states (brief §2), dev and
 * fixtures builds only (src/dev/fixtures/host.tsx). A panel state draws the panel at its exact size from the top left; the
 * two studio states draw Studio at 1440 × 900 with the panel in their canvas. `?fixture=pinned` lists them all.
 * The agents, mixer, now-playing and OBS widgets read the Widget QA page's demo streams, so no server is asked.
 */

installDemoStreams();
registerSampleCards();

export const STUDIO_STATES = ["editor", "rail-editor"] as const;
export const PINNED_STATES = [...SCENE_NAMES, ...STUDIO_STATES];

function Index() {
  return (
    <main className="min-h-screen bg-ui-app p-6 font-ui text-ui-1">
      <h1 className="text-title font-semibold">Pinned layer fixtures</h1>
      <ul className="mt-3 space-y-1 text-body">
        {PINNED_STATES.map((s) => (
          <li key={s} className="flex gap-3">
            <span style={{ width: 192 }}>{s}</span>
            {["classic", "paper"].flatMap((look) =>
              Object.keys(FIXTURE_SIZES).map((size) => (
                <a key={`${look}-${size}`} className="underline underline-offset-2" href={`?fixture=pinned/${s}&look=${look}&size=${size}`}>
                  {look} {size}
                </a>
              ))
            )}
          </li>
        ))}
      </ul>
    </main>
  );
}

export default function PinnedHost({ state }: { state: string }) {
  const q = new URLSearchParams(window.location.search);
  const look = q.get("look");
  const size = q.get("size");
  const lookId = isFixtureLook(look) ? look : "classic";
  const { w, h } = FIXTURE_SIZES[isFixtureSize(size) ? size : "1024x600"];
  if (state === "editor" || state === "rail-editor")
    return <LookProvider id={lookId}>{state === "editor" ? <EditorScreen w={w} h={h} /> : <RailEditorScreen h={h} />}</LookProvider>;
  if (!Object.hasOwn(SCENES, state)) return <Index />;
  const scene = SCENES[state as SceneName](w, h);
  return (
    <LookProvider id={lookId}>
      <PanelStage w={state === "rail" ? 84 : w} h={h} pinned={scene.pinned} overlay={scene.overlay} label={scene.label} modal={scene.modal}>
        {scene.page}
      </PanelStage>
    </LookProvider>
  );
}
