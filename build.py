#!/usr/bin/env python3
"""Compile every entry in content/entries/*.json into data/garden.json.

The CMS (admin/) writes one JSON file per entry. The site reads one combined
file, so this script runs on every deploy (see netlify.toml) and locally
before previewing:

    python3 build.py

Standard library only — no installs needed.
"""
import datetime
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SRC = ROOT / "content" / "entries"
OUT = ROOT / "data" / "garden.json"

TYPES = {"node", "branch"}
STATUSES = {"fresh", "budding", "bloomed"}
TAGS = {"document", "link", "photo", "drawing", "video", "audio"}


def norm_date(value):
    """Accept 'YYYY-MM-DD' or a full ISO datetime; return 'YYYY-MM-DD' or None."""
    if not value:
        return None
    text = str(value).strip()[:10]
    try:
        datetime.date.fromisoformat(text)
    except ValueError:
        return None
    return text


def as_list(value):
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [v for v in value if v not in (None, "")]
    return [value]


def load_entry(path, warnings):
    try:
        data = json.loads(path.read_text("utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        warnings.append(f"{path.name}: skipped, not valid JSON ({exc})")
        return None

    entry_type = data.get("type") if data.get("type") in TYPES else "branch"
    status = data.get("status") if data.get("status") in STATUSES else "fresh"
    tags = [t for t in as_list(data.get("tags")) if t in TAGS]
    planted = norm_date(data.get("planted")) or datetime.date.today().isoformat()
    tended = norm_date(data.get("tended")) or planted

    attachments = []
    for item in as_list(data.get("attachments")):
        if isinstance(item, dict) and item.get("file"):
            attachments.append({"label": item.get("label") or Path(item["file"]).name, "file": item["file"]})
        elif isinstance(item, str):
            attachments.append({"label": Path(item).name, "file": item})

    return {
        "id": path.stem,
        "title": (data.get("title") or path.stem).strip(),
        "type": entry_type,
        "parent": None if entry_type == "node" else (data.get("parent") or None),
        "status": status,
        "tags": tags,
        "planted": planted,
        "tended": max(tended, planted),
        "image": data.get("image") or None,
        "link": data.get("link") or None,
        "attachments": attachments,
        "related": [r for r in as_list(data.get("related")) if r != path.stem],
        "body": data.get("body") or "",
    }


def main():
    warnings = []
    entries = [e for e in (load_entry(p, warnings) for p in sorted(SRC.glob("*.json"))) if e]
    ids = {e["id"] for e in entries}

    for e in entries:
        if e["type"] == "branch" and not e["parent"]:
            warnings.append(f"{e['id']}: branch has no 'connected to' — it will show under Loose seeds")
        elif e["parent"] and e["parent"] not in ids:
            warnings.append(f"{e['id']}: connected to '{e['parent']}', which doesn't exist")
        missing = [r for r in e["related"] if r not in ids]
        if missing:
            warnings.append(f"{e['id']}: related entries not found: {', '.join(missing)}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "generated": datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds"),
        "entries": entries,
    }
    OUT.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", "utf-8")

    nodes = sum(1 for e in entries if e["type"] == "node")
    print(f"Garden built: {nodes} nodes, {len(entries) - nodes} branches -> {OUT.relative_to(ROOT)}")
    for w in warnings:
        print(f"  warning: {w}", file=sys.stderr)


if __name__ == "__main__":
    main()
