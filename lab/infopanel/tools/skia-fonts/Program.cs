// Writes what InfoPanel's renderer picks for every font request, on this machine:
//
//   dotnet run --project lab/infopanel/tools/skia-fonts -p:Platform=x64 -- <requests.json> <out.json>
//
// requests.json: [{ "font": "Barlow", "style": "", "bold": false, "italic": false }, ...]
// (written by `npm run lab:fonts`). The output lists Skia's font families in
// enumeration order with their style names, and for each request the typeface
// SkiaGraphics.CreateTypeface returns plus the one RichTextKit then draws with.
// The font file behind each drawn typeface is copied next to the output
// (faces/<sha1>.<ext>), so the lab can load the very bytes InfoPanel draws with.
using System.IO;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using SkiaSharp;
using Topten.RichTextKit;

var requests = JsonSerializer.Deserialize<List<Request>>(File.ReadAllText(args[0]), new JsonSerializerOptions { PropertyNameCaseInsensitive = true })!;

// SkiaGraphics is internal to InfoPanel; call it the way the renderer does.
var skiaGraphics = typeof(InfoPanel.App).Assembly.GetType("InfoPanel.Drawing.SkiaGraphics", throwOnError: true)!;
var createTypeface = skiaGraphics.GetMethod("CreateTypeface", BindingFlags.Public | BindingFlags.NonPublic | BindingFlags.Static)!;

var manager = SKFontManager.Default;
var families = manager.GetFontFamilies().Select(name =>
{
    using var set = manager.GetFontStyles(name);
    var styles = Enumerable.Range(0, set.Count).Select(i => new
    {
        name = set.GetStyleName(i),
        weight = set[i].Weight,
        width = set[i].Width,
        slant = set[i].Slant.ToString(),
    }).ToList();
    return new { name, styles };
}).ToList();

var facesDir = Path.Combine(Path.GetDirectoryName(Path.GetFullPath(args[1]))!, "faces");
Directory.CreateDirectory(facesDir);

object Describe(SKTypeface t) => new { family = t.FamilyName, weight = t.FontWeight, width = t.FontWidth, italic = t.IsItalic, slant = t.FontSlant.ToString() };

object Export(SKTypeface t)
{
    using var stream = t.OpenStream(out int ttcIndex);
    if (stream == null) return new { file = (string?)null, ttcIndex };
    var bytes = new byte[stream.Length];
    stream.Read(bytes, bytes.Length);
    string magic = System.Text.Encoding.ASCII.GetString(bytes, 0, 4);
    string ext = magic == "ttcf" ? "ttc" : magic == "OTTO" ? "otf" : "ttf";
    string name = $"{Convert.ToHexString(SHA1.HashData(bytes)).ToLowerInvariant()[..16]}.{ext}";
    string path = Path.Combine(facesDir, name);
    if (!File.Exists(path)) File.WriteAllBytes(path, bytes);
    return new { file = $"faces/{name}", ttcIndex };
}

var results = requests.Select(r =>
{
    var typeface = (SKTypeface)createTypeface.Invoke(null, [r.Font, r.Style, r.Bold, r.Italic])!;
    // SkiaGraphics.DrawString hands RichTextKit the family, weight, width and slant,
    // and RichTextKit's default FontMapper resolves them again.
    var style = new Style
    {
        FontFamily = typeface.FamilyName,
        FontWeight = typeface.FontWeight,
        FontItalic = typeface.IsItalic,
        FontWidth = (SKFontStyleWidth)typeface.FontWidth,
    };
    var drawn = FontMapper.Default.TypefaceFromStyle(style, false);
    return new { request = r, typeface = Describe(typeface), drawn = Describe(drawn), font = Export(drawn) };
}).ToList();

var defaultTypeface = SKTypeface.CreateDefault();
File.WriteAllText(args[1], JsonSerializer.Serialize(new
{
    skia = typeof(SKTypeface).Assembly.GetName().Version?.ToString(),
    @default = Describe(defaultTypeface),
    defaultFont = Export(defaultTypeface),
    families,
    results,
}, new JsonSerializerOptions { WriteIndented = true }));
Console.WriteLine($"{families.Count} families, {results.Count} requests -> {args[1]}");

record Request(string Font, string Style, bool Bold, bool Italic);
