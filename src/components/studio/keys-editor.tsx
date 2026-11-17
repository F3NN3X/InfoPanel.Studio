import { useState } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, ChevronRight, FolderPlus, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { IconGrid, type IconGridItem } from "@/components/ui/icon-grid";
import { assetIdOf, ASSETS_URL } from "@/lib/assets";
import { MAX_KEYS, type KeySlot } from "@/lib/keys";
import { addKey, levelKeys, moveKey, newKey, removeKey, updateKey, withField, withLevel } from "@/lib/keys-edit";
import type { RailIcon } from "@/lib/pinned";
import type { RailPage } from "@/lib/rail";
import { cn } from "@/lib/utils";
import { MediaField } from "./media-field";
import { PAGE_ICONS, pageIcon } from "./page-icons";
import { SegmentedRow, SelectRow, TextRow } from "./setting-rows";
import { TouchRows } from "./touch-rows";

/*
 * The Keys widget's keys in the inspector (pinned layer P7): the keys of a level in order, with arrows to move them, Add a
 * key and Add a folder; the selected key's name, icon (the icon set, an image, or text), colour and what its tap, hold and
 * double tap run, a command included. A folder's tap opens it; Open folder edits its keys. Each change is one undo step.
 */

const ICONS: IconGridItem[] = Object.entries(PAGE_ICONS).map(([name, Icon]) => ({ id: name, label: name, icon: <Icon /> }));

const COLOURS = [{ value: "", label: "Text colour" }, ...[1, 2, 3, 4, 5, 6].map((n) => ({ value: String(n), label: `Series ${n}` }))];

interface KeysEditorProps {
  keys: readonly KeySlot[] | undefined;
  pages: readonly RailPage[];
  /** `key`: the undo step's key, so typing in one field is one step. */
  onChange: (keys: KeySlot[] | undefined, key?: string) => void;
}

function KeyGlyph({ k }: { k: KeySlot }) {
  const icon = k.icon;
  if (icon?.from === "set") {
    const Cmp = pageIcon(icon.name);
    return Cmp ? <Cmp aria-hidden className="h-4 w-4" /> : null;
  }
  if (icon?.from === "text") return <span className="text-micro font-bold">{icon.text.slice(0, 3)}</span>;
  if (icon?.from === "image") return <img alt="" src={`${ASSETS_URL}/${encodeURIComponent(icon.asset)}`} className="h-4 w-4 object-contain" />;
  return null;
}

export function KeysEditor({ keys = [], pages, onChange }: KeysEditorProps) {
  const [folder, setFolder] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  // "Image" picked: the key keeps its icon until a file is chosen
  const [pendingImage, setPendingImage] = useState(false);
  const open = folder ? keys.find((k) => k.id === folder) : undefined;
  const level = levelKeys(keys, open ? folder : null);
  const key = level.find((k) => k.id === selected);
  const change = (fn: (level: readonly KeySlot[]) => KeySlot[], undoKey?: string) => {
    const next = withLevel(keys, open ? folder : null, fn);
    onChange(next.length ? next : undefined, undoKey);
  };
  const edit = (fn: (k: KeySlot) => KeySlot, field?: string) => key && change((l) => updateKey(l, key.id, fn), field ? `keys:${key.id}:${field}` : undefined);
  const from = pendingImage ? "image" : (key?.icon?.from ?? "set");
  const setIcon = (icon: RailIcon | undefined) => edit((k) => withField(k, "icon", icon));
  return (
    <div className="space-y-2">
      {open && (
        <div className="flex items-center gap-2">
          <Button small variant="ghost" icon={<ArrowLeft />} onClick={() => (setFolder(null), setSelected(open.id))}>
            All keys
          </Button>
          <span className="truncate text-caption text-ui-3">In {open.name || "the folder"}</span>
        </div>
      )}
      {level.length === 0 ? (
        <p className="text-caption text-ui-3">{open ? "This folder has no keys yet." : "No keys yet. A key runs what you set for its tap, hold and double tap."}</p>
      ) : (
        <ul aria-label={open ? `Keys in ${open.name}` : "Keys"} className="space-y-0.5">
          {level.map((k, i) => (
            <li key={k.id} className="flex items-center gap-1">
              <button
                type="button"
                aria-pressed={k.id === selected}
                onClick={() => (setSelected(k.id), setPendingImage(false))}
                className={cn("flex h-7 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-body text-ui-2 hover:bg-ui-hover", k.id === selected && "bg-ui-hover text-ui-1")}
              >
                <span className="flex w-4 shrink-0 justify-center">
                  <KeyGlyph k={k} />
                </span>
                <span className="min-w-0 flex-1 truncate">{k.name || "Key"}</span>
                {k.keys && <ChevronRight aria-hidden className="h-3.5 w-3.5 shrink-0 text-ui-3" />}
              </button>
              <IconButton label="Move up" size={26} disabled={i === 0} onClick={() => change((l) => moveKey(l, k.id, -1))}>
                <ArrowUp className="h-3.5 w-3.5" />
              </IconButton>
              <IconButton label="Move down" size={26} disabled={i === level.length - 1} onClick={() => change((l) => moveKey(l, k.id, 1))}>
                <ArrowDown className="h-3.5 w-3.5" />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          small
          icon={<Plus />}
          disabled={level.length >= MAX_KEYS}
          onClick={() => {
            const k = newKey();
            change((l) => addKey(l, k));
            setSelected(k.id);
          }}
        >
          Add a key
        </Button>
        {!open && (
          <Button
            small
            variant="ghost"
            icon={<FolderPlus />}
            disabled={level.length >= MAX_KEYS}
            onClick={() => {
              const k = newKey(true);
              change((l) => addKey(l, k));
              setSelected(k.id);
            }}
          >
            Add a folder
          </Button>
        )}
      </div>
      {key && (
        <div className="space-y-1.5 border-t border-ui-subtle pt-2" data-key-editor={key.id}>
          <TextRow label="Name" value={key.name} placeholder="Key" onChange={(name) => edit((k) => ({ ...k, name }), "name")} />
          <SegmentedRow
            label="Icon from"
            value={from}
            onChange={(v) => {
              setPendingImage(v === "image" && key.icon?.from !== "image");
              if (v === "set") setIcon(key.icon?.from === "set" ? key.icon : { from: "set", name: "zap" });
              if (v === "text") setIcon(key.icon?.from === "text" ? key.icon : { from: "text", text: key.name.slice(0, 2) || "A" });
            }}
            options={[
              { value: "set", label: "Icon set" },
              { value: "image", label: "Image" },
              { value: "text", label: "Text" },
            ]}
          />
          {from === "set" && <IconGrid icons={ICONS} value={key.icon?.from === "set" ? key.icon.name : ""} onChange={(name) => setIcon({ from: "set", name })} columns={7} label="Icon" />}
          {from === "text" && key.icon?.from === "text" && <TextRow label="Text" value={key.icon.text} onChange={(text) => text && edit((k) => withField(k, "icon", { from: "text", text }), "text")} />}
          {from === "image" && (
            <MediaField
              label="Image"
              kind="image"
              svg
              preview="thumb"
              value={key.icon?.from === "image" ? `${ASSETS_URL}/${encodeURIComponent(key.icon.asset)}` : undefined}
              onChange={(src) => {
                const asset = assetIdOf(src);
                if (!asset) return;
                setPendingImage(false);
                setIcon({ from: "image", asset });
              }}
            />
          )}
          <SelectRow label="Colour" value={key.series ? String(key.series) : ""} onChange={(v) => edit((k) => withField(k, "series", v ? Number(v) : undefined))} options={COLOURS} />
          {key.keys && (
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 text-caption text-ui-3">A tap opens the folder ({key.keys.length} {key.keys.length === 1 ? "key" : "keys"}).</span>
              <Button small variant="ghost" icon={<ChevronRight />} onClick={() => (setFolder(key.id), setSelected(null))}>
                Open folder
              </Button>
            </div>
          )}
          <TouchRows
            touch={key.touch}
            pages={pages}
            gestures={key.keys ? ["hold", "doubleTap"] : undefined}
            onChange={(touch, g) => edit((k) => withField(k, "touch", touch), `touch:${g}`)}
          />
          <Button
            small
            variant="ghost"
            icon={<Trash2 />}
            onClick={() => {
              change((l) => removeKey(l, key.id));
              setSelected(null);
            }}
          >
            {key.keys ? "Remove the folder and its keys" : "Remove the key"}
          </Button>
        </div>
      )}
    </div>
  );
}
