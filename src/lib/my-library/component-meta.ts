/**
 * What marks a Library canvas as a component (a reusable piece of an InfoPanel profile) rather than a whole
 * profile: `meta.component`. Kept apart from the component code so the studio's drop checks stay small.
 */
import type { LibraryItem } from "../library.ts";

/** The roles a component's sensors were saved with, by the binding group they belong to (`groupId`). */
export type ComponentRoles = Record<string, string>;

/** A saved component: a canvas item flagged in its meta. An older build lists it as an ordinary canvas. */
export const isComponent = (item: Pick<LibraryItem, "kind" | "meta">): boolean => item.kind === "canvas" && item.meta?.component === true;

/** A saved whole profile: a canvas that isn't a component. */
export const isProfileItem = (item: Pick<LibraryItem, "kind" | "meta">): boolean => item.kind === "canvas" && !isComponent(item);

/** The roles saved on a component item, or none. */
export function rolesOf(item: Pick<LibraryItem, "meta">): ComponentRoles {
  const raw = item.meta?.roles;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string"));
}
