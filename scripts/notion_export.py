"""Export brut de la base Notion du coach (import unique, SPECS.md §8.2).

Réutilise tel quel le scraping de la V4 (agent-Muscu-ics/sync_to_icloud.py)
et écrit import/notion-raw.json (dossier ignoré par git : données
personnelles, repo public).

Cookie : ~/.config/agent-muscu/notion_session.txt (procédure de
renouvellement dans agent-Muscu/CLAUDE.md), jamais affiché.

    python3 scripts/notion_export.py
"""

from __future__ import annotations

import json
import os
import sys
import time
import types
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
V4_SCRIPT = ROOT.parent / "agent-Muscu-ics" / "sync_to_icloud.py"
COOKIE_PATH = Path.home() / ".config" / "agent-muscu" / "notion_session.txt"
OUTPUT = ROOT / "import" / "notion-raw.json"


def load_v4() -> types.ModuleType:
    """Charge le module V4 sans ses dépendances calendrier (inutiles ici)."""
    for name in ("caldav", "icalendar"):
        stub = types.ModuleType(name)
        stub.Calendar = stub.Event = object  # type: ignore[attr-defined]
        sys.modules.setdefault(name, stub)
    source = V4_SCRIPT.read_text(encoding="utf-8")
    module = types.ModuleType("v4")
    module.__file__ = str(V4_SCRIPT)
    exec(compile(source, str(V4_SCRIPT), "exec"), module.__dict__)
    return module


def main() -> None:
    if not COOKIE_PATH.exists():
        raise SystemExit(f"Cookie Notion introuvable : {COOKIE_PATH}")
    token = COOKIE_PATH.read_text(encoding="utf-8").strip()
    v4 = load_v4()

    collection_id, table_view_id, _ = v4.fetch_collection_info(token)
    rows = v4.fetch_rows(token, collection_id, table_view_id)
    print(f"{len(rows)} lignes dans la base Notion.")

    movement_cache: dict = {}
    sessions = []
    for i, row in enumerate(rows, 1):
        if not row.get("Titre") or not row.get("Date"):
            continue
        exercises, freeform = v4.fetch_session_details(token, row["_id"])
        for ex in exercises:
            for mention in v4.get_movement_mentions(ex):
                v4.resolve_movement_name(token, mention, movement_cache)
        sessions.append(
            {
                "id": row["_id"],
                "title": row.get("Titre"),
                "date": row.get("Date"),
                "type": row.get("Type", ""),
                "done": row.get("Séance ok") == "Yes",
                "freeform": freeform,
                "exercises": [
                    {
                        "name": v4.exercise_display_name(ex, movement_cache, n),
                        "sets": v4.get_field_text(ex, "Séries"),
                        "reps": v4.get_field_text(ex, "Répétitions"),
                        "target": v4.get_field_text(ex, "Charge cible"),
                        "actual": v4.get_field_text(ex, "Charge réelle"),
                        "rest": v4.get_field_text(ex, "Récupération"),
                        "details": v4.get_details_text(ex),
                    }
                    for n, ex in enumerate(exercises, 1)
                ],
            }
        )
        if i % 20 == 0:
            print(f"  {i}/{len(rows)}…")
        time.sleep(v4.REQUEST_DELAY_SECONDS)

    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps(sorted(sessions, key=lambda s: s["date"]), ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{len(sessions)} séances exportées dans {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    os.chdir(ROOT)
    main()
