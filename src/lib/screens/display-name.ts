/** A display name in a kiosk link (`?display=desk`): letters, digits, `-` and `_`, up to 32 characters (the server's rule). */
export const DISPLAY_NAME_MAX = 32;

export function isDisplayName(name: string | null | undefined): name is string {
  return name != null && name.length <= DISPLAY_NAME_MAX && /^[A-Za-z0-9_-]+$/.test(name);
}
