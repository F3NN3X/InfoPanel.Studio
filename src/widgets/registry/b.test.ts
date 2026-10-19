import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SensorMap } from "@/modules/types";
import snapshot from "../__fixtures__/snapshot.json";
import { toFlat } from "../data-adapter";
import type { WidgetMeta } from "../core/types";
import * as DriveSpace from "../DriveSpace";
import * as StorageHealth from "../StorageHealth";
import * as DiskIO from "../DiskIO";
import * as NetworkThroughput from "../NetworkThroughput";
import * as NetworkAdapters from "../NetworkAdapters";
import * as Clock from "../Clock";
import * as Calendar from "../Calendar";
import * as Timer from "../Timer";
import * as CodingAgents from "../CodingAgents";
import * as Weather from "../Weather";
import * as Forecast from "../Forecast";
import * as SensorValue from "../SensorValue";
import * as SensorGroup from "../SensorGroup";
import * as CustomGauge from "../CustomGauge";
import { GROUP_B } from "./b";

type Template = { meta: WidgetMeta; default: (p: never) => unknown };
const TEMPLATES = [DriveSpace, StorageHealth, DiskIO, NetworkThroughput, NetworkAdapters, Clock, Timer, CodingAgents, Calendar, Weather, Forecast, SensorValue, SensorGroup, CustomGauge] as unknown as Template[];

const data = toFlat(snapshot.sensors as unknown as SensorMap);
// Widgets with no live value at size md, and why.
const NO_LIVE_VALUE: Record<string, string> = {
  SensorValue: "no sensor is bound by default, so it shows the unbound state",
};
const sizes = ["xs", "sm", "md", "lg"] as const;
const variants = ["default", "studio"] as const;
const skins = ["default", "instrument", "tui"] as const;

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

    it("renders every size x variant x skin without throwing", () => {
      for (const size of sizes)
        for (const variant of variants)
          for (const skin of skins) expect(render(data, size, variant, skin).length).toBeGreaterThan(0);
    });

    it("renders the empty state", () => {
      expect(render({}, "md", "default", "default").length).toBeGreaterThan(0);
    });

    if (NO_LIVE_VALUE[id]) it.skip(`shows a live value (skipped: ${NO_LIVE_VALUE[id]})`, () => {});
    else
      it("shows a live value from the snapshot at md", () => {
        expect(render(data, "md", "default", "default")).toMatch(/\d/);
      });
  });
});
