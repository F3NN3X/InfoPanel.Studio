// Wave Link: the Elgato Wave Link mixer. What the registry needs; the component is its own chunk.
import { BOTH, defineWidget } from "../define";
import { waveLinkIsland } from "../island-sources";
import { WAVELINK_SETTINGS, levelOwnOf, wavelinkToProps } from "../shared/audio-settings";
import { stringOf } from "../shared/settings-kit";
import { meta } from "./meta";

export default defineWidget({
  meta,
  inspector: { header: "yes", compact: BOTH },
  settings: WAVELINK_SETTINGS,
  render: {
    load: () => import("./WaveLink"),
    toProps: (s, saved) => ({ ...wavelinkToProps(s), levelColor: stringOf(s.levelColor), levelOwn: levelOwnOf(s, saved) }),
  },
  island: waveLinkIsland,
});
