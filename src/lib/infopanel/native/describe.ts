// Out of components/infopanel/native.tsx so the inspector can say it without loading the native renderer, which the
// kiosk's canvas chunk carries.
import type { NativeItem } from "./convert.ts";

/** What a conversion draws with, for people: the app widget, or the prototype standing in for one. */
export function describeNative(n: NativeItem): string {
  switch (n.custom?.kind) {
    case "vector":
      return "custom gauge widget, drawn live from its spec (studio prototype)";
    case "frames":
      return "image-sequence gauge widget (studio prototype)";
    case "element":
      return `studio ${n.custom.spec.type}, drawn live from its spec (studio prototype)`;
    case "shape":
      return `shape widget with ${n.needs[0] ?? "this shape"} (studio prototype)`;
    case "text":
      return `${n.widget.kind} widget in InfoPanel's font and placement${n.custom.marquee ? ", scrolling" : ""} (studio prototype)`;
    case "graph":
      return `${n.widget.kind} widget drawn as InfoPanel's ${n.custom.graph.type === "HISTOGRAM" ? "histogram" : "line graph"} (studio prototype)`;
    case "image":
      return `image widget, stretched to its box${n.custom.show ? ", shown by value thresholds" : ""} (studio prototype)`;
    default:
      return `${n.widget.kind} widget`;
  }
}
