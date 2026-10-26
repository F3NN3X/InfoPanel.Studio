/** The native screen templates the New screen gallery offers, in gallery order (after Blank). */
import { BAR } from "./designs/bar";
import { GAMING } from "./designs/gaming";
import { GENERAL } from "./designs/general";
import { HARDWARE } from "./designs/hardware";
import { MEDIA } from "./designs/media";
import { MINIMAL } from "./designs/minimal";
import { WORK } from "./designs/work";
import type { ScreenTemplate } from "./kit";

export const SCREEN_TEMPLATES: readonly ScreenTemplate[] = [GENERAL, GAMING, WORK, HARDWARE, MEDIA, MINIMAL, BAR];

export const screenTemplateById = (id: string): ScreenTemplate | undefined => SCREEN_TEMPLATES.find((t) => t.id === id);
