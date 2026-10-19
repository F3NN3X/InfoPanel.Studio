/**
 * Faces a canvas was supplied with (a missing font fixed at import or with Library › Fonts › Get a
 * font: `fonts[].use === "supplied"`), drawn from the asset store. Each face loads once as a
 * FontFace of its own and wins over the loader's answer for its request. A face inside a .ttc
 * collection can't be picked out by the browser, so its request keeps the loader's fallback.
 */
import { useEffect, useState } from "react";
import type { StoredCanvas, StoredFont } from "@/lib/infopanel/import/stored";
import type { TextStyle } from "@/lib/infopanel/render/scene";
import type { FontCss } from "./Text";

const key = (r: StoredFont["request"]) => JSON.stringify([r.font, r.style, r.bold, r.italic]);

/** The asset URL of a supplied face (its store extension is its file's), or null for a collection. */
export function suppliedUrl(s: NonNullable<StoredFont["supplied"]>): string | null {
  const ext = /\.(ttf|otf|woff2?)$/i.exec(s.file)?.[1]?.toLowerCase();
  return ext ? `/api/assets/${s.hash}.${ext}` : null;
}

const loaded = new Map<string, Promise<string | null>>();

function loadFace(url: string, name: string): Promise<string | null> {
  let p = loaded.get(name);
  if (!p) {
    p =
      typeof FontFace === "undefined"
        ? Promise.resolve(null)
        : new FontFace(name, `url(${url})`)
            .load()
            .then((face) => {
              document.fonts.add(face);
              return name;
            })
            .catch(() => null);
    loaded.set(name, p);
  }
  return p;
}

/** Request key → the loaded family of its supplied face. */
export function useSuppliedFonts(fonts: StoredCanvas["fonts"] | undefined): ReadonlyMap<string, string> {
  const [families, setFamilies] = useState<ReadonlyMap<string, string>>(new Map());
  const sig = JSON.stringify((fonts ?? []).filter((f) => f.use === "supplied").map((f) => [key(f.request), f.supplied?.hash, f.supplied?.index]));
  useEffect(() => {
    let live = true;
    const wanted = (fonts ?? []).flatMap((f) => {
      const url = f.use === "supplied" && f.supplied ? suppliedUrl(f.supplied) : null;
      return url && f.supplied ? [{ key: key(f.request), url, name: `sup-${f.supplied.hash.slice(0, 16)}-${f.supplied.index}` }] : [];
    });
    if (wanted.length === 0) {
      setFamilies(new Map());
      return;
    }
    void Promise.all(wanted.map(async (w) => [w.key, await loadFace(w.url, w.name)] as const)).then((pairs) => {
      if (live) setFamilies(new Map(pairs.filter((p): p is readonly [string, string] => p[1] !== null)));
    });
    return () => {
      live = false;
    };
    // The supplied faces, not the array's identity.
  }, [sig]);
  return families;
}

/** The loader's font CSS with the supplied faces first. */
export function withSupplied(base: FontCss, supplied: ReadonlyMap<string, string>): FontCss {
  if (supplied.size === 0) return base;
  return (style: TextStyle) => {
    const family = supplied.get(key(style.font));
    // The face file is the exact face: no synthetic bold or italic over it.
    return family ? { fontFamily: `"${family}"`, fontWeight: 400, fontStyle: "normal" } : base(style);
  };
}
