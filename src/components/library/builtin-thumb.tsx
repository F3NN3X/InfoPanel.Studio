/**
 * The thumbnails of the built-ins that draw with the studio's own pieces: a skin as Theme › Start from draws it
 * (a live widget in that skin), a screen template as the New screen gallery draws it (its zones on its
 * background), an InfoPanel template as the New profile gallery draws it. Loaded on demand by `AssetThumb`, so the cards that don't need them don't pull them in.
 */
import type { LibraryItem } from "@/lib/library";
import type { SkinData } from "@/lib/my-library/config-items";
import type { Template } from "@/lib/infopanel/templates/kit";
import type { ScreenTemplate } from "@/lib/screen-templates/kit";
import { SkinSwatch } from "@/components/studio/theme-start-from";
import { TemplateThumb } from "@/components/infopanel/template-gallery";
import { ScreenTemplateThumb } from "@/components/templates/screen-template-gallery";

export default function BuiltinThumb({ item }: { item: LibraryItem }) {
  if (item.kind === "skin") return <SkinSwatch skin={(item.data as SkinData).name} />;
  if (item.kind === "ptemplate") {
    const p = item.data as Template;
    const size = p.size ?? { width: 800, height: 480 };
    return <TemplateThumb template={p} variant={p.variants[0]?.id ?? ""} width={size.width} height={size.height} />;
  }
  const t = item.data as ScreenTemplate;
  return <ScreenTemplateThumb template={t} variant={t.variants?.[0]?.id ?? ""} width={t.size.width} height={t.size.height} />;
}
