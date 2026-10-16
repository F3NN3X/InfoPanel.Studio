/**
 * The profile's assets (L6): every file with a preview, its type, size and
 * uses; add, replace everywhere, remove; cleanup of unused, duplicate,
 * oversized and missing files; and the font library managed the same way.
 * Every asset edit is one undo step, together with the item fields it changes.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { itemAt } from "../editor/ops.ts";
import type { Editor } from "../editor/useEditor.ts";
import { fontFiles } from "../font-supply.ts";
import type { FontPlan } from "../useFontPlan.ts";
import {
  add, analyse, assetFile, assetKey, assign, MIME, mergeDuplicates, remove, removeWithUses, replace, scanRefs, usesOf,
  type AssetFile, type AssetRef, type Doc, type Oversized,
} from "./assets.ts";

/** One object URL per file content, revoked when the panel goes. */
export function useObjectUrls(): (f: AssetFile) => string {
  const cache = useRef(new Map<string, string>());
  useEffect(() => {
    const urls = cache.current;
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, []);
  return (f) => {
    let url = cache.current.get(f.hash);
    if (!url) {
      url = URL.createObjectURL(new Blob([f.bytes.slice()], { type: MIME[f.type] }));
      cache.current.set(f.hash, url);
    }
    return url;
  };
}

const kb = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

const readFiles = (files: readonly File[]) =>
  Promise.all(files.map(async (f) => assetFile(f.name, new Uint8Array(await f.arrayBuffer()), "added")));

/** Re-encodes an image at the size it is drawn; null when the result is not smaller. */
async function downscale(f: AssetFile, target: { width: number; height: number }): Promise<AssetFile | null> {
  const bitmap = await createImageBitmap(new Blob([f.bytes.slice()], { type: MIME[f.type] }));
  const canvas = new OffscreenCanvas(target.width, target.height);
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, target.width, target.height);
  bitmap.close();
  // JPEG and WebP stay lossy at high quality; everything else becomes PNG.
  const type = f.type === "jpeg" || f.type === "webp" ? MIME[f.type] : "image/png";
  const blob = await canvas.convertToBlob({ type, quality: 0.92 });
  if (blob.size >= f.bytes.length) return null;
  return assetFile(f.name, new Uint8Array(await blob.arrayBuffer()), f.origin);
}

/** Can the browser re-encode it: a still raster image. */
const reencodable = (f: AssetFile) => !f.animated && ["png", "jpeg", "webp", "gif", "bmp"].includes(f.type);

function Preview({ file, url }: { file: AssetFile; url: string }) {
  const box = { width: 72, height: 48, objectFit: "contain" as const, display: "block" };
  const checker = { background: "repeating-conic-gradient(#333 0 25%, #222 0 50%) 0 0 / 12px 12px" };
  if (file.type === "video") return <video src={url} muted style={{ ...box, ...checker }} />;
  if (file.type === "other") return <div style={{ ...box, ...checker, fontSize: 11, textAlign: "center", lineHeight: "48px" }}>?</div>;
  return <img src={url} alt={file.name} style={{ ...box, ...checker }} />;
}

const label = (r: AssetRef) => (r.frame === undefined ? r.path : `${r.path} frame ${r.frame}`);

function Uses({ refs, onSelect }: { refs: AssetRef[]; onSelect(paths: string[]): void }) {
  if (refs.length === 0) return <span style={{ color: "#999" }}>unused</span>;
  const paths = [...new Set(refs.map((r) => r.path))];
  return (
    <button title={refs.map(label).join(", ")} onClick={() => onSelect(paths)}>
      {refs.length} use{refs.length === 1 ? "" : "s"}
    </button>
  );
}

function FileButton({ children, multiple, accept, onFiles }: { children: ReactNode; multiple?: boolean; accept: string; onFiles(files: File[]): void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <button onClick={() => input.current?.click()}>{children}</button>
      <input
        ref={input}
        type="file"
        multiple={multiple}
        accept={accept}
        style={{ display: "none" }}
        onChange={(e) => {
          // Copied first: clearing the input empties its live FileList.
          if (e.target.files?.length) onFiles([...e.target.files]);
          e.target.value = "";
        }}
      />
    </>
  );
}

/** A font's license URL comes from an untrusted file: link only http(s). */
const webUrl = (u: string | undefined) => {
  try {
    const url = new URL(u ?? "");
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : undefined;
  } catch {
    return undefined;
  }
};

const IMAGE_ACCEPT = "image/*,video/mp4,video/webm,.ico";

export function AssetPanel({ editor, fonts }: { editor: Editor; fonts: FontPlan }) {
  const urlOf = useObjectUrls();
  const [note, setNote] = useState<string | null>(null);
  const doc: Doc = { items: editor.present, assets: editor.assets };
  const uses = usesOf(doc.items);
  const cleanup = analyse(doc);
  const { others } = scanRefs(doc.items);
  const files = [...doc.assets.values()].sort(
    (a, b) => (uses.get(assetKey(b.name))?.length ?? 0) - (uses.get(assetKey(a.name))?.length ?? 0) || a.name.localeCompare(b.name),
  );
  const total = files.reduce((n, f) => n + f.bytes.length, 0);
  const images = new Set(["Image", "SensorImage"]);
  const imageSelection = editor.selection.filter((p) => images.has(itemAt(editor.present, p)?.kind ?? ""));
  /** Runs an edit; its result, if any, is the note shown after. */
  const busy = (what: string, work: () => Promise<string | void>) => {
    setNote(`${what}…`);
    work().then(
      (message) => setNote(message || null),
      (e: Error) => setNote(`${what} failed: ${e.message}`),
    );
  };

  const addFiles = (list: File[]) =>
    busy("Adding", async () => {
      const files = await readFiles(list);
      editor.applyDoc(add(doc, files).doc);
      const known = new Map([...doc.assets.values()].map((f) => [f.hash, f.name]));
      const reused = files.flatMap((f) => (known.has(f.hash) ? [`${f.name} (as ${known.get(f.hash)})`] : []));
      if (reused.length) return `Already in the profile, not added again: ${reused.join(", ")}`;
    });

  const replaceWith = (name: string, list: File[]) =>
    busy("Replacing", async () => {
      const [file] = await readFiles(list);
      editor.applyDoc(replace(doc, name, file));
    });

  const shrink = (items: Oversized[]) =>
    busy("Downscaling", async () => {
      let next = doc;
      const skipped: string[] = [];
      for (const o of items) {
        const f = next.assets.get(assetKey(o.name));
        const smaller = f && o.target && reencodable(f) ? await downscale(f, o.target) : null;
        if (smaller) next = replace(next, o.name, smaller);
        else skipped.push(o.name);
      }
      editor.applyDoc(next);
      if (skipped.length) return `Not smaller when re-encoded, kept: ${skipped.join(", ")}`;
    });
  const shrinkable = cleanup.oversized.filter((o) => {
    const f = doc.assets.get(assetKey(o.name));
    return o.target && f && reencodable(f);
  });
  const addedFonts = fontFiles(fonts.library, fonts.rows).filter((f) => f.origin !== "pack");

  return (
    <section>
      <h3>Assets ({files.length} files, {kb(total)})</h3>
      <p>
        <FileButton multiple accept={IMAGE_ACCEPT} onFiles={addFiles}>
          Add files
        </FileButton>{" "}
        {note && <em>{note}</em>}
      </p>

      <h4>Cleanup</h4>
      <ul>
        <li>
          Unused: {cleanup.unused.length ? cleanup.unused.join(", ") : "none"}{" "}
          {cleanup.unused.length > 0 && <button onClick={() => editor.applyDoc(remove(doc, cleanup.unused))}>Remove unused</button>}
        </li>
        <li>
          Identical files: {cleanup.duplicates.length ? cleanup.duplicates.map((g) => g.join(" = ")).join("; ") : "none"}{" "}
          {cleanup.duplicates.length > 0 && (
            <button title="Keeps the first name of each group and points its uses at it" onClick={() => editor.applyDoc(mergeDuplicates(doc, cleanup.duplicates))}>
              Merge
            </button>
          )}
        </li>
        <li>
          Larger than drawn or over 1 MB: {cleanup.oversized.length ? "" : "none"}
          {cleanup.oversized.length > 0 && (
            <>
              {shrinkable.length > 0 && <button onClick={() => shrink(shrinkable)}>Downscale all to drawn size</button>}
              <ul>
                {cleanup.oversized.map((o) => (
                  <li key={o.name}>
                    {o.name}: {o.reason}
                    {shrinkable.includes(o) && (
                      <>
                        {" "}
                        <button onClick={() => shrink([o])}>
                          Downscale to {o.target!.width}×{o.target!.height}
                        </button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </li>
        <li>
          Missing (InfoPanel draws the placeholder):{" "}
          {cleanup.missing.length === 0
            ? "none"
            : cleanup.missing.map((m) => (
                <span key={m.name}>
                  <code>{m.name}</code> <Uses refs={m.refs} onSelect={editor.select} />{" "}
                </span>
              ))}
        </li>
      </ul>

      <table>
        <thead>
          <tr>
            <th />
            <th>File</th>
            <th>Type</th>
            <th>Pixels</th>
            <th>Size</th>
            <th>Used by</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {files.map((f) => {
            const refs = uses.get(assetKey(f.name)) ?? [];
            return (
              <tr key={f.name}>
                <td>
                  <Preview file={f} url={urlOf(f)} />
                </td>
                <td>
                  {f.name}
                  {f.origin === "added" && <em> (added)</em>}
                </td>
                <td>
                  {f.type}
                  {f.animated && ", animated"}
                </td>
                <td>{f.width ? `${f.width}×${f.height}` : ""}</td>
                <td>{kb(f.bytes.length)}</td>
                <td>
                  <Uses refs={refs} onSelect={editor.select} />
                </td>
                <td>
                  <FileButton accept={IMAGE_ACCEPT} onFiles={(l) => replaceWith(f.name, l)}>
                    Replace…
                  </FileButton>{" "}
                  <button
                    title={refs.length ? "Its uses lose their image (FilePath cleared)" : undefined}
                    onClick={() => editor.applyDoc(refs.length ? removeWithUses(doc, [f.name]) : remove(doc, [f.name]))}
                  >
                    Remove{refs.length ? ` (${refs.length} use${refs.length === 1 ? "" : "s"})` : ""}
                  </button>{" "}
                  {imageSelection.length > 0 && (
                    <button title="Selected image items draw this file" onClick={() => editor.apply(assign(editor.present, imageSelection, f.name))}>
                      Use for selection
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {others.length > 0 && (
        <>
          <h4>Images from outside the export</h4>
          <ul>
            {others.map((o) => (
              <li key={`${o.path}#${o.frame ?? ""}`}>
                <button onClick={() => editor.select([o.path])}>{o.frame === undefined ? o.path : `${o.path} frame ${o.frame}`}</button>{" "}
                {o.kind === "url" ? "URL" : "absolute path (placeholder on any other machine)"} <code>{o.value}</code>
              </li>
            ))}
          </ul>
        </>
      )}

      <h4>Fonts</h4>
      <FontAssets fonts={fonts} onSelectFamily={(family) => editor.select(textPaths(editor, family))} />
      {addedFonts.some((f) => f.items === 0) && (
        <p>
          <button onClick={() => addedFonts.filter((f) => f.items === 0).forEach((f) => fonts.removeFile(f.file))}>Remove unused added fonts</button>
        </p>
      )}
    </section>
  );
}

/** Text items asking for a font family. */
function textPaths(editor: Editor, family: string, items = editor.present, prefix = ""): string[] {
  return items.flatMap((item, i) => {
    const path = prefix ? `${prefix}.${i}` : String(i);
    const own = "Font" in item && item.Font === family ? [path] : [];
    return [...own, ...(item.kind === "Group" ? textPaths(editor, family, item.DisplayItems, path) : [])];
  });
}

/** The font library as assets: per file its origin, license and what draws with it; then the missing families. */
function FontAssets({ fonts, onSelectFamily }: { fonts: FontPlan; onSelectFamily(family: string): void }) {
  const files = fontFiles(fonts.library, fonts.rows);
  const used = files.filter((f) => f.items > 0 || f.origin !== "pack");
  const packsUnused = files.length - used.length;
  return (
    <>
      {used.length === 0 && <p>No library font draws in this profile.</p>}
      <table hidden={used.length === 0}>
        <thead>
          <tr>
            <th>File</th>
            <th>From</th>
            <th>Faces</th>
            <th>Size</th>
            <th>License</th>
            <th>Draws</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {used.map((f) => (
            <tr key={f.file}>
              <td title={f.file}>{f.file.replace(/^.*\//, "")}</td>
              <td>{f.origin === "pack" ? "font pack" : f.origin === "upload" ? "added" : "Fontsource"}</td>
              <td title={f.faces.map((x) => `${x.family} ${x.face}`).join(", ")}>{f.faces.length}</td>
              <td>{f.size ? kb(f.size) : ""}</td>
              <td title={f.license}>
                {f.license ? (f.license.length > 40 ? `${f.license.slice(0, 40)}…` : f.license) : <span style={{ color: "#fc6" }}>none in the file</span>}
                {webUrl(f.licenseUrl) && (
                  <>
                    {" "}
                    <a href={webUrl(f.licenseUrl)} target="_blank" rel="noopener noreferrer">
                      link
                    </a>
                  </>
                )}
                {f.embedding && f.embedding !== "installable" && <div>embedding: {f.embedding}</div>}
              </td>
              <td>
                {f.rows.length ? (
                  [...new Set(f.rows.map((r) => r.request.font))].map((family) => (
                    <button key={family} onClick={() => onSelectFamily(family)} title="Select the text items">
                      {family} ({f.items})
                    </button>
                  ))
                ) : (
                  <span style={{ color: "#999" }}>nothing</span>
                )}
              </td>
              <td>{f.origin !== "pack" && <button onClick={() => fonts.removeFile(f.file)}>Remove</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p>
        {packsUnused > 0 && `${packsUnused} more font-pack files draw nothing in this profile. `}
        Missing:{" "}
        {fonts.missing.length === 0
          ? "none"
          : fonts.missing.map((m) => {
              const covered = m.rows.every((r) => r.use === "supplied");
              return (
                <span key={m.family}>
                  <button onClick={() => onSelectFamily(m.family)} title="Select the text items">
                    {m.family} ({m.items})
                  </button>
                  {covered ? " supplied by the library" : " not supplied (Fonts panel)"};{" "}
                </span>
              );
            })}
      </p>
    </>
  );
}
