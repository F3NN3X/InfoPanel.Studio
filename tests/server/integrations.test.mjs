import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { calendarUpdate } from "../../src/lib/island/dashboard-notices";
import { blockedAddress, createCalendar, fetchFeed, guardedFetch, upcoming } from "../../server/calendar.mjs";
import { createExtras } from "../../server/extras.mjs";
import { applyIntegrations, cleanCalendarUrl, createIntegrations, emptyIntegrations, normalizeIntegrations, publicIntegrations } from "../../server/integrations.mjs";
import { emptyObs, obsAuth, obsStep } from "../../server/obs.mjs";

const ids = () => {
  let n = 0;
  return () => `id${++n}`;
};

describe("integrations", () => {
  it("never shows the password or a calendar URL to the studio", () => {
    const s = applyIntegrations(emptyIntegrations(), { obs: { host: "127.0.0.1", password: "hunter2" }, calendar: { links: [{ url: "webcal://calendar.example.com/private/abc/basic.ics", label: "Work" }] } }, ids()).state;
    const pub = publicIntegrations(s);
    expect(JSON.stringify(pub)).not.toContain("hunter2");
    expect(JSON.stringify(pub)).not.toContain("private");
    expect(pub).toEqual({ obs: { host: "127.0.0.1", port: 4455, hasPassword: true }, calendar: { links: [{ id: "id1", label: "Work", host: "calendar.example.com" }] } });
    expect(s.calendar.links[0].url).toBe("https://calendar.example.com/private/abc/basic.ics");
  });

  it("keeps a password unless one is sent, and clears it with an empty one", () => {
    const set = applyIntegrations(emptyIntegrations(), { obs: { host: "obs-pc", password: "pw" } }).state;
    expect(applyIntegrations(set, { obs: { port: 4456 } }).state.obs).toEqual({ host: "obs-pc", port: 4456, password: "pw" });
    expect(applyIntegrations(set, { obs: { password: "" } }).state.obs.password).toBe("");
  });

  it("keeps stored links by id, adds new ones and drops the rest", () => {
    const next = ids();
    const two = applyIntegrations(emptyIntegrations(), { calendar: { links: [{ url: "https://a.example/a.ics" }, { url: "https://b.example/b.ics" }] } }, next).state;
    const after = applyIntegrations(two, { calendar: { links: [{ id: "id2", label: "B" }, { url: "https://c.example/c.ics" }] } }, next).state;
    expect(after.calendar.links.map((l) => [l.id, l.label, l.url])).toEqual([
      ["id2", "B", "https://b.example/b.ics"],
      ["id3", "", "https://c.example/c.ics"],
    ]);
  });

  it("refuses bad hosts and links", () => {
    expect(applyIntegrations(emptyIntegrations(), { obs: { host: "ws://x/y" } }).error).toMatch(/host/);
    expect(applyIntegrations(emptyIntegrations(), { calendar: { links: [{ url: "file:///c:/x.ics" }] } }).error).toMatch(/link/);
    expect(cleanCalendarUrl("javascript:alert(1)")).toBeNull();
  });

  it("reads a damaged file as empty and normalises values", () => {
    expect(normalizeIntegrations("x")).toEqual(emptyIntegrations());
    expect(normalizeIntegrations({ obs: { host: "bad host", port: 99999 }, calendar: { links: [{ id: "a", url: "ftp://x" }] } })).toEqual(emptyIntegrations());
  });

  describe("on disk", () => {
    let dir;
    afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

    it("saves to its own file and tells listeners the old and new state", () => {
      dir = fs.mkdtempSync(path.join(os.tmpdir(), "integrations-"));
      const file = path.join(dir, "sub", "integrations.json");
      const store = createIntegrations({ file });
      const seen = [];
      store.subscribe((next, prev) => seen.push([prev.obs.host, next.obs.host]));
      store.apply({ obs: { host: "localhost", password: "pw" } });
      expect(seen).toEqual([["", "localhost"]]);
      expect(JSON.parse(fs.readFileSync(file, "utf8")).obs.password).toBe("pw");
      expect(createIntegrations({ file }).get().obs.host).toBe("localhost");
    });
  });
});

describe("obs-websocket", () => {
  it("answers Hello with Identify, authenticated when OBS asks", () => {
    const step = obsStep(emptyObs(true), { op: 0, d: { rpcVersion: 1, authentication: { salt: "s", challenge: "c" } } }, "pw");
    expect(step.send).toEqual([{ op: 1, d: { rpcVersion: 1, eventSubscriptions: 64, authentication: obsAuth("pw", "s", "c") } }]);
    expect(obsStep(emptyObs(true), { op: 0, d: { rpcVersion: 1 } }, "").send[0].d.authentication).toBeUndefined();
  });

  it("computes the documented authentication string", () => {
    // obs-websocket 5 protocol: base64(sha256(base64(sha256(password + salt)) + challenge)).
    expect(obsAuth("supersecretpassword", "lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=", "+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=")).toBe("1Ct943GAT+6YQUUX47Ia/ncufilbe6+oD6lY+5kaCu4=");
  });

  it("asks the status once identified and follows the output events", () => {
    const identified = obsStep(emptyObs(true), { op: 2, d: {} }, "");
    expect(identified.state.connected).toBe(true);
    expect(identified.send.map((m) => m.d.requestType)).toEqual(["GetStreamStatus", "GetRecordStatus"]);
    const streaming = obsStep(identified.state, { op: 7, d: { requestId: "stream", requestStatus: { result: true }, responseData: { outputActive: true } } }, "").state;
    expect(streaming.streaming).toBe(true);
    const recording = obsStep(streaming, { op: 5, d: { eventType: "RecordStateChanged", eventData: { outputActive: true } } }, "").state;
    expect(recording).toEqual({ configured: true, connected: true, streaming: true, recording: true });
    expect(obsStep(recording, { op: 5, d: { eventType: "StreamStateChanged", eventData: { outputActive: false } } }, "").state.streaming).toBe(false);
  });
});

describe("calendar", () => {
  it("merges the feeds' occurrences, soonest first, and skips a broken feed", () => {
    const now = Date.parse("2026-10-15T08:00:00Z");
    const ics = (uid, start, title) => `BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:${uid}\r\nSUMMARY:${title}\r\nDTSTART:${start}\r\nDURATION:PT30M\r\nEND:VEVENT\r\nEND:VCALENDAR`;
    const events = upcoming([ics("b", "20261015T120000Z", "Lunch"), "garbage", ics("a", "20261015T090000Z", "Standup"), ics("c", "20261020T090000Z", "Far")], now);
    expect(events.map((e) => e.title)).toEqual(["Standup", "Lunch"]);
    // The kiosk's countdown reads the same shape.
    expect(calendarUpdate(events, now + 50 * 60_000, 10, new Set()).activity?.title).toBe("Standup");
  });
});

describe("calendar refresh", () => {
  it("fetches each link, keeps a failing link's last feed, and reports the error", async () => {
    const ics = ["BEGIN:VCALENDAR", "BEGIN:VEVENT", "UID:a", "SUMMARY:Standup", "DTSTART:20261015T090000Z", "END:VEVENT", "END:VCALENDAR"].join("\r\n");
    let fail = false;
    const fetchImpl = async () => (fail ? { ok: false, status: 404, text: async () => "" } : { ok: true, status: 200, text: async () => ics });
    const states = [];
    const lookup = async () => [{ address: "93.184.216.34" }];
    const cal = createCalendar({ links: () => [{ label: "Work", url: "https://cal.example/a.ics" }], onChange: (s) => states.push(s), fetchImpl, lookup, now: () => Date.parse("2026-10-15T08:00:00Z") });
    await cal.reconfigure();
    fail = true;
    await cal.reconfigure();
    cal.stop();
    expect(states[0]).toMatchObject({ configured: true, events: [{ title: "Standup" }] });
    expect(states[1]).toMatchObject({ configured: true, events: [{ title: "Standup" }], error: "Work: HTTP 404" });
  });
});

describe("extras", () => {
  let dir;
  afterEach(() => dir && fs.rmSync(dir, { recursive: true, force: true }));

  it("starts with nothing set up and sends no secret in its state", () => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "extras-"));
    const extras = createExtras({ file: path.join(dir, "integrations.json"), claudeSessions: () => [] });
    expect(extras.state()).toEqual({ obs: { configured: false, connected: false, streaming: false, recording: false }, calendar: { configured: false, events: [] }, agents: { sessions: [], plan: {}, usage: {} } });
    expect(extras.integrations.public()).toEqual({ obs: { host: "", port: 4455, hasPassword: false }, calendar: { links: [] } });
  });
});

describe("calendar fetch targets", () => {
  const ics = ["BEGIN:VCALENDAR", "END:VCALENDAR"].join("\r\n");
  const ok = { ok: true, status: 200, headers: { get: () => null }, text: async () => ics };

  it("blocks this machine, link-local, unspecified and multicast addresses, not the LAN", () => {
    for (const ip of ["127.0.0.1", "0.0.0.0", "169.254.169.254", "224.0.0.1", "::1", "::", "fe80::1", "::ffff:127.0.0.1"]) expect(blockedAddress(ip), ip).toBe(true);
    for (const ip of ["192.168.1.10", "10.0.0.5", "93.184.216.34", "2606:4700::1"]) expect(blockedAddress(ip), ip).toBe(false);
  });

  it("reads IPv4 inside IPv6 in any spelling, as URL normalises it", () => {
    // new URL("http://[::ffff:127.0.0.1]/").hostname is "[::ffff:7f00:1]".
    for (const ip of ["::ffff:7f00:1", "::FFFF:A9FE:A9FE", "64:ff9b::7f00:1", "::127.0.0.1", "0:0:0:0:0:0:0:1", "0000::", "FE80::1%eth0", "febf::1", "ff02::1", "not an ip"]) {
      expect(blockedAddress(ip), ip).toBe(true);
    }
    for (const ip of ["::ffff:c0a8:10a", "::ffff:192.168.1.10", "64:ff9b::5db8:d822", "2001:db8::1", "fec0::1"]) expect(blockedAddress(ip), ip).toBe(false);
  });

  it("checks the address again when it connects, so a name cannot change between the check and the request", async () => {
    const server = http.createServer((_, res) => res.end("BEGIN:VCALENDAR"));
    await new Promise((ok) => server.listen(0, "127.0.0.1", ok));
    const { port } = server.address();
    try {
      // The name passes the first check, then resolves to this machine.
      let calls = 0;
      const lookup = async () => [{ address: calls++ === 0 ? "93.184.216.34" : "127.0.0.1", family: 4 }];
      await expect(fetchFeed(`http://rebind.example:${port}/a.ics`, guardedFetch(lookup), lookup)).rejects.toThrow("address not allowed");
    } finally {
      server.close();
    }
  });

  it("refuses a link whose name resolves to a blocked address", async () => {
    const lookup = async () => [{ address: "93.184.216.34" }, { address: "127.0.0.1" }];
    await expect(fetchFeed("https://cal.example/a.ics", async () => ok, lookup)).rejects.toThrow("address not allowed");
    await expect(fetchFeed("http://169.254.169.254/latest", async () => ok, lookup)).rejects.toThrow("address not allowed");
  });

  it("checks every redirect hop and stops after three", async () => {
    const lookup = async (host) => [{ address: host === "inside.example" ? "127.0.0.1" : "93.184.216.34" }];
    const to = (location) => ({ ok: false, status: 302, headers: { get: () => location }, text: async () => "" });
    await expect(fetchFeed("https://cal.example/a.ics", async () => to("http://inside.example/x"), lookup)).rejects.toThrow("address not allowed");
    await expect(fetchFeed("https://cal.example/a.ics", async () => to("/again"), lookup)).rejects.toThrow("too many redirects");
    let n = 0;
    expect(await fetchFeed("https://cal.example/a.ics", async () => (n++ === 0 ? to("/moved.ics") : ok), lookup)).toBe(ics);
  });
});
