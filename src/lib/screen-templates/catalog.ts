/** The native screen templates the New screen gallery offers, in gallery order (after Blank): the starters, then the native versions of the InfoPanel templates. */
import { BAR } from "./designs/bar";
import { CLOCK } from "./designs/clock";
import { CONSOLE } from "./designs/console";
import { CORES } from "./designs/cores";
import { DECK } from "./designs/deck";
import { FROSTBAR } from "./designs/frostbar";
import { GAMING } from "./designs/gaming";
import { GENERAL } from "./designs/general";
import { GLASS } from "./designs/glass";
import { GRAPHITE } from "./designs/graphite";
import { HARDWARE } from "./designs/hardware";
import { MEDIA } from "./designs/media";
import { METERS } from "./designs/meters";
import { MINIMAL } from "./designs/minimal";
import { MONO } from "./designs/mono";
import { NEON } from "./designs/neon";
import { ORBIT } from "./designs/orbit";
import { PAPER } from "./designs/paper";
import { QUOTA } from "./designs/quota";
import { READOUT } from "./designs/readout";
import { TERMINAL } from "./designs/terminal";
import { TICKER } from "./designs/ticker";
import { TOWER } from "./designs/tower";
import { WORK } from "./designs/work";
import type { ScreenTemplate } from "./kit";

const STARTERS: readonly ScreenTemplate[] = [GENERAL, GAMING, WORK, HARDWARE, MEDIA, MINIMAL, BAR];
/** The native versions of the InfoPanel profile templates, in the InfoPanel gallery's order. */
const PORTS: readonly ScreenTemplate[] = [GRAPHITE, GLASS, NEON, PAPER, MONO, TERMINAL, CLOCK, CORES, DECK, METERS, ORBIT, TOWER, TICKER, READOUT, CONSOLE, FROSTBAR, QUOTA];

export const SCREEN_TEMPLATES: readonly ScreenTemplate[] = [...STARTERS, ...PORTS];

export const screenTemplateById = (id: string): ScreenTemplate | undefined => SCREEN_TEMPLATES.find((t) => t.id === id);
