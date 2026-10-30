/** Stream Deck: OBS control, live chat and the sound mixer side by side on one wide touch screen, near-black with a teal accent. */
import { zone, type ScreenTemplate } from "../kit";

export const STREAM_DECK: ScreenTemplate = {
  id: "stream-deck",
  name: "Stream Deck",
  blurb: "OBS, live chat and the mixer on one wide touch screen",
  fits: ["wide"],
  size: { width: 2560, height: 720 },
  look: {
    theme: "zinc",
    radius: 0.75,
    style: { surface: "theme", accent: "#2dd4bf" },
    background: { type: "color", color: "#09090b" },
    gap: 14,
    padding: 14,
  },
  layouts: {
    wide: {
      cols: 12,
      rows: 4,
      pages: [
        [
          zone("StreamControl", [1, 1, 4, 4]),
          zone("StreamChat", [5, 1, 4, 4], { source: "both" }),
          zone("StreamMixer", [9, 1, 4, 4]),
        ],
      ],
    },
  },
};
