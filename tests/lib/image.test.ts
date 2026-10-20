import { afterEach, describe, expect, it } from "vitest";
import { isImageUrl, resolveImageUrl } from "@/lib/image";
import { setApiBase } from "@/lib/data-api";

describe("isImageUrl", () => {
  it("recognises Data API plugin images, relative or absolute", () => {
    expect(isImageUrl("/api/images/media-plugin/cover")).toBe(true);
    expect(isImageUrl("http://127.0.0.1:3921/api/images/media-plugin/cover")).toBe(true);
    expect(isImageUrl("/api/images/only-plugin")).toBe(false);
  });

  it("keeps the existing rules", () => {
    expect(isImageUrl("https://cdn.example/a.png")).toBe(true);
    expect(isImageUrl("https://example/x", "cover-art")).toBe(true);
    expect(isImageUrl("https://i.scdn.co/image/ab67")).toBe(true);
    expect(isImageUrl("https://example/page")).toBe(false);
    expect(isImageUrl("/assets/a.svg")).toBe(true);
    expect(isImageUrl("Rammstein")).toBe(false);
  });
});

describe("resolveImageUrl", () => {
  afterEach(() => setApiBase(undefined));

  it("resolves relative API image paths against the Data API URL", () => {
    setApiBase("http://pc:4000");
    expect(resolveImageUrl("/api/images/p/i")).toBe("http://pc:4000/api/images/p/i");
    expect(resolveImageUrl("https://cdn/a.png")).toBe("https://cdn/a.png");
    expect(resolveImageUrl("/assets/a.svg")).toBe("/assets/a.svg");
  });
});
