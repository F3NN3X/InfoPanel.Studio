import { useEffect, useState } from "react";
import { useSensorCatalog } from "@/lib/catalog";
import { deviceOptions } from "@/lib/device-options";
import { driveIconsOfSetting, normalizeDriveIcons, type IconSource } from "@/lib/effects/icon";
import { cn } from "@/lib/utils";
import type { ModuleSetting, ModuleSettingValue } from "@/modules/types";
import { MediaField } from "./media-field";
import { FIELD, StackRow, type RowLabelProps } from "./setting-rows";

/** The asset id ("<sha256>.<ext>") a stored asset URL names. */
const assetIdOf = (url: string): string | undefined => url.match(/\/api\/assets\/([0-9a-f]{64}\.[a-z0-9]{1,5})$/)?.[1];

/**
 * Your own icon for each drive (stored as a JSON object by drive letter): an image from My library or an upload,
 * or a lucide icon by name. A drive with none keeps the widget's own.
 */
export function DriveIconsField({ def, value, onChange, ...label }: RowLabelProps & { def: ModuleSetting; value: string; onChange: (v: ModuleSettingValue) => void }) {
  const { sensors } = useSensorCatalog();
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    let live = true;
    // The generated set, not icons.ts: that module is shared with the kiosk's canvas zone, and sharing it adds a chunk there.
    void import("@/lib/infopanel/elements/icons.generated").then((m) => live && setNames(Object.keys(m.ELEMENT_ICON_MARKUP).sort()));
    return () => {
      live = false;
    };
  }, []);
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
              <input
                aria-label={`${d.label} icon from the set`}
                list={`drive-icon-names-${d.value}`}
                placeholder="or an icon name, e.g. hard-drive"
                defaultValue={own && "lucide" in own ? own.lucide : ""}
                onBlur={(e) => {
                  const name = e.target.value.trim().toLowerCase();
                  if (name === "" && own && "lucide" in own) set(d.value, null);
                  else if (name !== "" && names.includes(name)) set(d.value, { lucide: name });
                }}
                className={cn(FIELD, "w-full font-ui")}
              />
              <datalist id={`drive-icon-names-${d.value}`}>
                {names.map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>
          );
        })}
      </div>
    </StackRow>
  );
}
