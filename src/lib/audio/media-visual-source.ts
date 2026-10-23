import { bandsFromSpectrum, logBandEdges } from "@/lib/audio/bands";
import { peakDb } from "@/lib/audio/decibels";
import { subscribeFrame } from "@/lib/audio/frame-loop";
import type { FrameSource, VisualFrame } from "@/lib/audio/types";
import { AMBIENT_FPS } from "@/lib/ticker";

export interface MediaVisualSourceOptions {
  /** Output frequency bands per frame. Default 48. */
  bandCount?: number;
  /** Lowest band edge, Hz. Default 30. */
  minHz?: number;
  /** Highest band edge, Hz. Default 16000. */
  maxHz?: number;
  /** History ring length, in frames. Default 128. */
  historyLength?: number;
  /** Minimum time between history entries, ms. Default 50. */
  historyIntervalMs?: number;
  /** The dB mapped to band 0 / band 1. Default the analyser window, -100 / -30. */
  minDb?: number;
  maxDb?: number;
}

export interface MediaVisualSourceHandle {
  /** Push this to `LiveWaveform` / `BarVisualizer` as their `source`. */
  readonly source: FrameSource<VisualFrame>;
  /** Point the stable source at a live analyser (starts reading). */
  attach: (analyser: AnalyserNode) => void;
  /** Stop reading (the source goes idle). */
  detach: () => void;
  /** Drop all listeners. */
  dispose: () => void;
}

/**
 * A `FrameSource<VisualFrame>` fed directly from a Web Audio `AnalyserNode` —
 * real, 60 fps, device-level audio (bypasses the Data API's ~1 Hz sensor
 * ceiling). Each animation frame reads the analyser's dB spectrum, reduces it
 * to `bandCount` log-spaced 0..1 bands (a true spectrum, not a decorative
 * shape), keeps a ring of broadband levels for the scrolling waveform, and
 * exposes the raw time-domain for the line variant.
 *
 * Reading runs on the shared rAF loop's *update* phase, so it pauses when the
 * tab is hidden and when no visualizer is subscribed — a settled, silent
 * device costs nothing.
 */
export function createMediaVisualSource(
  options: MediaVisualSourceOptions = {}
): MediaVisualSourceHandle {
  const bandCount = Math.max(4, options.bandCount ?? 48);
  const historyLength = Math.max(8, options.historyLength ?? 128);
  const historyIntervalMs = Math.max(16, options.historyIntervalMs ?? 50);
  const minHz = options.minHz ?? 30;
  const maxHz = options.maxHz ?? 16000;
  const range = { minDb: options.minDb, maxDb: options.maxDb };

  const listeners = new Set<(frame: VisualFrame) => void>();
  let analyser: AnalyserNode | null = null;
  let unsubscribe: (() => void) | null = null;

  const bands = new Float32Array(bandCount);
  const history = new Float32Array(historyLength);
  const edges = logBandEdges(bandCount, minHz, maxHz);
  let spectrumDb: Float32Array | null = null;
  let timeDomain: Float32Array | null = null;

  let historyStart = 0;
  let historyFilled = 0;
  let historyPrevious: number | undefined;
  let lastHistoryMs = 0;
  let lastFrame: VisualFrame | null = null;

  const ensureBuffers = () => {
    if (!analyser) return;
    if (!spectrumDb || spectrumDb.length !== analyser.frequencyBinCount) {
      spectrumDb = new Float32Array(analyser.frequencyBinCount);
    }
    if (!timeDomain || timeDomain.length !== analyser.fftSize) {
      timeDomain = new Float32Array(analyser.fftSize);
    }
  };

  const read = (nowMs: number) => {
    if (!analyser) return;
    ensureBuffers();
    const spectrum = spectrumDb;
    const time = timeDomain;
    if (!spectrum || !time) return;
    const sampleRate =
      (analyser.context as AudioContext | null)?.sampleRate ?? 44100;

    analyser.getFloatFrequencyData(spectrum);
    bandsFromSpectrum(spectrum, sampleRate, edges, bands, range);

    // Broadband level for the scrolling history: the mean of the bands.
    let sum = 0;
    for (let i = 0; i < bandCount; i += 1) sum += bands[i] ?? 0;
    const level = bandCount > 0 ? sum / bandCount : 0;

    if (
      historyFilled < historyLength ||
      nowMs - lastHistoryMs >= historyIntervalMs
    ) {
      lastHistoryMs = nowMs;
      historyPrevious =
        historyFilled >= historyLength ? history[historyStart] : undefined;
      history[historyStart] = level;
      historyStart = (historyStart + 1) % historyLength;
      if (historyFilled < historyLength) historyFilled += 1;
    }

    analyser.getFloatTimeDomainData(time);
    const frame: VisualFrame = {
      bands,
      history,
      historyStart,
      historyLength: historyFilled,
      historyUpdatedAt: nowMs,
      historyIntervalMs,
      historyPreviousLevel: historyPrevious,
      timeDomain: time,
      peakDb: peakDb(time),
    };
    lastFrame = frame;
    for (const listener of listeners) listener(frame);
  };

  const start = () => {
    if (unsubscribe || !analyser || listeners.size === 0) return;
    unsubscribe = subscribeFrame((nowMs) => read(nowMs), "update", "media:analyser", AMBIENT_FPS);
  };
  const stop = () => {
    unsubscribe?.();
    unsubscribe = null;
  };

  const source: FrameSource<VisualFrame> = {
    subscribe: (listener) => {
      listeners.add(listener);
      if (lastFrame) listener(lastFrame);
      start();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) stop();
      };
    },
  };

  return {
    source,
    attach: (next: AnalyserNode) => {
      analyser = next;
      lastFrame = null;
      start();
    },
    detach: () => {
      analyser = null;
      stop();
    },
    dispose: () => {
      stop();
      listeners.clear();
    },
  };
}
