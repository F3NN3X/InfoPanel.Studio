---
id: performance
title: Frame rate and motion
icon: monitoring
related: [kiosk, problems, background]
verified: 1.3.0-beta.6
---

Two settings decide how hard the display's GPU works: **Max FPS** and **Motion**. At the default of 60 they save little. On most panels 30 or 15 looks the same and costs far less.

## The settings

| Setting | Choices | Default |
|---|---|---|
| Max FPS (**Frame rate limit**) | 5, 15, 30, 60 or No limit | 60 |
| Motion (**Animations**) | Follow system, Reduced or Full | Follow system, which follows the Windows animation setting |

For every screen, open **Settings › Dashboard › Performance**: Max FPS is labelled **Frame-rate cap** (5, 15, 30, 60 or No limit) and Motion is **Animations** (Follow system, Reduced or Full). A change there is saved and reaches the kiosks at once. A screen can have its own: in **Screens**, the **Performance** group shows a chip, and Settings lists each screen that has its own, with **Reset** and a link to it. Below 60 fps the studio turns transitions off and graphs step at the data rate, so **Smooth** in Theme's Motion section does nothing on a screen capped lower or with reduced animations; Theme says which screens.

- **From All screens** means the screen uses the Settings values. Change a value there and the screen takes its own, starting from the shared ones.
- **Custom here** means the screen's own. **Reset to inherited** in the chip's menu drops them.

## What Max FPS changes

The kiosk's animations share one clock that redraws them at most Max FPS times a second. That covers animated gradients, gauges moving to a new value, smooth graphs, scrolling text, the Clock colon, visualizers, the slow pan and zoom on Game Spotlight's artwork, and the pulsing activity dots.

Below 60, widgets also drop their CSS transitions. Those run at the display's full rate whatever the cap, so they would keep the GPU busy. Bars, rings and heat tiles jump to each new reading instead of gliding. Small decorations stop too: Now Playing's equalizer and vinyl, the Fans spinner and the retro title cursor.

## What Reduce changes

Reduce stops animations instead of slowing them:

- gradients and gauges show their final state;
- the Clock colon stays solid;
- scrolling text stays still and shows its start;
- a visualizer shows one still frame, not live audio;
- a background video shows its poster frame;
- Game Spotlight's artwork and the activity dots hold still;
- widget transitions are off, as below 60 fps.

## Choosing a setting

These figures come from a 1920×550 dashboard with a visualizer, audio meters, Game Spotlight, Clock, Weather and the island, shown in a browser window. They are the browser's GPU process, as a share of one core:

| Setting | GPU |
|---|---|
| Max FPS 60 | 65% |
| Max FPS 30 | 15% |
| Max FPS 15 | 11% |
| Max FPS 5 | 6% |
| Motion: Reduce | 2% |

Inside InfoPanel the figures can be higher. How much InfoPanel's own web view adds hasn't been measured.

- Start with 30. Most dashboards look the same.
- Use 15 for a panel that mostly shows numbers.
- Use Reduce on a display where nothing needs to move.

## One display only

A kiosk URL overrides both settings for the display that opens it:

| Add to the URL | Effect |
|---|---|
| `&fps=30` | Max FPS of 5, 15, 30, 60, or `0` for Unlimited |
| `&animations=0` | Motion: Reduce |
| `&motion=reduce`, `&motion=full` or `&motion=system` | Motion for this display only |

The URL wins over the screen, and the screen wins over **Settings › Dashboard** (All screens).

## After an update

InfoPanel doesn't reload the kiosk page by itself. After you update InfoPanel Studio, restart InfoPanel so the display loads the new version.
