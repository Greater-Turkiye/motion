"""English pre-processor for the Fish S2 Pro narration text (@Conflict-Grid).

The English track clones the same voice as the Turkish one, so Fish is prompted
with Turkish reference clips and their Turkish transcripts. Conditioned that
way, it reads a bare capital I with Turkish letter values: the pronoun "I"
comes out as "ı" or "i", and "IAEA" or "UK" are spelled with Turkish letter
names. This module rewrites those tokens *before* synthesis so they carry their
English sound in the graphemes the prompt reads best: the letter names come
from tr_tts_prep._LETTER_TR ("I" -> "Ay", "UK" -> "yu key"). It changes
pronunciation only; it never adds, removes or reorders a fact (CLAUDE.md
section 2), and the on-screen scene and clips.json keep the original text.

Acronyms said as a word ("NATO", "NASA", "ISIS") are kept or respelled as a
word; every other run of two to six capitals is read letter by letter, which is
how an English anchor reads "UN", "EU", "IDF" or "UAV".
"""

import re

from tr_tts_prep import _LETTER_TR

# Read as one word, not letter by letter; the value is what Fish is given.
WORDS = {
    "NATO": "NATO", "NASA": "NASA", "OPEC": "OPEC", "UNESCO": "UNESCO", "UNICEF": "UNICEF",
    "ASEAN": "ASEAN", "HAMAS": "Hamas", "COVID": "Covid", "SWIFT": "Swift", "AUKUS": "AUKUS",
    "ISIS": "Aysis", "ISIL": "Aysil", "HIMARS": "Haymars", "ATACMS": "Atakıms",
}


def _spell(letters):
    # lower case on purpose: a capitalised "I" (the name of E) is the very token Fish misreads
    return " ".join(_LETTER_TR[ch] for ch in letters)


def _acronym(match):
    token, tail = match.group(1), match.group(2) or ""
    if token in WORDS:
        return WORDS[token] + tail
    # a plural or possessive stays on the last letter: "UAVs" -> "yu ey vi's"
    return _spell(token) + ("'s" if tail else "")


def prepare(text):
    """Return the segment text rewritten for English Fish synthesis."""
    if not isinstance(text, str) or not text.strip():
        return text
    result = text
    # 1. Runs of two to six capitals, with an optional plural or possessive ("UAVs", "UK's").
    result = re.sub(r"\b([A-Z]{2,6})('s|s)?\b", _acronym, result)
    # 2. The pronoun and its contractions: "I", "I'm", "I've", "I'd", "I'll".
    result = re.sub(r"(?<![\w'’])I(?=['’](?:m|ve|d|ll)\b|(?![\w'’-]))", "Ay", result)
    return re.sub(r"\s{2,}", " ", result).strip()


if __name__ == "__main__":
    import sys

    for line in sys.stdin:
        print(prepare(line.rstrip("\n")))
