import { useEffect, useState } from "react";
import { Bug, Check, Copy, FolderOpen, History } from "lucide-react";
import { StudioLogo } from "@/components/studio/studio-logo";
import { cn } from "@/lib/utils";
import { errorText, ipc } from "../ipc";
import { shortDate } from "../model/changelog";
import { useFound, useStore } from "../store";
import type { AppInfo } from "../types";
import { Button, Group, HeroCard, useFlag } from "../ui";

const ISSUES_URL = "https://github.com/F3NN3X/InfoPanel.Studio/issues/new";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The System rows: Version, Channel, Node, WebView2 and Windows. */
export function systemRows(info: AppInfo): [string, string][] {
  const rows: [string, string | null][] = [
    ["Version", `${info.version} (built ${info.buildDate})`],
    ["Channel", capitalize(info.channel)],
    ["Node", info.node],
    ["WebView2", info.webview],
    ["Windows", info.os],
  ];
  return rows.filter((r): r is [string, string] => r[1] !== null);
}

/** The rows as `Key: Value` lines, for Copy system info and the issue template. */
export function systemText(info: AppInfo): string {
  return systemRows(info)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

export function AboutSection() {
  const { go, toast } = useStore();
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [copied, flash] = useFlag();
  const hero = useFound("about-hero");
  const files = useFound("about-files");

  useEffect(() => {
    let alive = true;
    void ipc.appInfo().then((i) => alive && setInfo(i)).catch((e) => toast(errorText(e), true));
    return () => {
      alive = false;
    };
  }, [toast]);

  if (!info) return null;
  const fail = (e: unknown) => toast(errorText(e), true);
  const copy = () => navigator.clipboard.writeText(systemText(info)).then(flash, () => toast("Could not copy.", true));
  const paths: [string, string][] = [
    ["Settings file", info.paths.settingsFile],
    ["Dashboards and themes", info.paths.dataDir],
    ["Logs", info.paths.logsDir],
  ];

  return (
    <>
      <HeroCard className="flex flex-wrap items-center gap-[18px] p-6">
        <div ref={hero.ref} className={cn("h-[60px] w-[60px] rounded-2xl", hero.className)}>
          <StudioLogo className="h-full w-full" />
        </div>
        <div className="flex min-w-[140px] flex-1 flex-col gap-1">
          <span className="text-xl font-semibold tracking-[-0.01em]">InfoPanel Studio</span>
          <span className="text-[13px] text-s-muted">
            Version {info.version} · {capitalize(info.channel)} · built {shortDate(info.buildDate)}
          </span>
        </div>
        <Button size="md" onClick={() => void copy()}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy system info"}
        </Button>
      </HeroCard>

      <Group title="System">
        <div className="divide-y divide-s-divider overflow-hidden rounded-xl border border-s-card-line bg-s-card">
          {systemRows(info).map(([k, v]) => (
            <div key={k} className="flex gap-4 px-[18px] py-[11px] text-[13px]">
              <span className="w-[140px] shrink-0 text-s-muted">{k}</span>
              <span className="min-w-0 break-words font-mono text-[12.5px] text-[#d6d6db]">{v}</span>
            </div>
          ))}
        </div>
      </Group>

      <Group title="Files">
        <div ref={files.ref} className={cn("divide-y divide-s-divider overflow-hidden rounded-xl border border-s-card-line bg-s-card", files.className)}>
          {paths.map(([label, path]) => (
            <div key={label} className="flex flex-wrap items-center gap-3.5 px-[18px] py-3">
              <div className="flex min-w-[140px] flex-1 flex-col gap-[3px]">
                <span className="text-[13px] font-medium">{label}</span>
                <span className="break-all font-mono text-xs text-s-muted">{path}</span>
              </div>
              <Button className="h-[30px] text-xs" onClick={() => void ipc.revealPath(path).catch(fail)}>
                <FolderOpen className="h-[15px] w-[15px]" />
                Show
              </Button>
            </div>
          ))}
        </div>
      </Group>

      <div className="flex flex-wrap gap-2">
        <Button size="md" onClick={() => go("changelog")}>
          <History className="h-4 w-4" />
          Changelog
        </Button>
        <Button size="md" onClick={() => void ipc.openExternal(`${ISSUES_URL}?body=${encodeURIComponent(systemText(info))}`).catch(fail)}>
          <Bug className="h-4 w-4" />
          Report an issue
        </Button>
      </div>
    </>
  );
}
