/**
 * The Keys widget's editing (pinned layer P7): pure changes over a placement's keys (`Placement.keys`, src/lib/keys.ts), one
 * level at a time. A level is the top (`folder` null) or a folder key's own keys. Every change gives a new list, and what it
 * gives passes `normalizeKeys` unchanged.
 */
import { MAX_KEYS, type KeySlot } from "./keys";
import { uid } from "./layout";

/** A new key, or a folder (an empty one, opened by its tap). */
export const newKey = (folder = false): KeySlot =>
  folder ? { id: uid("key"), name: "Folder", icon: { from: "set", name: "folder" }, keys: [] } : { id: uid("key"), name: "Key", icon: { from: "set", name: "zap" } };

/** The keys of a level: the top, or a folder key's. */
export const levelKeys = (keys: readonly KeySlot[], folder: string | null): readonly KeySlot[] =>
  folder === null ? keys : (keys.find((k) => k.id === folder)?.keys ?? []);

/** `keys` with one level changed by `fn` (a folder that is gone changes nothing). */
export function withLevel(keys: readonly KeySlot[], folder: string | null, fn: (level: readonly KeySlot[]) => KeySlot[]): KeySlot[] {
  if (folder === null) return fn(keys);
  return keys.map((k) => (k.id === folder && k.keys ? { ...k, keys: fn(k.keys) } : k));
}

/** A level with a key added at its end, unless it is full. Folders are added at the top only. */
export const addKey = (level: readonly KeySlot[], key: KeySlot): KeySlot[] => (level.length >= MAX_KEYS ? [...level] : [...level, key]);

/** A level with one key changed. */
export const updateKey = (level: readonly KeySlot[], id: string, fn: (k: KeySlot) => KeySlot): KeySlot[] => level.map((k) => (k.id === id ? fn(k) : k));

/** A level without a key (a folder goes with its keys). */
export const removeKey = (level: readonly KeySlot[], id: string): KeySlot[] => level.filter((k) => k.id !== id);

/** A level with a key one place earlier or later. */
export function moveKey(level: readonly KeySlot[], id: string, by: -1 | 1): KeySlot[] {
  const from = level.findIndex((k) => k.id === id);
  const to = from + by;
  if (from < 0 || to < 0 || to >= level.length) return [...level];
  const next = [...level];
  [next[from], next[to]] = [next[to], next[from]];
  return next;
}

/** A key with a field set or, given undefined, left out (the stored shape keeps no empty fields). */
export function withField<K extends "icon" | "series" | "touch">(k: KeySlot, field: K, value: KeySlot[K] | undefined): KeySlot {
  const { [field]: _old, ...rest } = k;
  return (value === undefined ? rest : { ...rest, [field]: value }) as KeySlot;
}
