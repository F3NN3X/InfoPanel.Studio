import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { Toggle } from "@/components/ui/toggle";
import { LOOK_IDS } from "@/looks/ids";
import { type PackTrust, readPackTrust, readScriptSwitch, type ScriptSwitch, setScriptSwitch } from "@/looks/pack-trust";
import { checkImport, describeIssue, filesOfInput, removePack, storePack, type ImportReport } from "@/looks/user-pack-import";
import { listUserPacks } from "@/looks/user-packs";
import { PackTrustNote } from "./pack-trust-badge";

/** What Browse asks of the importer: open a folder or zip picker, or remove a stored pack. */
export interface PackImporterHandle {
  pick: (what: "folder" | "zip") => void;
  remove: (pack: { id: string; name: string }) => Promise<void>;
}

export interface UserPacksProps {
  ref?: Ref<PackImporterHandle>;
  /** A pack was stored or removed: the list is read again. */
  onChange: () => void;
  /** Takes the pack off every level that wears it (Classic is drawn there) and says how many there were. */
  onRemove: (id: string) => number;
}

/**
 * The pack importer (lazy, with the validator and the zip reader): a pack comes in as a folder or a zip, is checked by the
 * validator (errors refuse it, warnings are shown), a pack with CSS by the render check too, and is stored by the server.
 * It draws only what the import says (checking, the report, the notice) and the two hidden pickers; Browse lists the packs.
 * Sharing a pack is off.
 */
/** The server's pack-script switch: every kiosk obeys it. Hidden when the server has none. */
function ScriptSwitchRow() {
  const [state, setState] = useState<ScriptSwitch | undefined>();
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    void readScriptSwitch().then((s) => alive && setState(s));
    return () => void (alive = false);
  }, []);
  if (!state) return null;
  const change = async (on: boolean) => {
    const next = await setScriptSwitch(on);
    if (typeof next === "string") return setError(`Couldn't change it: ${next}`);
    setError("");
    setState(next);
  };
  const note = !state.env ? "Turned off on this server (PACK_SCRIPTS=off)." : state.stale ? "Paused: the list of withdrawn packs is over 30 days old." : "A pack's effect script runs in a sandbox, on every screen that wears it.";
  return (
    <div data-pack-scripts className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-ui-2">
      <Toggle checked={state.on && state.env} disabled={!state.env} label="Pack effect scripts" onChange={(on) => void change(on)} />
      <span className="font-medium text-ui-1">Pack effect scripts</span>
      <span className="text-ui-3">{note}</span>
      {error && (
        <span role="alert" className="text-ui-danger">
          {error}
        </span>
      )}
    </div>
  );
}

export function UserPacks({ ref, onChange, onRemove }: UserPacksProps) {
  const [report, setReport] = useState<(ImportReport & { stored?: boolean; trust?: PackTrust }) | undefined>();
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const folder = useRef<HTMLInputElement>(null);
  const zip = useRef<HTMLInputElement>(null);

  const take = async (list: FileList | null) => {
    if (!list?.length) return;
    setBusy(true);
    setNotice("");
    try {
      const checked = checkImport(await filesOfInput(list));
      const refused = checked.ok ? await storePack(checked) : undefined;
      const trust = checked.ok && !refused && checked.id ? await readPackTrust(checked.id) : undefined;
      setReport({ ...checked, stored: checked.ok && !refused, trust, issues: refused ? [...checked.issues, { rule: "store", severity: "error", file: "", message: refused }] : checked.issues, ok: checked.ok && !refused });
      if (checked.ok && !refused) onChange();
    } catch (e) {
      setReport({ ok: false, issues: [{ rule: "read", severity: "error", file: "", message: `The pack could not be read: ${(e as Error).message}` }] });
    } finally {
      setBusy(false);
      if (folder.current) folder.current.value = "";
      if (zip.current) zip.current.value = "";
    }
  };

  const remove = async (p: { id: string; name: string }) => {
    // the folder goes first: a places-that-wore-it edit is made only once the pack is really gone
    if (!(await removePack(p.id))) return setNotice(`Couldn't remove ${p.name}. It is still stored, and nothing that wears it was changed.`);
    // a built-in that shadows the pack keeps its id: the levels that name it wear the built-in
    const worn = LOOK_IDS.includes(p.id) ? 0 : onRemove(p.id);
    setNotice(worn > 0 ? `Removed ${p.name}. ${worn === 1 ? "A place that wore it now draws" : `${worn} places that wore it now draw`} Classic.` : `Removed ${p.name}.`);
    setReport(undefined);
    await listUserPacks();
    onChange();
  };

  useImperativeHandle(ref, () => ({ pick: (what) => (what === "folder" ? folder : zip).current?.click(), remove }));

  const errors = report?.issues.filter((i) => i.severity === "error") ?? [];
  const warnings = report?.issues.filter((i) => i.severity === "warn") ?? [];
  return (
    <section aria-label="Import a pack" data-user-packs className="flex flex-col gap-2">
      <input ref={folder} type="file" multiple hidden disabled={busy} data-pack-folder aria-label="Pack folder" {...{ webkitdirectory: "" }} onChange={(e) => void take(e.currentTarget.files)} />
      <input ref={zip} type="file" accept=".zip,application/zip" hidden disabled={busy} data-pack-zip aria-label="Pack zip" onChange={(e) => void take(e.currentTarget.files)} />
      <ScriptSwitchRow />
      {busy && (
        <p role="status" data-pack-checking className="text-caption text-ui-1">
          Checking the pack. One with a style sheet is tried on every widget first, which can take a minute.
        </p>
      )}
      {report && (
        <div role={errors.length > 0 ? "alert" : "status"} data-pack-report className="flex flex-col gap-1 rounded-ui-lg border border-ui-subtle bg-ui-panel px-3 py-2 text-caption text-ui-1">
          <span className="font-medium">{errors.length > 0 ? "This pack can't be imported." : report.stored ? `Imported ${report.name ?? report.id}.` : "Checked."}</span>
          {report.trust && <PackTrustNote trust={report.trust} />}
          {errors.map((i, k) => (
            <span key={`e${k}`} data-pack-issue="error" className="text-ui-3">
              {describeIssue(i)}
            </span>
          ))}
          {warnings.map((i, k) => (
            <span key={`w${k}`} data-pack-issue="warn" className="text-ui-3">
              Note: {describeIssue(i)}
            </span>
          ))}
        </div>
      )}
      {notice && (
        <p role="status" className="text-caption text-ui-1">
          {notice}
        </p>
      )}
    </section>
  );
}

export default UserPacks;
