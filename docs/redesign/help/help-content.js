// InfoPanel Studio — in-app help content.
// Block DSL: ['h',text] ['p',text] ['ul',[..]] ['ol',[..]] ['table',[head],[[row]..]] ['tip'|'note'|'warn',text]
// ['keys',[[combo,label]..]] ['flow',[[title,desc]..]] ['open',label,href,icon]
// Inline: `code`, **bold**, [label](article-id)
window.HELP_CONTENT = {
groups: [
  ['Start here', ['welcome', 'quickstart', 'concepts']],
  ['Build', ['studio', 'profiles', 'zones', 'widgets', 'panels', 'panel-widgets', 'presets']],
  ['Style', ['themes', 'widget-settings', 'background', 'custom-css']],
  ['Data', ['sensors', 'agents']],
  ['Import from InfoPanel', ['import', 'canvas', 'remap', 'assets', 'gauges']],
  ['Run', ['kiosk', 'startup', 'updates']],
  ['Troubleshoot', ['problems', 'diagnostics']],
  ['Reference', ['shortcuts', 'glossary']]
],
articles: {

welcome: { title: 'Welcome to InfoPanel Studio', icon: 'waving_hand', lede: 'InfoPanel Studio designs live dashboards for the small screen next to your monitor, and serves them to InfoPanel as a kiosk page.', blocks: [
  ['h', 'How the pieces fit'],
  ['flow', [['Sensors', 'InfoPanel and its plugins publish readings on the Data API'], ['Studio', 'You lay out widgets and panels and style them'], ['Server', 'A local server on this PC hosts the result'], ['Kiosk', 'InfoPanel shows the kiosk URL on your display']]],
  ['p', 'Everything runs on this computer. The studio saves to the local server as you edit, and every open kiosk updates within a second. Nothing is uploaded anywhere.'],
  ['h', 'What you can do'],
  ['ul', [
    '**Build dashboards** from ready-made widgets (system, media, weather, FPS, network…) or from panels you compose yourself. See [Widgets](widgets) and [Panels](panels).',
    '**Make one dashboard fit several screens** with a profile per display size. See [Profiles and the grid](profiles).',
    '**Style everything at once** with a theme, then let single widgets differ where you want. See [Themes and appearance](themes).',
    '**Import existing InfoPanel profiles**, keep them pixel-exact or turn items into native widgets. See [Importing a profile](import).',
    '**Show Claude Code and Codex sessions** on your dashboard. See [Coding agents](agents).'
  ]],
  ['h', 'Where to go next'],
  ['p', 'New here? The [Quick start](quickstart) gets a working dashboard onto your display in about five minutes. [Core concepts](concepts) explains the words used everywhere else in this help.']
], related: ['quickstart', 'concepts', 'kiosk'] },

quickstart: { title: 'Quick start', icon: 'rocket_launch', lede: 'From a fresh install to a live dashboard on your InfoPanel display.', blocks: [
  ['h', '1. Check the server is running'],
  ['p', 'The status pill at the bottom of the Settings sidebar should say **Server running**. If it says stopped, open Settings › Server and press **Start server**.'],
  ['open', 'Settings › Server', 'App Settings.dc.html', 'dns'],
  ['h', '2. Pick a profile for your screen'],
  ['p', 'Open the studio. In the drawer, switch to **Profiles** and pick the one closest to your display (for example `Kiosk strip 1920×550`), or press **New profile** and type your display size. The grid is created for you.'],
  ['h', '3. Add widgets'],
  ['ol', [
    'Switch the drawer to **Add**.',
    'Filter with the chips (System, Media, Network, Info…) or search.',
    'Drag a widget onto the grid. It snaps to cells and takes its minimum size.',
    'Drag the corner handle to make it bigger.'
  ]],
  ['tip', 'Not sure where to start? Add a **Layout starter** such as *Row of stats* and pick a sensor for each stat.'],
  ['h', '4. Choose a look'],
  ['p', 'Click an empty part of the canvas so nothing is selected. The inspector shows **Appearance**. Pick a preset (Dark, Glass, Neon…) and choose whether it applies to all profiles or this one.'],
  ['h', '5. Put it on the display'],
  ['ol', [
    'Open Settings › Server and press **Copy** next to the kiosk URL (`http://127.0.0.1:3922/?kiosk=1`).',
    'In InfoPanel, add a web or browser item that fills your display and paste the URL.',
    'Your dashboard appears. Edits in the studio show up there right away.'
  ]],
  ['note', 'InfoPanel and the kiosk URL have to use the same port. If you change the port in Settings, update the URL in InfoPanel too.']
], related: ['concepts', 'studio', 'kiosk'] },

concepts: { title: 'Core concepts', icon: 'account_tree', lede: 'The five building blocks, from the whole dashboard down to a single readout.', blocks: [
  ['flow', [['Dashboard', 'Theme, global style, presets'], ['Profile', 'One per display size and grid'], ['Zone', 'A box on the grid'], ['Widget or panel', 'What fills the zone']]],
  ['h', 'Dashboard'],
  ['p', 'Everything you build: the theme, the global style, the page background, fonts and your saved presets. There is one dashboard per install, and it exports as one file.'],
  ['h', 'Profile'],
  ['p', 'A page designed for one display size, with its own grid (columns × rows), fit mode, gap and padding. A profile can inherit the dashboard theme or set its own. **Auto** picks the profile closest to the window size, so one dashboard can serve a 1920×550 strip and a 1024×600 panel.'],
  ['h', 'Zone'],
  ['p', 'A rectangle on the profile grid, placed by column, row, width and height in cells. A zone holds exactly one thing: a widget, a panel, an imported InfoPanel canvas, or nothing yet (a blank zone).'],
  ['h', 'Widget'],
  ['p', 'A ready-made module that reads sensors and draws itself: System, Spotify, Weather, FPS and so on. Widgets adapt to the zone size and have settings in four tabs. See [Widgets](widgets).'],
  ['h', 'Panel'],
  ['p', 'A zone you compose from small **panel widgets** (stat, gauge, bar, clock, image…) laid out as a Stack, a Grid or an Overlay. Use a panel when no widget shows exactly what you want. See [Panels](panels).'],
  ['h', 'How looks are decided'],
  ['p', 'Looks flow downward. A widget follows its profile theme, which follows the dashboard theme, unless you customise a section on the widget itself. Content (which sensor, what to show) always belongs to the widget. See [Themes and appearance](themes).']
], related: ['profiles', 'zones', 'themes'] },

studio: { title: 'The studio', icon: 'space_dashboard', lede: 'The editor window: canvas in the middle, a drawer for adding things, and an inspector for settings.', blocks: [
  ['h', 'Canvas'],
  ['p', 'Shows the selected profile at its real size, scaled to fit the window. Grid lines appear while you drag. Click a zone to select it; click empty space to select nothing and see dashboard-wide settings.'],
  ['h', 'Drawer'],
  ['table', ['Tab', 'What it holds'], [
    ['**Add**', 'Every widget, layout starters, panel presets and *My panels*. Filter chips: All, Layouts, My panels, System, Media, Network, Info, Other.'],
    ['**Layers**', 'The zones of this profile in order. Hide, rename, reorder and select from here.'],
    ['**Profiles**', 'Switch, add, duplicate and resize profiles.']
  ]],
  ['h', 'Inspector'],
  ['p', 'The settings for whatever is selected. It sits beside the canvas or docks at the bottom:'],
  ['ul', [
    '**Side** — one column next to the canvas. Good for tall profiles.',
    '**Bottom** — cards flow in 300 px columns under the canvas, and the drawer becomes the first column. Good for wide, short profiles such as 1920×550.',
    '**Auto** — picks Bottom for wide, short profiles and Side for the rest.'
  ]],
  ['p', 'Drag the splitter to resize the bottom dock. Press `Ctrl+\\` to collapse or expand it.'],
  ['h', 'Saving'],
  ['p', 'The studio pushes every change to the local server automatically. A dot on the **Save** button means some edits haven\'t reached the server yet; press it (or `Ctrl+S`) to push them now.'],
  ['h', 'Undo'],
  ['p', 'One drag, one field change or one bulk action (such as applying a preset) is one undo step. `Ctrl+Z` undoes, `Ctrl+Y` redoes. Shortcuts never fire while you are typing in a field.']
], related: ['zones', 'widget-settings', 'shortcuts'] },

profiles: { title: 'Profiles and the grid', icon: 'aspect_ratio', lede: 'A profile is a page for one display size. Its grid decides where zones can go.', blocks: [
  ['h', 'Profile settings'],
  ['table', ['Setting', 'What it does'], [
    ['Size', 'The design size in pixels, usually your display\'s resolution.'],
    ['Grid', 'Columns × rows. New profiles get 6 or 12 columns and 4 or 6 rows depending on size.'],
    ['Fit', '**Fill**: the grid stretches to the full height. **Scroll**: rows are 120 px tall and the page scrolls.'],
    ['Gap / padding', 'Space between zones (default 12 px) and around the edge.'],
    ['Theme, style, background', 'Inherit from the dashboard, or set this profile\'s own.']
  ]],
  ['h', 'Which profile the kiosk shows'],
  ['p', 'With **Auto**, the kiosk picks the profile whose size is closest to its window. You can also pin a profile in the kiosk URL. Keep one profile per physical display and Auto does the right thing.'],
  ['h', 'Shipped profiles'],
  ['table', ['Profile', 'Size', 'Grid', 'Fit'], [
    ['Sample 1920×550', '1920×550', '12×6', 'Fill'],
    ['ARCv2', '1920×550', '12×6', 'Fill'],
    ['Main display', '1920×1080', '12×10', 'Scroll'],
    ['Kiosk strip 1920×550', '1920×550', '12×2', 'Fill'],
    ['Small 1024×600', '1024×600', '6×4', 'Scroll']
  ]],
  ['tip', 'Changing the grid keeps zones where they are in cells. If you halve the columns, widen zones afterwards or they will look narrow.']
], related: ['zones', 'themes', 'kiosk'] },

zones: { title: 'Zones', icon: 'grid_view', lede: 'Every box on the grid is a zone. Select one to move, resize or fill it.', blocks: [
  ['h', 'Placing and sizing'],
  ['ul', [
    'Drag a zone to move it; it snaps to grid cells.',
    'Drag the corner handle to resize. A zone can\'t go below its widget\'s minimum size (for example 2×1 for most widgets, 4×2 for Web Page).',
    'Or type exact values in the zone box at the top of the inspector: **Col**, **Row**, **W**, **H**.'
  ]],
  ['h', 'Zone kinds'],
  ['table', ['Kind', 'Holds', 'Inspector shows'], [
    ['Widget', 'One widget', 'Show · Style · Data · Behaviour tabs'],
    ['Panel', 'Panel widgets in a Stack, Grid or Overlay', 'Panel, Layout, Widgets list, then the selected panel widget'],
    ['Canvas', 'An imported InfoPanel profile', 'Item tree, canvas tools, item inspector'],
    ['Blank', 'Nothing yet', '**Pick a widget** and the zone frame']
  ]],
  ['h', 'Zone actions'],
  ['p', 'The inspector header has **hide**, **duplicate** and **remove**. Hidden zones stay in the layout but don\'t render on the kiosk. Use **Change** on the Widget section to swap the widget while keeping the zone and its look.']
], related: ['widgets', 'panels', 'studio'] },

widgets: { title: 'Widgets', icon: 'widgets', lede: 'Ready-made modules that read sensors and adapt to their zone.', blocks: [
  ['h', 'The widget list'],
  ['table', ['Widget', 'Min size', 'Reads'], [
    ['System', '2×1', 'CPU, GPU, RAM, drives via LibreHardwareMonitor'],
    ['Hardware', '2×1', 'LibreHardwareMonitor or HWiNFO sensors, as a list or temperature gauges'],
    ['Spotify', '2×1', 'Spotify plugin plus the audio level meter'],
    ['Media', '2×1', 'Any media player via the Media plugin'],
    ['Steam', '2×1', 'Steam API plugin: game, banner, stats, news'],
    ['Weather', '3×1', 'yr weather plugin: now and forecast'],
    ['FPS', '2×1', 'RTSS / FPS plugin, as a gauge or a trend'],
    ['Audio', '2×1', 'Audio level meter for a device'],
    ['Wave Link', '2×1', 'Elgato Wave Link mixes, 100 ms updates'],
    ['Bluetooth', '2×1', 'Battery levels of Bluetooth devices'],
    ['Network', '2×1', 'Ethernet speeds or totals'],
    ['Departures', '2×1', 'Public transport departures (VBZ plugin)'],
    ['Notifications', '2×1', 'Recent Windows notifications'],
    ['Text File', '2×1', 'Contents of a text file'],
    ['Stream Deck', '3×2', 'A Stream Deck profile\'s keys'],
    ['Web Page', '4×2', 'Any URL, in a frame'],
    ['Other sensors', '4×2', 'Every sensor no other widget uses, one card each']
  ]],
  ['h', 'Adapting to size'],
  ['p', 'Most widgets pick a layout from the space they get: **standard**, **card**, **compact** or **simple**. In Show › Fit, **Small zones** decides what happens when the zone is small:'],
  ['ul', ['**Auto** — the widget decides.', '**Full** — always the full layout, scaled down.', '**Card** — a summary card with the key value.', '**Dense** — everything, packed tighter.']],
  ['h', 'Hide when idle'],
  ['p', 'Spotify, Media, Steam, FPS and Notifications can hide themselves when there is nothing to show (no music, no game). Turn it on in Behaviour.'],
  ['h', 'Tint'],
  ['p', 'Spotify and Media can tint their surface from the cover art, Weather from the conditions, Steam from the game banner. Find it in Style › Widget colors.']
], related: ['widget-settings', 'sensors', 'panels'] },

panels: { title: 'Panels', icon: 'dashboard_customize', lede: 'Compose your own zone from small widgets when no ready-made widget fits.', blocks: [
  ['h', 'Three layouts'],
  ['table', ['Layout', 'Places widgets', 'Options'], [
    ['**Stack**', 'In a row or column', 'Direction, wrap, and one 3×3 alignment picker (along: start/center/end/spread; across: start/center/end/stretch)'],
    ['**Grid**', 'In cells', 'Columns 1–12, column sizes (`1fr`, `auto`, px), row sizes, cell alignment; per widget: span and start'],
    ['**Overlay**', 'In Top / Middle / Bottom bands over an image', 'Dark scrim, band alignment, bottom band columns 1–12']
  ]],
  ['p', 'A panel fills its zone (**Fill**) or shrinks to its content (**Hug**). Gap and padding go from 0 to 200 px, or auto.'],
  ['h', 'Editing a panel'],
  ['ol', [
    'Select the panel zone. The inspector shows **Panel**, **Layout**, **Widgets** (and **Background** for Overlay).',
    'Press **Add** in the Widgets list and choose a kind.',
    'Pick a sensor for it. The widget\'s own settings appear below the list.',
    'Drag to reorder. Each row has hide, duplicate, copy/paste, change kind and delete.'
  ]],
  ['tip', '**Change kind** keeps the label, sensor, unit and colour, so you can try a gauge, then a bar, without setting it up again.'],
  ['h', 'Code mode'],
  ['p', 'Switch the Panel card to **Code** to edit the whole panel as JSON. Press **Apply** or `Ctrl+Enter`; the change is one undo step.'],
  ['h', 'Saving a panel'],
  ['p', 'From the panel\'s **…** menu choose **Save panel**. It appears under *My panels* in the Add drawer, for every profile, and is included when you export. Each use is a fresh copy.']
], related: ['panel-widgets', 'presets', 'custom-css'] },

'panel-widgets': { title: 'Panel widgets', icon: 'view_comfy_alt', lede: 'The ten small building blocks you place inside a panel.', blocks: [
  ['table', ['Kind', 'Shows', 'Own options'], [
    ['stat', 'A label over a big number', 'Sub sensor, decimals, scale, font size, align'],
    ['value', 'A compact inline readout', 'Sub sensor, decimals, scale, font size, align'],
    ['bar', 'Label, value and a fill bar', 'Decimals, scale, max, inverted'],
    ['gauge', 'A ring with the value inside', 'Decimals, scale, max, inverted, ring size'],
    ['sparkline', 'A rolling mini graph', 'Decimals, scale, history (5–200 samples)'],
    ['table', 'Rows from a multi-line sensor', 'Rows, columns, header, align, font size'],
    ['text', 'Fixed or sensor-bound text', 'Text, align, font size'],
    ['image', 'A picture from a URL or sensor', 'Height, use as panel background'],
    ['clock', 'Live time and/or date', 'Time, date or both; align; font size'],
    ['shape', 'A bar, rectangle or circle', 'Shape, thickness']
  ]],
  ['h', 'Shared options'],
  ['p', 'Every panel widget also has a label, sensor, unit, colour, size and placement, class names and custom CSS.'],
  ['table', ['In a…', 'Placement means'], [
    ['Stack', '**Hug** (content size), **Fill** (share the free space) or **Fixed** (px)'],
    ['Grid', 'Column and row span, and start cell'],
    ['Overlay', 'Which band: Top, Middle or Bottom']
  ]],
  ['note', 'When a theme forces the global style, panel widget colours follow the theme too: fills take the accent.']
], related: ['panels', 'sensors', 'custom-css'] },

presets: { title: 'Layouts and presets', icon: 'auto_awesome_mosaic', lede: 'Starting points you can drop in and adjust: whole pages, single panels, and looks.', blocks: [
  ['table', ['Kind', 'Is', 'Find it'], [
    ['Profiles', 'Whole pages with a grid and zones', 'Drawer › Profiles'],
    ['Layout starters', 'One sensor-free panel; each widget asks for a sensor', 'Add › Layouts'],
    ['Panel presets', 'One panel already bound to sensors (samples)', 'Add › Layouts'],
    ['My panels', 'Panels you saved', 'Add › My panels'],
    ['Style presets', 'One widget\'s look keys', 'Style tab › preset menu'],
    ['Appearance presets', 'A whole look: theme, radius, surface, background', 'Nothing selected › Appearance']
  ]],
  ['h', 'Layout starters'],
  ['table', ['Starter', 'Size', 'Builds'], [
    ['Row of stats', '4×1', 'A spread row of 3 stats'],
    ['2×2 stats', '3×2', 'A 2-column grid of 4 stats'],
    ['Hero overlay', '4×2', 'Image background, title, big stat, 2 values'],
    ['Gauge row', '4×1', 'A row of 3 gauges'],
    ['Clock + date', '2×1', 'Time over date, no card'],
    ['Label / value list', '2×2', 'Labels with right-aligned values']
  ]],
  ['note', 'Panel presets (System, CPU, GPU, FPS gauges…) were built against one PC\'s sensors. Expect to re-pick some sensors.'],
  ['h', 'Appearance presets'],
  ['p', 'Dark, Light, Glass, Frosted, Matte, Neon, Minimal, Ocean and Forest. Applying one is a single undo step, for **All profiles** or **This profile**. Its background is only used where none is set, unless you tick **Replace the page background**. Save your current look as your own preset from the same gallery.']
], related: ['panels', 'themes', 'profiles'] },

themes: { title: 'Themes and appearance', icon: 'palette', lede: 'Set the look once and every widget follows. Customise only where a widget should differ.', blocks: [
  ['h', 'Where looks come from'],
  ['flow', [['Default', 'Built into each widget'], ['Dashboard theme', 'All profiles'], ['Profile theme', 'This profile'], ['Widget', 'Only sections you customise']]],
  ['p', 'Each layer overrides the one before it. Content settings (sensors, what to show) are never themed; they always belong to the widget.'],
  ['h', 'Follow theme, section by section'],
  ['p', 'Every themable section in a widget\'s settings (Colors, Surface, Typography, Size & spacing, Border & glow, Units & format, Thresholds, Motion…) starts out following the theme. Its rows show the theme\'s values, dimmed.'],
  ['ul', [
    'Press **Customize** to change that section for this widget only. Rows start from the theme values.',
    'Press **Use theme** to follow again. Your values are kept, so Customize brings them back.',
    'Press the section\'s reset icon to clear them for good.'
  ]],
  ['h', 'Locking'],
  ['p', 'In the profile theme, **Lock** a section to make every widget follow it, whatever its own setting. Locked sections show *Locked by the profile* in widgets. Use this to enforce one font or one set of thresholds across a whole screen.'],
  ['h', 'Theme colours'],
  ['p', 'A theme is 19 colour tokens (background, foreground, card, primary, accent, muted, border…) and a corner radius. Start from Zinc, Neutral, Slate, Ocean, Forest or Paper (light) and edit any token.'],
  ['h', 'Surfaces'],
  ['table', ['Surface', 'Look'], [
    ['Glass', 'Translucent dark gradient with white text (default for most widgets)'],
    ['Matte light / dark', 'Solid light grey or near-black card'],
    ['Theme', 'Built from the theme tokens; follows light or dark themes'],
    ['None / Card / Bordered', 'Panels only: transparent, half-opacity card, or card with a border']
  ]],
  ['p', 'Surface opacity, background blur, border and glow (none, soft, strong) apply on top of any surface.']
], related: ['widget-settings', 'background', 'presets'] },

'widget-settings': { title: 'Widget settings', icon: 'tune', lede: 'Every widget has the same four tabs, filed by the question they answer.', blocks: [
  ['table', ['Tab', 'Answers', 'Holds'], [
    ['**Show**', 'What is on it?', 'Header (title, icon), the widget\'s own content sections, Fit (small zones, density)'],
    ['**Style**', 'How does it look?', 'Skin & graphics, Colors, Widget colors, Surface, Typography, Size & spacing, Border & glow, Custom CSS'],
    ['**Data**', 'Where do values come from?', 'Device, sensors, source; Units & format'],
    ['**Behaviour**', 'How does it react?', 'Thresholds, history, dynamics, Dynamic Island, Motion']
  ]],
  ['p', 'Widget-specific sections come first in each tab, shared ones after. A tab with nothing in it for this widget is greyed out.'],
  ['h', 'Finding a setting'],
  ['ul', [
    'Type in the inspector\'s search box. Results name the tab and section.',
    'Press **Changed** to list only what you have changed on this widget.',
    'Rows marked **More** are less common; open them at the end of a section.'
  ]],
  ['h', 'Setting dots'],
  ['p', 'A filled accent dot means the row has its own value on this widget. Click the dot to reset just that row. Sections show a pill instead: **Theme**, **Custom** or **Locked**.'],
  ['h', 'Common controls'],
  ['table', ['Control', 'Works like this'], [
    ['Thresholds', 'A green / amber / red bar with Warning and Critical sliders. Critical can\'t go below Warning.'],
    ['Device', '**Auto** first, with its rule and current pick (for example *busiest adapter · now Ethernet 2*), then every detected device.'],
    ['Units & format', 'Temperature °C / °F, rate (auto, MB/s, Mb/s…), decimals, 12 / 24 h. Set once in the theme.'],
    ['Widget colors', 'Each colour has a role (Series 1–6, OK, Warning, Critical, Accent) that follows the theme palette until customised.']
  ]],
  ['h', 'Copying a look'],
  ['p', 'From the Style tab\'s preset menu: **Copy style**, **Paste style**, **Save as preset**, or **Use as theme** to push this widget\'s look up to the profile.']
], related: ['themes', 'widgets', 'custom-css'] },

background: { title: 'Page background', icon: 'wallpaper', lede: 'A colour, gradient, image or video behind all zones.', blocks: [
  ['table', ['Type', 'Options'], [
    ['Color', 'Any colour or theme token'],
    ['Gradient', 'Linear or radial, with stops'],
    ['Image', 'URL or upload; fit (cover, contain, stretch, center, tile); position'],
    ['Video', 'URL or upload; loops muted']
  ]],
  ['p', 'Every type also has **dim**, **tint** and **blur**, which keep text readable over busy pictures.'],
  ['h', 'Dashboard and profile'],
  ['p', 'Set a background for all profiles, then per profile choose **Inherit**, **Custom** or **None**.'],
  ['note', 'Videos pause when the kiosk is hidden. With reduced motion on, only the poster frame shows.']
], related: ['themes', 'profiles'] },

'custom-css': { title: 'Custom CSS', icon: 'code', lede: 'For looks the settings can\'t reach. CSS is scoped, so it never leaks into other zones.', blocks: [
  ['h', 'Where to write it'],
  ['ul', [
    'A widget: Style › Custom CSS.',
    'A panel: Panel card › More › CSS. It applies to that zone only.',
    'A panel widget: its Advanced card. It applies to that cell only.'
  ]],
  ['p', 'Inside, `:scope` is the zone or cell root.'],
  ['h', 'Hooks'],
  ['table', ['Selector', 'Targets'], [
    ['`.wp-panel[data-panel-layout]`', 'The panel; layout is stack, grid or overlay'],
    ['`.wp-widget--{kind}`', 'A panel widget, e.g. `.wp-widget--gauge`'],
    ['`.wp-label` `.wp-value` `.wp-unit`', 'Text parts'],
    ['`.wp-bar-fill` `.wp-gauge` `.wp-clock-time`', 'Graphic parts']
  ]],
  ['h', 'Variables'],
  ['p', '`--panel-gap`, `--panel-pad`, `--panel-direction`, `--wp-accent`, `--wp-fg`, `--wp-radius`. Setting a variable is safer than overriding the property, because it survives theme changes.'],
  ['tip', 'Example: `:scope .wp-value { font-variant-numeric: tabular-nums; }` stops numbers jittering as they change.']
], related: ['panels', 'widget-settings'] },

sensors: { title: 'Sensors and the Data API', icon: 'sensors', lede: 'Where every number on your dashboard comes from.', blocks: [
  ['p', 'InfoPanel collects readings from LibreHardwareMonitor, HWiNFO and its plugins (Spotify, weather, Steam, Bluetooth…) and publishes them on its **Data API**, by default on port `3921`. The studio and kiosk read from there.'],
  ['h', 'How widgets find sensors'],
  ['p', 'Each widget claims sensor keys by prefix: System reads `system.cpu…` and `system.ram…`, Network reads ethernet sensors, and so on. Anything no widget claims appears in **Other sensors**.'],
  ['h', 'Picking a sensor'],
  ['p', 'Sensor fields open a picker with live values. Type to search keys, names and references; every word has to match. Use the arrow keys and Enter to pick.'],
  ['h', 'Changing the Data API address'],
  ['p', 'With nothing selected in the studio, open **Connection** and set the Data API URL. Only change it if InfoPanel runs on another PC or port.'],
  ['warn', 'If every widget shows dashes, the Data API is unreachable. Check InfoPanel is running and its web server is enabled. See [Common problems](problems).']
], related: ['widgets', 'problems', 'panel-widgets'] },

agents: { title: 'Coding agents', icon: 'smart_toy', lede: 'Show what Claude Code and Codex are doing, live on your dashboard.', blocks: [
  ['h', 'Turning it on'],
  ['ol', ['Open Settings › Coding agents.', 'Turn on **Connect coding agents**.', 'Start a new Claude Code or Codex session. It appears on widgets that show agent sessions.']],
  ['open', 'Settings › Coding agents', 'App Settings.dc.html', 'smart_toy'],
  ['h', 'What it changes'],
  ['table', ['Agent', 'File', 'Change'], [
    ['Claude Code', '`~/.claude/settings.json`', 'Adds hooks, and wraps your statusline so it still prints as before'],
    ['Codex', '`~/.codex/hooks.json`', 'Adds hooks']
  ]],
  ['p', 'Each file is backed up before it is edited. The hooks run InfoPanel Studio\'s own Node, so you don\'t need Node installed. Turning the setting off removes exactly what was added.'],
  ['h', 'If sessions don\'t appear'],
  ['ul', ['Check the status chips in Settings › Coding agents. **Needs repair** means the hooks were changed or removed; press **Repair hooks**.', 'Sessions that were already running before you connected won\'t report until they restart.', 'The server must be running: agents post to it.']]
], related: ['problems', 'diagnostics'] },

import: { title: 'Importing a profile', icon: 'download', lede: 'Bring an existing InfoPanel profile into the studio without losing anything.', blocks: [
  ['h', 'The import flow'],
  ['flow', [['Source', 'File, folder, installed or saved'], ['Mode', 'Faithful, native or both'], ['Report', 'What converts and why'], ['Remap', 'Fix sensors'], ['Save', 'Into a canvas zone']]],
  ['h', '1. Source'],
  ['ul', ['An `.infopanel` file or an extracted folder.', 'A profile installed in InfoPanel on this PC (read-only).', 'A canvas you saved earlier (`.canvas.zip`).']],
  ['h', '2. Default mode'],
  ['table', ['Mode', 'Result'], [
    ['**Faithful**', 'Every item drawn exactly as InfoPanel draws it. The theme never touches it.'],
    ['**Native where possible**', 'Items become dashboard widgets (text, value, bar, gauge…) that follow your theme.'],
    ['**Both**', 'One canvas of each, side by side, to compare.']
  ]],
  ['p', 'This only sets the starting point. You can switch any item later, without loss.'],
  ['h', '3. Report'],
  ['p', 'Before committing, the report lists items per kind, how many go native and why the rest stay faithful, sensors by match status, assets (unused, duplicates, missing), fonts and gauges.'],
  ['h', '4. Remap and save'],
  ['p', 'Fix sensors that didn\'t match this PC (see [Sensor remap](remap)), then save. The profile becomes a new dashboard profile at the InfoPanel size, filled by a canvas zone. A canvas zone can also sit beside widgets in an existing profile.'],
  ['h', 'Exporting back'],
  ['p', '**Export .infopanel** writes a profile InfoPanel can open, with assets included. **Save stored form** writes a `.canvas.zip` that reopens with your modes, remaps, fonts and assets intact.']
], related: ['canvas', 'remap', 'assets'] },

canvas: { title: 'Editing a canvas', icon: 'draw', lede: 'A free-form editor over the imported profile. Every edit stays valid for export back to InfoPanel.', blocks: [
  ['h', 'Selecting and moving'],
  ['ul', [
    'Click an item on the canvas or in the item tree. `Shift` or `Ctrl` adds to the selection; `Shift` in the tree selects a range.',
    'Drag to move. Drag a handle to resize (one unrotated, unlocked, non-group item).',
    'Arrow keys nudge 1 px, `Shift`+arrow 10 px.',
    'Locked items can be selected but not moved.'
  ]],
  ['h', 'Item tree'],
  ['p', 'Groups nest. The checkbox on each row sets InfoPanel\'s Hidden flag.'],
  ['h', 'Faithful or native, per item'],
  ['p', 'Each item has a mode badge. In the inspector, **Draw as a dashboard widget** switches it, and lists what would be lost (for example *vertical gradient direction*) and what the widget needs. Switching back restores every original field.'],
  ['h', 'Sensor source'],
  ['table', ['Source', 'Shows'], [['Unbound', 'As InfoPanel with no sensors'], ['Live', 'Real values from the Data API'], ['Mock', 'A slider per item, to test ranges']]],
  ['h', 'Compare overlay'],
  ['p', 'Lay InfoPanel\'s own screenshot over the render, with an opacity slider and a difference blend, to check the match.'],
  ['keys', [['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'], ['Ctrl+D', 'Duplicate'], ['Ctrl+G', 'Group'], ['Ctrl+Shift+G', 'Ungroup'], ['Delete', 'Delete'], ['Arrows', 'Nudge 1 px'], ['Shift+Arrows', 'Nudge 10 px']]]
], related: ['import', 'remap', 'gauges'] },

remap: { title: 'Sensor remap', icon: 'swap_horiz', lede: 'Profiles from another PC read other hardware. Remap points them at yours.', blocks: [
  ['p', 'Bindings are grouped by the sensor they read, so one choice fixes every item that uses it. Click a group\'s item count to select those items on the canvas.'],
  ['h', 'Statuses'],
  ['table', ['Status', 'Means', 'Do'], [
    ['Matched', 'Found the same sensor here', 'Nothing'],
    ['Check', 'Matched by name, or one strong suggestion', 'Confirm one by one, or **Confirm all**'],
    ['Unresolved', 'No match', 'Pick a key'],
    ['Unbound', 'Left empty on purpose', 'Nothing']
  ]],
  ['h', 'How matches are found'],
  ['ol', ['Your own choice wins.', 'Then an automatic match: exact reference, plugin key, or HWiNFO name.', 'Then a suggestion, when exactly one sensor of the same type and hardware family stands out.']],
  ['p', 'Reset a group to go back to the automatic match. Reopen remap any time from the canvas zone.']
], related: ['import', 'sensors'] },

assets: { title: 'Assets and fonts', icon: 'perm_media', lede: 'Manage the images, videos and fonts an imported profile carries.', blocks: [
  ['h', 'Files'],
  ['p', 'Each file shows a preview, its real type and pixel size, byte size and how many items use it. URL and absolute-path images are listed separately.'],
  ['ul', ['**Add files** — duplicates are merged by content.', '**Use for selection** — assign to the selected items.', '**Replace…** — every use follows the new file.', '**Remove** — clears its uses.']],
  ['h', 'Cleanup'],
  ['p', 'Finds unused files, identical copies (merged), images larger than drawn, files over 1 MB and missing files. **Downscale** shrinks an image to its drawn size.'],
  ['h', 'Optimise images'],
  ['p', 'Re-encodes still images (same type or WebP) with a quality and size cap. A file is only replaced when it gets at least 5 % smaller. One undo step.'],
  ['h', 'Replace by name'],
  ['p', 'Pick a set of files; they are matched to the profile\'s files by name. You see matches, identical, unmatched and ambiguous before anything changes.'],
  ['h', 'Fonts'],
  ['p', 'For each font the profile asks for, see the face that will be drawn and where it came from. Add fonts (ttf, otf, ttc, zip) or get them from Fontsource or Font Squirrel. Each font shows its licence and whether it may be shared.'],
  ['warn', 'Before sharing an exported profile, check the fonts marked **check** or **do not share**.']
], related: ['import', 'canvas'] },

gauges: { title: 'Gauges', icon: 'speed', lede: 'Edit imported image gauges, or build vector gauges that need no frames.', blocks: [
  ['h', 'Image-sequence gauges'],
  ['p', 'Preview at any value with a slider or **play**. Retime frames, move, duplicate, reverse, resample or replace them, and recolour by hue, saturation and brightness.'],
  ['h', 'Vector gauges'],
  ['table', ['Part', 'Options'], [
    ['Shape', 'Arc, bar, liquid tank (round, rect, diamond, hexagon), grid of cells'],
    ['Fill', 'Solid, gradient, zones or thresholds; theme colours follow your dashboard'],
    ['Extras', 'Track, needle or marker, ticks and labels, value text, glow, rings, patterns, icons']
  ]],
  ['p', 'Start from a preset, or press **Convert to vector** on an imported gauge. Save gauges to your library to reuse them, and share them as `.gauge.json`.'],
  ['h', 'SVG templates'],
  ['p', 'Use your own SVG, driven by the `--value` and `--percent` variables. Animations are kept; files up to 256 KB.'],
  ['note', '**Bake** renders a vector gauge to PNG frames for InfoPanel. It is only needed when exporting, and warns when frames are out of date.']
], related: ['canvas', 'assets'] },

kiosk: { title: 'Kiosk and server', icon: 'dns', lede: 'The local server hosts your dashboard. InfoPanel shows it through the kiosk URL.', blocks: [
  ['h', 'The kiosk URL'],
  ['p', '`http://127.0.0.1:3922/?kiosk=1` by default. Copy it from Settings › Server and paste it into an InfoPanel web item that fills your display.'],
  ['open', 'Settings › Server', 'App Settings.dc.html', 'dns'],
  ['h', 'Starting and stopping'],
  ['p', 'Settings › Server has **Start**, **Stop** and **Restart**, and so does the tray menu. While stopped, the kiosk shows *can\'t connect*.'],
  ['h', 'Who can connect'],
  ['table', ['Option', 'Address', 'Use when'], [
    ['This computer only', '`127.0.0.1`', 'InfoPanel runs on this PC (most setups)'],
    ['Local network', '`0.0.0.0`', 'The display is driven by another device on your network']
  ]],
  ['warn', 'On Local network, anyone on your network can open the kiosk and the studio.'],
  ['h', 'Changing the port'],
  ['p', 'Pick a port from 1024 to 65535. Port, network and debug changes are saved right away but apply after a server restart; a bar at the top of Settings offers **Restart server**. Update the URL in InfoPanel to match.'],
  ['h', 'Crashes'],
  ['p', 'With **Restart automatically if it crashes** on, the server comes back up to 3 times a minute, then stays stopped and logs why.']
], related: ['startup', 'problems', 'diagnostics'] },

startup: { title: 'Startup and tray', icon: 'power_settings_new', lede: 'Keep the kiosk working after a reboot, without the studio in the way.', blocks: [
  ['table', ['Setting', 'Recommended for a kiosk', 'Why'], [
    ['Start at login', 'On', 'Starts in the tray after a reboot'],
    ['Start the server on launch', 'On', 'The kiosk works as soon as the app is up'],
    ['Open the studio on launch', 'Off', 'Starts quietly; open the studio from the tray'],
    ['Close to tray', 'On', 'Closing the window keeps the server running']
  ]],
  ['open', 'Settings › General', 'App Settings.dc.html', 'tune'],
  ['h', 'App zoom'],
  ['p', 'Scales the studio and Settings windows from 80 % to 150 %. It doesn\'t change the kiosk. `Ctrl +` and `Ctrl −` step through the sizes, `Ctrl 0` resets.']
], related: ['kiosk', 'updates'] },

updates: { title: 'Updates', icon: 'system_update', lede: 'Get new versions, and see what changed.', blocks: [
  ['p', 'Settings › Updates checks for a new version, downloads it and installs it on restart. Installing restarts the app and the kiosk server; the display is blank for about 10 seconds.'],
  ['table', ['Option', 'Effect'], [
    ['Release channel', '**Stable**, or **Beta** to get features a few weeks early'],
    ['Check at startup', 'Look for updates each time the app starts'],
    ['Download in the background', 'Download automatically; install on the next restart']
  ]],
  ['open', 'Settings › Updates', 'App Settings.dc.html', 'system_update'],
  ['p', 'The full changelog lives in Settings › Changelog, with every release and what was added, changed and fixed.']
], related: ['startup', 'kiosk'] },

problems: { title: 'Common problems', icon: 'build', lede: 'Quick fixes for the things that go wrong most.', blocks: [
  ['h', 'The display says it can\'t connect'],
  ['ol', ['Check the status pill in Settings: the server must be **running**.', 'Compare the port in the kiosk URL in InfoPanel with Settings › Server.', 'If you chose Local network and InfoPanel is on another device, allow InfoPanel Studio through Windows Firewall.']],
  ['h', 'The server won\'t start: port in use'],
  ['p', 'Another program holds the port. Settings › Server shows **Use 3923** (or the next free port); press it, then update the kiosk URL in InfoPanel.'],
  ['h', 'Widgets show dashes or zeros'],
  ['ul', ['InfoPanel must be running with its Data API enabled.', 'The sensor may have a new name after a driver or hardware change. Re-pick it in the widget\'s Data tab.', 'Plugin widgets (Spotify, Weather, Steam…) need that plugin enabled in InfoPanel.']],
  ['h', 'Edits don\'t show on the display'],
  ['ul', ['Look for a dot on the studio\'s **Save** button and press it.', 'Check the kiosk shows the profile you are editing; with Auto it picks the closest size.']],
  ['h', 'An imported profile looks different'],
  ['ul', ['Missing fonts are the usual cause. Open Assets › Fonts and add the missing families.', 'Items set to native follow your theme. Switch them back to Faithful to match InfoPanel exactly.']],
  ['h', 'Still stuck?'],
  ['p', 'Turn on debug mode, reproduce the problem, then use **Copy diagnostics summary** and attach it to an issue. See [Diagnostics and logs](diagnostics).']
], related: ['diagnostics', 'kiosk', 'sensors'] },

diagnostics: { title: 'Diagnostics and logs', icon: 'monitoring', lede: 'Find out what went wrong, and give a bug report everything it needs.', blocks: [
  ['h', 'Debug mode'],
  ['p', 'Logs every server request and samples memory every 30 seconds. Turn it on in Settings › Diagnostics and restart the server. Leave it off day to day: it writes a lot of log lines.'],
  ['open', 'Settings › Diagnostics', 'App Settings.dc.html', 'monitoring'],
  ['h', 'Reading the samples'],
  ['p', 'Series are grouped by where they come from: `app`, `server`, `sidecar` (sensor reader), `studio` and `webview`. A series is **flagged** (amber) when it rose in at least 80 % of samples over the last hour and by more than 20 %. A flag after a few minutes means little; one after an hour points to a leak.'],
  ['h', 'Logs'],
  ['p', 'Settings › Logs streams the Server, Studio and Sensor sidecar output. Filter by level (errors, warnings, info, debug) or by text. **Follow new lines** keeps the newest line in view; scrolling up pauses it.'],
  ['h', 'Reporting a problem'],
  ['ol', ['Turn on debug mode and restart the server.', 'Reproduce the problem and leave it running for a while if it is a slowdown.', 'Press **Copy diagnostics summary**, and **Copy system info** in About.', 'Use **Report an issue** in About and paste both.']]
], related: ['problems', 'kiosk'] },

shortcuts: { title: 'Keyboard shortcuts', icon: 'keyboard', lede: 'Shortcuts never fire while you are typing in a field.', blocks: [
  ['h', 'Everywhere'],
  ['keys', [['Ctrl+Z', 'Undo'], ['Ctrl+Y', 'Redo'], ['Ctrl+S', 'Push changes to the server now'], ['Ctrl+K', 'Search (Settings and Help)'], ['Ctrl +', 'Zoom in'], ['Ctrl −', 'Zoom out'], ['Ctrl 0', 'Reset zoom']]],
  ['h', 'Studio'],
  ['keys', [['Ctrl+\\', 'Collapse or expand the bottom dock'], ['Ctrl+Enter', 'Apply panel JSON in Code mode'], ['Delete', 'Remove the selected zone']]],
  ['h', 'Canvas zones'],
  ['keys', [['Ctrl+D', 'Duplicate'], ['Ctrl+G', 'Group'], ['Ctrl+Shift+G', 'Ungroup'], ['Arrows', 'Nudge 1 px'], ['Shift+Arrows', 'Nudge 10 px'], ['Shift+Click', 'Add to selection'], ['Ctrl+Click', 'Add to selection']]]
], related: ['studio', 'canvas'] },

glossary: { title: 'Glossary', icon: 'menu_book', lede: 'The words this app uses, in one place.', blocks: [
  ['table', ['Term', 'Meaning'], [
    ['Canvas zone', 'A zone holding an imported InfoPanel profile, drawn faithfully or as native widgets'],
    ['Data API', 'InfoPanel\'s sensor feed, on port 3921 by default'],
    ['Faithful', 'Drawn exactly as InfoPanel draws it; ignores the theme'],
    ['Follow theme', 'A widget section that takes its values from the theme'],
    ['Kiosk', 'The full-screen page InfoPanel shows on your display'],
    ['Lock', 'A profile theme section every widget must follow'],
    ['Native', 'Drawn as a dashboard widget that follows the theme'],
    ['Panel', 'A zone composed of panel widgets in a Stack, Grid or Overlay'],
    ['Profile', 'A page for one display size, with its own grid'],
    ['Sidecar', 'The helper process that reads hardware sensors'],
    ['Small zones', 'What a widget does in a small zone: auto, full, card or dense'],
    ['Zone', 'A box on the profile grid']
  ]]
], related: ['concepts'] }

}};
