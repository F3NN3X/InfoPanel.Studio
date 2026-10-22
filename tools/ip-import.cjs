/**
 * InfoPanel profile importer.
 *
 * Reads a profile's item tree + registry entry + asset folder from the
 * InfoPanel install (%LOCALAPPDATA%\InfoPanel) and emits:
 *   - infopanel-studio/src/lib/ip/imported/<slug>.ts  (typed IPProfile)
 *   - infopanel-studio/public/assets/ip/<slug>/*      (image assets)
 *
 * Usage:
 *   node tools/ip-import.cjs <profileGuid> [slug]
 *
 * The item XML is one-tag-per-line (XmlSerializer indent), so a line-based
 * state machine parses it without an XML dependency.
 */
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");

const [guidArg, slugArg] = process.argv.slice(2);
if (!guidArg) {
  console.error("usage: node ip-import.cjs <profileGuid> [slug]");
  process.exit(1);
}
const guid = guidArg.toLowerCase();
const root = path.join(os.homedir(), "AppData", "Local", "InfoPanel");
const itemsFile = path.join(root, "profiles", guid + ".xml");
const registryFile = path.join(root, "profiles.xml");
const assetsDir = path.join(root, "assets", guid);

if (!fs.existsSync(itemsFile)) {
  console.error("items file not found: " + itemsFile);
  process.exit(1);
}

/* ------------------------------------------------------------------ *
 * Line-based item XML parser
 * ------------------------------------------------------------------ */

function parseItemsXml(text) {
  const lines = text.split(/\r?\n/);
  const items = [];
  const stack = []; // { type, fields, children, imgChildren, section }

  const scalar = (line) => {
    // <Tag>value</Tag> | <Tag />  → [tag, value]
    const m = line.match(/^\s*<([A-Za-z_][\w.]*)(?:\s[^>]*)?>([^<]*)<\/\1>\s*$/);
    if (m) return [m[1], m[2]];
    const e = line.match(/^\s*<([A-Za-z_][\w.]*)(?:\s[^>]*)?\/>\s*$/);
    if (e) return [e[1], ""];
    return null;
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    // <DisplayItem xsi:type="..."> | <ImageDisplayItem> (gauge frames)
    let m = line.match(/^<DisplayItem\s+xsi:type="(\w+)">$/);
    if (m) {
      stack.push({ type: m[1], fields: {}, children: [], imgChildren: [], section: null });
      continue;
    }
    m = line.match(/^<ImageDisplayItem>$/);
    if (m && stack.length > 0 && stack[stack.length - 1].section === "Images") {
      stack.push({ type: "ImageDisplayItem", fields: {}, children: [], imgChildren: [], section: null });
      continue;
    }
    if (line === "</DisplayItem>" || line === "</ImageDisplayItem>") {
      const node = stack.pop();
      if (stack.length === 0) items.push(node);
      else {
        const p = stack[stack.length - 1];
        if (p.section === "Images") p.imgChildren.push(node);
        else p.children.push(node);
      }
      continue;
    }
    if (line === "<DisplayItems>") {
      if (stack.length) stack[stack.length - 1].section = "Items";
      continue;
    }
    if (line === "</DisplayItems>") {
      if (stack.length) stack[stack.length - 1].section = null;
      continue;
    }
    if (line === "<Images>") {
      if (stack.length) stack[stack.length - 1].section = "Images";
      continue;
    }
    if (line === "</Images>") {
      if (stack.length) stack[stack.length - 1].section = null;
      continue;
    }

    const s = scalar(line);
    if (s && stack.length > 0) {
      stack[stack.length - 1].fields[s[0]] = s[1];
    }
    // ignore: root open/close, whitespace, unknown
  }
  return items;
}

/* ------------------------------------------------------------------ *
 * Field → model mapping
 * ------------------------------------------------------------------ */

const b = (v) => v === "true";
const n = (v) => (v === "" || v === undefined ? 0 : parseInt(v, 10));
const f = (v, d) => (v === "" || v === undefined ? d : parseFloat(v));
const s = (v) => (v === undefined ? "" : v);

function textBlock(fl) {
  return {
    font: s(fl.Font) || undefined,
    fontSize: n(fl.FontSize),
    fontStyle: s(fl.FontStyle) || undefined,
    bold: b(fl.Bold),
    italic: b(fl.Italic),
    underline: b(fl.Underline),
    strikeout: b(fl.Strikeout),
    color: s(fl.Color) || undefined,
    rightAlign: b(fl.RightAlign),
    centerAlign: b(fl.CenterAlign),
    uppercase: b(fl.Uppercase),
    wrap: fl.Wrap === undefined ? true : b(fl.Wrap),
    ellipsis: fl.Ellipsis === undefined ? true : b(fl.Ellipsis),
    width: n(fl.Width),
    height: n(fl.Height),
    marquee: b(fl.Marquee),
    marqueeSpeed: fl.MarqueeSpeed === undefined ? 50 : n(fl.MarqueeSpeed),
    marqueeSpacing: fl.MarqueeSpacing === undefined ? 40 : n(fl.MarqueeSpacing),
    glowEnabled: b(fl.GlowEnabled),
    glowRadius: fl.GlowRadius === undefined ? 8 : n(fl.GlowRadius),
    glowColor: s(fl.GlowColor) || undefined,
    glowBlendMode: s(fl.GlowBlendMode) || "SrcOver",
  };
}

function binding(fl) {
  const out = {
    sensorType: fl.SensorType === "Libre" ? "libre" : fl.SensorType === "HwInfo" ? "hwinfo" : "plugin",
    sensorName: s(fl.SensorName) || undefined,
    valueType: fl.ValueType || "NOW",
    showName: b(fl.ShowName),
    unit: s(fl.Unit) || undefined,
    overrideUnit: b(fl.OverrideUnit),
    showUnit: b(fl.ShowUnit),
    precision: fl.Precision === undefined ? 0 : n(fl.Precision),
    overridePrecision: b(fl.OverridePrecision),
    showThousandsSeparator: b(fl.ShowThousandsSeparator),
    multiplicationModifier: fl.MultiplicationModifier === undefined ? 1 : f(fl.MultiplicationModifier, 1),
    divisionToggle: b(fl.DivisionToggle),
    additionModifier: fl.AdditionModifier === undefined ? 0 : f(fl.AdditionModifier, 0),
    absoluteAddition: b(fl.AbsoluteAddition),
    threshold1: n(fl.Threshold1),
    threshold1Color: s(fl.Threshold1Color) || undefined,
    threshold2: n(fl.Threshold2),
    threshold2Color: s(fl.Threshold2Color) || undefined,
  };
  if (fl.LibreSensorId) out.libreId = fl.LibreSensorId;
  if (fl.PluginSensorId) out.pluginId = fl.PluginSensorId;
  if (fl.SensorType === "HwInfo") {
    out.hwinfo = {
      remoteIndex: n(fl.HwInfoRemoteIndex),
      sensor: n(fl.Id),
      instance: n(fl.Instance),
      entryId: n(fl.EntryId),
    };
  }
  return out;
}

function chartBase(fl) {
  return {
    width: n(fl.Width),
    height: n(fl.Height),
    min: f(fl.MinValue, 0),
    max: f(fl.MaxValue, 100),
    autoValue: b(fl.AutoValue),
    frame: fl.Frame === undefined ? true : b(fl.Frame),
    frameColor: s(fl.FrameColor) || "#000000",
    background: fl.Background === undefined ? true : b(fl.Background),
    backgroundColor: s(fl.BackgroundColor) || "#FFFFFF",
    color: s(fl.Color) || "#808080",
  };
}

function imageFields(fl) {
  return {
    filePath: s(fl.FilePath),
    httpUrl: s(fl.HttpUrl) || undefined,
    type: fl.Type || "FILE",
    scale: n(fl.Scale),
    layer: b(fl.Layer),
    layerColor: s(fl.LayerColor) || "#77FFFFFF",
    showPanel: b(fl.ShowPanel),
    volume: n(fl.Volume),
    width: n(fl.Width),
    height: n(fl.Height),
    cache: fl.Cache === undefined ? true : b(fl.Cache),
    readOnly: b(fl.ReadOnly),
    relativePath: fl.RelativePath === undefined ? true : b(fl.RelativePath),
  };
}

function convert(node, idx) {
  const fl = node.fields;
  const base = {
    id: "i" + idx.id,
    kind: null,
    name: s(fl.Name) || node.type,
    x: n(fl.X),
    y: n(fl.Y),
    rotation: n(fl.Rotation),
    hidden: b(fl.Hidden),
    locked: b(fl.IsLocked),
  };
  switch (node.type) {
    case "TextDisplayItem":
      // C# TextDisplayItem has no Text property — the content is the Name.
      return { ...base, kind: "text", ...textBlock(fl), text: base.name };
    case "ClockDisplayItem":
      return { ...base, kind: "clock", ...textBlock(fl), format: s(fl.Format) || "hh:mm:ss tt" };
    case "CalendarDisplayItem":
      return { ...base, kind: "calendar", ...textBlock(fl), format: s(fl.Format) || "dd/MM/yyyy" };
    case "SensorDisplayItem":
      return { ...base, kind: "sensor", ...textBlock(fl), sensor: binding(fl) };
    case "TableSensorDisplayItem":
      return {
        ...base,
        kind: "table",
        ...textBlock(fl),
        sensor: binding(fl),
        tableFormat: s(fl.TableFormat),
        maxRows: n(fl.MaxRows),
        showHeader: b(fl.ShowHeader),
      };
    case "ImageDisplayItem":
      return { ...base, kind: "image", ...imageFields(fl) };
    case "HttpImageDisplayItem":
      return {
        ...base,
        kind: "httpImage",
        ...imageFields(fl),
        httpUrl: s(fl.HttpUrl),
        sensor: binding(fl),
      };
    case "SensorImageDisplayItem":
      return {
        ...base,
        kind: "sensorImage",
        ...imageFields(fl),
        sensor: binding(fl),
        threshold1: n(fl.Threshold1),
        threshold2: n(fl.Threshold2),
      };
    case "GraphDisplayItem":
      return {
        ...base,
        kind: "graph",
        ...chartBase(fl),
        sensor: binding(fl),
        graphType: fl.Type === "HISTOGRAM" ? "HISTOGRAM" : "LINE",
        step: fl.Step === undefined ? 4 : n(fl.Step),
        thickness: fl.Thickness === undefined ? 2 : f(fl.Thickness, 2),
        fill: fl.Fill === undefined ? true : b(fl.Fill),
        fillColor: s(fl.FillColor) || "#3C888DFF",
        flipX: b(fl.FlipX),
      };
    case "BarDisplayItem":
      return {
        ...base,
        kind: "bar",
        ...chartBase(fl),
        sensor: binding(fl),
        cornerRadius: fl.CornerRadius === undefined ? 0 : f(fl.CornerRadius, 0),
        gradient: fl.Gradient === undefined ? true : b(fl.Gradient),
        gradientColor: s(fl.GradientColor) || "#3B3B3B",
        flipX: b(fl.FlipX),
      };
    case "DonutDisplayItem":
      return {
        ...base,
        kind: "donut",
        ...chartBase(fl),
        sensor: binding(fl),
        thickness: fl.Thickness === undefined ? 10 : f(fl.Thickness, 10),
        span: fl.Span === undefined ? 360 : f(fl.Span, 360),
      };
    case "GaugeDisplayItem":
      return {
        ...base,
        kind: "gauge",
        sensor: binding(fl),
        minValue: f(fl.MinValue, 0),
        maxValue: f(fl.MaxValue, 100),
        scale: n(fl.Scale),
        width: n(fl.Width),
        height: n(fl.Height),
        flipX: b(fl.FlipX),
        animationSpeed: fl.AnimationSpeed === undefined ? 0 : f(fl.AnimationSpeed, 0),
        // Full ImageDisplayItem frames (C# `Images`).
        images: node.imgChildren.map((c, i) => ({
          id: `g${idx.id}-f${i}`,
          kind: "image",
          name: c.fields.Name || c.fields.FilePath || `frame-${i}`,
          x: n(c.fields.X),
          y: n(c.fields.Y),
          rotation: n(c.fields.Rotation),
          hidden: b(c.fields.Hidden),
          locked: b(c.fields.IsLocked),
          ...imageFields(c.fields),
        })),
      };
    case "ShapeDisplayItem":
      return {
        ...base,
        kind: "shape",
        shapeType: s(fl.Type) || "Capsule",
        width: n(fl.Width),
        height: n(fl.Height),
        cornerRadius: fl.CornerRadius === undefined ? 0 : f(fl.CornerRadius, 0),
        showFrame: b(fl.ShowFrame),
        frameThickness: fl.FrameThickness === undefined ? 5 : n(fl.FrameThickness),
        frameColor: s(fl.FrameColor) || "#000000",
        showFill: fl.ShowFill === undefined ? true : b(fl.ShowFill),
        fillColor: s(fl.FillColor) || "#000000",
        showGradient: b(fl.ShowGradient),
        gradientColor: s(fl.GradientColor) || "#000000",
        gradientColor2: s(fl.GradientColor2) || "#000000",
        gradientType: s(fl.GradientType) || "Linear",
        gradientAngle: n(fl.GradientAngle),
        gradientAnimationSpeed: fl.GradientAnimationSpeed === undefined ? 300 : n(fl.GradientAnimationSpeed),
      };
    case "GroupDisplayItem": {
      const children = node.children.map((c, ci) =>
        convert(c, { id: `${idx.id}c${ci}` })
      );
      return { ...base, kind: "group", children };
    }
    default:
      console.warn("  ! unknown item type: " + node.type);
      return { ...base, kind: "text", text: node.type };
  }
}

/* ------------------------------------------------------------------ *
 * Registry (profile) XML — line-based too.
 * ------------------------------------------------------------------ */

function parseRegistry(text, guid) {
  const lines = text.split(/\r?\n/);
  const profiles = [];
  let profile = null;
  let inTarget = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "<Profile>") {
      inTarget = false;
      profile = {};
      profiles.push(profile);
      continue;
    }
    if (line === "</Profile>") {
      profile = null;
      continue;
    }
    if (!profile) continue;
    if (line === "<TargetWindow>") {
      inTarget = true;
      profile.target = {};
      continue;
    }
    if (line === "</TargetWindow>") {
      inTarget = false;
      continue;
    }
    const m = line.match(/^<([\w.]+)>([^<]*)<\/\1>$/);
    if (!m) continue;
    const [tag, value] = [m[1], m[2]];
    if (inTarget) profile.target[tag] = value;
    else profile[tag] = value;
  }
  const found = profiles.find((p) => String(p.Guid).toLowerCase() === guid);
  if (!found) {
    console.error("guid not found in registry: " + guid);
    process.exit(1);
  }
  return found;
}

/* ------------------------------------------------------------------ *
 * Main
 * ------------------------------------------------------------------ */

const itemsText = fs.readFileSync(itemsFile, "utf8");
const registryText = fs.readFileSync(registryFile, "utf8");
const reg = parseRegistry(registryText, guid);

const rawItems = parseItemsXml(itemsText);
let seq = 0;
const items = rawItems.map((n) => convert(n, { id: seq++ }));

const slug = (slugArg || (reg.Name || "profile").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")).replace(/[^a-z0-9-]/g, "");

const profile = {
  // "-ip" suffix: keeps the free-canvas profile id out of the grid
  // profile namespace (a shipped grid profile may use the same slug).
  id: slug + "-ip",
  assets: slug,
  name: reg.Name || slug,
  width: n(reg.Width),
  height: n(reg.Height),
  backgroundColor: reg.BackgroundColor || "#00FFFFFF",
  font: reg.Font || "",
  fontSize: n(reg.FontSize),
  fontScale: reg.FontScale === undefined ? 1.33 : f(reg.FontScale, 1.33),
  color: reg.Color || "#FFFFFFFF",
  showFps: b(reg.ShowFps),
  drag: reg.Drag === undefined ? true : b(reg.Drag),
  resize: reg.Resize === undefined ? true : b(reg.Resize),
  active: reg.Active === undefined ? true : b(reg.Active),
  topmost: b(reg.Topmost),
  windowX: n(reg.WindowX),
  windowY: n(reg.WindowY),
  strictWindowMatching: b(reg.StrictWindowMatching),
  items,
};
if (reg.target && (reg.target.X || reg.target.Width)) {
  profile.targetWindow = {
    x: n(reg.target.X),
    y: n(reg.target.Y),
    width: n(reg.target.Width),
    height: n(reg.target.Height),
    deviceName: reg.target.DeviceName || "",
  };
}

/* Emit TS module */
const dashRoot = path.join(__dirname, "..");
const outDir = path.join(dashRoot, "src", "lib", "ip", "imported");
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, slug + ".ts");

const ts =
  `// GENERATED by tools/ip-import.cjs from InfoPanel profile ${guid} — do not edit by hand.\n` +
  `import type { IPProfile } from "../types";\n\n` +
  `export const ${slug === "arcv2" ? "arcv2" : slug + "Profile"}: IPProfile = ${JSON.stringify(profile, null, 2)};\n`;
fs.writeFileSync(outFile, ts);

/* Copy assets */
const assetOut = path.join(dashRoot, "public", "assets", "ip", slug);
if (fs.existsSync(assetsDir)) {
  fs.mkdirSync(assetOut, { recursive: true });
  let count = 0;
  for (const entry of fs.readdirSync(assetsDir)) {
    if (entry.toLowerCase().endsWith(".png") || entry.toLowerCase().endsWith(".jpg") || entry.toLowerCase().endsWith(".jpeg") || entry.toLowerCase().endsWith(".gif") || entry.toLowerCase().endsWith(".webp")) {
      fs.copyFileSync(path.join(assetsDir, entry), path.join(assetOut, entry));
      count++;
    }
  }
  console.log(`assets: ${count} files → public/assets/ip/${slug}/`);
} else {
  console.log("assets: no folder at " + assetsDir);
}

console.log(`items: ${items.length} (top level) → src/lib/ip/imported/${slug}.ts`);
console.log(`profile: ${profile.name} ${profile.width}x${profile.height}`);
