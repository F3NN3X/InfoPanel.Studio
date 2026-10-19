// Reads .infopanel exports the way InfoPanel's importer does (SharedModel.ImportProfile:
// XmlSerializer over Profile and List<DisplayItem> with the same item types) and writes
// what InfoPanel then holds, serialized again by InfoPanel's own XmlSerializer:
//
//   dotnet run --project lab/infopanel/tools/import-check -p:Platform=x64 -- <out-folder> <a.infopanel> [<b.infopanel> ...]
//
// For each input, <out-folder>/<name>.Profile.xml and <name>.DisplayItems.xml, plus a
// summary line (items per type, gauge frames, assets). Two exports that InfoPanel reads
// the same give identical files, so the lab's writer is checked against an original
// export by comparing them.
using System.IO;
using System.IO.Compression;
using System.Text;
using System.Xml;
using System.Xml.Serialization;
using InfoPanel.Models;

var outDir = args[0];
Directory.CreateDirectory(outDir);
Type[] itemTypes = [typeof(GroupDisplayItem), typeof(BarDisplayItem), typeof(GraphDisplayItem), typeof(DonutDisplayItem), typeof(TableSensorDisplayItem), typeof(SensorDisplayItem), typeof(ClockDisplayItem), typeof(CalendarDisplayItem), typeof(TextDisplayItem), typeof(SensorImageDisplayItem), typeof(ImageDisplayItem), typeof(HttpImageDisplayItem), typeof(GaugeDisplayItem), typeof(ShapeDisplayItem)];
var itemsSerializer = new XmlSerializer(typeof(List<DisplayItem>), itemTypes);
var profileSerializer = new XmlSerializer(typeof(Profile));

foreach (var file in args.Skip(1))
{
    using var archive = ZipFile.OpenRead(file);
    ZipArchiveEntry? Entry(string name) => archive.Entries.FirstOrDefault(e => e.FullName.Equals(name, StringComparison.OrdinalIgnoreCase));
    var profileEntry = Entry("Profile.xml") ?? throw new Exception($"{file}: no Profile.xml");
    var itemsEntry = Entry("DisplayItems.xml") ?? throw new Exception($"{file}: no DisplayItems.xml");

    Profile profile;
    using (var s = profileEntry.Open()) profile = (Profile)profileSerializer.Deserialize(XmlReader.Create(s))!;
    List<DisplayItem> items;
    using (var s = itemsEntry.Open()) items = (List<DisplayItem>)itemsSerializer.Deserialize(XmlReader.Create(s))!;

    var name = Path.GetFileNameWithoutExtension(file);
    var settings = new XmlWriterSettings { Encoding = new UTF8Encoding(false), Indent = true };
    using (var w = XmlWriter.Create(Path.Combine(outDir, name + ".Profile.xml"), settings)) profileSerializer.Serialize(w, profile);
    using (var w = XmlWriter.Create(Path.Combine(outDir, name + ".DisplayItems.xml"), settings)) itemsSerializer.Serialize(w, items);

    IEnumerable<DisplayItem> All(IEnumerable<DisplayItem> list) => list.SelectMany(i => i is GroupDisplayItem g ? new[] { i }.Concat(All(g.DisplayItems)) : [i]);
    var all = All(items).ToList();
    var kinds = string.Join(", ", all.GroupBy(i => i.GetType().Name.Replace("DisplayItem", "")).OrderBy(g => g.Key).Select(g => $"{g.Count()} {g.Key}"));
    var frames = all.OfType<GaugeDisplayItem>().Sum(g => g.Images.Count);
    var assets = archive.Entries.Count(e => e.FullName.StartsWith("assets/", StringComparison.OrdinalIgnoreCase));
    Console.WriteLine($"{name}: {profile.Name} {profile.Width}x{profile.Height}; {all.Count} items ({kinds}); {frames} gauge frames; {assets} assets");
}
