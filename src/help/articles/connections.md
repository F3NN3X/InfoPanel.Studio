---
id: connections
title: Connections
icon: cable
related: [widgets, island-alerts, problems]
verified: 1.3.1-beta.3
---

Connect OBS, Twitch and your calendars so the Streaming widgets, the island's On air notice and the calendar widgets have something to show. Everything is set in one place, and it all runs on the dashboard server, so every kiosk shares one connection.

:::open settings/connections Settings › Connections

## OBS

1. In OBS, open **Tools › WebSocket Server Settings**, turn on **Enable WebSocket server** and copy the port and password.
2. In Settings › Connections, enter the host (`127.0.0.1` when OBS runs on this PC), the port and the password, then press **Save OBS**. The status reads **Connected** once OBS answers.
3. Pick the **Mic input** Stream Control shows and mutes. The list fills once OBS is connected.
4. Under **Scenes**, give each scene a line to show under its name and a Material Symbols icon name.

Leave the password blank to keep the saved one. **Disconnect** forgets the connection.

## Twitch

Press **Sign in with Twitch**. Open twitch.tv/activate, enter the code shown and approve. No password is typed into Studio. Once signed in, the **Chat channel** says whose chat Stream Chat reads; leave it blank for your own. **Sign out** forgets the sign-in on this PC.

## Calendar links

Paste an ICS link and press **Add**: Google Calendar's **Secret address in iCal format**, Outlook's published ICS link, or an iCloud public calendar. The server fetches each one every 10 minutes. Remove a link with the bin next to it.

## What stays on this PC

The OBS password, the Twitch sign-in and the calendar links are kept by the server in its own file. They are sent once and never shown again, and they are not part of the dashboard config, so exports and backups of a dashboard don't carry them.
