import { hue } from "../kit";

/** The Look's series colour `n` (1-6), as `hue()` turns the accent for a second series: the chip's and the picker's marks. */
const SERIES_TURNS = [0, 60, 200, 290, 140, 30];
export const series = (n: number): string => hue(SERIES_TURNS[(n - 1) % SERIES_TURNS.length]);
