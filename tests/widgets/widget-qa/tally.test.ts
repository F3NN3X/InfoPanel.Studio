import { describe, expect, it } from "vitest";
import { forgetFrame, tally, tallyFrame, sectionTally } from "@/widgets/widget-qa/tally";

describe("widget-qa summary tally", () => {
  it("adds up what the checked frames found, and drops a frame that leaves the page", () => {
    tallyFrame("CpuMonitor--2x1", 2, 1);
    tallyFrame("CpuMonitor--4x2", 0, 0);
    tallyFrame("Clock--1x1", 1, 3);
    expect(tally()).toEqual({ checked: 3, issues: 3, flags: 4, withIssues: 2, withFlags: 2 });
    // a frame that settles again replaces its own counts rather than adding to them
    tallyFrame("CpuMonitor--2x1", 0, 1);
    expect(tally()).toEqual({ checked: 3, issues: 1, flags: 4, withIssues: 1, withFlags: 2 });
    // a widget's own totals, for its section header: its frames only, not a widget whose id starts the same
    tallyFrame("CpuMonitorX--1x1", 5, 5);
    expect(sectionTally("CpuMonitor")).toEqual({ checked: 2, issues: 0, flags: 1, withIssues: 0, withFlags: 1 });
    forgetFrame("CpuMonitorX--1x1");
    forgetFrame("Clock--1x1");
    forgetFrame("Clock--1x1");
    expect(tally()).toEqual({ checked: 2, issues: 0, flags: 1, withIssues: 0, withFlags: 1 });
    forgetFrame("CpuMonitor--2x1");
    forgetFrame("CpuMonitor--4x2");
    expect(tally().checked).toBe(0);
  });
});
