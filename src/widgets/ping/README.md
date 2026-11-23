# Ping

How long a host takes to answer.

## What it shows

The round-trip time to one host you name, as a big number in milliseconds with its recent trend, and under it the average, the
jitter (how much the time moves between checks) and the share of checks that got no answer, over the last 20. A word beside the
number says Up, Slow, Down or Checking, so the state is never colour alone. Small zones get a summary card and a dense view of
their own; with no host set it says so.

## Data it needs

The dashboard server's own source, `ping.<host>-<port>.*` (`ips-server ping.rs`, streamed on `/events/ping`): `status`, `ms`
(absent while the host does not answer), `avg`, `jitter`, `loss` and `updated`. Nothing to install. The server probes only the hosts
saved in Ping widgets, never one named by a request, by opening a TCP connection to the host's port and closing it (it sends and
reads nothing), at most once per interval per host, 8 hosts and 240 checks a minute in all. `PING=off` turns the source off.

## Options

- **Host**, **Port** (443 unless set; any TCP port the host answers on) and **Check every** (2 to 60 seconds, 5 by default).
- **Name**: shown instead of the host.
- **Slow from** and **Critical from**: the times, in ms, at which the number turns to a warning and to critical.

## Presets

None yet.
