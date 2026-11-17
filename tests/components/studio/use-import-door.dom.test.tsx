// @vitest-environment happy-dom
// The "Drop to import" cover is for files dragged in from outside Studio. A drag that starts in the page (a picture on a
// widget, an image block moved in the builder) can be listed as "Files" by the browser, and must not raise it.
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useImportDoor } from "@/components/studio/use-import-door";
import { defaultConfig } from "@/lib/layout";

afterEach(cleanup);

function Host() {
  const node = useImportDoor({
    config: defaultConfig(),
    setConfig: vi.fn() as never,
    addScreen: vi.fn(),
    backup: vi.fn(async () => true),
    useAsBackground: vi.fn(),
    current: { screen: "s", page: "a" },
    toast: vi.fn(),
    onGo: vi.fn(),
    onWizard: vi.fn(),
    onInstalled: vi.fn(),
    onLibraryChanged: vi.fn(),
  } as never);
  return <>{node}</>;
}

function fire(type: string, target: EventTarget = window, prevented = false): void {
  const e = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(e, "dataTransfer", { value: { types: ["Files"], files: [] } });
  if (prevented) e.preventDefault();
  act(() => {
    target.dispatchEvent(e);
  });
}

const cover = () => screen.queryByText("Drop to import");

describe("the Drop to import cover", () => {
  it("shows for a file dragged in from outside", () => {
    render(<Host />);
    fire("dragenter");
    fire("dragover");
    expect(cover()).not.toBeNull();
    fire("dragleave");
    expect(cover()).toBeNull();
  });

  it("stays away for a drag that started in the page, until it ends", () => {
    render(<Host />);
    fire("dragstart");
    fire("dragenter");
    fire("dragover");
    expect(cover()).toBeNull();
    fire("dragend");
    fire("dragenter");
    fire("dragover");
    expect(cover()).not.toBeNull();
  });

  it("a drag the page cancelled (the builder's stage) leaves outside files working", () => {
    render(<Host />);
    fire("dragstart", window, true);
    fire("dragenter");
    fire("dragover");
    expect(cover()).not.toBeNull();
  });
});
