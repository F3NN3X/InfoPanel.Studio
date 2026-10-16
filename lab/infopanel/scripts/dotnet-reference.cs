#:property TargetFramework=net8.0
#:property JsonSerializerIsReflectionEnabledByDefault=true
// Writes src/__fixtures__/dotnet-reference.json: what .NET 8 (InfoPanel's runtime)
// prints for the number and date formats InfoPanel uses, under en-US. The lab's
// formatting tests compare against it.
//
//   dotnet run lab/infopanel/scripts/dotnet-reference.cs   (from the repo root)
using System.Globalization;
using System.Text.Json;

var enUs = CultureInfo.GetCultureInfo("en-US");
CultureInfo.CurrentCulture = enUs;
var inv = CultureInfo.InvariantCulture;

double[] values =
[
    0, -0.0, 0.4, 0.5, 1.5, 2.5, -0.4, -0.5, -1.5, 0.05, 0.15, 0.25, 0.35, 0.045, 1.005, 2.675, 1.45,
    9.995, 99.5, 123.456, 999.95, 9999.9995, 1e15 + 0.3, 123456789.987654321, 1234567890123456789,
    1e-7, 5e-324, 1e20, 1.7976931348623157e308, -2.5e-3, 45.375,
    (double)3.14159f, (double)0.1f, (double)1.15f, (double)72.6f, (double)-12.35f,
    double.NaN, double.PositiveInfinity, double.NegativeInfinity,
];
string[] patterns = ["{0:0}", "{0:0.0}", "{0:0.00}", "{0:0.000}"];

var fixedRows = new List<object>();
foreach (var v in values)
{
    var row = new Dictionary<string, string> { ["v"] = v.ToString("R", inv) };
    for (int d = 0; d < patterns.Length; d++) row[$"f{d}"] = string.Format(patterns[d], v);
    row["floor"] = string.Format("{0:0}", Math.Floor(v));
    for (int d = 0; d < 4; d++) row[$"n{d}"] = v.ToString("N" + d, inv);
    fixedRows.Add(row);
}

string[] parseInputs =
[
    "1234", "1,234.5", "-12.50", "12.5-", "(42)", "  7  ", "1e3", "1.5E-2", ".5", "5.", "¤12", "12:30", "abc",
    "", "-", "1,2,3", "+3", "+-3", "- 3", "3 -", "0x10", "Infinity", "NaN", "1 234", "12%", "1.2.3",
];
var parseRows = parseInputs.Select(s => new
{
    s,
    ok = double.TryParse(s, NumberStyles.Any, inv, out var p),
    v = double.TryParse(s, NumberStyles.Any, inv, out var q) ? q.ToString("R", inv) : null,
}).ToList();

DateTime[] dates = [new(2026, 10, 16, 15, 45, 52, 123), new(2026, 1, 5, 0, 7, 3, 0), new(2026, 7, 4, 12, 0, 9, 5)];
string[] formats =
[
    "HH:mm:ss", "HH:mm", "H:mm", "h:mm tt", "hh:mm:ss tt", ":ss", "dddd", "dd.MM.yyyy", "dd/MM/yyyy", "MM/dd/yyyy",
    "dd-MMM-yy", "d MMMM yyyy", "ddd d MMM", "yyy y yyyyy", "t tt", "h H", "%d", "%h", "'dd' \"MM\" \\y", "fff FFF ff F",
    "d", "D", "t", "T", "f", "F", "g", "G", "M", "Y", "s", "MMMM dd", "dd MMMM", "hh:mm:ss.fff",
    "q", "%", "'open", "\\", "ffffffff",
];
var dateRows = formats.Select(f => new
{
    f,
    outputs = dates.Select(d =>
    {
        try { return d.ToString(f); }
        catch (FormatException) { return "!error"; }
    }).ToList(),
}).ToList();

var output = new
{
    runtime = Environment.Version.ToString(),
    dates = dates.Select(d => d.ToString("yyyy-MM-ddTHH:mm:ss.fff", inv)).ToList(),
    @fixed = fixedRows,
    parse = parseRows,
    formats = dateRows,
};

var path = args.Length > 0 ? args[0] : "lab/infopanel/src/__fixtures__/dotnet-reference.json";
File.WriteAllText(path, JsonSerializer.Serialize(output, new JsonSerializerOptions
{
    WriteIndented = true,
    Encoder = System.Text.Encodings.Web.JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
}) + "\n");
Console.WriteLine($"Wrote {Path.GetFullPath(path)} on .NET {Environment.Version}");
