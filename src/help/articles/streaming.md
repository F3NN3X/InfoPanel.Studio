---
id: streaming
title: Streaming widgets
icon: videocam
related: [connections, widgets, touch]
verified: 1.3.1-beta.4
---

Seven widgets in the **Streaming** and **Audio** groups of the Library turn a touch screen into a stream deck: OBS scenes, live chat, a sound mixer and a virtual Elgato Stream Deck. The **Stream Deck** screen template puts the first three on one wide screen; pick it in **New screen**.

Connect OBS, Twitch and YouTube first, under **Settings › Connections**. See [Connections](connections).

## Stream Control

OBS on one tile board. Tap a scene to switch to it; the live one gets a white ring. A live tile shows the time on air, the bitrate and frame rate, the Twitch and YouTube viewers and a short history of them. The mic and replay tiles mute your OBS mic and save the replay buffer. The number of tiles follows the zone's size, so a larger zone shows more scenes.

## Stream Chat

Twitch chat, YouTube chat or both merged by time. Names are tinted by platform or by the accent, a small square marks a broadcaster, moderator, VIP or subscriber, and a message that names you is highlighted. The send box at the bottom sends to the platform you choose in the widget's settings. It shows only while sending can work.

## Stream Mixer

Touch faders for Windows audio (Master, Mic and the apps playing) or for Elgato Wave Link. Drag a fader to set the level, tap the icon to mute. For Windows, the output picker switches the default playback device. Choose which channels show, and rename them, in the widget's settings.

## OBS Button, Audio Button and Audio Fader

The small versions, for a grid of buttons. **OBS Button** does one thing in OBS: switch to a scene, mute the mic or save the replay. It rings while its scene is on air and lights while the mic is muted. **Audio Button** mutes a channel or switches the output device, and lights while muted or active. **Audio Fader** is one channel's fader.

## Elgato Stream Deck

A virtual Stream Deck on the screen. Its keys come from the Stream Deck app, and a tap runs the real action, so anything you can put on a key there works here.

1. Turn on **Stream Deck** in **Settings › Connections** and press **Pair**. The Stream Deck app asks you to confirm the same 6-character code. It only asks when a freshly started Stream Deck app meets a new client.
2. Add the widget and, in its **Device** setting, pick a device or press **New device**. Each widget has its own virtual deck, named IPStudio, IPStudio 2 and so on.
3. Open the Stream Deck app. The deck appears there like a real one: set its buttons there.
4. Set the **Grid** in the widget's settings, from 1×1 up to 8×8, with presets for 5×3, 8×4, 8×5 and 8×8. The widget draws the grid square and centred in its zone.

When the deck has more than one page, a page row shows ‹ 1 / 3 ›; swiping sideways over the keys changes page too. If the widget says the Stream Deck app isn't running, start it; the widget connects again by itself.

The widget's **Skin** styles its keys only; the widget's own frame stays as it is. Under **Style**, **Key style** is the skin's own card by default, and can be the widget's surface, plain, or any surface. The icons from the Stream Deck app fill their key, so the surface shows as a **Frame** round each icon (none, thin or thick). **Icon overlay** draws over each icon: the skin's edge, a sheen, a glow or nothing, with **Overlay strength** to tone it down. **Pressed effect** on **Skin** glows on the skins that glow and dips on the rest.

## Who can use them

The widgets act on OBS, the audio and the Stream Deck app of the PC that runs Studio. A kiosk on this PC controls them. A kiosk on another device does too once **Allow editing from other devices** is on under **Settings › Server**; without it the widget shows **Read-only** there. The sign-ins and passwords stay on this PC either way.
