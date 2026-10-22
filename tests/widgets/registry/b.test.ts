import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SensorMap } from "@/modules/types";
import snapshot from "@/widgets/__fixtures__/snapshot.json";
import { toFlat } from "@/widgets/data-adapter";
import type { WidgetMeta } from "@/widgets/core/types";
import * as DriveSpace from "@/widgets/DriveSpace";
import * as StorageHealth from "@/widgets/StorageHealth";
import * as DiskIO from "@/widgets/DiskIO";
import * as NetworkThroughput from "@/widgets/NetworkThroughput";
import * as NetworkAdapters from "@/widgets/NetworkAdapters";
import * as Clock from "@/widgets/Clock";
import * as Calendar from "@/widgets/Calendar";
import * as Timer from "@/widgets/Timer";
import * as Countdown from "@/widgets/Countdown";
import * as StatusBar from "@/widgets/StatusBar";
import * as CodingAgents from "@/widgets/CodingAgents";
import * as Weather from "@/widgets/Weather";
import * as Forecast from "@/widgets/Forecast";
import * as SensorValue from "@/widgets/SensorValue";
import * as SensorGroup from "@/widgets/SensorGroup";
import * as CustomGauge from "@/widgets/CustomGauge";
import { GROUP_B } from "@/widgets/registry/b";

type Template = { meta: WidgetMeta; default: (p: never) => unknown };
const TEMPLATES = [DriveSpace, StorageHealth, DiskIO, NetworkThroughput, NetworkAdapters, Clock, Timer, Countdown, StatusBar, CodingAgents, Calendar, Weather, Forecast, SensorValue, SensorGroup, CustomGauge] as unknown as Template[];

const data = toFlat(snapshot.sensors as unknown as SensorMap);
// Widgets with no live value at size md, and why.
const NO_LIVE_VALUE: Record<string, string> = {
  SensorValue: "no sensor is bound by default, so it shows the unbound state",
};

describe("registry group B", () => {
  it("has one module per template, ids and minimum sizes from meta", () => {
    expect(GROUP_B.map((m) => m.id)).toEqual(TEMPLATES.map((t) => t.meta.id));
    for (const [i, m] of GROUP_B.entries()) {
      const { meta } = TEMPLATES[i];
      expect([m.minCols, m.minRows]).toEqual(meta.minSize);
    }
  });

  describe.each(TEMPLATES.map((t) => [t.meta.id, t] as const))("%s", (id, t) => {
    const C = t.default as unknown as ComponentType<Record<string, unknown>>;
    const render = (d: object, size: string, variant: string, skin: string) => renderToString(createElement(C, { data: d, size, variant, skin }));

    it("renders a live value, the extremes and the empty state without throwing", () => {
      if (!NO_LIVE_VALUE[id]) expect(render(data, "md", "default", "default")).toMatch(/\d/);
      expect(render(data, "xs", "studio", "tui").length).toBeGreaterThan(0);
      expect(render({}, "md", "default", "default").length).toBeGreaterThan(0);
    });
  });
});
