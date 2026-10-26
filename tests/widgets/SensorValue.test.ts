import { describe, expect, it } from "vitest";
import { readingText } from "@/widgets/SensorValue";

describe("readingText", () => {
  it("keeps a unit and gives a small number a decimal", () => {
    expect(readingText(61, "°C")).toBe("61°C");
    expect(readingText(5.58, "GHz")).toBe("5.6GHz");
  });

  it("reads a rate or a size in the next unit up past a thousand", () => {
    expect(readingText(13493, "KB/s")).toBe("13.2MB/s");
    expect(readingText(999, "KB/s")).toBe("999KB/s");
    expect(readingText(5414, "MB")).toBe("5.3GB");
    expect(readingText(43.8, "GB")).toBe("43.8GB");
  });

  it("has nothing to show without a reading", () => {
    expect(readingText(undefined, "°C")).toBeUndefined();
  });
});
