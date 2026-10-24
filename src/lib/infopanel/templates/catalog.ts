/** The profile templates the New InfoPanel profile gallery offers, in gallery order (after Blank). */
import { CLOCK } from "./designs/clock.ts";
import { CORES } from "./designs/cores.ts";
import { GLASS } from "./designs/glass.ts";
import { GRAPHITE } from "./designs/graphite.ts";
import { MONO } from "./designs/mono.ts";
import { NEON } from "./designs/neon.ts";
import { PAPER } from "./designs/paper.ts";
import { TERMINAL } from "./designs/terminal.ts";
import type { Template } from "./kit.ts";

export const TEMPLATES: readonly Template[] = [GRAPHITE, GLASS, NEON, PAPER, MONO, TERMINAL, CLOCK, CORES];

export const templateById = (id: string): Template | undefined => TEMPLATES.find((t) => t.id === id);
