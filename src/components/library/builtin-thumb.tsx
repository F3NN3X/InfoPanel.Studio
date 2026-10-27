/**
 * The thumbnails of the built-ins that draw with the studio's own pieces: a skin as Theme › Start from draws it
 * (a live widget in that skin), a screen template as the New screen gallery draws it (its zones on its
 * background). Loaded on demand by `AssetThumb`, so the cards that don't need them don't pull them in.
 */
import type { LibraryItem } from "@/lib/library";
import type { SkinData } from "@/lib/my-library/config-items";
import type { ScreenTemplate } from "@/lib/screen-templates/kit";
import { SkinSwatch } from "@/components/studio/theme-start-from";
import { ScreenTemplateThumb } from "@/components/templates/screen-template-gallery";

export default function BuiltinThumb({ item }: { item: LibraryItem }) {
  if (item.kind === "skin") return <SkinSwatch skin={(item.data as SkinData).name} />;
  const t = item.data as ScreenTemplate;
  return <ScreenTemplateThumb template={t} variant={t.variants?.[0]?.id ?? ""} width={t.size.width} height={t.size.height} />;
}
