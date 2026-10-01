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
"""
import json, re, sys, time, pathlib
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
    mono = torchaudio.functional.resample(wav.mean(0), sr, 16000).numpy()
    return " ".join(s.text for s in ear.transcribe(mono, language="tr", beam_size=5)[0]).strip()

clips, bad = [], []
for i, seg in enumerate(segments):
    best = None
    for k in range(TRIES):
        t1 = time.time()
        wav, sr = speak(seg["text"])
        h = heard(wav, sr)
        c = cer(seg["text"], h)
        print(f"seg{i} try {k + 1}  {wav.shape[-1] / sr:4.1f}s audio  {time.time() - t1:5.1f}s  CER {c:.2f}  heard: {h}", flush=True)
        if best is None or c < best[0]:
            best = (c, wav, sr)
        if c <= RETRY:
            break
    c, wav, sr = best
    name = f"seg{i}.wav"
    torchaudio.save(str(out / name), wav, sr)
    print(f"{name} at {seg['at']:5.2f}s  CER {c:.2f}  {seg['text']}", flush=True)
    clips.append({**seg, "file": name, "cer": round(c, 3)})
    if c > FAIL:
        bad.append(name)
(out / "clips.json").write_text(json.dumps(clips, ensure_ascii=False, indent=1), encoding="utf-8")
if bad:
    sys.exit(f"not clear enough after {TRIES} tries: {', '.join(bad)} (character error above {FAIL})")
