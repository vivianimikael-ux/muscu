"""Tests de la partie pure de sync_calendar.py (sans réseau ni dépendance).

    python3 -m unittest discover scripts
"""

import unittest
from datetime import datetime
from zoneinfo import ZoneInfo

from sync_calendar import desired_events, describe_session

PARIS = ZoneInfo("Europe/Paris")


def ms(y, m, d, h, mi):
    return int(datetime(y, m, d, h, mi, tzinfo=PARIS).timestamp() * 1000)


EXERCISES = [{"id": "squat", "name": "Squat"}, {"id": "burpee", "name": "Burpees"}]

PROGRAM = {
    "id": "p",
    "name": "Force",
    "active": True,
    "calendarSlot": {"start": "07:30", "durationMin": 75},
    "schedule": [
        {"key": "b:0:s1", "date": "2026-10-12", "title": "Jambes · Force S1", "status": "done"},
        {"key": "b:0:s2", "date": "2026-10-14", "title": "Haut · Force S1", "status": "planned"},
    ],
}

DONE = {
    "id": "sess1",
    "name": "Jambes · Force S1",
    "status": "done",
    "startedAt": ms(2026, 10, 12, 18, 0),
    "completedAt": ms(2026, 10, 12, 19, 10),
    "programRef": {"key": "b:0:s1"},
    "blocks": [
        {
            "kind": "classic",
            "exercises": [
                {
                    "exerciseId": "squat",
                    "sets": [
                        {"load": 100, "reps": 5, "rpe": 8, "done": True},
                        {"load": 102.5, "reps": 5, "done": True},
                        {"load": 105, "reps": 5, "done": False},
                    ],
                }
            ],
        },
        {"kind": "wod", "done": True, "items": [{"exerciseId": "burpee"}], "score": {"type": "rounds", "rounds": 5, "reps": 3}},
    ],
}


class DesiredEventsTest(unittest.TestCase):
    def test_seance_faite_horaires_reels_et_resume(self):
        ev = desired_events([PROGRAM], [DONE], EXERCISES)["session-sess1@muscu-app"]
        self.assertEqual(ev["summary"], "✓ Jambes · Force S1")
        self.assertEqual(ev["start"].hour, 18)
        self.assertEqual(ev["description"], "Squat : 100×5 @8, 102,5×5\nWOD (Burpees) : 5 tours + 3")

    def test_seance_planifiee_au_creneau_du_programme(self):
        events = desired_events([PROGRAM], [DONE], EXERCISES)
        ev = events["plan-b:0:s2@muscu-app"]
        self.assertEqual((ev["start"].hour, ev["start"].minute), (7, 30))
        self.assertEqual((ev["end"] - ev["start"]).seconds, 75 * 60)
        # La séance faite n'est pas dupliquée en "planifiée".
        self.assertNotIn("plan-b:0:s1@muscu-app", events)

    def test_programme_inactif_ignore(self):
        events = desired_events([{**PROGRAM, "active": False}], [], EXERCISES)
        self.assertEqual(events, {})

    def test_seance_oubliee_ouverte_limitee_a_une_heure(self):
        s = {**DONE, "startedAt": ms(2026, 10, 11, 18, 0)}
        ev = desired_events([], [s], EXERCISES)["session-sess1@muscu-app"]
        self.assertEqual((ev["end"] - ev["start"]).seconds, 3600)

    def test_seances_importees_de_notion_ignorees(self):
        self.assertEqual(desired_events([], [{**DONE, "source": "notion", "programRef": None}], EXERCISES), {})

    def test_resume_ignore_series_non_faites(self):
        self.assertNotIn("105", describe_session(DONE, {"squat": "Squat"}))


if __name__ == "__main__":
    unittest.main()
