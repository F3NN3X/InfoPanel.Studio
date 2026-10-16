"""Writes src/__fixtures__/corpus-expected.json from the extracted corpus.

An independent read of the exports (Python's ElementTree) that the TypeScript
parser's corpus tests are checked against. Run from the repo root after
`npm run lab:extract`:

    python -I lab/infopanel/scripts/corpus-expected.py
"""

import json
import pathlib
import sys
import xml.etree.ElementTree as ET
from collections import Counter

LAB = pathlib.Path(sys.argv[0]).resolve().parent.parent
CORPUS = LAB / "corpus"
OUT = LAB / "src" / "__fixtures__" / "corpus-expected.json"
XSI = "{http://www.w3.org/2001/XMLSchema-instance}type"
# Fields written by other InfoPanel versions than the source at d3fe32c.
DRIFT = {"AutoScale", "SeparateUnitWithSpace", "RefreshInterval", "Threshold", "ThresholdColor"}
CHART = {"BarDisplayItem", "GraphDisplayItem", "DonutDisplayItem"}


def kind(el):
    return el.get(XSI).removesuffix("DisplayItem")


def walk(items, depth, acc):
    for it in items:
        k = kind(it)
        acc["types"][k] += 1
        st = it.findtext("SensorType")
        if st is not None:
            acc["sensorTypes"][st] += 1
        for child in it:
            tag = child.tag
            drift = tag in DRIFT or (it.get(XSI) in CHART and tag in {"Threshold2", "Threshold2Color"})
            if drift:
                acc["unknown"].add(f"{k}.{tag}")
        if k == "Gauge":
            frames = [f.findtext("FilePath") for f in it.find("Images")]
            acc["gauges"].append({"name": it.findtext("Name"), "frames": len(frames),
                                  "first": frames[0] if frames else None, "last": frames[-1] if frames else None})
        if k == "Group":
            children = list(it.find("DisplayItems"))
            acc["groups"].append({"name": it.findtext("Name"), "depth": depth, "children": len(children)})
            walk(children, depth + 1, acc)


def main():
    index = json.loads((CORPUS / "index.json").read_text(encoding="utf-8"))
    out = {}
    for entry in index:
        pid = entry["id"]
        profile = ET.parse(CORPUS / pid / "Profile.xml").getroot()
        items = ET.parse(CORPUS / pid / "DisplayItems.xml").getroot()
        acc = {"types": Counter(), "sensorTypes": Counter(), "gauges": [], "groups": [], "unknown": set()}
        walk(list(items), 0, acc)
        out[pid] = {
            "width": int(profile.findtext("Width")),
            "height": int(profile.findtext("Height")),
            "fontScale": float(profile.findtext("FontScale")),
            "backgroundColor": profile.findtext("BackgroundColor"),
            "items": sum(acc["types"].values()),
            "types": dict(sorted(acc["types"].items())),
            "sensorTypes": dict(sorted(acc["sensorTypes"].items())),
            "gauges": acc["gauges"],
            "groups": acc["groups"],
            "unknown": sorted(acc["unknown"]),
            "assets": sorted(n for n in entry["entries"] if n.lower().startswith("assets/")),
        }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    for pid, p in out.items():
        print(f"{pid}: {p['items']} items, sensors {p['sensorTypes']}, unknown {p['unknown']}")


main()
