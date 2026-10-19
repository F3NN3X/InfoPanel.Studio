import { describe, expect, it } from "vitest";
import { reviewFont } from "./font-licence.ts";

const verdict = (license?: string, extra: { licenseUrl?: string; embedding?: "installable" | "restricted" | "preview & print" | "editable" } = {}) =>
  reviewFont({ license, ...extra }).verdict;

describe("font licence review", () => {
  it("lets open licences travel, by id, by name or by URL", () => {
    expect(verdict("OFL-1.1")).toBe("share");
    expect(verdict("This Font Software is licensed under the SIL Open Font License, Version 1.1.")).toBe("share");
    expect(verdict("Apache-2.0")).toBe("share");
    expect(verdict("Licensed under the Apache License, Version 2.0")).toBe("share");
    expect(verdict(undefined, { licenseUrl: "https://openfontlicense.org" })).toBe("share");
  });

  it("keeps fonts whose licence or embedding bits forbid passing them on", () => {
    expect(verdict("Microsoft supplied font. You may use this font to create, display, and print content as permitted by the license terms or terms of use, of the Microsoft product, service, or content in which this font was included.")).toBe("keep");
    expect(verdict("This font may not be redistributed.")).toBe("keep");
    expect(verdict(undefined, { embedding: "restricted" })).toBe("keep");
    // An open licence with restricted bits is for the user to look at.
    expect(verdict("OFL-1.1", { embedding: "restricted" })).toBe("check");
  });

  it("asks the user to check anything else", () => {
    expect(verdict()).toBe("check");
    expect(verdict("Copyright 2020 Some Foundry. All rights reserved.", { embedding: "editable" })).toBe("check");
    expect(reviewFont({}).reason).toMatch(/no licence/);
  });
});
