import { describe, expect, it } from "vitest";
import { selectedLabel } from "@/components/studio/selected-label";

describe("selectedLabel", () => {
  const options = [
    { value: "", label: "None (loudest live device)" },
    { value: "d1", label: "Speakers (Realtek High Definition Audio)" },
  ];

  it("is the whole label of the selected option, the blank one included", () => {
    expect(selectedLabel(options, "d1")).toBe("Speakers (Realtek High Definition Audio)");
    expect(selectedLabel(options, "")).toBe("None (loudest live device)");
  });

  it("is nothing for a value the list doesn't hold", () => {
    expect(selectedLabel(options, "gone")).toBeUndefined();
  });
});
