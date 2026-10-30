import { obsAct } from "@/lib/obs-control";
import type { ModuleSettings } from "@/modules/types";
import { Widget, shell, Icon, STATE, type ShellProps } from "./kit";
import { useExtras } from "./time-hooks";
import { meta } from "./meta/ObsButton";

export { meta };

export interface ObsButtonProps extends ShellProps {
  look?: ModuleSettings;
  /** `scene` switches to a scene, `mic` flips the mic's mute, `replay` saves the replay buffer. */
  action?: "scene" | "mic" | "replay";
  /** The scene's id (`scene`). */
  scene?: string;
  /** Replaces the name under the symbol. */
  name?: string;
  /** Replaces the symbol (a Material Symbols name). */
  symbol?: string;
}

export default function ObsButton(p: ObsButtonProps) {
  const obs = useExtras().obs;
  const action = p.action ?? "scene";
  const scene = action === "scene" ? obs.scenes.find((s) => s.id === p.scene) : undefined;
  const muted = action === "mic" && obs.mic?.muted === true;
  const active = action === "scene" ? !!scene && scene.id === obs.currentScene : muted;
  const ready = obs.connected && (action === "scene" ? !!scene : action === "mic" ? obs.mic !== null : obs.replay !== null);
  const name = p.name || (action === "scene" ? (scene?.name ?? "Scene") : action === "mic" ? (muted ? "Mic off" : "Mic") : "Replay");
  const icon = p.symbol || (action === "scene" ? scene?.icon || "movie" : action === "mic" ? (muted ? "mic_off" : "mic") : "replay");
  const tint = action === "mic" ? STATE.crit : "var(--accent)";
  const press = () => {
    if (action === "scene" && scene) void obsAct({ op: "scene", id: scene.id });
    else if (action === "mic") void obsAct({ op: "mic" });
    else if (action === "replay") void obsAct({ op: "replay" });
  };
  return (
    <Widget {...shell(p)} title={p.title ?? name} icon="videocam" showHeader={p.showHeader ?? false} bleed>
      {({ w, h }) => {
        const small = Math.min(w, h) < 90;
        const corner = p.radius === undefined ? "calc(var(--radius, 1rem) * 0.62)" : `${p.radius * 0.62}px`;
        return (
          <button
            type="button"
            disabled={!ready}
            onClick={press}
            aria-pressed={active}
            aria-label={name}
            className="flex h-full w-full flex-col items-center justify-center gap-1 transition active:scale-[0.97] disabled:opacity-50"
            style={{
              borderRadius: corner,
              color: muted ? tint : "var(--w-fg)",
              background: muted ? `color-mix(in oklab, ${tint} 16%, transparent)` : "transparent",
              boxShadow: action === "scene" && active ? "inset 0 0 0 2px rgba(255,255,255,.92)" : undefined,
            }}
          >
            <Icon name={icon} className={small ? "text-[26px]" : "text-[34px]"} />
            <span className="max-w-full truncate px-1 text-[12px] font-semibold leading-tight">{name}</span>
            {!small && ready && action === "scene" && active && <span className="text-[11px] text-[color:var(--w-muted)]">On air</span>}
          </button>
        );
      }}
    </Widget>
  );
}
