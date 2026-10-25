/**
 * The address that shows screen `profileId` on a kiosk: `‹origin›/?kiosk=1&profile=‹id›`. With a display name it is
 * `‹origin›/?kiosk=1&display=‹name›` instead: a link that pins a screen would beat the one the studio assigns.
 */
export function kioskLink(origin: string, profileId: string, display?: string): string {
  const base = `${origin.replace(/\/+$/, "")}/?kiosk=1`;
  return display ? `${base}&display=${encodeURIComponent(display)}` : `${base}&profile=${encodeURIComponent(profileId)}`;
}
