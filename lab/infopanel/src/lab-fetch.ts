import { PROXIED, type Fetch } from "@/lib/infopanel/font-sources.ts";

/** `fetch` for the lab page: proxied hosts through `/font-proxy`, the rest direct. */
export const labFetch: Fetch = (url, init) =>
  PROXIED.has(new URL(url).hostname) ? fetch(`/font-proxy?url=${encodeURIComponent(url)}`) : fetch(url, init);
