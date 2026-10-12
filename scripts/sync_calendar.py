"""Synchro du planning Muscu App vers le calendrier iCloud (SPECS.md §2.3).

Sens unique app → calendrier. Lit dans Supabase :
  - le programme actif et son planning mis en cache par l'app (`schedule`),
  - les séances terminées (horaires réels + résumé des séries).
Puis crée / met à jour / supprime les événements du calendrier iCloud
"Musculation" (le même que la V4). Les événements de l'app ont un UID en
`@muscu-app` : ceux de la V4 (`@agent-muscu`) ne sont jamais touchés.

Variables d'environnement (secrets GitHub Actions) :
  SUPABASE_SECRET_KEY   clé secrète Supabase (sb_secret_… ou service_role)
  ICLOUD_APPLE_ID       identifiant Apple
  ICLOUD_APP_PASSWORD   mot de passe d'application Apple

Logique CalDAV reprise de agent-Muscu-ics/sync_to_icloud.py (V4).
"""

from __future__ import annotations

import json
import os
import sys
import time
from datetime import datetime, timedelta
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo

SUPABASE_URL = "https://ndxsyluprxsrvyvmtrpr.supabase.co"
ICLOUD_CALDAV_URL = "https://caldav.icloud.com/"
ICLOUD_CALENDAR_NAME = "Musculation"
UID_SUFFIX = "@muscu-app"
TIMEZONE = ZoneInfo("Europe/Paris")
REQUEST_DELAY_SECONDS = 0.3


# ---------------------------------------------------------------------------
# Lecture Supabase


def supabase_get(table: str, key: str) -> list[dict]:
    """Toutes les lignes non supprimées d'une table (la clé secrète ignore les RLS)."""
    headers = {"apikey": key}
    # Les anciennes clés service_role sont des JWT à passer aussi en Bearer ;
    # les nouvelles clés sb_secret_… ne s'utilisent que dans `apikey`.
    if key.startswith("ey"):
        headers["Authorization"] = f"Bearer {key}"
    rows: list[dict] = []
    page = 1000
    offset = 0
    while True:
        url = f"{SUPABASE_URL}/rest/v1/{table}?select=data&deleted=eq.false&order=id&limit={page}&offset={offset}"
        with urlopen(Request(url, headers=headers), timeout=30) as resp:
            batch = json.load(resp)
        rows.extend(r["data"] for r in batch)
        if len(batch) < page:
            return rows
        offset += page


# ---------------------------------------------------------------------------
# Événements voulus (logique pure, testable sans réseau)


def _fmt_num(n: float) -> str:
    return f"{n:g}".replace(".", ",")


def describe_session(session: dict, exercise_names: dict[str, str]) -> str:
    """Résumé texte des séries faites, pour la description de l'événement."""
    lines = []
    for block in session.get("blocks", []):
        if block.get("kind") == "classic":
            for ex in block.get("exercises", []):
                sets = [s for s in ex.get("sets", []) if s.get("done")]
                if not sets:
                    continue
                parts = []
                for s in sets:
                    load = s.get("load")
                    reps = s.get("reps")
                    txt = f"{_fmt_num(load)}×{reps}" if load is not None else f"{reps}"
                    if s.get("rpe") is not None:
                        txt += f" @{_fmt_num(s['rpe'])}"
                    parts.append(txt)
                lines.append(f"{exercise_names.get(ex.get('exerciseId'), '?')} : {', '.join(parts)}")
        elif block.get("kind") == "wod" and block.get("done"):
            names = ", ".join(exercise_names.get(it.get("exerciseId"), "?") for it in block.get("items", []))
            lines.append(f"WOD ({names}) : {describe_score(block.get('score'))}")
    return "\n".join(lines)


def describe_score(score: dict | None) -> str:
    if not score:
        return "—"
    t = score.get("type")
    if t == "time":
        sec = int(score.get("sec", 0))
        return f"{sec // 60}:{sec % 60:02d}"
    if t == "rounds":
        reps = score.get("reps") or 0
        return f"{score.get('rounds', 0)} tours" + (f" + {reps}" if reps else "")
    if t == "intervals":
        return f"{score.get('held', 0)}/{score.get('total', 0)} intervalles"
    if t == "reps":
        return f"{sum(score.get('perInterval', []))} reps"
    return "—"


def _slot_times(day: str, slot: dict) -> tuple[datetime, datetime]:
    y, m, d = (int(p) for p in day.split("-"))
    hh, mm = (int(p) for p in slot.get("start", "08:00").split(":"))
    start = datetime(y, m, d, hh, mm, tzinfo=TIMEZONE)
    return start, start + timedelta(minutes=int(slot.get("durationMin", 60)))


def _ms_to_dt(ms: int) -> datetime:
    return datetime.fromtimestamp(ms / 1000, tz=TIMEZONE)


def desired_events(programs: list[dict], sessions: list[dict], exercises: list[dict]) -> dict[str, dict]:
    """UID → {summary, start, end, description} de tous les événements voulus.

    - Séances terminées : horaires réels, titre préfixé ✓, résumé des séries.
    - Séances planifiées du programme actif : créneau du programme.
    """
    names = {e["id"]: e.get("name", "?") for e in exercises}
    events: dict[str, dict] = {}
    done_by_key: dict[str, dict] = {}

    for s in sessions:
        if s.get("status") != "done" or not s.get("completedAt"):
            continue
        if s.get("source") == "notion":
            continue  # déjà dans le calendrier via la V4 (événements @agent-muscu)
        ref = s.get("programRef")
        if ref:
            done_by_key[ref["key"]] = s
        end = _ms_to_dt(s["completedAt"])
        start = _ms_to_dt(s["startedAt"]) if s.get("startedAt") else end - timedelta(hours=1)
        # Une séance oubliée ouverte toute la nuit ne doit pas occuper la journée.
        if end - start > timedelta(hours=4):
            start = end - timedelta(hours=1)
        events[f"session-{s['id']}{UID_SUFFIX}"] = {
            "summary": f"✓ {s.get('name', 'Séance')}",
            "start": start,
            "end": end,
            "description": describe_session(s, names),
        }

    for p in programs:
        if not p.get("active"):
            continue
        slot = p.get("calendarSlot") or {}
        for entry in p.get("schedule") or []:
            if entry.get("status") == "done" or entry["key"] in done_by_key or not entry.get("date"):
                continue  # déjà représentée par l'événement de la séance faite
            start, end = _slot_times(entry["date"], slot)
            events[f"plan-{entry['key']}{UID_SUFFIX}"] = {
                "summary": entry.get("title", "Séance"),
                "start": start,
                "end": end,
                "description": f"Programme : {p.get('name', '')}",
            }
    return events


# ---------------------------------------------------------------------------
# iCloud (CalDAV)


def build_ical_bytes(uid: str, ev: dict) -> bytes:
    from icalendar import Calendar, Event

    event = Event()
    event.add("uid", uid)
    event.add("summary", ev["summary"])
    event.add("dtstart", ev["start"])
    event.add("dtend", ev["end"])
    if ev.get("description"):
        event.add("description", ev["description"])
    event.add("dtstamp", datetime.now(tz=ZoneInfo("UTC")))
    cal = Calendar()
    cal.add("prodid", "-//Muscu App//sync_calendar//FR")
    cal.add("version", "2.0")
    cal.add_component(event)
    return cal.to_ical()


def event_signature(ev: dict) -> str:
    """Empreinte du contenu, pour ne réécrire que les événements qui changent."""
    # Comparaison sur l'instant (iCloud peut renvoyer les heures en UTC).
    return json.dumps([ev["summary"], ev["start"].timestamp(), ev["end"].timestamp(), ev.get("description", "")])


def load_app_events(calendar) -> dict[str, tuple[object, str]]:
    """UID → (événement CalDAV, empreinte) pour les événements de l'app.

    Listing complet plutôt que event_by_uid() : ce dernier renvoie 412 sur
    iCloud avec la lib caldav (constaté en V4)."""
    from icalendar import Calendar

    index = {}
    for obj in calendar.events():
        try:
            parsed = Calendar.from_ical(obj.data)
        except ValueError:
            continue
        for comp in parsed.walk("VEVENT"):
            uid = str(comp.get("uid"))
            if uid.endswith(UID_SUFFIX):
                current = {
                    "summary": str(comp.get("summary", "")),
                    "start": comp.decoded("dtstart"),
                    "end": comp.decoded("dtend"),
                    "description": str(comp.get("description", "")),
                }
                index[uid] = (obj, event_signature(current))
            break
    return index


def main() -> None:
    key = os.environ.get("SUPABASE_SECRET_KEY", "").strip()
    apple_id = os.environ.get("ICLOUD_APPLE_ID", "").strip()
    app_password = os.environ.get("ICLOUD_APP_PASSWORD", "").strip()
    if not key or not apple_id or not app_password:
        # Pas d'échec (le workflow tourne toutes les heures) : simple avertissement.
        print("::warning::Synchro calendrier non configurée : secrets SUPABASE_SECRET_KEY, ICLOUD_APPLE_ID, ICLOUD_APP_PASSWORD manquants.")
        return

    programs = supabase_get("programs", key)
    sessions = supabase_get("sessions", key)
    exercises = supabase_get("exercises", key)
    wanted = desired_events(programs, sessions, exercises)
    print(f"Supabase : {len(programs)} programme(s), {len(sessions)} séance(s) → {len(wanted)} événement(s) voulu(s).")

    import caldav

    client = caldav.DAVClient(url=ICLOUD_CALDAV_URL, username=apple_id, password=app_password)
    principal = client.principal()
    calendar = next((c for c in principal.calendars() if c.name == ICLOUD_CALENDAR_NAME), None)
    if calendar is None:
        calendar = principal.make_calendar(name=ICLOUD_CALENDAR_NAME)
    existing = load_app_events(calendar)

    created = updated = unchanged = deleted = failed = 0
    for uid, ev in wanted.items():
        try:
            current = existing.get(uid)
            if current and current[1] == event_signature(ev):
                unchanged += 1
                continue
            data = build_ical_bytes(uid, ev)
            if current:
                obj = current[0]
                obj.data = data
                obj.save()
                updated += 1
            else:
                calendar.save_event(data)
                created += 1
            time.sleep(REQUEST_DELAY_SECONDS)
        except Exception as e:  # une erreur sur un événement ne bloque pas les autres
            print(f"ERREUR sur {uid} : {e}", file=sys.stderr)
            failed += 1

    for uid, (obj, _) in existing.items():
        if uid not in wanted:
            try:
                obj.delete()
                deleted += 1
            except Exception as e:
                print(f"ERREUR suppression {uid} : {e}", file=sys.stderr)
                failed += 1

    print(f"Terminé. Créés : {created} | Mis à jour : {updated} | Inchangés : {unchanged} | Supprimés : {deleted} | Échecs : {failed}")
    if failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
