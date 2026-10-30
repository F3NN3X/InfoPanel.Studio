---
id: streaming
title: Streaming widgets
icon: videocam
related: [connections, widgets, touch]
verified: 1.3.1-beta.4
---

Six widgets in the **Streaming** and **Audio** groups of the Library turn a touch screen into a stream deck: OBS scenes, live chat and a sound mixer. The **Stream Deck** screen template puts the first three on one wide screen; pick it in **New screen**.

Connect OBS, Twitch and YouTube first, under **Settings › Connections**. See [Connections](connections).

## Stream Control

OBS on one tile board. Tap a scene to switch to it; the live one gets a white ring. A live tile shows the time on air, the bitrate and frame rate, the Twitch and YouTube viewers and a short history of them. The mic and replay tiles mute your OBS mic and save the replay buffer. The number of tiles follows the zone's size, so a larger zone shows more scenes.

## Stream Chat

Twitch chat, YouTube chat or both merged by time. Names are tinted by platform or by the accent, a small square marks a broadcaster, moderator, VIP or subscriber, and a message that names you is highlighted. The send box at the bottom sends to the platform you choose in the widget's settings. It shows only while sending can work.

## Stream Mixer

Touch faders for Windows audio (Master, Mic and the apps playing) or for Elgato Wave Link. Drag a fader to set the level, tap the icon to mute. For Windows, the output picker switches the default playback device. Choose which channels show, and rename them, in the widget's settings.

## OBS Button, Audio Button and Audio Fader

The small versions, for a grid of buttons. **OBS Button** does one thing in OBS: switch to a scene, mute the mic or save the replay. It rings while its scene is on air and lights while the mic is muted. **Audio Button** mutes a channel or switches the output device, and lights while muted or active. **Audio Fader** is one channel's fader.

## Who can use them

The widgets act on OBS and the audio of the PC that runs Studio. A kiosk on this PC controls them. A kiosk on another device does too once **Allow editing from other devices** is on under **Settings › Server**; without it the widget shows **Read-only** there. The sign-ins and passwords stay on this PC either way.
