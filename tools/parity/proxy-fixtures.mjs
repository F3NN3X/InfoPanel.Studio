// Parity fixture cases for the proxies (server/proxy.mjs, server/font-proxy.mjs and the image proxy's address check,
// calendar.mjs's blockedAddress with the LAN blocked). Imported by export-fixtures.mjs.
import { blockedAddress } from "../../server/calendar.mjs";
import { hopAllowed, proxyAllowed } from "../../server/font-proxy.mjs";
import { isAllowedProxyType, isValidProxyTarget, resolveProxyType, sniffImageType } from "../../server/proxy.mjs";

/** Every blocked range's edges and the addresses just outside them, in each spelling the check reads. */
const ADDRESSES = [
  "0.0.0.0", "0.255.255.255", "1.0.0.0", "126.255.255.255", "127.0.0.0", "127.255.255.255", "128.0.0.0",
  "169.253.255.255", "169.254.0.0", "169.254.169.254", "169.254.255.255", "169.255.0.0", "223.255.255.255", "224.0.0.0", "239.255.255.255", "240.0.0.1", "255.255.255.255",
  "9.255.255.255", "10.0.0.0", "10.255.255.255", "11.0.0.0", "172.15.255.255", "172.16.0.0", "172.31.255.255", "172.32.0.0",
  "192.167.255.255", "192.168.0.0", "192.168.255.255", "192.169.0.0", "100.63.255.255", "100.64.0.0", "100.127.255.255", "100.128.0.0",
  "8.8.8.8", "93.184.216.34", "192.0.2.1", "198.18.0.1",
  "::", "::1", "::2", "1::1", "fe7f:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "fe80::", "fe80::1%eth0", "febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "fec0::",
  "feff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "ff00::", "ff02::1", "fbff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "fc00::", "fd00::1", "fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff", "fe00::",
  "::ffff:127.0.0.1", "::ffff:7f00:1", "::FFFF:A9FE:A9FE", "::fffe:7f00:1", "::ffff:10.0.0.1", "::ffff:11.0.0.0", "::ffff:100.64.0.1", "::ffff:100.128.0.0", "::ffff:192.168.1.10",
  "::ffff:0.0.0.0", "::ffff:8.8.8.8", "::127.0.0.1", "::8.8.8.8", "::1:0", "64:ff9b::7f00:1", "64:ff9b::c0a8:1", "64:ff9b::808:808", "64:ff9b:1::7f00:1",
  "2606:4700::1", "2002::1", "2001::1", "0:0:0:0:0:0:0:1", "0000::", "not an ip", "", "1.2.3", "::ffff:1.2.3", "[::1]",
];

const TARGETS = [
  "https://i.scdn.co/a.jpg", "https://10.0.0.1/x", "https://user:pw@a.test:8443/x", "HTTPS://A.TEST/x", "http://localhost:9/a", "http://LOCALHOST/a", "http://127.0.0.1/a",
  "http://127.1/a", "http://0x7f000001/a", "http://[::1]/a", "http://[0:0::1]:80/a", "http://localhost./a", "http://127.0.0.2/a", "http://[::ffff:127.0.0.1]/a",
  "http://169.254.169.254/latest", "http://10.0.0.1/x", "http://example.com/a.jpg", "file:///C:/a.png", "ftp://example.com/a", "data:image/png;base64,AA", "ws://localhost/a",
  "not a url", "", "/relative", "https://[::1", "http://user@localhost/a", " https://a.test/x ", "https://a.test/\tx",
];

const TYPES = [
  "image/png", "image/jpeg", "image/webp", "IMAGE/PNG", "image/avif; q=1", "image/x-icon", " image/png ", "image/vnd.microsoft.icon", "image/svg+xml", "IMAGE/SVG+XML; x",
  "image/", "image/p_g", "image/png extra", "text/html", "text/html; charset=utf-8", "application/json", "application/octet-stream", "video/mp4", "", null,
];

const BYTES = [
  [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0], [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a], [0xff, 0xd8, 0xff, 0xe0], [0xff, 0xd8], "GIF87a....", "GIF89a", "GIF88a", "GIF8",
  "RIFF\0\0\0\0WEBPVP8 ", "RIFF\0\0\0\0WEB", "\0\0\0\x1cftypavif\0\0\0\0", "\0\0\0\x1cftypavis", "\0\0\0\x1cftypheic", "<html><script>", '<svg xmlns="http://www.w3.org/2000/svg"/>', "",
].map((b) => Buffer.from(typeof b === "string" ? Buffer.from(b, "latin1") : b));

const FONT_URLS = [
  "https://www.fontsquirrel.com/fonts/download/roboto", "https://www.fontsquirrel.com/api/fontlist/all", "https://WWW.FontSquirrel.com:8443/x", "https://u:p@www.fontsquirrel.com/x",
  "http://www.fontsquirrel.com/x", "https://www.fontsquirrel.com./x", "https://fontsquirrel.com/x", "https://evil.example/x", "https://cdn.jsdelivr.net/x.ttf", "https://api.fontsource.org/v1",
  "https://fonts.google.com/x", "https://fonts.gstatic.com/s/x.woff2", "http://cdn.jsdelivr.net/x", "https://127.0.0.1/x", "https://169.254.169.254/", "file:///C:/x", "not a url", "",
];

const parsed = (u) => {
  try {
    return new URL(u);
  } catch {
    return null;
  }
};

export function proxyCases() {
  const cases = [];
  for (const ip of ADDRESSES) for (const blockLan of [true, false]) cases.push({ input: { fn: "blockedAddress", ip, blockLan }, output: blockedAddress(ip, blockLan) });
  // null: `new URL` throws (the route's 400 before the target check).
  for (const url of TARGETS) cases.push({ input: { fn: "isValidProxyTarget", url }, output: parsed(url) && isValidProxyTarget(parsed(url)) });
  for (const type of TYPES) cases.push({ input: { fn: "isAllowedProxyType", type }, output: isAllowedProxyType(type) });
  for (const buf of BYTES) cases.push({ input: { fn: "sniffImageType", bytes: buf.toString("base64") }, output: sniffImageType(buf) });
  for (const type of TYPES) for (const buf of [BYTES[0], BYTES[13]]) cases.push({ input: { fn: "resolveProxyType", type, bytes: buf.toString("base64") }, output: resolveProxyType(type, buf) });
  return cases;
}

export function fontProxyCases() {
  return FONT_URLS.flatMap((url) => [
    { input: { fn: "proxyAllowed", url }, output: proxyAllowed(url) },
    { input: { fn: "hopAllowed", url }, output: hopAllowed(url) },
  ]);
}
