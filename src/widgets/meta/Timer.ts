// Timer's catalog entry, apart from its component so the registry can list it without loading the widget.
import type { WidgetMeta } from "../core/types";

export const meta: WidgetMeta = {
  id: "Timer",
  name: "Timer",
  category: "Info",
  icon: "timer",
  prefixes: [],
  defaultSize: [2, 2],
  minSize: [1, 1],
  blurb: "Countdown, presets and pomodoro",
  tags: "countdown pomodoro stopwatch",
  description: "A countdown with preset buttons and a pomodoro, for screens you can touch. Sends to the Dynamic Island.",
};
