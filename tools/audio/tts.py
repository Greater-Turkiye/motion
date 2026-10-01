"""The narrator: one clip per segment of tools/audio/narration.mjs, in Turkish.

    python -u tools/audio/tts.py <narration.json> <out dir> [chatterbox|freya]

chatterbox (production): Chatterbox Multilingual (Resemble AI, MIT licence), its default voice, on
the CPU. Every clip carries Resemble's PerTh watermark, so a clip can be shown to be synthetic, and
the video says so on screen (the "YAPAY SES" line).
freya (trial only, PLAN.md 15.7): FreyaTTS-small (Apache-2.0 code and weights, Turkish first, one
fixed voice); its training data's licence is not published, so it is compared, not shipped. Needs
the FreyaTTS repository on PYTHONPATH (voice-sample.yml clones it at a pinned commit).
Writes seg<i>.wav and clips.json ([{at, until, file, text, cer}]).

Every clip is heard before it is kept: Whisper (small, int8, CPU) transcribes it and the letters it
heard are compared with the letters the voice was given (numbers in words on both sides). A clip
above 0.20 character error is made again, up to three tries, and the best one is kept; if the best
is still above 0.30 the run fails and the video goes out silent. Calibrated on karadeniz-gemi:
Chatterbox's six clips scored 0.00-0.12; FreyaTTS's two garbled ones ("Tek kaynağı, kaynak, tek
renform") scored 0.37 and 0.46.

Two more guards, after a published video (Sumy, 1 October) carried 19 s of the model running on past
its sentence, which Whisper ignored, so the letters still matched:
- each clip ends 0.35 s after the last word Whisper heard, so whatever follows the sentence goes;
- a clip longer than its text could take to say (1.2 s plus one second per 7.5 characters; the
  slowest real reading so far was 6.6 a second, with its pauses) counts as a failed try.
"""
import json, re, sys, time, pathlib
import numpy as np
import torch, torchaudio
from faster_whisper import WhisperModel

RETRY, FAIL, TRIES = 0.20, 0.30, 3
ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
def u1000(n):
    h, r = divmod(n, 100)
    return " ".join(x for x in ["" if h == 0 else "yüz" if h == 1 else ONES[h] + " yüz", TENS[r // 10], ONES[r % 10]] if x)
def say(n):
    """1470 -> "bin dört yüz yetmiş", as tools/audio/narration.mjs spells it."""
    if n == 0:
        return "sıfır"
    parts = []
    for unit, word in ((10**9, "milyar"), (10**6, "milyon"), (1000, "bin")):
        k, n = divmod(n, unit)
        if k:
            parts.append("bin" if k == 1 and unit == 1000 else u1000(k) + " " + word)
    if n:
        parts.append(u1000(n))
    return " ".join(parts)
def letters(s):
    s = re.sub(r"\d+", lambda m: say(int(m.group())), s)
    s = s.replace("I", "ı").replace("İ", "i").lower()
    return re.sub(r"[^a-zçğıöşüâîû]", "", s)
WORD_VALUE = {w: i for i, w in enumerate(ONES) if w} | {w: 10 * i for i, w in enumerate(TENS) if w}
SCALE = {"bin": 1000, "milyon": 10**6, "milyar": 10**9}
def numbers(s):
    """The numbers a text says, in order, whether written in digits ("1000", "1.440") or in Turkish
    words ("bin dört yüz kırk"): what a listener must hear right above everything else. A Turkish
    number goes from the larger places to the smaller, so a word whose place is not smaller than the
    last one's starts a new number: "on dört yirmi beş" (14-25 said aloud) is 14 and 25, not 39."""
    s = s.replace("I", "ı").replace("İ", "i").lower()
    out = []
    state = {"cur": 0, "total": 0, "inside": False, "last": 10**12}
    def flush():
        if state["inside"]: out.append(state["total"] + state["cur"])
        state.update(cur=0, total=0, inside=False, last=10**12)
    def place(v): return 1 if v < 10 else 10
    toks = re.findall(r"\d[\d.,]*|[a-zçğıöşü]+", s)
    # Whisper's spellings of spoken numbers: "ekiyüz" (iki yüz run together), "eki" next to "yüz". A word
    # glued to yüz/bin is split, and a word one letter off a number word counts as it when a real number
    # word stands beside it (so "ön" alone stays "ön", but "eki yüz" is 200)
    split = []
    for tok in toks:
        m = re.fullmatch(r"([a-zçğıöşü]{2,}?)(yüz|bin)", tok)
        split.extend([m.group(1), m.group(2)] if m and tok not in WORD_VALUE else [tok])
    toks = split
    known = set(WORD_VALUE) | set(SCALE) | {"yüz"}
    def near(w):
        if w in known or len(w) < 3:
            return None
        for k in known:
            if len(k) == len(w) and sum(a != b for a, b in zip(k, w)) == 1:
                return k
        return None
    for j, tok in enumerate(toks):
        guess = near(tok)
        if guess and any(x in known for x in toks[max(0, j - 1): j] + toks[j + 1: j + 2]):
            toks[j] = guess
    for tok in toks:
        if tok[0].isdigit():
            flush(); out.append(int(re.sub(r"[.,](?=\d{3}\b)", "", tok).split(",")[0].replace(".", "")))
            continue
        w = tok if tok in WORD_VALUE or tok in SCALE or tok == "yüz" else re.sub(r"(da|de|ta|te|dan|den|tan|ten|a|e|ya|ye|ı|i|u|ü|yı|yi|yu|yü|ın|in|un|ün)$", "", tok)
        if w in WORD_VALUE:
            pl = place(WORD_VALUE[w])
            if state["inside"] and pl >= state["last"]: flush()
            state["cur"] += WORD_VALUE[w]; state["inside"] = True; state["last"] = pl
        elif w == "yüz":
            if state["inside"] and state["last"] <= 100 and state["cur"] >= 100: flush()
            state["cur"] = (state["cur"] or 1) * 100; state["inside"] = True; state["last"] = 100
        elif w in SCALE:
            if state["inside"] and state["last"] >= SCALE[w] and state["cur"] == 0: flush()
            state["total"] += (state["cur"] or 1) * SCALE[w]; state["cur"] = 0; state["inside"] = True; state["last"] = SCALE[w]
        else:
            flush()
    flush()
    return out

def cer(ref, hyp):
    """Character error rate over letters only: forgiving of spacing and punctuation, not of sounds."""
    r, h = letters(ref), letters(hyp)
    d = list(range(len(h) + 1))
    for i in range(1, len(r) + 1):
        prev, d[0] = d[0], i
        for j in range(1, len(h) + 1):
            cur = min(d[j] + 1, d[j - 1] + 1, prev + (r[i - 1] != h[j - 1]))
            prev, d[j] = d[j], cur
    return d[len(h)] / max(1, len(r))

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
engine = sys.argv[3] if len(sys.argv) > 3 else "chatterbox"
out.mkdir(parents=True, exist_ok=True)
segments = json.loads(src.read_text(encoding="utf-8"))["segments"]

t0 = time.time()
if engine == "freya":
    from freyatts import FreyaTTS
    model = FreyaTTS.from_pretrained("freyavoice/freya-tts", device="cpu")
    def speak(text):
        return torch.from_numpy(model.synthesize(text, steps=32)).reshape(1, -1), 48000
else:
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    def speak(text):
        # a calm reading: little exaggeration, the default pacing guidance
        return model.generate(text, language_id="tr", exaggeration=0.45, cfg_weight=0.5), model.sr
ear = WhisperModel("small", device="cpu", compute_type="int8")
print(f"{engine} and the checker loaded in {time.time() - t0:.0f} s", flush=True)

def heard(wav, sr):
    """What Whisper hears, and when its last word ends (seconds; None when it heard nothing)."""
    mono = torchaudio.functional.resample(wav.mean(0), sr, 16000).numpy()
    # half a second of silence on each side: a clip that starts or ends on a word is otherwise misheard
    # at its edges ("yaklaşık bin kilometre" came back "1 km" alone, "1000 km" in the finished video)
    pad = np.zeros(8000, dtype=mono.dtype)
    segs = list(ear.transcribe(np.concatenate([pad, mono, pad]), language="tr", beam_size=5, word_timestamps=True)[0])
    words = [w for s in segs for w in (s.words or [])]
    return " ".join(s.text for s in segs).strip(), (max(w.end for w in words) - 0.5 if words else None)

def longest(text):
    return 1.2 + len(text) / 7.5

clips, bad = [], []
for i, seg in enumerate(segments):
    best = None
    tries = TRIES + 2 if numbers(seg["text"]) else TRIES
    for k in range(tries):
        t1 = time.time()
        wav, sr = speak(seg["text"])
        made = wav.shape[-1] / sr
        h, last = heard(wav, sr)
        if last is not None:
            wav = wav[..., : min(wav.shape[-1], int((last + 0.35) * sr))]
        c = cer(seg["text"], h)
        # a number heard wrong is the worst error a news voice can make ("bin kilometre" heard as "1 km"):
        # every number the text says must be heard, whatever the letters score
        # a clip that goes on after its sentence in words ("…236 kayıt, yan sekt.") scores within the line
        # on letters, since only the tail is wrong: hearing more than the text has is a failed try
        if len(letters(h)) > 1.12 * len(letters(seg["text"])) + 2:
            print(f"seg{i} try {k + 1}  ran on: heard {len(letters(h))} letters for {len(letters(seg['text']))}", flush=True)
            c = max(c, 0.5)
        if numbers(seg["text"]) != numbers(h):
            print(f"seg{i} try {k + 1}  numbers differ: said {numbers(seg['text'])}, heard {numbers(h)}", flush=True)
            c = max(c, 0.5)
        if wav.shape[-1] / sr > longest(seg["text"]):
            c = max(c, 1.0)  # still too long after the cut: the model ran on in words, a failed try
        print(f"seg{i} try {k + 1}  {made:4.1f}s made, {wav.shape[-1] / sr:4.1f}s kept  {time.time() - t1:5.1f}s  CER {c:.2f}  heard: {h}", flush=True)
        if best is None or c < best[0]:
            best = (c, wav, sr)
        if c <= RETRY:
            break
    c, wav, sr = best
    name = f"seg{i}.wav"
    if c > FAIL:
        # left out, not shipped: its block keeps its words on screen and goes without a voice; one
        # sentence the model cannot say clearly must not silence the whole video
        print(f"{name} left out: not clear after {tries} tries (best {c:.2f})  {seg['text']}", flush=True)
        bad.append(name)
        continue
    torchaudio.save(str(out / name), wav, sr)
    print(f"{name} at {seg['at']:5.2f}s  CER {c:.2f}  {seg['text']}", flush=True)
    clips.append({**seg, "file": name, "cer": round(c, 3)})
(out / "clips.json").write_text(json.dumps(clips, ensure_ascii=False, indent=1), encoding="utf-8")
if len(bad) * 2 > len(segments):
    sys.exit(f"most of the narration is not clear: {', '.join(bad)} left out of {len(segments)}")
