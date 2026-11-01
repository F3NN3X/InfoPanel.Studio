---
id: connections
title: Connections
icon: cable
related: [widgets, island-alerts, problems]
verified: 1.3.1-beta.3
---

Connect OBS, Twitch, YouTube, the Stream Deck app and your calendars so the Streaming widgets, the island's On air notice and the calendar widgets have something to show. Everything is set in one place, and it all runs on the dashboard server, so every kiosk shares one connection.

:::open settings/connections Settings › Connections

## OBS

1. In OBS, open **Tools › WebSocket Server Settings**, turn on **Enable WebSocket server** and copy the port and password.
2. In Settings › Connections, enter the host (`127.0.0.1` when OBS runs on this PC), the port and the password, then press **Save OBS**. The status reads **Connected** once OBS answers.
3. Pick the **Mic input** Stream Control shows and mutes. The list fills once OBS is connected.
4. Under **Scenes**, give each scene a line to show under its name and a Material Symbols icon name.

Leave the password blank to keep the saved one. **Disconnect** forgets the connection.

## Twitch

Press **Sign in with Twitch**. Open twitch.tv/activate, enter the code shown and approve. No password is typed into Studio. Once signed in, the **Chat channel** says whose chat Stream Chat reads; leave it blank for your own. **Sign out** forgets the sign-in on this PC.

## YouTube

YouTube gives each Google project 10,000 units a day, so you make your own project and sign in with it:

1. In the Google Cloud Console create a project and enable **YouTube Data API v3**.
2. Set up the **OAuth consent screen** (External) and add yourself as a test user.
3. Under **Credentials** choose **Create credentials › OAuth client ID** and the type **Desktop app**.
4. Copy the Client ID and the client secret into Settings › Connections › YouTube and press **Save client**.
5. Press **Sign in with Google**. Your browser opens; approve, and the page says you can close the tab.

Once signed in, **Chat refresh** sets how often the live chat is read (5, 10 or 20 seconds) and shows how many hours of live chat a day that allows. The page also shows about how many of the 10,000 units are used today. If the quota runs out, YouTube is left alone until midnight Pacific time. **Sign out** forgets the sign-in on this PC.

## Stream Deck

Turn on **Connect to the Stream Deck app**. Studio then adds virtual decks to the Stream Deck app, one for each Elgato Stream Deck widget. The block shows a 6-character code: press **Pair** and confirm the same code in the Stream Deck app. The app only asks when a freshly started Stream Deck app meets a new client. Each device is listed with its name (edit it in place), its grid and a status dot. **Add device** makes another and **Forget** removes one, after a confirmation. If the Stream Deck app isn't running, the status says so and the connection is made once it starts.

## Calendar links

Paste an ICS link and press **Add**: Google Calendar's **Secret address in iCal format**, Outlook's published ICS link, or an iCloud public calendar. The server fetches each one every 10 minutes. Remove a link with the bin next to it.

## What stays on this PC

The OBS password, the Twitch and YouTube sign-ins, the Google client secret and the calendar links are kept by the server in its own file. They are sent once and never shown again, and they are not part of the dashboard config, so exports and backups of a dashboard don't carry them.
