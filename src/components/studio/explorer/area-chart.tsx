import { useId } from "react";
import { ChartSummary, chartSummary } from "@/components/ui/chart-summary";
import { sparkPoints } from "@/components/ui/sensor-row";

interface AreaChartProps {
  name: string;
  samples: readonly number[];
  unit?: string;
}

const W = 288;
const H = 76;

/** The detail pane's last-minute chart: the same line as the row's sparkline, in the accent, over a faint fill. */
export function AreaChart({ name, samples, unit }: AreaChartProps) {
  const summaryId = useId();
  const line = sparkPoints(samples, W, H);
  return (
    <>
      <svg role="img" aria-label={`${name}, last 60 s`} aria-describedby={summaryId} viewBox={`0 0 ${W} ${H + 4}`} preserveAspectRatio="none" className="h-20 w-full overflow-visible">
        {line && (
          <g transform="translate(0 2)">
            <polygon points={`0,${H} ${line} ${W},${H}`} className="fill-ui-accent/12" />
            <polyline points={line} fill="none" strokeWidth={1.5} vectorEffect="non-scaling-stroke" className="stroke-ui-accent" />
          </g>
        )}
      </svg>
      <ChartSummary id={summaryId} text={chartSummary({ name, span: "last 60 s", samples, unit })} />
    </>
  );
}
