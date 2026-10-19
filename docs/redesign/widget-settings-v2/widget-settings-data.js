// Widget settings v2: taxonomy, theme defaults, sample widgets, panel kinds.
const R = (key, label, type, o = {}) => ({ key, label, type, ...o });
const S = (key, label, opts, def, o = {}) => R(key, label, 'seg', { opts, def, ...o });
const T = (key, label, def, o = {}) => R(key, label, 'toggle', { def, ...o });
const H = (h) => [0, 4, 8, 12, 16, 20, 24, 32, 48].map((v) => [String(v), v + ' px']);

export const HUES = [255, 295, 190, 150, 75, 15].map((h) => `oklch(0.72 0.15 ${h})`);
export const COLOR_NAMES = { 'oklch(0.72 0.15 255)': 'Blue', 'oklch(0.72 0.15 295)': 'Violet', 'oklch(0.72 0.15 190)': 'Teal', 'oklch(0.72 0.15 150)': 'Green', 'oklch(0.72 0.15 75)': 'Amber', 'oklch(0.72 0.15 15)': 'Red', '#f4f4f5': 'White', 'oklch(0.78 0.15 75)': 'Amber', 'oklch(0.68 0.19 25)': 'Red', 'oklch(0.74 0.16 150)': 'Green' };

const SKINS = [['auto', 'Auto'], ['default', 'Default'], ['tui', 'TUI'], ['macos', 'macOS'], ['fluent', 'Fluent'], ['hud', 'HUD'], ['ink', 'Ink'], ['retro', 'Retro'], ['ios', 'iOS'], ['android', 'Android'], ['synth', 'Synth'], ['brutal', 'Brutal'], ['cyber', 'Cyber'], ['nixie', 'Nixie'], ['instrument', 'Instrument']];
const GRAPHS = [['auto', 'Skin'], ['area', 'Area'], ['line', 'Line'], ['step', 'Step'], ['bars', 'Bars'], ['dots', 'Dots'], ['braille', 'Braille']];
const METERS = [['auto', 'Skin'], ['bar', 'Bar'], ['pill', 'Pill'], ['segments', 'Segments'], ['blocks', 'Blocks'], ['hair', 'Hair'], ['wave', 'Wave'], ['square', 'Square']];
const SURFACES = [['auto', 'Skin card'], ['glass', 'Glass'], ['matte-dark', 'Matte dark'], ['matte-light', 'Matte light'], ['theme', 'Theme'], ['solid', 'Solid'], ['outline', 'Outline'], ['flat', 'Flat'], ['tinted', 'Tinted'], ['carbon', 'Carbon'], ['inset', 'Inset'], ['terminal', 'Terminal']];
const FONTS = [['auto', 'Skin font'], ['geist', 'Geist'], ['geist-mono', 'Geist Mono'], ['space-grotesk', 'Space Grotesk'], ['instrument-serif', 'Instrument Serif'], ['jetbrains-mono', 'JetBrains Mono'], ['orbitron', 'Orbitron'], ['inter', 'Inter'], ['manrope', 'Manrope'], ['ibm-plex-sans', 'IBM Plex Sans'], ['vt323', 'VT323']];
const WEIGHTS = [['auto', 'Auto'], ['400', 'Regular'], ['500', 'Medium'], ['600', 'Semibold'], ['700', 'Bold'], ['800', 'Heavy']];
const PRESETS = [['default', 'None'], ['dark', 'Dark'], ['light', 'Light'], ['vivid', 'Vivid'], ['mono', 'Mono']];

// Style tab: every followable section. `palette` (widget colours) is inserted after Colors per widget.
export const STYLE = [
  { id: 'skin', title: 'Skin & graphics', icon: 'palette', follow: true, rows: [
    R('skin', 'Skin', 'select', { opts: SKINS }),
    R('stroke', 'Ring / bar thickness', 'slider', { min: 50, max: 250, step: 10, unit: '%' }),
    R('graph', 'Graph style', 'select', { opts: GRAPHS, more: true }),
    R('meter', 'Meter style', 'select', { opts: METERS, more: true, hint: 'Skin meters only. Audio meters have their own style under Show.' })] },
  { id: 'colors', title: 'Colors', icon: 'format_color_fill', follow: true, rows: [
    R('accent', 'Accent', 'color'),
    R('textColor', 'Text', 'color'),
    R('mutedColor', 'Secondary text', 'color'),
    R('preset', 'Quick preset', 'select', { opts: PRESETS, more: true, hint: 'Writes surface, accent and tint once. Not stored.' })] },
  { id: 'surface', title: 'Surface', icon: 'layers', follow: true, rows: [
    R('surface', 'Material', 'select', { opts: SURFACES }),
    R('surfaceOpacity', 'Opacity', 'slider', { min: 0, max: 100, step: 5, unit: '%' }),
    R('blur', 'Backdrop blur', 'select', { opts: [['auto', 'Auto'], ['0', '0 px'], ['4', '4 px'], ['8', '8 px'], ['16', '16 px'], ['24', '24 px'], ['40', '40 px']] }),
    R('background', 'Background image', 'text', { more: true, placeholder: 'Image URL', perWidget: true }),
    T('backgroundOn', 'Use as background', false, { more: true, perWidget: true })] },
  { id: 'type', title: 'Typography', icon: 'text_fields', follow: true, rows: [
    R('font', 'Font', 'select', { opts: FONTS }),
    R('fontWeight', 'Value weight', 'select', { opts: WEIGHTS }),
    S('labelCase', 'Label case', [['auto', 'Auto'], ['uppercase', 'ABC'], ['none', 'Abc'], ['capitalize', 'Title']])] },
  { id: 'spacing', title: 'Size & spacing', icon: 'padding', follow: true, rows: [
    R('scale', 'Size', 'slider', { min: 50, max: 200, step: 5, unit: '%' }),
    R('align', 'Alignment', 'align'),
    R('padding', 'Inner padding', 'select', { opts: [['auto', 'Auto'], ...H()] }),
    R('gap', 'Gap between items', 'select', { opts: [['auto', 'Auto'], ...H()] }),
    R('radius', 'Corner radius', 'select', { opts: [['auto', 'Auto'], ['0', '0 px'], ['4', '4 px'], ['8', '8 px'], ['12', '12 px'], ['16', '16 px'], ['20', '20 px'], ['28', '28 px'], ['999', 'Pill']] })] },
  { id: 'border', title: 'Border & glow', icon: 'border_style', follow: true, rows: [
    R('borderWidth', 'Border width', 'select', { opts: [['auto', 'Auto'], ['0', '0 px'], ['1', '1 px'], ['2', '2 px'], ['3', '3 px'], ['4', '4 px'], ['6', '6 px']] }),
    R('borderColor', 'Border color', 'color'),
    S('glow', 'Edge glow', [['none', 'None'], ['soft', 'Soft'], ['strong', 'Strong']]),
    R('glowColor', 'Glow color', 'color', { if: (v) => v('glow') !== 'none' })] },
  { id: 'css', title: 'Custom CSS', icon: 'code', follow: true, rows: [
    R('customCss', 'CSS (:scope = widget root)', 'code', { more: true })] },
];

export const FORMAT_ROWS = {
  tempUnit: S('tempUnit', 'Temperature', [['c', '°C'], ['f', '°F']]),
  rateUnit: R('rateUnit', 'Speed units', 'select', { opts: [['auto', 'Auto'], ['MB/s', 'MB/s'], ['Mb/s', 'Mb/s'], ['KB/s', 'KB/s'], ['Kb/s', 'Kb/s']] }),
  decimals: S('decimals', 'Decimals', [['auto', 'Auto'], ['0', '0'], ['1', '1'], ['2', '2']]),
  clock: S('clock', 'Clock', [['24', '24 h'], ['12', '12 h']]),
};
export const QUANTITIES = {
  load: { label: 'Load', unit: '%', min: 0, max: 100, step: 5 },
  temp: { label: 'Temperature', unit: '°C', min: 30, max: 110, step: 5 },
  full: { label: 'Fullness', unit: '%', min: 0, max: 100, step: 5 },
  db: { label: 'Audio level', unit: 'dB', min: -40, max: 0, step: 1 },
  value: { label: 'Value', unit: 'unit', min: 0, max: 100, step: 5 },
};
export const MOTION_ROWS = {
  smoothing: S('smoothing', 'Graph updates', [['stepped', 'Stepped'], ['smooth', 'Smooth']], undefined, { hint: 'Reduced motion keeps them stepped.' }),
  meterBallistics: S('meterBallistics', 'Meter response', [['peak', 'Peak'], ['vu', 'VU'], ['instant', 'Instant']]),
};
export const PALETTE_ROLES = [['s1', 'Series 1'], ['s2', 'Series 2'], ['s3', 'Series 3'], ['s4', 'Series 4'], ['s5', 'Series 5'], ['s6', 'Series 6'], ['ok', 'OK'], ['warn', 'Warning'], ['crit', 'Critical']];

export const THEME_DEFAULTS = {
  skin: 'default', stroke: 100, graph: 'auto', meter: 'auto',
  accent: 'oklch(0.72 0.15 255)', textColor: '', mutedColor: '', preset: 'default',
  surface: 'glass', surfaceOpacity: 100, blur: 'auto', background: '', backgroundOn: false,
  font: 'auto', fontWeight: 'auto', labelCase: 'auto',
  scale: 100, align: 'mc', padding: 'auto', gap: 'auto', radius: '12',
  borderWidth: 'auto', borderColor: '', glow: 'none', glowColor: '', customCss: '',
  tempUnit: 'c', rateUnit: 'auto', decimals: 'auto', clock: '24',
  'warn.load': 80, 'crit.load': 92, 'warn.temp': 80, 'crit.temp': 90, 'warn.full': 85, 'crit.full': 95, 'warn.db': -9, 'crit.db': -2, 'warn.value': 70, 'crit.value': 90,
  smoothing: 'smooth', meterBallistics: 'peak',
  s1: 'oklch(0.72 0.15 255)', s2: 'oklch(0.72 0.15 295)', s3: 'oklch(0.72 0.15 190)', s4: 'oklch(0.72 0.15 150)', s5: 'oklch(0.72 0.15 75)', s6: 'oklch(0.72 0.15 15)',
  ok: 'oklch(0.74 0.16 150)', warn: 'oklch(0.78 0.15 75)', crit: 'oklch(0.68 0.19 25)',
};
export const DASH_SEED = { accent: 'oklch(0.72 0.15 295)', skin: 'default' };

export const DEVICES = {
  cpu: { auto: 'First detected processor', list: [['amd_7950x', 'AMD Ryzen 9 7950X', '34 %']] },
  audio: { auto: 'Loudest live device', list: [['speakers', 'Speakers (Realtek)', '−18 dB'], ['stream', 'Wave Link · Stream Mix', '−12 dB'], ['mic', 'Headset microphone', '−41 dB']] },
};
export const SENSORS = [
  ['libre.amd_7950x.temperature.package', 'CPU package', '61 °C'],
  ['libre.gpu_4080.temperature.hotspot', 'GPU hotspot', '74 °C'],
  ['libre.nct6799.fan.cpu', 'CPU fan', '1180 RPM'],
  ['libre.gpu_4080.power.total', 'GPU power', '212 W'],
];

const header = T('showTitle', 'Show title', true);
const title = R('label', 'Title', 'text', { placeholder: 'Widget name', if: (v) => v('showTitle') !== false });
const icon = R('icon', 'Icon', 'text', { placeholder: 'Material Symbols name', more: true });
export function headerSection(mode) {
  if (mode === 'none') return null;
  if (mode === 'title-only') return { id: 'header', title: 'Header', icon: 'title', rows: [R('label', 'Title', 'text', { placeholder: 'Empty = no header', hint: 'This widget draws a header only when a title is set.' }), icon] };
  return { id: 'header', title: 'Header', icon: 'title', rows: [header, title, icon] };
}
export function fitSection(w) {
  const c = w.compact;
  const opts = [['auto', 'Auto'], ['full', 'Full'], ...(c.card ? [['card', 'Card']] : []), ...(c.dense ? [['dense', 'Dense']] : [])];
  const rows = [];
  if (opts.length > 2) rows.push(S('compact', 'Small zones', opts, 'auto', { hint: c.card ? 'Auto: 1×1, one-row and one-column zones show the summary card.' : 'No summary card for this widget; Auto keeps the full layout.' }));
  rows.push(S('sizeTier', 'Density', [['auto', 'Auto'], ['lg', 'Roomy'], ['md', 'Standard'], ['sm', 'Compact'], ['xs', 'Minimal']], 'auto', { more: rows.length > 0, hint: 'Auto picks from the zone size.' }));
  return { id: 'fit', title: 'Fit', icon: 'aspect_ratio', rows };
}

const thr = (q) => ({ q });
export const WIDGETS = [
  {
    id: 'SystemOverview', name: 'System Overview', icon: 'dashboard', cat: 'System', header: 'title-only', compact: { card: false, dense: true },
    today: { rows: 74, cats: 15 }, probe: { label: 'CPU load', value: 63, unit: '%', q: 'load', pct: 63 },
    show: [
      { id: 'sections', title: 'Sections', icon: 'view_agenda', rows: [
        R('sections', 'Show', 'chips', { opts: [['cpu', 'CPU'], ['gpu', 'GPU'], ['ram', 'RAM'], ['vram', 'VRAM'], ['disk', 'Disks'], ['net', 'Network']], def: 'cpu,gpu,ram', hint: 'Order follows the click order.' }),
        S('details', 'Detail level', [['auto', 'Auto'], ['min', 'Minimal'], ['full', 'Full']], 'auto'),
        S('ring', 'Load rings', [['ring', 'Rings'], ['none', 'None']], 'ring'),
        T('showNames', 'Hardware names', true), T('showTemps', 'Temperatures', true), T('showPower', 'Power draw', true)] },
      { id: 'cpu', title: 'CPU', icon: 'memory', if: (v) => has(v('sections'), 'cpu'), rows: [
        S('coreView', 'Threads', [['heatmap', 'Heatmap'], ['bars', 'Bars'], ['off', 'Off']], 'heatmap'),
        R('cpuLabel', 'Label', 'text', { placeholder: 'CPU', more: true })] },
      { id: 'gpu', title: 'GPU', icon: 'developer_board', if: (v) => has(v('sections'), 'gpu'), rows: [
        T('showClock', 'Core clock', true), T('showHotspot', 'Hotspot', true), T('showFans', 'Fans', true),
        T('showMemClock', 'Memory clock', true, { more: true }), T('showPowerLimit', 'Power (% of limit)', true, { more: true }), R('gpuLabel', 'Label', 'text', { placeholder: 'GPU', more: true })] },
      { id: 'ram', title: 'Memory', icon: 'memory_alt', if: (v) => has(v('sections'), 'ram'), rows: [
        T('showMemory', 'Used / total', true), T('showPageFile', 'Page file', true), R('ramLabel', 'Label', 'text', { placeholder: 'RAM', more: true })] },
      { id: 'disk', title: 'Drives', icon: 'hard_drive', if: (v) => has(v('sections'), 'disk'), rows: [
        T('showDiskTemp', 'Temperature', true), T('showDiskIo', 'Read / write rate', true), T('showDiskLife', 'Life remaining', true), R('diskLabel', 'Label', 'text', { placeholder: 'Disks', more: true })] },
    ],
    palette: [
      T('unifiedColor', 'One accent for every section', false, { perWidget: true }),
      R('cpuColor', 'CPU', 'color', { role: 's1', if: (v) => !v('unifiedColor') && has(v('sections'), 'cpu') }),
      R('gpuColor', 'GPU', 'color', { role: 's2', if: (v) => !v('unifiedColor') && has(v('sections'), 'gpu') }),
      R('ramColor', 'RAM', 'color', { role: 's3', if: (v) => !v('unifiedColor') && has(v('sections'), 'ram') }),
      R('vramColor', 'VRAM', 'color', { role: 's4', if: (v) => !v('unifiedColor') && has(v('sections'), 'vram') }),
      R('diskColor', 'Disks', 'color', { role: 's5', if: (v) => !v('unifiedColor') && has(v('sections'), 'disk') }),
      R('netColor', 'Network', 'color', { role: 's6', if: (v) => !v('unifiedColor') && has(v('sections'), 'net') }),
      S('heatRamp', 'Thread heat ramp', [['accent', 'Accent'], ['thermal', 'Thermal']], 'accent', { more: true, perWidget: true })],
    data: [{ id: 'drives', title: 'Drives', icon: 'hard_drive', if: (v) => has(v('sections'), 'disk'), rows: [R('diskFilter', 'Drives to show', 'text', { placeholder: 'Names, comma-separated · empty = all' })] }],
    fmt: ['tempUnit', 'decimals'], thr: [thr('load'), thr('temp'), thr('full')], motion: ['smoothing'],
    behave: [{ id: 'trends', title: 'Trends', icon: 'show_chart', rows: [T('sparkline', 'Trend sparklines', true), R('historyLength', 'Length', 'slider', { min: 12, max: 120, step: 12, unit: 'samples', def: 60, if: (v) => v('sparkline') !== false })] }],
    notes: ['40 rows in 6 groups become 5 Show sections that appear only for the chosen Sections.', 'Device colours follow the theme series palette by default (Series 1–6).', 'Load / temperature / fullness thresholds follow the theme; the hidden 80/95 adapter fallback is gone.', 'Header: there is no Show title toggle, because a header appears only when a title is set.', 'No Card option under Small zones: this widget has no summary card.'],
  },
  {
    id: 'NowPlaying', name: 'Now Playing', icon: 'music_note', cat: 'Media', header: 'yes', compact: { card: true, dense: true },
    today: { rows: 73, cats: 16 }, probe: { label: 'Now playing', text: 'Midnight City', sub: 'M83', pct: 42 },
    show: [
      { id: 'player', title: 'Player', icon: 'album', rows: [
        S('playerLayout', 'Layout', [['card', 'Card'], ['vinyl', 'Vinyl'], ['backdrop', 'Backdrop'], ['wave', 'Wave']], 'card'),
        T('showArt', 'Cover art', true, { if: (v) => ['card', 'wave'].includes(v('playerLayout')) }),
        T('showProgress', 'Progress', true),
        S('progress', 'Progress style', [['bar', 'Bar'], ['wave', 'Wavy'], ['visualizer', 'Visualizer']], 'bar', { if: (v) => v('showProgress') !== false }),
        T('showTimes', 'Times', true)] },
      { id: 'viz', title: 'Visualizer', icon: 'graphic_eq', if: (v) => v('progress') === 'visualizer', rows: [
        R('vizStyle', 'Style', 'select', { opts: [['bars', 'Bars'], ['mirror', 'Mirror'], ['wave', 'Wave'], ['line', 'Line'], ['dots', 'Dots'], ['radial', 'Radial'], ['blob', 'Blob'], ['scroll', 'Scroll']], def: 'bars' }),
        R('vizBars', 'Bar count', 'slider', { min: 4, max: 64, step: 2, def: 24 }),
        S('vizAlign', 'Alignment', [['center', 'Center'], ['start', 'Start'], ['end', 'End']], 'center'),
        T('showTimeline', 'Timeline under it', true), T('vizPeaks', 'Peak caps', false),
        S('vizShape', 'Bar shape', [['auto', 'Skin'], ['round', 'Round'], ['square', 'Square'], ['pill', 'Pill']], 'auto', { more: true }),
        R('vizGap', 'Bar gap', 'slider', { min: 0, max: 80, step: 5, unit: '%', def: 30, more: true }),
        S('vizOrientation', 'Orientation', [['horizontal', 'Horizontal'], ['vertical', 'Vertical']], 'horizontal', { more: true }),
        R('vizMinLevel', 'Resting bar size', 'slider', { min: 0, max: 0.5, step: 0.02, def: 0.08, more: true }),
        R('vizLine', 'Line width', 'slider', { min: 0.5, max: 6, step: 0.5, unit: 'px', def: 1.5, more: true }),
        T('vizFade', 'Edge fade', true, { more: true })] },
    ],
    palette: [
      T('tint', 'Tint from cover art', false, { perWidget: true }),
      T('artBackground', 'Blurred cover behind', false, { perWidget: true }),
      S('vizColorMode', 'Visualizer colors', [['follow', 'Accent'], ['solid', 'Solid'], ['gradient', 'Gradient'], ['ramp', 'Ramp']], 'follow', { perWidget: true, if: (v) => v('progress') === 'visualizer' }),
      R('vizColor1', 'Color 1', 'color', { role: 's1', if: (v) => v('progress') === 'visualizer' && v('vizColorMode') !== 'follow' }),
      R('vizColor2', 'Color 2', 'color', { role: 's2', if: (v) => v('progress') === 'visualizer' && ['gradient', 'ramp'].includes(v('vizColorMode')) }),
      R('vizPeakColor', 'Peak cap', 'color', { role: 'crit', more: true, if: (v) => v('progress') === 'visualizer' }),
      R('vizOpacity', 'Visualizer opacity', 'slider', { min: 10, max: 100, step: 5, unit: '%', def: 100, more: true, perWidget: true, if: (v) => v('progress') === 'visualizer' })],
    data: [
      { id: 'source', title: 'Player source', icon: 'input', rows: [S('source', 'Source', [['auto', 'Auto'], ['media', 'Windows'], ['spotify', 'Spotify'], ['pushed', 'Pushed']], 'auto', { hint: 'Auto: Spotify when connected, else Windows Media.' })] },
      { id: 'vizsrc', title: 'Visualizer audio', icon: 'speaker', if: (v) => v('progress') === 'visualizer', rows: [
        R('device', 'Device', 'device', { kind: 'audio' }),
        T('liveCapture', 'Live capture (Web Audio)', false, { more: true, hint: 'Needs the profile set to Interactive once, then Allow.' })] },
    ],
    fmt: [], thr: [], motion: ['smoothing'],
    behave: [
      { id: 'dynamics', title: 'Visualizer dynamics', icon: 'equalizer', if: (v) => v('progress') === 'visualizer', rows: [
        R('vizGain', 'Sensitivity', 'slider', { min: 0.1, max: 4, step: 0.1, def: 1, unit: '×' }), T('vizAutoGain', 'Auto gain', true),
        R('vizFloorDb', 'Floor', 'slider', { min: -90, max: -30, step: 1, unit: 'dB', def: -60, more: true }), R('vizCeilDb', 'Ceiling', 'slider', { min: -30, max: 0, step: 1, unit: 'dB', def: -12, more: true }),
        R('vizAttack', 'Attack', 'slider', { min: 10, max: 500, step: 10, unit: 'ms', def: 60, more: true }), R('vizRelease', 'Release', 'slider', { min: 50, max: 2000, step: 50, unit: 'ms', def: 300, more: true })] },
      { id: 'island', title: 'Dynamic Island', icon: 'pill', rows: [T('island', 'Send to island', false, { hint: 'The playing track beside the time; a new track opens it briefly.' })] },
    ],
    notes: ['The 16 visualizer rows appear only when Progress style is Visualizer, split by task: shape in Show, colours in Style, device in Data, dynamics in Behaviour.', 'Legacy keys waveformVariant / liveSource / vizRamp become vizStyle / device / vizColor1 (migration).', '19 advanced rows become per-section More: 6 in Visualizer, 4 in dynamics.', 'Island toggle moves to Behaviour > Dynamic Island, same as every widget.'],
  },
  {
    id: 'SensorGroup', name: 'Sensor Group', icon: 'view_list', cat: 'Generic', header: 'yes', compact: { card: true, dense: true },
    today: { rows: 47, cats: 13 }, probe: { label: 'CPU package', value: 61, unit: '°', q: 'temp', pct: 61, isTemp: true },
    show: [{ id: 'readings', title: 'Readings', icon: 'list', rows: [
      S('mode', 'Readings', [['pick', 'Pick sensors'], ['auto', 'Auto-discover']], 'pick'),
      S('groupLayout', 'Layout', [['auto', 'Auto'], ['rows', 'Rows'], ['grid', 'Grid']], 'auto', { if: (v) => v('mode') !== 'auto' }),
      T('bars', 'Bar per item', true, { if: (v) => v('mode') !== 'auto' }),
      R('maxRows', 'Max rows', 'slider', { min: 0, max: 100, step: 2, def: 12, zero: 'All', if: (v) => v('mode') === 'auto' })] }],
    palette: [
      R('tempColor', 'Temperature dot', 'color', { role: 'crit', if: (v) => v('mode') === 'auto' }),
      R('fanColor', 'Fan dot', 'color', { role: 's3', if: (v) => v('mode') === 'auto' }),
      R('powerColor', 'Power dot', 'color', { role: 's5', if: (v) => v('mode') === 'auto' })],
    data: [{ id: 'sensors', title: 'Sensors', icon: 'sensors', if: (v) => v('mode') !== 'auto', rows: [R('sensors', 'Sensors', 'sensors', { hint: 'Empty = CPU, GPU, memory and volume. Tune a row to override its label or thresholds.' })] },
      { id: 'scale', title: 'Bar scale', icon: 'straighten', if: (v) => v('mode') !== 'auto', rows: [R('groupMax', 'Bar maximum', 'slider', { min: 0, max: 500, step: 10, def: 0, zero: 'Auto', hint: 'Auto: 100 for % and °, else no bar.' })] }],
    fmt: ['tempUnit', 'decimals'], thr: [thr('value')], motion: ['smoothing'], behave: [],
    notes: ['Auto-discover becomes a mode switch, so pick-mode and auto-mode rows never show together.', 'groupDecimals (text, blank = auto) becomes the shared Decimals control in Units & format.', 'groupWarn / groupCrit become the shared Thresholds control; per-sensor overrides sit on each sensor row.', 'Dot colours follow the theme palette (Critical, Series 3, Series 5).'],
  },
  {
    id: 'AudioMeter', name: 'Audio Meter', icon: 'graphic_eq', cat: 'Audio', header: 'yes', compact: { card: true, dense: true },
    today: { rows: 46, cats: 12 }, probe: { label: 'Speakers', value: -9, unit: 'dB', q: 'db', pct: 72 },
    show: [
      { id: 'meter', title: 'Meter', icon: 'equalizer', rows: [
        S('mode', 'Mode', [['single', 'One device'], ['bridge', 'All devices']], 'single'),
        R('meterStyle', 'Meter style', 'select', { opts: [['led', 'LED'], ['bar', 'Bar'], ['solid', 'Solid'], ['vu', 'VU'], ['ring', 'Ring'], ['mirror', 'Mirror'], ['wave', 'Wave']], def: 'led', if: (v) => v('mode') !== 'bridge' }),
        R('segments', 'Segments', 'slider', { min: 0, max: 64, step: 1, def: 0, zero: 'Auto', if: (v) => v('mode') !== 'bridge' && v('meterStyle') === 'led' }),
        S('orientation', 'Bridge layout', [['vertical', 'Columns'], ['horizontal', 'Rows']], 'vertical', { if: (v) => v('mode') === 'bridge' })] },
      { id: 'details', title: 'Details', icon: 'info', rows: [T('showDevice', 'Device name', true), T('showDetails', 'Peak / RMS, L/R', true), T('showVolume', 'Volume bar', false), T('showMute', 'Mute indicator', true)] },
    ],
    palette: [R('levelColor', 'Level', 'color', { role: 'ok' }), R('hotColor', 'Hot level', 'color', { role: 'crit' })],
    data: [{ id: 'device', title: 'Device', icon: 'speaker', if: (v) => v('mode') !== 'bridge', rows: [R('device', 'Device', 'device', { kind: 'audio' })] }],
    fmt: [], thr: [thr('db')], motion: ['smoothing', 'meterBallistics'], behave: [],
    notes: ['Level and hot colours move from the Content tab (advanced) to Style > Widget colors and follow the theme OK / Critical roles.', '"Hot" becomes a real threshold (Audio level dB) shared with Meter Bridge and Wave Link.', 'Meter response sits with Graph updates in Behaviour > Motion, and can follow the theme.', 'Meter style keeps its own name here; the skin meter row lives in Style > Skin & graphics (More).'],
  },
  {
    id: 'Weather', name: 'Weather', icon: 'partly_cloudy_day', cat: 'Info', header: 'yes', compact: { card: true, dense: 'fallback' },
    today: { rows: 44, cats: 13 }, probe: { label: 'Oslo', value: 14, unit: '°', isTemp: true },
    show: [
      { id: 'display', title: 'Display', icon: 'wb_sunny', rows: [
        R('view', 'Preset', 'preset', { opts: [['full', 'Full'], ['now', 'Now'], ['forecast', 'Forecast'], ['minimal', 'Minimal']], bundles: { full: { showForecast: true, showStats: true, showFeels: true }, now: { showForecast: false, showStats: true, showFeels: true }, forecast: { showForecast: true, showStats: false, showFeels: false }, minimal: { showForecast: false, showStats: false, showFeels: false } }, hint: 'Sets the three toggles below. Change one and the preset reads Custom.' }),
        T('showStats', 'Stats row', true), T('showFeels', 'Feels-like', true), T('showForecast', 'Forecast strip', true),
        R('forecastDays', 'Forecast days', 'slider', { min: 1, max: 7, step: 1, def: 5, if: (v) => v('showForecast') !== false })] },
    ],
    palette: [T('tint', 'Tint from conditions', true, { perWidget: true })],
    data: [{ id: 'source', title: 'Source', icon: 'cloud', rows: [
      S('provider', 'Provider', [['auto', 'Auto'], ['yr', 'Yr'], ['owm', 'OpenWeatherMap']], 'auto'),
      R('location', 'Location', 'select', { opts: [['', 'First Yr location'], ['oslo', 'Oslo'], ['bergen', 'Bergen']], def: '', if: (v) => v('provider') !== 'owm' })] }],
    fmt: ['tempUnit'], thr: [], motion: ['smoothing'],
    behave: [{ id: 'island', title: 'Dynamic Island', icon: 'pill', rows: [T('island', 'Send to island', false, { hint: 'Rain or snow starting (Yr).' })] }],
    notes: ['units (C/F, per widget) becomes tempUnit and follows the theme: set it once per profile.', 'The View preset no longer hides its effect: it sets the toggles in place and shows Custom when they diverge.', 'Tint from conditions moves to Style > Widget colors.', 'Dense: falls back to the summary card (no studio descriptor), so Small zones offers Card and Dense.'],
  },
  {
    id: 'CpuMonitor', name: 'CPU Monitor', icon: 'memory', cat: 'Hardware', header: 'yes', compact: { card: true, dense: 'fallback' },
    today: { rows: 40, cats: 11 }, probe: { label: 'Load', value: 86, unit: '%', q: 'load', pct: 86 },
    show: [{ id: 'threads', title: 'Threads', icon: 'grid_view', rows: [
      S('coreView', 'Threads', [['bars', 'Bars'], ['heatmap', 'Heatmap'], ['off', 'Off']], 'bars'),
      S('coreMetric', 'Metric', [['load', 'Load'], ['clock', 'Clock']], 'load', { if: (v) => v('coreView') !== 'off' })] }],
    palette: [S('heatRamp', 'Heatmap ramp', [['accent', 'Accent'], ['thermal', 'Thermal']], 'accent', { perWidget: true, if: (v) => v('coreView') === 'heatmap' })],
    data: [{ id: 'device', title: 'Processor', icon: 'memory', rows: [R('device', 'Processor', 'device', { kind: 'cpu' })] }],
    fmt: ['tempUnit', 'decimals'], thr: [thr('load')], motion: ['smoothing'], behave: [],
    notes: ['warn / crit (75 / 90 here, 80 / 92 elsewhere) become one Load threshold that follows the theme.', 'cpu (device select) becomes the shared device picker, which shows what Auto picks right now.', 'Threads view keeps bars as the default; SystemOverview keeps heatmap. Labels now match ("Threads").'],
  },
  {
    id: 'Uptime', name: 'Uptime', icon: 'timer', cat: 'System', header: 'yes', compact: { card: true, dense: 'fallback' },
    today: { rows: 35, cats: 9 }, probe: { label: 'Since boot', text: '3d 04:12', sub: '', secs: true },
    show: [{ id: 'uptime', title: 'Time', icon: 'schedule', rows: [T('showSeconds', 'Seconds', true)] }],
    palette: [], data: [], fmt: [], thr: [], motion: ['smoothing'], behave: [],
    notes: ['The one own row joins Show instead of a one-row "Uptime" category.', 'Data tab is empty and shown disabled: nothing to pick.', 'Show seconds is labelled "Seconds" like Clock.'],
  },
  {
    id: 'SteamProfile', name: 'Steam Profile', icon: 'account_circle', cat: 'Gaming', header: 'yes', compact: { card: true, dense: 'fallback' },
    today: { rows: 34, cats: 8 }, probe: { label: 'gabe_n', text: 'Online', sub: 'Level 42 · 7 friends in game' },
    show: [], palette: [], data: [{ id: 'account', title: 'Account', icon: 'link', rows: [R('_acct', 'Steam API', 'info', { text: 'Connected · SteamAPI-Profile, SteamAPI-Social' })] }],
    fmt: [], thr: [], motion: ['smoothing'], behave: [],
    notes: ['No own settings: Show has only Header and Fit, the rest is theme.', 'Data shows where the data comes from, read-only, so the tab is not empty.'],
  },
  {
    id: 'WebPage', name: 'Web Page', icon: 'language', cat: 'Generic', header: 'none', compact: { card: false, dense: false }, styleOnly: ['colors:accent', 'spacing:scale,radius', 'border'],
    today: { rows: 8, cats: 4 }, probe: { label: 'youtube.com', text: 'Embedded page', sub: '' },
    show: [{ id: 'page', title: 'Page', icon: 'link', rows: [R('url', 'URL', 'text', { placeholder: 'https://…' })] }],
    palette: [], data: [], fmt: [], thr: [], motion: [], behave: [],
    notes: ['Uses a declared style subset (accent, size, radius, border & glow) instead of base: [].', 'No Header section: the widget never draws one.', 'No Fit section: summary card is forced off and density does not apply to a page.'],
  },
];
export function has(list, x) { return String(list || '').split(',').includes(x); }

// Panel widget kinds
export const KINDS = [['stat', 'Stat', 'tag'], ['value', 'Value', 'text_fields'], ['bar', 'Bar', 'linear_scale'], ['gauge', 'Gauge', 'speed'], ['sparkline', 'Sparkline', 'show_chart'], ['table', 'Table', 'table'], ['text', 'Text', 'notes'], ['image', 'Image', 'image'], ['clock', 'Clock', 'schedule'], ['shape', 'Shape', 'category']];
const NUMERIC = ['stat', 'value', 'bar', 'gauge', 'sparkline', 'text'];
const k = (list) => (v) => list.includes(v('kind'));
export const PANEL_ITEMS = [
  { id: 'p1', kind: 'stat', label: 'CPU', sensor: 'libre.amd_7950x.load.total', unit: '%', live: 63 },
  { id: 'p2', kind: 'bar', label: 'GPU', sensor: 'libre.gpu_4080.load.core', unit: '%', live: 91 },
  { id: 'p3', kind: 'sparkline', label: 'Download', sensor: 'net.eth0.rx', unit: 'MB/s', live: 38 },
  { id: 'p4', kind: 'gauge', label: 'VRAM', sensor: 'libre.gpu_4080.memory.used', unit: '%', live: 72 },
  { id: 'p5', kind: 'clock', label: 'Time', sensor: '', unit: '', live: 0 },
];
export const KIND_TABS = {
  show: [
    { id: 'kind', title: 'Kind', icon: 'category', rows: [R('kind', 'Kind', 'kinds')] },
    { id: 'content', title: 'Content', icon: 'title', rows: [
      R('label', 'Label', 'text', { if: (v) => v('kind') !== 'shape' }),
      S('clockShow', 'Show', [['both', 'Both'], ['time', 'Time'], ['date', 'Date']], 'both', { if: k(['clock']) }),
      R('text', 'Static text', 'text', { if: k(['text']) }),
      S('shape', 'Shape', [['vbar', 'V-bar'], ['hbar', 'H-bar'], ['rect', 'Rect'], ['circle', 'Circle']], 'vbar', { if: k(['shape']) }),
      R('rows', 'Rows', 'slider', { min: 1, max: 20, step: 1, def: 7, if: k(['table']) })] },
    { id: 'place', title: 'Size & placement', icon: 'open_with', rows: [
      S('boxW', 'Width', [['hug', 'Hug'], ['fill', 'Fill'], ['px', 'Fixed']], 'hug'),
      S('self', 'Align self', [['auto', 'Auto'], ['start', 'Start'], ['center', 'Center'], ['end', 'End']], 'auto'),
      R('span', 'Grid span', 'slider', { min: 1, max: 12, step: 1, def: 1, more: true }),
      R('rowSpan', 'Row span', 'slider', { min: 1, max: 6, step: 1, def: 1, more: true })] },
  ],
  style: [
    { id: 'type', title: 'Typography', icon: 'text_fields', follow: true, rows: [
      R('fontSize', 'Font size', 'select', { opts: [['auto', 'Auto'], ['12', '12 px'], ['16', '16 px'], ['24', '24 px'], ['32', '32 px'], ['48', '48 px']], if: (v) => !['bar', 'sparkline', 'image', 'shape'].includes(v('kind')) }),
      S('textAlign', 'Text alignment', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], 'left', { if: k(['stat', 'value', 'table', 'text', 'clock']) })] },
    { id: 'colors', title: 'Color', icon: 'format_color_fill', follow: true, if: (v) => !['table', 'image'].includes(v('kind')), rows: [R('color', 'Color', 'color', { role: 'accent' })] },
    { id: 'css', title: 'Custom CSS', icon: 'code', rows: [R('className', 'Class names', 'text', { more: true }), R('css', 'CSS (:scope = cell)', 'code', { more: true })] },
  ],
  data: [
    { id: 'bind', title: 'Binding', icon: 'sensors', if: (v) => !['clock', 'shape'].includes(v('kind')), rows: [R('sensor', 'Sensor', 'sensorOne'), R('subSensor', 'Sub sensor', 'sensorOne', { more: true, if: k(['stat', 'value']), hint: 'Shown below the value.' })] },
    { id: 'format', title: 'Units & format', icon: 'straighten', follow: true, if: k(NUMERIC), rows: [
      R('unit', 'Unit', 'text', { placeholder: 'From the sensor', perWidget: true }),
      S('decimals', 'Decimals', [['auto', 'Auto'], ['0', '0'], ['1', '1'], ['2', '2']]),
      R('max', 'Maximum', 'slider', { min: 0, max: 500, step: 10, def: 100, perWidget: true, if: k(['bar', 'gauge']) }),
      R('scaleX', 'Multiply by', 'slider', { min: 0.1, max: 10, step: 0.1, def: 1, unit: '×', perWidget: true, more: true })] },
  ],
  behave: [
    { id: 'thresholds', title: 'Thresholds', icon: 'warning', follow: true, if: k(['stat', 'value', 'bar', 'gauge']), rows: [R('thr.value', 'Value', 'thr', { q: 'value' })], isNew: true },
    { id: 'history', title: 'History', icon: 'history', if: k(['sparkline']), rows: [R('history', 'Samples', 'slider', { min: 5, max: 200, step: 5, def: 40 })] },
    { id: 'fill', title: 'Fill', icon: 'swap_horiz', if: k(['bar', 'gauge']), rows: [T('inverted', 'Invert fill', false)] },
  ],
};
