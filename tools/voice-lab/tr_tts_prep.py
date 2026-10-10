"""Turkish monolingual pre-processor for the Fish S2 Pro narration text.

Fish S2 Pro reads the grapheme stream it is given. When a segment carries a
Latin acronym ("USS") or a foreign spelling ("Washington"), the model slips
into an English accent for those tokens and the calm Turkish delivery breaks.
This module rewrites those tokens into Turkish graphemes *before* synthesis, so
the model never leaves Turkish: "Washington" -> "Vaşington", "USS" -> "Yu Es
Es", "F-16" -> "ef on altı". It changes pronunciation only; it never adds,
removes or reorders a fact, so the red lines in CLAUDE.md section 2 hold.

tools/audio/narration.mjs already spells numbers and Turkish place names, so by
the time a segment reaches here most of the work is done. This pass is the last
guard: a curated map of the foreign tokens this domain keeps producing, plus a
safety net that voices any bare integer the generator left behind. Unknown
all-caps tokens are left untouched on purpose — a wrong guess is worse than an
unspelled acronym, and the map is meant to be extended as new ones appear.
"""

import re

# Turkish spellings of numbers, mirroring tools/audio/narration.mjs sayNumber()
# and tools/audio/tts.py say(): "1470" -> "bin dört yüz yetmiş".
_ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
_TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]


def _under_thousand(n):
    hundreds, rest = divmod(n, 100)
    head = "" if hundreds == 0 else "yüz" if hundreds == 1 else _ONES[hundreds] + " yüz"
    return " ".join(part for part in [head, _TENS[rest // 10], _ONES[rest % 10]] if part)


def say_number(n):
    """Spell a non-negative integer in Turkish the way the generator does."""
    if n == 0:
        return "sıfır"
    parts = []
    for unit, word in ((10**9, "milyar"), (10**6, "milyon"), (1000, "bin")):
        count, n = divmod(n, unit)
        if count:
            parts.append("bin" if count == 1 and unit == 1000 else _under_thousand(count) + " " + word)
    if n:
        parts.append(_under_thousand(n))
    return " ".join(parts)


# Foreign tokens this feed keeps producing, mapped to Turkish graphemes. Keys
# are matched case-insensitively as whole words (see _WORD below). Weapon and
# platform designators are spelled the way a Turkish anchor reads them aloud.
PHONETIC = {
    # Letter-run acronyms read as letters, written in Turkish graphemes.
    "USS": "Yu Es Es",
    "HMS": "Eyç Em Es",
    "UAV": "Yu Ey Vi",
    "ISR": "Ay Es Ar",
    "GPS": "Ci Pi Es",
    "NATO": "Nato",
    "HIMARS": "Haymars",
    "ATACMS": "Atakıms",
    # Foreign place and proper names not already handled upstream.
    "Washington": "Vaşington",
    "Pentagon": "Pentagon",
    "Pentagon'a": "Pentagon'a",
    "Houthi": "Husi",
    "Houthis": "Husiler",
    # Weapon / platform designators: read the letter, then the number in Turkish.
    "HIMARS'ı": "Haymars'ı",
}

# Designator families "F-16", "Su-35", "S-400", "MQ-9" -> letters in Turkish
# graphemes + the number spelled in Turkish. The leading part is read letter by
# letter when it is one or two Latin letters, otherwise kept as a word.
_LETTER_TR = {
    "A": "ey", "B": "bi", "C": "si", "D": "di", "E": "i", "F": "ef", "G": "ci",
    "H": "eyç", "I": "ay", "J": "cey", "K": "key", "L": "el", "M": "em",
    "N": "en", "O": "o", "P": "pi", "Q": "kyu", "R": "ar", "S": "es",
    "T": "ti", "U": "yu", "V": "vi", "W": "dabılyu", "X": "iks", "Y": "vay", "Z": "zi",
}


# Designator heads read as a Turkish syllable, not letter by letter: the Russian
# design bureaus the press names as words ("Su otuz beş", "Mig yirmi dokuz").
_WORD_HEADS = {"SU", "MI", "TU", "KA", "MIG", "YAK", "AN", "IL"}


def _designator(match):
    head, number = match.group(1), int(match.group(2))
    if head.upper() in _WORD_HEADS:
        spoken_head = head
    elif len(head) <= 2 and all(ch.upper() in _LETTER_TR for ch in head):
        spoken_head = " ".join(_LETTER_TR[ch.upper()] for ch in head)
    else:
        spoken_head = head
    return f"{spoken_head} {say_number(number)}"


def prepare(text):
    """Return the segment text rewritten for Turkish-only Fish synthesis."""
    if not isinstance(text, str) or not text.strip():
        return text
    result = text
    # 1. Weapon / platform designators like "F-16", "Su-35", "S-400".
    result = re.sub(r"\b([A-Za-z]{1,3})-(\d{1,4})\b", _designator, result)
    # 2. Curated foreign tokens, longest first so "HIMARS'ı" wins over "HIMARS".
    for token in sorted(PHONETIC, key=len, reverse=True):
        result = re.sub(rf"(?<!\w){re.escape(token)}(?!\w)", PHONETIC[token], result)
    # 3. Safety net: voice any bare integer the generator left in digits
    #    ("2026" -> "iki bin yirmi altı"). Decimals and ranges with separators
    #    are left to narration.mjs, which already speaks them.
    result = re.sub(r"(?<![\d.,])\d{1,12}(?![\d.,])", lambda m: say_number(int(m.group())), result)
    return re.sub(r"\s{2,}", " ", result).strip()


if __name__ == "__main__":
    import sys

    for line in sys.stdin:
        print(prepare(line.rstrip("\n")))
