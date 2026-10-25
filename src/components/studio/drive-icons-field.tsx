import { lazy, Suspense, useState } from "react";
import { useSensorCatalog } from "@/lib/catalog";
import { deviceOptions } from "@/lib/device-options";
import { driveIconsOfSetting, normalizeDriveIcons, type IconSource } from "@/lib/effects/icon";
import type { ModuleSetting, ModuleSettingValue } from "@/modules/types";
import { MediaField } from "./media-field";
import { StackRow, type RowLabelProps } from "./setting-rows";

/** The asset id ("<sha256>.<ext>") a stored asset URL names. */
/** The searchable icon list, loaded when a drive's Icon set is opened. */
const IconPicker = lazy(() => import("@/components/infopanel/edit/icon-picker").then((m) => ({ default: m.IconPicker })));

const assetIdOf = (url: string): string | undefined => url.match(/\/api\/assets\/([0-9a-f]{64}\.[a-z0-9]{1,5})$/)?.[1];

/**
 * Your own icon for each drive (stored as a JSON object by drive letter): an image from My library or an upload,
 * or a lucide icon by name. A drive with none keeps the widget's own.
 */
export function DriveIconsField({ def, value, onChange, ...label }: RowLabelProps & { def: ModuleSetting; value: string; onChange: (v: ModuleSettingValue) => void }) {
  const { sensors } = useSensorCatalog();
  const [listFor, setListFor] = useState<string | null>(null);
  const icons = driveIconsOfSetting(value) ?? {};
  const drives = deviceOptions("drive", sensors).filter((o) => o.value !== "");
  const set = (id: string, source: IconSource | null) => {
    const { [id]: _old, ...rest } = icons;
    const next = normalizeDriveIcons(source ? { ...rest, [id]: source } : rest);
    onChange(next ? JSON.stringify(next) : "");
  };
  return (
    <StackRow {...label}>
      <div role="group" aria-label={def.label} className="flex flex-col gap-2">
        {drives.length === 0 && <span className="text-[11px] text-ui-4">No drives found yet</span>}
        {drives.map((d) => {
          const own = Object.hasOwn(icons, d.value) ? icons[d.value] : undefined;
          const id = own && "asset" in own ? own.asset : undefined;
          return (
            <div key={d.value} className="space-y-1">
              <span className="text-[12px] text-ui-2">{d.label}</span>
              <MediaField
                label={`${d.label} image`}
                kind="image"
                value={id ? `/api/assets/${id}` : undefined}
                onChange={(src) => {
                  const asset = src ? assetIdOf(src) : undefined;
                  set(d.value, asset ? { asset } : null);
                }}
                preview="thumb"
              />
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  aria-label={`${d.label}: pick an icon from the set`}
                  aria-expanded={listFor === d.value}
                  onClick={() => setListFor(listFor === d.value ? null : d.value)}
                  className="flex h-7 items-center rounded-[7px] border border-ui-default bg-ui-raised px-2.5 text-[12px] text-ui-1 hover:border-ui-strong"
                >
                  Icon set{own && "lucide" in own ? `: ${own.lucide}` : ""}
                </button>
                {own && (
                  <button type="button" aria-label={`${d.label}: back to the default`} onClick={() => set(d.value, null)} className="flex h-7 items-center rounded-[7px] border border-ui-default bg-ui-raised px-2.5 text-[12px] text-ui-3 hover:border-ui-strong">
                    Reset
                  </button>
                )}
              </div>
              {listFor === d.value && (
                <Suspense fallback={<p className="text-[11.5px] text-ui-4">Loading icons…</p>}>
                  <IconPicker
                    value={own && "lucide" in own ? own.lucide : ""}
                    onPick={(name) => {
                      set(d.value, { lucide: name });
                      setListFor(null);
                    }}
                  />
                </Suspense>
              )}
            </div>
          );
        })}
      </div>
    </StackRow>
  );
}
