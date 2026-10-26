/** Tower: a tall card: FPS big, then the frame, CPU and GPU readings, each a label over a large value. The native version of the InfoPanel template. */
import type { Role } from "../../infopanel/templates/roles";
import type { ScreenTemplate, Zone } from "../kit";
import { cards, type Colours, darkFamily, reading, theme } from "./ports";

type Tile = readonly [Role, string];

const FRAMES: readonly Tile[] = [["fps.low1", "1% low"], ["fps.low01", "0.1% low"], ["frametime", "Frametime"]];
const CPU: readonly Tile[] = [["cpu.temp", "CPU temp"], ["cpu.load", "CPU load"], ["cpu.power", "CPU power"], ["cpu.clock", "CPU clock"], ["ram.used", "RAM"]];
const GPU: readonly Tile[] = [["gpu.temp", "GPU temp"], ["gpu.load", "GPU load"], ["gpu.power", "GPU power"], ["gpu.clock", "GPU clock"], ["gpu.volt", "Voltage"], ["gpu.fan", "Fan"], ["vram.used", "VRAM"], ["vram.temp", "VRAM temp"]];

/** The readings two to a row from `row` (an odd one out takes its whole row), in one accent: a label over a large value, which a 480 px screen can show at a size to read. */
const tiles = (row: number, list: readonly Tile[], accent: string): Zone[] =>
  list.map(([role, label], i) => {
    const alone = i === list.length - 1 && list.length % 2 === 1;
    return reading([alone ? 1 : (i % 2) + 1, row + Math.floor(i / 2), alone ? 2 : 1, 1], label, role, { display: "value", scale: 230, accent, align: "ml" });
  });

const COLOURS: Colours = { bg: "#2a3a66", fg: "#ffffff", card: "#11151f", sub: "#8a93a8", line: "#2a3040" };

export const TOWER: ScreenTemplate = {
  id: "tower",
  name: "Tower",
  blurb: "A tall card: FPS, CPU and GPU readings in large type",
  port: true,
  fits: ["tall"],
  size: { width: 480, height: 1920 },
  look: {
    theme: theme(COLOURS),
    radius: 0.5,
    style: { skin: "default", surface: "theme", accent: "#0a84ff", font: "sans" },
    background: { type: "color", color: "#2a3a66" },
    gap: 6,
    padding: 8,
  },
  variants: darkFamily(COLOURS, "white", "smoke", "float"),
  layouts: {
    tall: {
      cols: 2,
      rows: 12,
      pages: [
        cards(
          [
            reading([1, 1, 2, 3], "FPS", "fps", { display: "value", scale: 300, accent: "#30d158", align: "ml" }),
            ...tiles(4, FRAMES, "#30d158"),
            ...tiles(6, CPU, "#0a84ff"),
            ...tiles(9, GPU, "#bf5af2"),
          ],
          { surface: "theme" },
        ),
      ],
    },
  },
};
