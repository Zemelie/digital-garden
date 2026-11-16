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

STATUSES = {"fresh", "budding", "bloomed"}
TAGS = ["document", "link", "photo", "drawing", "video", "audio"]
AUDIO = (".mp3", ".m4a", ".wav", ".ogg", ".aac")
VIDEO = (".mp4", ".webm", ".mov")


def norm_date(value):
    """Accept 'YYYY-MM-DD' or an ISO datetime. Returns (sortable datetime, original string) or None."""
    if not value:
        return None
    text = str(value).strip()
    try:
        if len(text) == 10:
            return datetime.datetime.fromisoformat(text + "T12:00:00+00:00"), text
        parsed = datetime.datetime.fromisoformat(text.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=datetime.timezone.utc)
        return parsed, parsed.isoformat(timespec="seconds").replace("+00:00", "Z")
    except ValueError:
        return None


def as_list(value):
    if value is None or value == "":
        return []
    if isinstance(value, list):
        return [v for v in value if v not in (None, "")]
    return [value]


def guess_kind(path):
    p = path.lower()
    if p.endswith(AUDIO):
        return "audio"
    if p.endswith(VIDEO):
        return "video"
    if p.endswith((".jpg", ".jpeg", ".png", ".gif", ".webp", ".avif")):
        return "photo"
    return "document"


def collect_files(data):
    """The CMS 'Files' list: each item has a type (photo, drawing, document, audio, video, link)."""
    files = []
    for item in as_list(data.get("files")):
        if not isinstance(item, dict):
            continue
        kind = item.get("type") if item.get("type") in TAGS else None
        file, url = item.get("file") or None, item.get("url") or None
        if not (file or url):
            continue
        files.append({"kind": kind or (guess_kind(file) if file else "link"), "label": item.get("label") or "", "file": file, "url": url})
    # Older entries used separate image / link / attachments fields.
    if data.get("image"):
        files.append({"kind": "photo", "label": "", "file": data["image"], "url": None})
    if data.get("link"):
        files.append({"kind": "link", "label": "", "file": None, "url": data["link"]})
    for item in as_list(data.get("attachments")):
        file = item.get("file") if isinstance(item, dict) else item
        if file:
            label = item.get("label", "") if isinstance(item, dict) else ""
            files.append({"kind": guess_kind(file), "label": label, "file": file, "url": None})
    return files


def load_entry(path, warnings):
    try:
        data = json.loads(path.read_text("utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        warnings.append(f"{path.name}: skipped, not valid JSON ({exc})")
        return None

    parent = data.get("parent") or None
    files = collect_files(data)
    # "Type" tags: whatever was ticked, plus the kinds of any files attached.
    tags = [t for t in as_list(data.get("tags")) if t in TAGS]
    for f in files:
        if f["kind"] not in tags:
            tags.append(f["kind"])
    tags.sort(key=TAGS.index)

    planted = norm_date(data.get("planted")) or norm_date(datetime.date.today().isoformat())
    tended = norm_date(data.get("tended")) or planted
    if tended[0] < planted[0]:
        tended = planted

    return {
        "id": path.stem,
        "title": (data.get("title") or path.stem).strip(),
        # No "grows from" = a node (a new dandelion). Anything else is a branch.
        "type": "branch" if parent else "node",
        "parent": parent,
        "status": data.get("status") if data.get("status") in STATUSES else "fresh",
        "tags": tags,
        "planted": planted[1],
        "tended": tended[1],
        "attachments": files,
        "related": [r for r in as_list(data.get("related")) if r != path.stem],
        "body": data.get("body") or "",
    }


def main():
    warnings = []
    entries = [e for e in (load_entry(p, warnings) for p in sorted(SRC.glob("*.json"))) if e]
    ids = {e["id"] for e in entries}

    for e in entries:
        if e["parent"] and e["parent"] not in ids:
            warnings.append(f"{e['id']}: grows from '{e['parent']}', which doesn't exist — shown under Loose seeds")
        missing = [r for r in e["related"] if r not in ids]
        if missing:
            warnings.append(f"{e['id']}: threads to entries that don't exist: {', '.join(missing)}")

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
