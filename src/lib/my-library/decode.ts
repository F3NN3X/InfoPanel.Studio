/**
 * What only a browser can read from a library file at upload: an image's or a video frame's
 * pixels (sampled at 64 px for the stats and the perceptual hash), a video's length and audio,
 * a font's faces and licence. Each step that fails leaves its fields out; the upload goes on.
 */
import { readFaces } from "@/lib/infopanel/sfnt";
import { reviewFont } from "@/lib/infopanel/font-licence";
import { dHash, pixelStats, type Pixels } from "./analyse";
import { svgVars, type Intake } from "./intake";
import { autoTags, type MediaMeta } from "./model";

const SAMPLE = 64;

function sample(source: CanvasImageSource, width: number, height: number): Pixels | null {
  if (!(width > 0 && height > 0)) return null;
  const k = Math.min(1, SAMPLE / Math.max(width, height));
  const w = Math.max(1, Math.round(width * k));
  const h = Math.max(1, Math.round(height * k));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(source, 0, 0, w, h);
  return { width: w, height: h, data: ctx.getImageData(0, 0, w, h).data };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("image did not load"));
    img.src = url;
  });
}

interface VideoFacts {
  duration: number;
  width: number;
  height: number;
  audio?: boolean;
  pixels: Pixels | null;
}

function readVideo(url: string): Promise<VideoFacts> {
  return new Promise((resolve, reject) => {
    const v = document.createElement("video");
    v.muted = true;
    v.preload = "auto";
    v.onerror = () => reject(new Error("video did not load"));
    v.onloadedmetadata = () => {
      v.currentTime = Math.min(1, (v.duration || 0) / 2);
    };
    v.onseeked = () => {
      const media = v as HTMLVideoElement & { mozHasAudio?: boolean; audioTracks?: { length: number }; webkitAudioDecodedByteCount?: number };
      const audio = media.mozHasAudio ?? (media.audioTracks ? media.audioTracks.length > 0 : undefined);
      resolve({ duration: v.duration, width: v.videoWidth, height: v.videoHeight, audio, pixels: sample(v, v.videoWidth, v.videoHeight) });
    };
    v.src = url;
  });
}

/** The meta of an accepted library file (spec §3 auto tags included). */
export async function readMeta(intake: Extract<Intake, { ok: true; mime: string }>, bytes: Uint8Array): Promise<MediaMeta> {
  const meta: MediaMeta = { type: intake.type, size: bytes.length, width: intake.width, height: intake.height, frames: intake.frames };
  if (intake.kind === "font") {
    try {
      const faces = readFaces(bytes);
      const first = faces[0];
      if (first) {
        const review = reviewFont({ license: first.licenseText, licenseUrl: first.licenseUrl, embedding: first.embedding });
        Object.assign(meta, { family: first.family, faces: faces.length, licence: review.verdict, embedding: first.embedding });
      }
    } catch {
      // A font the parser can't read still uploads; it shows without a family.
    }
    return { ...meta, tags: [] };
  }
  const url = URL.createObjectURL(new Blob([bytes.slice()], { type: intake.mime }));
  try {
    if (intake.kind === "video") {
      const v = await readVideo(url);
      Object.assign(meta, { duration: Math.round(v.duration * 10) / 10, width: v.width, height: v.height, audio: v.audio, loop: v.audio === false || undefined });
      if (v.pixels) Object.assign(meta, { stats: pixelStats(v.pixels), phash: dHash(v.pixels) });
    } else {
      const img = await loadImage(url);
      const width = meta.width ?? img.naturalWidth;
      const height = meta.height ?? img.naturalHeight;
      Object.assign(meta, { width, height });
      const px = sample(img, width, height);
      if (px) Object.assign(meta, { stats: pixelStats(px), phash: dHash(px) });
      if (intake.kind === "svg") meta.vars = svgVars(new TextDecoder().decode(bytes));
    }
  } catch {
    // Undecodable here (an AVIF in an old engine): the file still uploads, untagged by pixels.
  } finally {
    URL.revokeObjectURL(url);
  }
  return { ...meta, tags: autoTags(intake.kind, meta) };
}
