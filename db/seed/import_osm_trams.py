"""Import a pinned OSM snapshot for routes shown on the Moscow tram scheme.

This is a one-off data refresh tool. Normal seed generation reads the committed
snapshot and never contacts OSM, keeping repeated seeds deterministic.
"""

import json
from concurrent.futures import ThreadPoolExecutor
from hashlib import sha256
from pathlib import Path
from time import sleep
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / "mock_data" / "osm_trams.json"
RELATIONS = {
    "T1": (19587154, 19587155), "T2": (1284062, 1343391),
    "А": (1689396, 1689397), "1": (543080, 1283310),
    "2": (18088223, 18088224), "4": (448785, 1082824),
    "5": (7556406, 15840810), "6": (1225388, 1244690),
    "7": (556900, 3299879), "10": (1224026, 1224136),
    "11": (918052, 920053), "12": (14258874, 14258875),
    "13": (547827, 556081), "14": (1689106, 1689153),
    "15": (1223129, 1224820), "16": (538657, 1347973),
    "17": (540033, 540139), "21": (1216232, 1224178),
    "23": (1217244, 1223430), "25": (3186264, 3186265),
    "26": (1689026, 1689064), "27": (1216289, 1216344),
    "28": (3184022, 3184023), "29": (6653144, 6653145),
    "30": (1223431, 1224819), "31": (3375723, 3375724),
    "32": (1538163, 6736069), "36": (1100813, 1100822),
    "38": (1690015, 1690016), "39": (1689389, 1689390),
    "43": (10395071, 10395074), "46": (1538171, 1538172),
    "47": (1689750, 1689751), "49": (6671251, 6671252),
    "50": (1538169, 1538170),
}
PALETTE = ("#24528a", "#c5404c", "#1e7568", "#8c4a8e", "#c2761e", "#556ca5")
EXISTING_COLORS = {"7": "#1e7568", "17": "#24528a", "39": "#c5404c"}


def route_id(ref: str) -> str:
    return "demo-" + {"А": "a", "T1": "t1", "T2": "t2", "6к": "6k"}.get(ref, ref)


def route_color(ref: str) -> str:
    index = int(sha256(ref.encode("utf-8")).hexdigest()[:8], 16) % len(PALETTE)
    return EXISTING_COLORS.get(ref, PALETTE[index])


def fetch_relation(relation_id: int) -> dict:
    url = f"https://api.openstreetmap.org/api/0.6/relation/{relation_id}/full"
    request = Request(url, headers={"User-Agent": "hackaton_asumadi demo map import"})
    for attempt in range(4):
        try:
            with urlopen(request, timeout=60) as response:
                root = ET.parse(response).getroot()
            break
        except (HTTPError, URLError, TimeoutError):
            if attempt == 3:
                raise
            sleep(2 ** attempt)
    relation = next(item for item in root.findall("relation") if item.get("id") == str(relation_id))
    nodes = {item.get("id"): item for item in root.findall("node")}
    ways = {item.get("id"): item for item in root.findall("way")}
    stop_rows = []
    line_rows = []
    for member in relation.findall("member"):
        kind, ref, role = member.get("type"), member.get("ref"), member.get("role", "")
        if kind == "node" and role.startswith("stop"):
            node = nodes.get(ref)
            if node is None:
                continue
            tags = {tag.get("k"): tag.get("v") for tag in node.findall("tag")}
            stop_rows.append({
                "osm_node_id": int(ref),
                "name": tags.get("name") or "Трамвайная остановка",
                "lat": float(node.get("lat")),
                "lon": float(node.get("lon")),
            })
        elif kind == "way" and role == "":
            way = ways.get(ref)
            if way is None:
                continue
            coordinates = []
            for nd in way.findall("nd"):
                node = nodes.get(nd.get("ref"))
                if node is not None:
                    coordinates.append([float(node.get("lon")), float(node.get("lat"))])
            if len(coordinates) >= 2:
                line_rows.append(coordinates)
    if not stop_rows or not line_rows:
        raise ValueError(f"OSM relation {relation_id} has no usable stops or track geometry")
    return {"relation_id": relation_id, "stops": stop_rows, "lines": line_rows}


def short_turn(source: dict, start_stop: int, end_stop: int) -> dict:
    """Clip an ordered OSM route at two stops without inventing track geometry."""
    stops = source["stops"]
    if not 0 <= start_stop < end_stop < len(stops):
        raise ValueError("Invalid short-turn stop range")
    oriented = []
    previous = None
    for source_line in source["lines"]:
        line = list(source_line)
        anchor = [stops[0]["lon"], stops[0]["lat"]] if previous is None else previous
        if sum((line[-1][i] - anchor[i]) ** 2 for i in (0, 1)) < sum(
            (line[0][i] - anchor[i]) ** 2 for i in (0, 1)
        ):
            line.reverse()
        oriented.append(line)
        previous = line[-1]

    def closest(stop: dict) -> tuple[int, int]:
        return min(
            ((line_index, point_index) for line_index, line in enumerate(oriented)
             for point_index in range(len(line))),
            key=lambda location: sum(
                (oriented[location[0]][location[1]][axis] - stop[coordinate]) ** 2
                for axis, coordinate in ((0, "lon"), (1, "lat"))
            ),
        )

    first = closest(stops[start_stop])
    last = closest(stops[end_stop])
    if first >= last:
        raise ValueError("OSM track order does not match short-turn stops")
    lines = []
    for line_index in range(first[0], last[0] + 1):
        line = oriented[line_index]
        begin = first[1] if line_index == first[0] else 0
        end = last[1] + 1 if line_index == last[0] else len(line)
        if end - begin >= 2:
            lines.append(line[begin:end])
    if not lines:
        raise ValueError("Short-turn has no track geometry")
    return {"relation_id": source["relation_id"], "stops": stops[start_stop:end_stop + 1], "lines": lines}


def main() -> None:
    relation_ids = sorted({relation for pair in RELATIONS.values() for relation in pair})
    with ThreadPoolExecutor(max_workers=3) as pool:
        downloaded = dict(zip(relation_ids, pool.map(fetch_relation, relation_ids)))
    routes = []
    for ref, relation_pair in RELATIONS.items():
        directions = [downloaded[relation_id] for relation_id in relation_pair]
        display_ref = {"T1": "Т1", "T2": "Т2"}.get(ref, ref)
        routes.append({
            "id": route_id(ref),
            "name": f"Трамвай {display_ref} · демопрогноз",
            "color": route_color(ref),
            "directions": directions,
        })
        print(ref, [(len(row["stops"]), len(row["lines"])) for row in directions], flush=True)
        if ref == "6":
            short_directions = [
                short_turn(downloaded[1244690], 0, 14),
                short_turn(downloaded[1225388], 12, 27),
            ]
            routes.append({
                "id": route_id("6к"),
                "name": "Трамвай 6к · демопрогноз",
                "color": route_color("6к"),
                "note": "Short turn clipped from the two OSM route 6 relations at Восточный мост.",
                "directions": short_directions,
            })
            print("6к", [(len(row["stops"]), len(row["lines"])) for row in short_directions], flush=True)
    payload = {
        "source": "OpenStreetMap contributors",
        "license": "ODbL 1.0",
        "attribution_url": "https://www.openstreetmap.org/copyright",
        "note": "OSM tram route relations; geographic data only. All load forecasts remain synthetic.",
        "routes": routes,
    }
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT}")


if __name__ == "__main__":
    main()
