// Band dynamics: the plugin's 0..1 bands (dBFS mapped from a -80 dB floor) back to dB, tilted so the
// treble reads as loud as the bass, windowed to floor..ceil, auto-gained, and eased by time.

/** The plugin's (and the capture's) band range. */
export const BAND_MIN_HZ = 30;
export const BAND_MAX_HZ = 16000;
/** The plugin maps `(dB + 80) / 80` to 0..1. */
const RANGE_DB = 80;

const AUTO_ATTACK_MS = 150;
const AUTO_RELEASE_MS = 3000;
/** Where auto-gain puts the loudest band. */
const AUTO_TARGET = 0.9;
/** The most auto-gain lifts a quiet passage (so the floor's noise never fills the bars). */
const AUTO_MAX_GAIN = 4;

/** The auto-gain's slow peak follower, kept between calls. */
export interface GainState {
  peak: number;
}
export const createGainState = (): GainState => ({ peak: AUTO_TARGET });

export interface ShapeOptions {
  floorDb: number;
  ceilDb: number;
  tiltDb: number;
  autoGain: boolean;
  state: GainState;
  /** Time since the last call, for the auto-gain follower. Default 100. */
  dtMs?: number;
  /** Visual gain after the auto-gain. Default 1. */
  gain?: number;
  /** False skips the tilt (a broadband level has no spectrum to tilt). Default true. */
  tilt?: boolean;
}

export const SHAPE_DEFAULTS = { floorDb: -60, ceilDb: -12, tiltDb: 3, autoGain: true } as const;

/** Band `i` of `n`'s log-centre frequency between 30 Hz and 16 kHz. */
export const bandCentreHz = (i: number, n: number): number => BAND_MIN_HZ * (BAND_MAX_HZ / BAND_MIN_HZ) ** ((i + 0.5) / n);

/** The tilt added to band `i` of `n`, in dB. */
export const tiltOf = (tiltDb: number, i: number, n: number): number => tiltDb * Math.log2(bandCentreHz(i, n) / 1000);

const clamp01 = (v: number) => Math.min(Math.max(v, 0), 1);
const alphaOf = (dtMs: number, tauMs: number) => (tauMs <= 0 ? 1 : 1 - Math.exp(-dtMs / tauMs));

/**
 * `raw` (0..1 per band) shaped into `out`: back to dB, plus the tilt, mapped floor..ceil to 0..1,
 * then scaled by the auto-gain (a slow peak follower that puts the loudest band near 0.9) and `gain`.
 * Silence stays 0: a band at or below the floor maps to 0 and no gain lifts it.
 */
export function shapeBands(raw: ArrayLike<number>, out: Float32Array, o: ShapeOptions): Float32Array {
  const n = raw.length;
  const span = Math.max(1, o.ceilDb - o.floorDb);
  let loudest = 0;
  for (let i = 0; i < n; i++) {
    const v = raw[i];
    if (!(v > 0)) {
      out[i] = 0;
      continue;
    }
    const db = v * RANGE_DB - RANGE_DB + (o.tilt === false ? 0 : tiltOf(o.tiltDb, i, n));
    out[i] = clamp01((db - o.floorDb) / span);
    if (out[i] > loudest) loudest = out[i];
  }
  let k = o.gain ?? 1;
  if (o.autoGain) {
    const st = o.state;
    const dt = o.dtMs ?? 100;
    st.peak += (loudest - st.peak) * alphaOf(dt, loudest > st.peak ? AUTO_ATTACK_MS : AUTO_RELEASE_MS);
    k *= Math.min(AUTO_MAX_GAIN, AUTO_TARGET / Math.max(st.peak, AUTO_TARGET / AUTO_MAX_GAIN));
  }
  if (k !== 1) for (let i = 0; i < n; i++) out[i] = clamp01(out[i] * k);
  return out;
}

/** Within this of the target a band snaps to it, so a constant input settles to identical frames. */
const SNAP = 0.0005;

/**
 * `cur` eased toward `target` in place over `dtMs`: time constants `attackMs` rising, `releaseMs`
 * falling (0 = jump). Returns true while any band is still moving.
 */
export function easeBands(cur: Float32Array, target: ArrayLike<number>, dtMs: number, attackMs: number, releaseMs: number): boolean {
  const up = alphaOf(dtMs, attackMs);
  const down = alphaOf(dtMs, releaseMs);
  let moving = false;
  for (let i = 0; i < cur.length; i++) {
    const t = target[i] ?? 0;
    const c = cur[i];
    if (c === t) continue;
    const next = c + (t - c) * (t > c ? up : down);
    cur[i] = Math.abs(t - next) < SNAP ? t : next;
    moving = true;
  }
  return moving;
}
