# Stream Stats

OBS bitrate, frame rate, uptime and viewers.

## What it shows

How the stream is doing: OBS's bitrate as the big number with its recent trend, then the frame rate, the time on air and the viewers
on Twitch and YouTube (added up when both are signed in). A word beside it says Live, Offline or Not connected. Small zones get a
summary card and a dense view of their own.

## Data it needs

The server's OBS connection (`useExtras().obs`: `connected`, `streaming`, `kbps`, `fps`, `uptime`) and the Twitch and YouTube viewers
(`useExtras().twitch` and `.youtube`), not sensor keys. Connect them under Settings › Connections.

## Options

- **Show viewers** (needs Twitch or YouTube signed in) and **Bitrate trend**.

## Presets

None yet.
