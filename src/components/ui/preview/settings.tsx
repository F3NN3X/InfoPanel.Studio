import { useState } from "react";
import { SelectField } from "@/components/ui/field";
import { InheritDot, SettingCard, SettingRow } from "@/components/ui/setting-row";
import { Toggle } from "@/components/ui/toggle";

const CHANNELS = [
  { value: "stable", label: "Stable" },
  { value: "beta", label: "Beta" },
];

/** The settings pages' row and card, and the select field: hint, rejection, disabled and a narrow card. */
export function SettingsSection() {
  const [on, setOn] = useState(true);
  const [channel, setChannel] = useState("stable");
  return (
    <section className="space-y-2 border-b border-ui-subtle py-4">
      <h2 className="text-body font-medium text-ui-1">Settings rows and cards</h2>
      <div className="flex flex-wrap items-start gap-6">
        <div className="w-120 max-w-full space-y-2">
          <p className="m-0 text-caption text-ui-hint">A card of rows: a hint, a select, a disabled switch, a rejection.</p>
          <SettingCard>
            <SettingRow card label="Check for updates" hint="Once a day, and asks before installing.">
              <Toggle checked={on} onChange={setOn} label="Check for updates" />
            </SettingRow>
            <SettingRow card label="Update channel" hint="Beta gets changes a week early.">
              <SelectField aria-label="Update channel" options={CHANNELS} value={channel} onChange={(e) => setChannel(e.target.value)} />
            </SettingRow>
            <SettingRow card label="Start with Windows" hint="Turned off by your administrator.">
              <Toggle checked={false} onChange={() => {}} label="Start with Windows" disabled />
            </SettingRow>
            <SettingRow card label="Port" hint="Already in use by another program." hintAlert hintClass="text-ui-danger">
              <SelectField aria-label="Port" options={CHANNELS} value="stable" onChange={() => {}} aria-invalid />
            </SettingRow>
          </SettingCard>
        </div>
        <div className="w-60 space-y-2">
          <p className="m-0 text-caption text-ui-hint">A narrow card: the control drops under the label.</p>
          <SettingCard>
            <SettingRow card label="Update channel" hint="Beta gets changes a week early.">
              <SelectField aria-label="Update channel, narrow" options={CHANNELS} value="beta" onChange={() => {}} />
            </SettingRow>
          </SettingCard>
        </div>
        <div className="w-72 space-y-2">
          <p className="m-0 text-caption text-ui-hint">A studio row, with the inheritance dot.</p>
          <SettingRow label="Wrap" dot={<InheritDot from="Perf heavy" />}>
            <Toggle checked={on} onChange={setOn} label="Wrap" />
          </SettingRow>
          <SettingRow label="A long label that is cut where the row ends" hint="With a hint the label is cut and the hint wraps.">
            <Toggle checked onChange={() => {}} label="Long" />
          </SettingRow>
        </div>
      </div>
    </section>
  );
}
