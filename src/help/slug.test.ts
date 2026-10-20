import { describe, expect, it } from "vitest";
import { slugify } from "./slug";

describe("slugify", () => {
  it("lowercases and joins the words with a dash", () => {
    expect(slugify("The kiosk URL")).toBe("the-kiosk-url");
  });

  it("drops apostrophes instead of splitting on them", () => {
    expect(slugify("The server won't start: port in use")).toBe("the-server-wont-start-port-in-use");
    expect(slugify("The display says it can’t connect")).toBe("the-display-says-it-cant-connect");
  });

  it("collapses other punctuation and trims the ends", () => {
    expect(slugify("  1. Check the server -- is running!  ")).toBe("1-check-the-server-is-running");
    expect(slugify("Settings › Server")).toBe("settings-server");
  });

  it("drops accents", () => {
    expect(slugify("Café Ångström")).toBe("cafe-angstrom");
  });

  it("is empty for text with no letters or digits", () => {
    expect(slugify("—")).toBe("");
  });
});
