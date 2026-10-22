import { describe, expect, it } from "vitest";
import { securityHeaders } from "../../server/security-headers.mjs";

const csp = (search) => securityHeaders(true, search)["Content-Security-Policy"];

describe("securityHeaders", () => {
  it("lets only the Studio and Settings pages refuse other sites' frames", () => {
    expect(csp("?studio=1")).toContain("frame-ancestors 'self'");
    expect(csp("?settings")).toContain("frame-ancestors 'self'");
  });
  it("leaves kiosk pages embeddable", () => {
    expect(csp("?kiosk=1")).not.toContain("frame-ancestors");
    expect(csp("")).not.toContain("frame-ancestors");
  });
  it("sends the policy on HTML only", () => {
    expect(securityHeaders(false, "?studio")["Content-Security-Policy"]).toBeUndefined();
  });
});
