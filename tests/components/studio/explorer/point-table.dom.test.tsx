// @vitest-environment happy-dom
// The point list is one Tab stop: Tab enters it once, arrows move inside it, Tab leaves in one press and Shift+Tab returns to the last row.
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { PointTable } from "@/components/studio/explorer/point-table";
import type { TableRow } from "@/components/studio/explorer/explorer-model";
import type { DataPoint } from "@/lib/data-points";
import { HistoryRecorder } from "@/lib/data-history";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
    unobserve() {}
  }
);

const point = (n: number): DataPoint => ({
  key: `s.p${n}`,
  name: `Point ${n}`,
  sourceId: "s",
  sourceName: "S",
  containerId: "s/",
  containerRawId: "",
  containerTitle: "",
  raw: String(n),
  type: "text",
  num: null,
  unit: "",
  kind: "",
});
const rows: TableRow[] = [
  { kind: "group", id: "s/", title: "S", sub: "", pushed: false, collapsed: false, count: 3 } as TableRow,
  ...[1, 2, 3].map((n) => ({ kind: "point" as const, point: point(n) })),
];

describe("PointTable keyboard", () => {
  it("is one Tab stop, with arrows moving inside it", () => {
    render(
      <>
        <button>before</button>
        <PointTable
          rows={rows}
          values={{}}
          recorder={new HistoryRecorder()}
          usage={{ byKey: new Map(), byZone: new Map() }}
          selectedKey={null}
          onSelect={() => {}}
          onToggleGroup={() => {}}
          onVisible={() => {}}
          target={null}
          onToggleBind={() => {}}
          screens={new Map()}
          alerts={new Map()}
          apiBase=""
          showUsedIn={false}
          live={false}
        />
        <button>after</button>
      </>
    );
    // What Tab can land on, in DOM order: the page's buttons and exactly one row.
    const stops = () =>
      [...document.querySelectorAll<HTMLElement>("button, [data-row]")]
        .filter((el) => el.getAttribute("tabindex") !== "-1" && !el.closest("[aria-hidden]"))
        .map((el) => el.getAttribute("aria-label") ?? el.textContent);
    expect(stops()).toEqual(["before", "S, 3 points", "after"]);

    const group = screen.getByRole("button", { name: "S, 3 points" });
    group.focus();
    fireEvent.keyDown(group, { key: "ArrowDown" });
    const one = screen.getByRole("button", { name: "Point 1, 1" });
    expect(document.activeElement).toBe(one);
    fireEvent.keyDown(one, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Point 2, 2" }));
    // Focus left the list: the one stop is the last row, so Shift+Tab from "after" lands on it.
    screen.getByRole("button", { name: "after" }).focus();
    expect(stops()).toEqual(["before", "Point 2, 2", "after"]);

    fireEvent.keyDown(screen.getByRole("button", { name: "Point 2, 2" }), { key: "End" });
    expect(stops()).toEqual(["before", "Point 3, 3", "after"]);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Point 3, 3" }));
  });
});
