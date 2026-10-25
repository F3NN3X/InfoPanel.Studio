/** The profile templates the New InfoPanel profile gallery offers, in gallery order (after Blank). */
import { CLOCK } from "./designs/clock.ts";
import { CORES } from "./designs/cores.ts";
import { DECK } from "./designs/deck.ts";
import { GLASS } from "./designs/glass.ts";
import { GRAPHITE } from "./designs/graphite.ts";
import { METERS } from "./designs/meters.ts";
import { MONO } from "./designs/mono.ts";
import { NEON } from "./designs/neon.ts";
import { ORBIT } from "./designs/orbit.ts";
import { PAPER } from "./designs/paper.ts";
import { CONSOLE } from "./designs/console.ts";
import { FROSTBAR } from "./designs/frostbar.ts";
import { QUOTA } from "./designs/quota.ts";
import { READOUT } from "./designs/readout.ts";
import { TERMINAL } from "./designs/terminal.ts";
import { TICKER } from "./designs/ticker.ts";
import { TOWER } from "./designs/tower.ts";
import type { Template } from "./kit.ts";

export const TEMPLATES: readonly Template[] = [GRAPHITE, GLASS, NEON, PAPER, MONO, TERMINAL, CLOCK, CORES, DECK, METERS, ORBIT, TOWER, TICKER, READOUT, CONSOLE, FROSTBAR, QUOTA];

export const templateById = (id: string): Template | undefined => TEMPLATES.find((t) => t.id === id);
