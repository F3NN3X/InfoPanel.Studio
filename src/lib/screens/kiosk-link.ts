/** The address that shows screen `profileId` on a kiosk: `‹origin›/?kiosk=1&profile=‹id›`. */
export function kioskLink(origin: string, profileId: string): string {
  return `${origin.replace(/\/+$/, "")}/?kiosk=1&profile=${encodeURIComponent(profileId)}`;
}
