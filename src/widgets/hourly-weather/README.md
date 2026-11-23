# Hourly Weather

The next hours: temperature and rain chance.

## What it shows

The next hours of weather for one place: for each hour its time, the condition as an icon, the temperature and the chance of rain.
Wide zones lay the hours out as columns, tall ones as rows, and as many as fit are drawn. A small zone gets a summary card with
the temperature now. The provider's credit (CC BY 4.0) is drawn under the hours whenever there is room, and its name in the header
always.

## Data it needs

The dashboard server's weather by place, `weather.place.<id>.*` (`ips-server weather.rs`, streamed on `/events/weather`): `temp`,
`status`, `age` and per hour `hourly.<n>.{time,temp,condition,is_day,precip}` for 24 hours. The server fetches the first place of
the `places` setting of every saved Hourly Weather widget from Open-Meteo, every 15 minutes at most; the page never calls the
provider, and a place goes to it only. `WEATHER=off` turns the source off.

## Options

- **Place**: search for a place; the first of the list is shown. Its name and position go to Open-Meteo through the server.
- **Hours**: how many to ask for (2 to 24); **Chance of rain**: the rain line.
- **Temperature** (themed unit): °C or °F.

## Presets

None yet.
