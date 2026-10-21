import { Eye, LayoutDashboard, Monitor, Pencil } from "lucide-react";
import { useElementSize } from "@/hooks/use-element-size";
import type { DashboardConfig, MonitorProfile, ProfilePage as Page } from "@/lib/layout";
import { InheritChip } from "./inherit-chip";
import { zoneName } from "./inspector/zone-meta";
import { pageIcon } from "./page-icons";
import { ProfilePage } from "./profile-page";
import type { ThemeAt } from "./theme-cards";
import { exceptionZones, previewProfile, type ThemeException } from "./theme-exceptions";
import { moduleIcon } from "./zone-icons";

const BUTTON =
  "h-[26px] shrink-0 rounded-md border border-ui-strong px-2.5 text-[11.5px] text-ui-1 transition-colors hover:bg-ui-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ui-accent";

interface ThemePreviewProps {
  config: DashboardConfig;
  at: ThemeAt;
  profile: MonitorProfile;
  page: Page;
  exceptions: readonly ThemeException[];
}

/**
 * "Live preview · ‹screen› / ‹page›" (SPEC §7.3): the real page drawn at the scope's resolved theme (`previewProfile`),
 * scaled to fit, with the accent edit badge on each widget that doesn't follow it.
 */
export function ThemePreview({ config, at, profile, page, exceptions }: ThemePreviewProps) {
  const { ref, w } = useElementSize();
  const scale = profile.width > 0 ? w / profile.width : 0;
  const badged = exceptionZones(exceptions, page.id);
  return (
    <section aria-label="Live preview" className="flex w-full max-w-[900px] flex-col gap-2">
      <div className="flex items-center gap-2 text-[12px] text-[#8a8a94]">
        <Eye className="h-[15px] w-[15px]" strokeWidth={1.75} />
        Live preview · {profile.name} / {page.name}
      </div>
      <div
        ref={ref}
        className="relative w-full overflow-hidden rounded-md bg-[#070709] shadow-[0_0_0_1px_#1f1f24]"
        style={{ height: profile.height * scale }}
      >
        {scale > 0 && (
          <div className="pointer-events-none absolute left-0 top-0 origin-top-left" style={{ scale: String(scale) }} inert>
            <ProfilePage
              profile={previewProfile(profile, at)}
              dashboard={config}
              pageId={page.id}
              badge={(p) =>
                badged.has(p.id) && (
                  <span
                    title="Doesn't follow this theme"
                    className="absolute right-1.5 top-1.5 z-20 flex h-4 w-4 origin-top-right items-center justify-center rounded-full bg-ui-accent text-ui-inverse-fg"
                    style={{ scale: String(1 / scale) }}
                  >
                    <Pencil className="h-[11px] w-[11px]" strokeWidth={2.25} />
                  </span>
                )
              }
            />
          </div>
        )}
      </div>
    </section>
  );
}

/** What an exception's row says it does: "Colors customised", "Colors set for this screen". */
const whatOf = (ex: ThemeException): string => `${ex.card.title} ${ex.kind === "screen" ? "set for this screen" : "customised"}`;

/** Who an exception is, and what kind of thing. */
function whoOf(ex: ThemeException): { who: string; kind: string; icon: typeof Monitor } {
  if (ex.kind === "screen") return { who: ex.profile.name, kind: "Screen", icon: Monitor };
  if (ex.kind === "page") return { who: ex.page!.name, kind: "Page", icon: pageIcon(ex.page!.icon) ?? LayoutDashboard };
  return { who: zoneName(ex.zone!), kind: `Widget on ${ex.page!.name}`, icon: moduleIcon(ex.zone!.module) };
}

interface ThemeExceptionsProps {
  /** The scope's name in the header ("All screens", the screen's, the page's). */
  scopeName: string;
  exceptions: readonly ThemeException[];
  onFollow: (ex: ThemeException) => void;
  onFollowAll: () => void;
}

/**
 * Exceptions (SPEC §7.3): everything below the scope that doesn't follow it, with Make it follow per row (exactly
 * that override) and Make all follow. A locked chip marks an override the screen's lock ignores (it is kept).
 */
export function ThemeExceptions({ scopeName, exceptions, onFollow, onFollowAll }: ThemeExceptionsProps) {
  const n = exceptions.length;
  return (
    <section aria-label="Exceptions" className="flex w-full max-w-[900px] flex-col rounded-[10px] border border-ui-default bg-ui-chrome">
      <div className="flex items-center gap-2.5 border-b border-ui-subtle px-3.5 py-3">
        <span className="text-[12.5px] font-semibold text-ui-1">Exceptions</span>
        <span className="min-w-0 flex-1 truncate text-[11.5px] text-[#8a8a94]">
          {n > 0 ? `${n} ${n === 1 ? "thing" : "things"} below ${scopeName} ${n === 1 ? "doesn't" : "don't"} follow it` : ""}
        </span>
        {n > 0 && (
          <button type="button" className={BUTTON} onClick={onFollowAll}>
            Make all follow
          </button>
        )}
      </div>
      {exceptions.map((ex) => {
        const { who, kind, icon: Icon } = whoOf(ex);
        return (
          <div key={ex.key} data-exception={ex.key} className="flex items-center gap-2.5 border-b border-[#18181c] px-3.5 py-[9px] last:border-b-0">
            <Icon className="h-4 w-4 shrink-0 text-[#8a8a94]" strokeWidth={1.75} />
            <div className="flex min-w-0 flex-1 flex-col gap-px">
              <span className="truncate text-[12.5px] text-ui-1">
                {who} <span className="text-[#7c7c86]">· {kind}</span>
              </span>
              <span className="truncate text-[11px] text-[#8a8a94]">{whatOf(ex)}</span>
            </div>
            {ex.ignored && <InheritChip state="locked" from="screen" fromName={ex.profile.name} />}
            <InheritChip state="custom" from={ex.kind === "widget" ? "page" : ex.kind === "page" ? "screen" : "all"} onReset={() => onFollow(ex)} />
            <button type="button" className={BUTTON} onClick={() => onFollow(ex)}>
              Make it follow
            </button>
          </div>
        );
      })}
      {n === 0 && <p className="px-3.5 py-3.5 text-[12px] text-[#8a8a94]">Everything below this level follows it.</p>}
    </section>
  );
}
