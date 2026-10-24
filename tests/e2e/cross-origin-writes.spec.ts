import http from "node:http";
import type { AddressInfo } from "node:net";
import { expect, saveConfig, test } from "./fixtures";

// docs/security.md: a page from another origin (here another port on this machine, the case a studio open in a
// normal browser invites) can't change the server's state. It tries every way a browser lets it: a simple
// (no-cors) fetch, a CORS fetch carrying the write headers, and plain HTML form posts. The request guard
// (ips-server's request_guard.rs) must refuse all of them; the state is compared before and after. The studio preferences
// (ips-server's studio_prefs.rs) are in it too.

const PNG_1PX = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** The attacker's page: fires every write at `target`, then sets `document.title` to "done". */
function attackerPage(target: string): string {
  const writes = [
    { path: "/api/config", method: "POST", type: "application/json", headers: { "x-dashboard-config": "1" }, body: '{"version":1,"profiles":[]}' },
    { path: "/api/control/page", method: "POST", type: "application/json", headers: { "x-dashboard-control": "1" }, body: '{"page":"second"}' },
    { path: "/api/integrations", method: "PUT", type: "application/json", headers: { "x-dashboard-config": "1" }, body: '{"weather":{"key":"stolen"}}' },
    { path: "/api/assets", method: "POST", type: "image/png", headers: { "x-dashboard-asset": "1" }, body: "png" },
    { path: "/api/studio-prefs", method: "PUT", type: "application/json", headers: { "x-dashboard-config": "1" }, body: '{"studio.previewData":"live"}' },
  ];
  // Form posts: text/plain can carry a JSON-looking body; urlencoded and multipart are the other simple types.
  const forms = ["/api/config", "/api/control/page", "/api/assets", "/api/integrations", "/api/studio-prefs"].flatMap((path, i) =>
    ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"].map(
      (enctype, j) =>
        `<iframe name="f${i}${j}"></iframe><form target="f${i}${j}" method="POST" enctype="${enctype}" action="${target}${path}"><input name='{"version":1,"profiles":[],"x":"' value='"}'></form>`
    )
  );
  return `<!doctype html><body>${forms.join("")}<script>
const target = ${JSON.stringify(target)};
const writes = ${JSON.stringify(writes)};
const png = Uint8Array.from(atob(${JSON.stringify(PNG_1PX)}), (c) => c.charCodeAt(0));
(async () => {
  for (const w of writes) {
    const body = w.body === "png" ? png : w.body;
    // A simple request: the browser sends it without asking, but strips the custom header.
    await fetch(target + w.path, { method: w.method === "PUT" ? "POST" : w.method, mode: "no-cors", headers: { "content-type": "text/plain" }, body }).catch(() => {});
    // The real request, with the write header: needs a CORS preflight the server must not pass.
    await fetch(target + w.path, { method: w.method, mode: "cors", headers: { "content-type": w.type, ...w.headers }, body }).catch(() => {});
  }
  for (const f of document.forms) f.submit();
  setTimeout(() => (document.title = "done"), 1500);
})();
</script></body>`;
}

test("a page from another origin can't write: fetch, CORS or form", async ({ page, scratch }) => {
  const read = async () => ({
    config: await (await fetch(`${scratch.base}/api/config`)).text(),
    control: await (await fetch(`${scratch.base}/api/control`)).text(),
    integrations: await (await fetch(`${scratch.base}/api/integrations`)).text(),
    assets: await (await fetch(`${scratch.base}/api/assets`)).text(),
    studioPrefs: await (await fetch(`${scratch.base}/api/studio-prefs`)).text(),
  });
  // The server's own config, saved once, so "unchanged" compares like with like.
  expect((await saveConfig(scratch.base, JSON.parse((await read()).config))).status).toBe(200);
  const before = await read();

  const writes: { method: string; path: string; status: number }[] = [];
  page.on("response", (res) => {
    if (res.url().startsWith(scratch.base) && res.request().method() !== "GET") writes.push({ method: res.request().method(), path: new URL(res.url()).pathname, status: res.status() });
  });
  const evil = http.createServer((_req, res) => {
    res.writeHead(200, { "content-type": "text/html" });
    res.end(attackerPage(scratch.base));
  });
  await new Promise<void>((ok) => evil.listen(0, "127.0.0.1", ok));
  try {
    await page.goto(`http://127.0.0.1:${(evil.address() as AddressInfo).port}/`);
    await expect(page).toHaveTitle("done", { timeout: 15_000 });
    await page.waitForTimeout(1000);
  } finally {
    evil.close();
  }

  expect(await read()).toEqual(before);
  // Every write that reached the server was refused (a preflight that fails never sends the write at all).
  const accepted = writes.filter((w) => w.method !== "OPTIONS" && w.status < 400);
  expect(accepted, JSON.stringify(writes)).toEqual([]);
  // The attack did reach the server: the simple requests and the form posts, refused with 403.
  const refused = writes.filter((w) => w.status === 403).map((w) => w.path);
  expect(new Set(refused), JSON.stringify(writes)).toEqual(new Set(["/api/config", "/api/control/page", "/api/assets", "/api/integrations", "/api/studio-prefs"]));
});
