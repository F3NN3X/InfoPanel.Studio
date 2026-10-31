import { audioAct, audioActThrottled } from "@/lib/audio-control";
import { muteAction, routeKey, volumeAction, type MixChannel } from "./channels";

/** Sets a channel's level (a drag: throttled, the last value always follows). */
export const setVolume = (c: MixChannel, value: number): void => audioActThrottled(routeKey(c.route), volumeAction(c.route, value));

/** Flips a channel's mute. */
export const toggleMute = (c: MixChannel): void => void audioAct(muteAction(c.route, c.mute));
