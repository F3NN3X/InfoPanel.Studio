# Mixer Solo

One tap: hear only one channel.

## What it shows

A tile for one channel that solos it. A tap mutes every other channel except Master and lights the tile ("Solo", with how many are
muted); a second tap unmutes the channels the solo muted. It is soloed whenever its channel is live and every other channel is
muted, so it reads right whichever way they got that way. A channel that was muted is unmuted by the first tap.

## Data it needs

The server's audio control (`src/lib/audio-control.ts`: Windows audio and Wave Link), not sensor keys. It reads and writes it, so it
draws without sensor keys. It writes only mutes, through the same route as Audio Button. The channels a solo muted are remembered
for the second tap by the page that tapped; after a reload while a solo is on, the second tap unmutes every other channel.

## Options

- **Channel**, and the **Wave Link mix** for a Wave Link channel; **Name**.

## Presets

None yet.
