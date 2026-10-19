"""
date_query.py

Finds dates in a student's question and turns them into text snippets that
can be looked up directly in the knowledge base.

Why this exists: the knowledge base is searched by meaning (embeddings).
Embeddings are poor at exact dates, so "what is happening on Friday 1 May
2026" used to return five unrelated almanac days and the assistant said it
saw no event. The almanac text contains each date in ISO form, e.g.
"(2026-05-01)", so a plain text lookup for that string finds the right day
every time.

Understands (English and Swahili):
  "1 May 2026", "1st of May", "May 1", "friday may 1 of 2026", "1 Mei",
  "2026-05-01", "01/05/2026" (day/month/year), "today"/"leo",
  "tomorrow"/"kesho", "yesterday"/"jana", and month-only questions such as
  "what is in May" / "events during Oktoba".

Pure functions, no database, so they are easy to test.
"""

import re
from datetime import date, timedelta

_MONTHS = {
    # English
    "january": 1, "jan": 1,
    "february": 2, "feb": 2,
    "march": 3, "mar": 3,
    "april": 4, "apr": 4,
    "may": 5,
    "june": 6, "jun": 6,
    "july": 7, "jul": 7,
    "august": 8, "aug": 8,
    "september": 9, "sep": 9, "sept": 9,
    "october": 10, "oct": 10,
    "november": 11, "nov": 11,
    "december": 12, "dec": 12,
    # Swahili
    "januari": 1,
    "februari": 2,
    "machi": 3,
    "aprili": 4,
    "mei": 5,
    "juni": 6,
    "julai": 7,
    "agosti": 8, "ago": 8,
    "septemba": 9,
    "oktoba": 10, "okt": 10,
    "novemba": 11,
    "desemba": 12, "des": 12,
}

_MONTH_RE = "|".join(sorted(_MONTHS, key=len, reverse=True))
_YEAR = r"(20\d{2})"
_ORD = r"(?:st|nd|rd|th)?"

_RE_ISO = re.compile(rf"\b{_YEAR}-(\d{{1,2}})-(\d{{1,2}})\b")
_RE_DAY_MONTH = re.compile(
    rf"\b(\d{{1,2}}){_ORD}\s*(?:of\s+|ya\s+)?({_MONTH_RE})\b"
    rf"(?:\s*,?\s*(?:of\s+)?{_YEAR})?",
    re.I,
)
_RE_MONTH_DAY = re.compile(
    rf"\b({_MONTH_RE})\s+(\d{{1,2}}){_ORD}\b(?!\s*:)"
    rf"(?:\s*,?\s*(?:of\s+)?{_YEAR})?",
    re.I,
)
_RE_NUMERIC = re.compile(r"\b(\d{1,2})[/.](\d{1,2})[/.](20\d{2}|\d{2})\b")
_RE_MONTH_ONLY = re.compile(
    rf"\b(?:in|during|for|of|within|mwezi(?:\s+wa)?)\s+({_MONTH_RE})\b"
    rf"(?!\s+\d)",
    re.I,
)

_RELATIVE = [
    (re.compile(r"\b(day after tomorrow|kesho kutwa)\b", re.I), 2),
    (re.compile(r"\b(tomorrow|kesho)\b", re.I), 1),
    (re.compile(r"\b(yesterday|jana)\b", re.I), -1),
    (re.compile(r"\b(today|leo)\b", re.I), 0),
]


def _valid(year, month, day):
    """A real calendar date? year may be None (then any leap year works)."""
    try:
        date(year if year else 2024, month, day)
        return True
    except ValueError:
        return False


def _needle(year, month, day):
    # The closing bracket stops "-05-01" matching inside "-05-010" etc.
    if year:
        return f"{year:04d}-{month:02d}-{day:02d})"
    return f"-{month:02d}-{day:02d})"


def _add(found, year, month, day):
    if 1 <= month <= 12 and _valid(year, month, day):
        needle = _needle(year, month, day)
        if needle not in found:
            found.append(needle)


def find_date_needles(question, today=None):
    """
    Returns (day_needles, month_needles) for the question.

    day_needles   exact days, e.g. ["2026-05-01)"] or ["-05-01)"] when the
                  question gave no year (matches that day in any year).
    month_needles whole months, e.g. ["-05-"], for "what is in May".

    Both lists are empty when the question mentions no date.
    """
    if not question:
        return [], []
    today = today or date.today()
    days, months = [], []
    text = question

    for m in _RE_ISO.finditer(text):
        _add(days, int(m.group(1)), int(m.group(2)), int(m.group(3)))

    for m in _RE_DAY_MONTH.finditer(text):
        year = int(m.group(3)) if m.group(3) else None
        _add(days, year, _MONTHS[m.group(2).lower()], int(m.group(1)))

    for m in _RE_MONTH_DAY.finditer(text):
        year = int(m.group(3)) if m.group(3) else None
        _add(days, year, _MONTHS[m.group(1).lower()], int(m.group(2)))

    for m in _RE_NUMERIC.finditer(text):
        year = int(m.group(3))
        if year < 100:
            year += 2000
        _add(days, year, int(m.group(2)), int(m.group(1)))  # day/month/year

    for pattern, offset in _RELATIVE:
        if pattern.search(text):
            d = today + timedelta(days=offset)
            _add(days, d.year, d.month, d.day)

    if not days:
        for m in _RE_MONTH_ONLY.finditer(text):
            needle = f"-{_MONTHS[m.group(1).lower()]:02d}-"
            if needle not in months:
                months.append(needle)

    return days, months
