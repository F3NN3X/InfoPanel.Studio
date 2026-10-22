import { renderToString } from "react-dom/server";
import { fixtureSensors } from "./__fixtures__";
import type { DashboardModule, ModuleSettings, SensorMap } from "@/modules/types";

/** A module's zone as markup, from the widget fixtures unless `sensors` is given (tests). */
export const renderModule = (mod: DashboardModule, settings: ModuleSettings = {}, sensors: SensorMap = fixtureSensors()) =>
  renderToString(mod.render(sensors, settings));
