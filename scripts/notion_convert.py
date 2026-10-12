"""Conversion de l'export Notion (import/notion-raw.json) en documents de
l'app (import/notion-import.json). Règles validées avec l'utilisateur le
2026-10-12 (lettres = points de l'arbitrage) :

Séances : Strength et Mobility faites (ou non cochées mais avec des charges
réelles) ; Intensity selon INTENSITY ; Padel, course, day off et séances
futures ignorés. Échauffements / mobilité groupés ignorés.

Charges : "Barre + X" = barre 20 kg + X au total ; barre EZ 10 kg (F2) ;
pas de détail par série = même poids partout ; charge réelle vide → charge
cible (H) ; fourchette → milieu (F5) ; 2×N = N par main, ou 2N sur un
exercice unilatéral (B3) ; élastique / hauteur / longueur = sans charge (F4).

Reps : fourchette → milieu arrondi vers le bas ; "N D/G" ou "N droite puis
gauche" = N par côté (B1) ; "N au total" / "N (alterner D/G)" = N/2 par
côté (B2) ; tests xRM = une série au poids réussi + max réel pour les 1RM,
échecs ignorés (C) ; pyramides détaillées série par série (D).

Isométrie / overcoming (E, révisé le 2026-10-12) : pas d'exercice "(iso)"
ni de durée (sans intérêt pour l'utilisateur). Avec charge : séries sur
l'exercice normal, charge sans reps + note, donc hors records, 1RM et
tonnage ; sans charge : ligne ignorée. Lignes "A, B" en contraste
iso + dynamique séparées en deux exercices (G).

Tout ce qui reste non reconnu est listé dans import/residuels.md.

    python3 scripts/notion_convert.py
"""

from __future__ import annotations

import json
import math
import re
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "import" / "notion-raw.json"
OUTPUT = ROOT / "import" / "notion-import.json"
REPORT = ROOT / "import" / "residuels.md"
PARIS = ZoneInfo("Europe/Paris")
TODAY = "2026-10-12"
BAR_KG = 20.0
EZ_BAR_KG = 10.0

# Séances Intensity (A) : format du WOD et score connu.
# Lignes avec un nombre de séries = bloc force ; les autres = WOD.
INTENSITY = {
    "3319d3f5-b6e7-8010-a61b-e7415d7b72dc": {"format": {"type": "for_time", "rounds": 4}, "rounds": 4},
    "3399d3f5-b6e7-8009-adae-d9bd1a1af795": {"format": {"type": "amrap", "durationSec": 1200}},
    "3409d3f5-b6e7-8081-bbfd-d0c92c52d230": {"format": {"type": "amrap", "durationSec": 1200}, "rounds": 3.5},
    "3409d3f5-b6e7-80c8-96d4-e0ecd1353908": {"format": {"type": "amrap", "durationSec": 1200}},
    "3409d3f5-b6e7-80f7-b30f-c8fe26b0a4bd": {"format": {"type": "amrap", "durationSec": 1200}, "rounds": 4},
    "3559d3f5-b6e7-804d-98fd-c35ef2f7a18e": {"format": {"type": "for_time", "rounds": 5}, "rounds": 5},
    "38d9d3f5-b6e7-8003-9bdf-cf7ad5f15a89": {"format": {"type": "amrap", "durationSec": 1500}},
}

# Exercices Notion → bibliothèque de départ de l'app (avec son type de mesure).
SEED_MAP = {
    "pull up": ("seed-tractions", "bodyweight"),
    "bench press": ("seed-developpe-couche", "barbell"),
    "deadlift": ("seed-souleve-de-terre", "barbell"),
    "strict press": ("seed-developpe-militaire", "barbell"),
    "squat": ("seed-squat", "barbell"),
    "front squat": ("seed-front-squat", "barbell"),
    "rowing": ("seed-rowing-barre", "barbell"),
    "hip thrust": ("seed-hip-thrust", "barbell"),
    "kb swing": ("seed-kettlebell-swing", "barbell"),
    "push up": ("seed-pompes", "bodyweight"),
    "dips": ("seed-dips", "bodyweight"),
    "burpees": ("seed-burpees", "reps"),
    "thrusters": ("seed-thrusters", "barbell"),
    "rameur": ("seed-rameur", "distance"),
    "skierg": ("seed-ski-erg", "calories"),
    "farmer carry": ("seed-farmer-carry", "distance"),
    "legs curl": ("seed-leg-curl", "machine"),
    "legs extension": ("seed-leg-extension", "machine"),
    "jump box": ("seed-box-jumps", "reps"),
    "single-arm dumbbell row": ("seed-rowing-haltere", "unilateral"),
    "single-arm dumbbell row (bench-supported)": ("seed-rowing-haltere", "unilateral"),
    "biceps curl": ("seed-curl-halteres", "dumbbell"),
}

SEED_MUSCLES = {
    "seed-tractions": (["dos"], ["biceps"]),
    "seed-developpe-couche": (["pectoraux"], ["triceps", "epaules"]),
    "seed-souleve-de-terre": (["ischios", "fessiers", "lombaires"], ["dos", "trapezes", "avant-bras"]),
    "seed-squat": (["quadriceps", "fessiers"], ["ischios", "lombaires"]),
    "seed-hip-thrust": (["fessiers"], ["ischios"]),
    "seed-front-squat": (["quadriceps"], ["fessiers", "abdos"]),
    "seed-kettlebell-swing": (["fessiers", "ischios"], ["lombaires", "epaules"]),
}

# Lignes dont l'exercice réel n'est indiqué que dans la note du coach.
NAME_FIXES = {
    "3769d3f5-b6e7-806f-97ae-c782cb0bd787#1": "Deadlift Trap Bar",  # 08/06 : "Squat" mais note "TRAP BAR" (3RM)
}

# Corrections manuelles des muscles devinés.
MUSCLE_FIXES = {
    "Pigeon Loaded": (["fessiers"], []),
    "Hip Flexor strengthening": (["abdos"], ["quadriceps"]),
    "Single Arm Floor Press Bridge": (["pectoraux"], ["triceps", "fessiers"]),
}

BODYWEIGHT_WORDS = ("pull up", "push up", "dips", "nordic", "sissy")
UNILATERAL_WORDS = ("single", "unilateral", "split", "lunge", "cossack", "cossak", "step")

MOBILITY_WORDS = (
    "t spine", "t-spine", "scapular", "90/90", "ankle", "deep squat standing", "thoracic", "dead bug",
    "external shoulder rotation", "hip flexor", "jefferson curl squat", "dynamic scorpion", "prone back extension",
    "tibialis", "banded hip abduction", "lunges rotation", "wall sit",
)

MUSCLE_RULES = [
    (("pallof", "rotation", "plank", "hollow", "get-up", "sit-up", "windmill", "antirotation", "carry", "assymetrical", "tilts", "spinal", "slam"), ["abdos"], []),
    (("nordic", "leg curl", "legs curl"), ["ischios"], []),
    (("rdl", "deadlift", "back extension", "jefferson", "swing"), ["ischios", "fessiers"], ["lombaires"]),
    (("hip thrust", "bridge"), ["fessiers"], ["ischios"]),
    (("adductor",), ["fessiers"], ["abdos"]),
    (("squat", "lunge", "split", "step", "cossack", "cossak", "sissy", "sled push"), ["quadriceps", "fessiers"], []),
    (("jump", "hop", "bound", "pogo", "plyometric", "high knee"), ["quadriceps"], ["mollets", "fessiers"]),
    (("snatch", "thruster", "push press", "high pull", "triple extension"), ["quadriceps", "epaules"], ["fessiers"]),
    (("strict press", "landmine press", "overhead"), ["epaules"], ["triceps"]),
    (("bench", "floor press", "chest press", "push up", "dips"), ["pectoraux"], ["triceps", "epaules"]),
    (("skull", "triceps"), ["triceps"], []),
    (("curl",), ["biceps"], ["avant-bras"]),
    (("row", "pull"), ["dos"], ["biceps"]),
    (("isometric hold", "grip"), ["avant-bras"], []),
    (("rameur", "skierg", "bikeerg"), ["cardio"], []),
]

NUM = r"(\d+(?:[.,]\d+)?)"


def num(s: str) -> float:
    return float(s.replace(",", "."))


def norm(s: str) -> str:
    # Apostrophes et guillemets typographiques convertis AVANT de retirer les
    # caractères non ASCII (sinon 5” devient 5).
    s = s.replace("’", "'").replace("‘", "'").replace("”", '"').replace("“", '"')
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode()
    return re.sub(r"\s+", " ", s.strip().lower())


def slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", norm(s)).strip("-")


def mid(a: float, b: float) -> float:
    return (a + b) / 2


def mid_floor(a: float, b: float) -> int:
    return int(math.floor(mid(a, b)))


class Residual(Exception):
    """Valeur non interprétable automatiquement."""


# ---------------------------------------------------------------------------
# Lecture des champs. Une "prescription" décrit les séries d'une ligne :
# liste de (reps | secondes | mètres, charge | None), plus des indicateurs.


def parse_duration(t: str) -> float | None:
    """'30"', '45s', "1'", '1min' → secondes."""
    t = t.strip()
    if m := re.fullmatch(NUM + r"\s*(s|sec|\")", t):
        return num(m[1])
    if m := re.fullmatch(NUM + r"\s*('|min)", t):
        return num(m[1]) * 60
    return None


def parse_duration_range(t: str) -> float | None:
    """'45" - 1'', '30 a 1'', '6-10s' → milieu, en secondes."""
    t = norm(t)
    if (d := parse_duration(t)) is not None:
        return d
    m = re.fullmatch(r"(.+?)\s*(?:-|a)\s*(.+)", t)
    if not m:
        return None
    a, b = m[1].strip(), m[2].strip()
    db = parse_duration(b)
    if db is None:
        return None
    da = parse_duration(a)
    if da is None and re.fullmatch(NUM, a):
        # Unité implicite reprise de la borne haute ("6-10s"), ou secondes si la borne haute est en minutes ("30 a 1'").
        da = num(a) if re.search(r"(s|\")$", b) else num(a)
    return mid(da, db) if da is not None else None


def parse_sets(text: str) -> int | None:
    t = norm(text)
    if not t or t.startswith("pyramid"):
        return None  # séries déduites des reps / charges
    if m := re.fullmatch(r"(\d+)", t):
        return int(m[1])
    if m := re.fullmatch(r"(\d+)\s*-\s*(\d+)", t):
        return mid_floor(int(m[1]), int(m[2]))
    raise Residual(text)


class Reps:
    """Résultat de lecture des reps."""

    def __init__(self, qty=None, unit="reps", unilateral=False, groups=None, iso=False, rm=None, sets=None, per_round=None):
        self.qty = qty  # quantité par série
        self.unit = unit  # 'reps' | 's' | 'm'
        self.unilateral = unilateral
        self.groups = groups  # pyramide : [(nb_séries, reps)]
        self.iso = iso  # isométrie / overcoming (E)
        self.rm = rm  # test de max xRM (C)
        self.sets = sets  # séries imposées par le texte ("4x3")
        self.per_round = per_round  # [(reps, lesté?)] ex. "4 lesté + 8 à vide" (D3)


def parse_reps(text: str) -> Reps:
    t = norm(text.replace("\n", " "))
    if not t:
        return Reps()
    if re.search(r"max|echec|jusqu|longueur", t):
        return Reps()  # D6 : séries sans nombre de reps (ou longueur de terrain)
    if m := re.fullmatch(r"(\d)\s*rm", t):
        return Reps(qty=int(m[1]), rm=int(m[1]))
    if "overcoming" in t or "position basse" in t or re.search(r"\biso\b", t):
        d = parse_duration_range(re.sub(r"\(.*?\)|overcoming|position basse|\biso\b|en charge", "", t).strip())
        if d is None:
            raise Residual(text)
        return Reps(qty=int(d), unit="s", iso=True)
    # Pyramides : "6 - 3 - 1 - 2x3", "pyramidal : 1x6 reps - 1x3 reps - ..."
    p = re.sub(r"^pyramidal\s*:?\s*", "", t)
    p = re.sub(r"\s*\breps?\b", "", p)
    parts = [x.strip() for x in p.split(" - ")]
    if len(parts) >= 3 and all(re.fullmatch(r"(\d+x)?\d+", x) for x in parts):
        groups = []
        for x in parts:
            c, _, r = x.rpartition("x")
            groups.append((int(c) if c else 1, int(r)))
        return Reps(groups=groups)
    if m := re.fullmatch(r"(\d+)\s*lest[ea]\s*\+\s*(\d+)\s*(poids de corps|a vide)", t):
        return Reps(per_round=[(int(m[1]), True), (int(m[2]), False)])
    if m := re.fullmatch(r"(\d+)\s*x\s*(\d+)", t):
        return Reps(qty=int(m[2]), sets=int(m[1]))
    if m := re.fullmatch(r"(\d+)\s*\(\s*one shot\s*\)", t):
        return Reps(qty=int(m[1]), sets=1)

    total = bool(re.search(r"au total|\(alterner d/g\)|\(au total", t)) and not re.search(r"\d+\s*d/g\s*\(donc", t)
    unilateral = bool(re.search(r"d\s*/\s*g|droite|gauche|alterne", t)) or total
    # On ne garde que le nombre (ou la fourchette) de tête et son unité.
    head = re.match(r"(\d+(?:[.,]\d+)?)(?:\s*(?:-|/)\s*(\d+(?:[.,]\d+)?))?\s*(m\b|s\b|\"|'|min\b)?", t)
    if not head:
        raise Residual(text)
    a, b, unit = num(head[1]), num(head[2]) if head[2] else None, head[3]
    rest = t[head.end():].strip()
    if unit is None and rest.startswith(("a ", "a1")):
        d = parse_duration_range(t)
        if d is not None:
            return Reps(qty=int(d), unit="s")
    value = mid(a, b) if b is not None else a
    if unit in ("s", '"'):
        return Reps(qty=int(math.floor(value)), unit="s", unilateral=unilateral)
    if unit in ("'", "min"):
        return Reps(qty=int(value * 60), unit="s", unilateral=unilateral)
    if unit == "m":
        return Reps(qty=int(math.floor(value)), unit="m", unilateral=unilateral)
    if rest and not re.fullmatch(
        r"(\(.*\)|d\s*/\s*g.*|-?\s*alterner?.*|alterne.*|droite.*|faire droite.*|au total.*|cercles.*|reps?.*|lest[ea]|repetitions?.*)", rest
    ):
        raise Residual(text)
    reps = int(math.floor(value))
    if total:
        reps = reps // 2
    return Reps(qty=reps, unilateral=unilateral)


class Load:
    def __init__(self, loads=None, pair=False, reps=None, pairs=None, max_load=None):
        self.loads = loads  # une charge (toutes séries) ou une par groupe / série
        self.pair = pair  # 2×N (B3)
        self.reps = reps  # reps précisées dans le texte de charge
        self.pairs = pairs  # séries détaillées [(reps, charge)] (D1, D2)
        self.max_load = max_load  # 1RM réussi (C)


def _one_load(t: str, empty_bar: float) -> float | None:
    """Une charge simple en texte normalisé, ou None si non reconnue."""
    t = t.strip().rstrip(".")
    if m := re.fullmatch(NUM + r"\s*(kg)?", t):
        return num(m[1])
    if re.fullmatch(r"(barre|barre (a )?vide|barre seule|barre vide 20 ?kg|vide)", t):
        return empty_bar
    if m := re.fullmatch(r"barre ez\s*\+\s*" + NUM + r"\s*(kg)?", t):
        return EZ_BAR_KG + num(m[1])
    if m := re.fullmatch(r"barre\s*\+\s*" + NUM + r"\s*(kg)?(\s*au total)?", t):
        return BAR_KG + num(m[1])
    if m := re.fullmatch(r"barre\s*\+\s*" + NUM + r"\s*-\s*" + NUM + r"\s*(kg)?", t):
        return BAR_KG + mid(num(m[1]), num(m[2]))  # F5
    if m := re.fullmatch(NUM + r"\s*-\s*" + NUM + r"\s*(kg)?", t):
        return mid(num(m[1]), num(m[2]))  # F5
    if m := re.fullmatch(r"(?:db|kb|balle)\s*" + NUM + r"\s*(kg)?(\s*x\s*\d+\s*m)?", t):
        return num(m[1])
    if m := re.fullmatch(NUM + r"\s*kg\s*(db|kb|sur machine|barre simple)", t):
        return num(m[1])
    if m := re.fullmatch(r"kb\s*" + NUM + r"\s*kg\s*et\s*" + NUM + r"\s*kg", t):
        return num(m[1]) + num(m[2])  # F3
    return None


def parse_load(text: str, empty_bar: float = BAR_KG) -> Load:
    raw = norm(text)
    if not raw:
        return Load()
    lines = [norm(x) for x in text.split("\n") if x.strip()]
    # Séries détaillées "3x 60 kg" / "6x80" / "1RM : 30kg" (D1, D2).
    if len(lines) >= 2 and all(re.match(r"(\d+\s*x|1\s*rm)", x) for x in lines):
        pairs, max_load = [], None
        for x in lines:
            if "echec" in x:
                continue
            if m := re.fullmatch(r"1\s*rm\s*:?\s*" + NUM + r"\s*(kg)?", x):
                pairs.append((1, num(m[1])))
                max_load = num(m[1])
                continue
            m = re.fullmatch(r"(\d+)\s*x\s*(.+)", x)
            load = _one_load(m[2], empty_bar) if m else None
            if load is None:
                raise Residual(text)
            pairs.append((int(m[1]), load))
        return Load(pairs=pairs, max_load=max_load)
    t = lines[0]
    if re.fullmatch(r"(elastique|\d+\s*cm|\d+\s*m longueur saut)", t):
        return Load()  # F4
    if m := re.fullmatch(r"(\d)\s*rm\s*" + NUM + r"\s*kg.*", raw):
        reps = int(m[1])
        return Load(loads=[num(m[2])], reps=reps, max_load=num(m[2]) if reps == 1 else None)
    if m := re.fullmatch(r"1\s*x\s*" + NUM + r"\s*kg", t):
        return Load(loads=[num(m[1])], reps=1, max_load=num(m[1]))
    if m := re.fullmatch(r"(\d+)\s*rep\.?\s+(.*)", t):
        inner = parse_load(m[2], empty_bar)
        return Load(loads=inner.loads, pair=inner.pair, reps=int(m[1]))
    if m := re.fullmatch(r"(\d+)\s*d/g\s*a\s*" + NUM + r"\s*kg", t):
        return Load(loads=[num(m[2])], reps=int(m[1]))  # F6
    if m := re.fullmatch(r"2\s*x\s*(?:haltere\s*)?" + NUM + r"\s*(kg)?\s*(db|kb)?(\s*x\s*(\d+)\s*rep)?", t):
        return Load(loads=[num(m[1])], pair=True, reps=int(m[5]) if m[5] else None)
    if re.fullmatch(r"\d+(?:[.,]\d+)?(\s*-\s*\d+(?:[.,]\d+)?){2,}\s*(kg)?", t):
        return Load(loads=[num(x) for x in re.findall(NUM, t)])
    if (one := _one_load(t, empty_bar)) is not None:
        return Load(loads=[one])
    # Une seule charge en kg accompagnée de précisions ("14kg strict", "DB 12kg en goblet").
    kg = re.findall(NUM + r"\s*kg", t)
    if len(kg) == 1 and len(re.findall(r"\d+(?:[.,]\d+)?", t)) == 1:
        return Load(loads=[num(kg[0])])
    raise Residual(text)


def parse_rest(text: str) -> int:
    t = norm(text)
    if m := re.match(r"(\d+)\s*'\s*(\d+)", t):
        return int(m[1]) * 60 + int(m[2])
    d = parse_duration_range(t.split(" ")[0]) if t else None
    return int(d) if d else 120


# ---------------------------------------------------------------------------
# Construction des séries


def build_sets(reps: Reps, load: Load, n_sets: int | None) -> list[dict]:
    """Séries {reps, load} d'une ligne."""
    if load.pairs:
        if reps.groups and len(load.pairs) == len(reps.groups):
            # Pyramide : le schéma de reps fixe le nombre de séries par palier ("2x3"),
            # les lignes de charge donnent le poids de chaque palier.
            return [{"reps": r, "load": l} for (count, _), (r, l) in zip(reps.groups, load.pairs) for _ in range(count)]
        return [{"reps": r, "load": l} for r, l in load.pairs]
    loads = load.loads or [None]
    if reps.groups:
        out = []
        for gi, (count, r) in enumerate(reps.groups):
            l = loads[gi] if len(loads) == len(reps.groups) else loads[min(gi, len(loads) - 1)] if len(loads) > 1 else loads[0]
            out += [{"reps": r, "load": l} for _ in range(count)]
        return out
    qty = load.reps if load.reps is not None else reps.qty
    if reps.rm:
        return [{"reps": qty, "load": loads[0]}]
    count = reps.sets or n_sets or (len(loads) if len(loads) > 1 else 1)
    if reps.per_round:
        out = []
        for _ in range(count):
            out += [{"reps": r, "load": loads[0] if weighted else 0} for r, weighted in reps.per_round]
        return out
    if len(loads) > 1:
        return [{"reps": qty, "load": l} for l in loads]
    return [{"reps": qty, "load": loads[0]} for _ in range(count)]


def is_warmup(name: str) -> bool:
    n = norm(name)
    return n == "wu" or ("," in n and any(w in n for w in MOBILITY_WORDS)) or any(n == w for w in MOBILITY_WORDS)


def guess_muscles(name: str) -> tuple[list[str], list[str]]:
    n = norm(name)
    for words, primary, secondary in MUSCLE_RULES:
        if any(w in n for w in words):
            return primary, secondary
    return [], []


def session_times(day: str) -> tuple[int, int]:
    y, m, d = (int(p) for p in day.split("-"))
    start = int(datetime(y, m, d, 8, 0, tzinfo=PARIS).timestamp() * 1000)
    return start, start + 3600_000


# ---------------------------------------------------------------------------


class Converter:
    def __init__(self):
        self.exercises: dict[str, dict] = {}
        self.stats: dict[str, Counter] = defaultdict(Counter)
        self.max_tests: list[dict] = []
        self.residuals: dict[str, dict] = {}

    def residual(self, kind: str, value: str, s: dict, e: dict):
        r = self.residuals.setdefault(f"{kind}:{value}", {"kind": kind, "value": value, "count": 0, "examples": []})
        r["count"] += 1
        if len(r["examples"]) < 2:
            r["examples"].append(f"{e['name']} ({s['date']})")

    def exercise_id(self, name: str, iso: bool = False, base_name: str | None = None) -> str:
        """Id d'exercice ; crée les nouveaux exercices (et leurs variantes iso)."""
        if not iso and (seed := SEED_MAP.get(norm(name))):
            return seed[0]
        display = name.strip()
        if iso and "iso" not in norm(display):
            display = f"{display} (iso)"
        key = f"notion-ex-{slug(display)}"
        if key not in self.exercises:
            src = base_name or name
            seed = SEED_MAP.get(norm(src))
            primary, secondary = SEED_MUSCLES.get(seed[0], guess_muscles(src)) if seed else guess_muscles(src)
            self.exercises[key] = {"id": key, "name": display, "primaryMuscles": primary, "secondaryMuscles": secondary}
            if iso:
                self.stats[key]["iso"] += 1
        return key

    def empty_bar_for(self, name: str) -> float:
        return 0.0 if any(w in norm(name) for w in BODYWEIGHT_WORDS) else BAR_KG

    def exercise_log(self, s: dict, idx: int, part: str, name: str, sets: list[dict], reps: Reps, load: Load, rest: int, notes, iso=False, base=None) -> dict | None:
        iso = iso or re.search(r"\biso(metric)?\b", norm(name)) is not None
        if iso:
            # Isométrie / overcoming (E, révisé) : la durée n'intéresse pas l'utilisateur.
            # Avec charge : séries sur l'exercice normal, charge sans reps (donc hors
            # records, 1RM et tonnage) + note ; sans charge : ligne ignorée.
            if not any(x["load"] for x in sets):
                return None
            sets = [{"reps": None, "load": x["load"]} for x in sets]
            notes = "\n".join(filter(None, ["Isométrie / overcoming", notes]))
            reps = Reps(unilateral=reps.unilateral)
        ex_id = self.exercise_id(name, base_name=base)
        st = self.stats[ex_id]
        st["rows"] += 1
        if reps.qty is not None or reps.groups or reps.per_round:
            st[f"unit:{reps.unit}"] += 1
        if reps.unilateral:
            st["unilateral"] += 1
        if load.pair:
            st["pair"] += 1
        if any(x["load"] for x in sets):
            st["loaded"] += 1
        key = f"{s['id']}#{idx}{part}"
        if load.max_load is None and reps.rm == 1 and load.loads and len(load.loads) == 1:
            load.max_load = load.loads[0]  # "1RM" en reps, charge dans la colonne charge (C)
        if load.max_load is not None:
            self.max_tests.append({"id": f"notion-max-{key}", "exerciseId": ex_id, "date": s["date"], "load": load.max_load})
        return {
            "id": key,
            "exerciseId": ex_id,
            "restSec": rest,
            "sets": [{"id": f"{key}:{i}", "load": x["load"], "reps": x["reps"], "done": True, "_pair": load.pair} for i, x in enumerate(sets)],
            "notes": notes or None,
        }

    def convert_row(self, s: dict, idx: int, e: dict) -> list[dict]:
        rest = parse_rest(e["rest"])
        notes = e["details"]
        load_text = e["actual"] if e["actual"].strip() else e["target"]  # H
        if "," in e["name"]:
            return self.convert_combo(s, idx, e, rest, notes, load_text)
        name = NAME_FIXES.get(f"{s['id']}#{idx}", e["name"])
        n_sets = parse_sets(e["sets"])
        reps = parse_reps(e["reps"])
        seed = SEED_MAP.get(norm(name))
        if reps.unit == "s" and seed and seed[1] not in ("time", "distance", "calories", "reps"):
            # Durée sur un exercice de force = isométrie / overcoming (précisée dans la note).
            reps.iso = True
        load = parse_load(load_text, self.empty_bar_for(name))
        if reps.qty is None and not reps.groups and not reps.per_round and not load.pairs and n_sets is None and not load.loads:
            return []  # ligne vide
        sets = build_sets(reps, load, n_sets)
        log = self.exercise_log(s, idx, "", name, sets, reps, load, rest, notes, iso=reps.iso, base=name)
        return [log] if log else []

    def convert_combo(self, s: dict, idx: int, e: dict, rest: int, notes, load_text: str) -> list[dict]:
        """G : "A, B" en contraste iso + dynamique → deux exercices."""
        names = [x.strip() for x in e["name"].split(",")]
        reps_parts = [x.strip() for x in re.split(r"\s*\+\s*", e["reps"].replace("\n", " "), maxsplit=1)]
        if len(names) != 2 or len(reps_parts) != 2:
            raise Residual(e["name"])
        lines = [x for x in load_text.split("\n") if x.strip()]
        if len(lines) == 1 and len(kg := re.findall(r"\d+(?:[.,]\d+)?\s*kg", lines[0])) == 2:
            lines = kg  # "150kg + 24kg", "90kg iso Galette 15kg dynamique"
        n_sets = parse_sets(e["sets"])
        out = []
        for i, (name, rtext) in enumerate(zip(names, reps_parts)):
            rt = norm(rtext)
            iso = i == 0 and (re.search(r"\d\s*(s\b|\")|overcoming|\biso\b|a 1'", rt) is not None or "iso" in norm(name))
            if iso:
                d = parse_duration_range(re.sub(r"overcoming|\biso\b|en charge|de \w+", "", rt).strip())
                reps = Reps(qty=int(d) if d else None, unit="s", iso=True)
            else:
                cleaned = re.sub(r"\b(explosif|dynamique|en charge|swing|pompes|box jump|de hollow|reps?)\b", "", rt).strip()
                reps = parse_reps(cleaned)
            line = lines[i] if len(lines) == 2 else (lines[0] if lines else "")
            m = re.search(NUM + r"\s*kg", norm(line))
            if len(lines) == 1:
                load = parse_load(line)
            else:
                load = Load(loads=[num(m[1])]) if m else Load()
            sets = build_sets(reps, load, n_sets)
            if log := self.exercise_log(s, idx, f"/{i}", name, sets, reps, load, rest, notes, iso=iso, base=name):
                out.append(log)
        return out

    def convert_intensity(self, s: dict, cfg: dict) -> list[dict]:
        classic, items = [], []
        for idx, e in enumerate(s["exercises"]):
            if is_warmup(e["name"]):
                continue
            if e["sets"].strip():
                classic += self.convert_row(s, idx, e)
                continue
            try:
                reps = parse_reps(e["reps"])
            except Residual:
                reps = Reps()
            load_text = e["actual"] or e["target"]
            load = parse_load(load_text, self.empty_bar_for(e["name"])) if load_text.strip() else Load()
            ex_id = self.exercise_id(e["name"])
            self.stats[ex_id]["rows"] += 1
            self.stats[ex_id][f"unit:{reps.unit}"] += 1
            if load.pair:
                self.stats[ex_id]["pair"] += 1
            if load.loads:
                self.stats[ex_id]["loaded"] += 1
            items.append({"id": f"{s['id']}#{idx}", "exerciseId": ex_id, "quantity": reps.qty or 0, "load": load.loads[0] if load.loads else None})
        blocks = []
        if classic:
            blocks.append({"id": f"notion-{s['id']}:b", "kind": "classic", "exercises": classic})
        if items:
            wod = {"id": f"notion-{s['id']}:wod", "kind": "wod", "format": cfg["format"], "items": items, "done": True}
            if (rounds := cfg.get("rounds")) is not None:
                full = int(rounds)
                partial = 0
                if rounds > full:  # demi-tour : première moitié des exercices (A3)
                    partial = sum(it["quantity"] for it in items[: math.ceil(len(items) / 2)])
                wod["score"] = {"type": "rounds", "rounds": full, "reps": partial}
            blocks.append(wod)
        return blocks

    def finalize_exercises(self):
        """Type de mesure des nouveaux exercices, déduit des données ; 2×N sur unilatéral (B3)."""
        for key, ex in self.exercises.items():
            st = self.stats[key]
            n = norm(ex["name"])
            if st["unit:s"] > st["rows"] / 2:
                measure = "time"
            elif st["unit:m"] > st["rows"] / 2:
                measure = "distance"
            elif any(w in n for w in BODYWEIGHT_WORDS):
                measure = "bodyweight"
            elif st["pair"] and not any(w in n for w in UNILATERAL_WORDS):
                measure = "dumbbell"
            elif st["unilateral"] or any(w in n for w in UNILATERAL_WORDS):
                measure = "unilateral" if st["loaded"] else "reps"
            elif st["loaded"]:
                measure = "barbell"
            else:
                measure = "reps"
            ex.update(measure=measure, maxReference="estimated", trainingMaxPct=90)
            if fix := MUSCLE_FIXES.get(ex["name"]):
                ex["primaryMuscles"], ex["secondaryMuscles"] = fix

    def measure_of(self, ex_id: str) -> str:
        if ex_id in self.exercises:
            return self.exercises[ex_id]["measure"]
        return next(m for k, (sid, m) in SEED_MAP.items() if sid == ex_id)


def main() -> None:
    raw = json.loads(RAW.read_text(encoding="utf-8"))
    c = Converter()
    sessions_out, skipped = [], Counter()

    for s in raw:
        typ = s["type"]
        if s["date"] >= TODAY:
            skipped["future"] += 1
            continue
        if typ == "Intensity":
            cfg = INTENSITY.get(s["id"])
            if not cfg:
                skipped["intensity non classée"] += 1
                continue
            try:
                blocks = c.convert_intensity(s, cfg)
            except Residual as r:
                c.residual("Intensity", str(r), s, {"name": s["title"]})
                continue
        elif typ in ("Strenght", "Mobility"):
            if not s["done"] and not any(e["actual"].strip() for e in s["exercises"]):
                skipped["non faite"] += 1
                continue
            logs = []
            for idx, e in enumerate(s["exercises"]):
                if is_warmup(e["name"]):
                    continue
                try:
                    logs += c.convert_row(s, idx, e)
                except Residual as r:
                    c.residual("Ligne", str(r), s, e)
            blocks = [{"id": f"notion-{s['id']}:b", "kind": "classic", "exercises": logs}] if logs else []
        else:
            skipped[typ or "sans type"] += 1
            continue
        if not blocks:
            skipped["aucun exercice exploitable"] += 1
            continue
        start, end = session_times(s["date"])
        sessions_out.append(
            {
                "id": f"notion-{s['id']}",
                "name": (s["title"] or "Séance").strip(),
                "status": "done",
                "startedAt": start,
                "completedAt": end,
                "source": "notion",
                "blocks": blocks,
                "notes": "\n".join(dict.fromkeys(t.strip() for t in s["freeform"])) or None,
            }
        )

    c.finalize_exercises()
    # B3 : 2×N sur un exercice unilatéral = 2N portés.
    for sess in sessions_out:
        for b in sess["blocks"]:
            for log in b.get("exercises", []):
                measure = c.measure_of(log["exerciseId"])
                for st in log["sets"]:
                    if st.pop("_pair") and measure == "unilateral" and st["load"] is not None:
                        st["load"] *= 2

    OUTPUT.write_text(
        json.dumps({"exercises": list(c.exercises.values()), "sessions": sessions_out, "maxTests": c.max_tests}, ensure_ascii=False, indent=1),
        encoding="utf-8",
    )
    lines = ["# Import Notion : points restants", "", f"Séances : {len(sessions_out)} · nouveaux exercices : {len(c.exercises)} · max testés : {len(c.max_tests)}"]
    lines.append("Ignorées : " + ", ".join(f"{k} {v}" for k, v in skipped.most_common()))
    for r in sorted(c.residuals.values(), key=lambda r: -r["count"]):
        lines.append(f"- [{r['kind']}] ×{r['count']} `{r['value']!r}` — ex. {', '.join(r['examples'])}".replace("\n", " "))
    REPORT.write_text("\n".join(lines) + "\n", encoding="utf-8")
    print(f"{len(sessions_out)} séances · {len(c.exercises)} nouveaux exercices · {len(c.max_tests)} max testés · {len(c.residuals)} valeurs non reconnues")


if __name__ == "__main__":
    main()
