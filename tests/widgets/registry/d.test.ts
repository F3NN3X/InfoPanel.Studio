import { createElement, type ComponentType } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { SensorMap } from "@/modules/types";
import snapshot from "@/widgets/__fixtures__/snapshot.json";
import { toFlat } from "@/widgets/data-adapter";
import type { ShellProps } from "@/widgets/kit";
import Achievements, { meta as achievements } from "@/widgets/Achievements";
import FpsMonitor, { meta as fps } from "@/widgets/FpsMonitor";
import FramePacing, { meta as pacing } from "@/widgets/FramePacing";
import GameSpotlight, { meta as spotlight } from "@/widgets/GameSpotlight";
import OsdStrip, { meta as osd } from "@/widgets/OsdStrip";
import PlaytimeShare, { meta as playtime } from "@/widgets/PlaytimeShare";
import SteamGame, { meta as game } from "@/widgets/SteamGame";
import SteamLibrary, { meta as library } from "@/widgets/SteamLibrary";
import SteamNews, { meta as news } from "@/widgets/SteamNews";
import SteamProfile, { meta as profile } from "@/widgets/SteamProfile";
import SteamFriends, { meta as friends } from "@/widgets/SteamFriends";
import { GROUP_D } from "@/widgets/registry/d";

const WIDGETS: [typeof fps, ComponentType<ShellProps>][] = [
  [fps, FpsMonitor],
  [spotlight, GameSpotlight],
  [osd, OsdStrip],
  [pacing, FramePacing],
  [playtime, PlaytimeShare],
  [profile, SteamProfile],
  [friends, SteamFriends],
  [game, SteamGame],
  [achievements, Achievements],
  [library, SteamLibrary],
  [news, SteamNews],
];
const DATA = toFlat((snapshot as unknown as { sensors: SensorMap }).sensors);

// Every source of this group is in the captured snapshot (RTSS, Steam, libre).
const ABSENT_FROM_SNAPSHOT: string[] = [];

describe("registry group D", () => {
  it("lists the eleven gaming widgets in order", () => {
    expect(GROUP_D.map((m) => m.id)).toEqual(WIDGETS.map(([m]) => m.id));
  });

  WIDGETS.forEach(([meta, Component], i) => {
    describe(meta.id, () => {
      it("mirrors its meta in the module", () => {
        expect(GROUP_D[i]).toMatchObject({ id: meta.id, minCols: meta.minSize[0], minRows: meta.minSize[1], category: "Gaming" });
      });

      it("renders a live value, the extremes and the empty state without throwing", () => {
        if (!ABSENT_FROM_SNAPSHOT.includes(meta.id)) expect(renderToString(createElement(Component, { data: DATA, size: "md" }))).toMatch(/\d/);
        expect(renderToString(createElement(Component, { data: DATA, size: "xs", variant: "studio", skin: "tui" })).length).toBeGreaterThan(0);
        expect(renderToString(createElement(Component, { data: {} })).length).toBeGreaterThan(0);
      });
    });
  });
});
