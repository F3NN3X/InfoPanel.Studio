/**
 * The anchor of a heading: lowercase, accents and apostrophes dropped, every other run of
 * non-alphanumerics collapsed to one "-", the ends trimmed. "The server won't start: port in use"
 * is "the-server-wont-start-port-in-use".
 */
export function slugify(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/['‘’`]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
