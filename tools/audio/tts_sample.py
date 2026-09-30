"""Turkish voice-over sample for karadeniz-gemi: one clip per block, placed at the block's start.

The words are the video's own on-screen text (the source's words), numbers spelled out for speech.
Model: Chatterbox Multilingual (MIT), default voice, CPU. Every clip carries Resemble's PerTh
watermark, which is what a "synthetic voice" disclosure can point to.
"""
import math, subprocess, sys, time, pathlib
import torch, torchaudio
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

OUT = pathlib.Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

def km(a, b):
    (lo1, la1), (lo2, la2) = a, b
    p1, p2 = math.radians(la1), math.radians(la2)
    dl = math.radians(lo2 - lo1)
    d = math.acos(min(1, math.sin(p1) * math.sin(p2) + math.cos(p1) * math.cos(p2) * math.cos(dl)))
    return round(d * 6371 / 10) * 10

ONES = ["", "bir", "iki", "üç", "dört", "beş", "altı", "yedi", "sekiz", "dokuz"]
TENS = ["", "on", "yirmi", "otuz", "kırk", "elli", "altmış", "yetmiş", "seksen", "doksan"]
def words(n):
    h, r = divmod(n, 100)
    t, o = divmod(r, 10)
    hs = "" if h == 0 else ("yüz" if h == 1 else ONES[h] + " yüz")
    return " ".join(x for x in [hs, TENS[t], ONES[o]] if x)

d = km((30.73, 46.48), (29.05, 41.2))
SEGMENTS = [
    (0.25, "Karadeniz. Kaptan öldü."),
    (2.95, "Yük gemisi saldırıya uğradı. Kesin konum yok."),
    (6.35, "Ukrinform'a göre Ruslar, Odesa'da depolara ve bir yük gemisine saldırdı."),
    (11.55, f"Odesa'dan İstanbul Boğazı'na, kuş uçuşu, yaklaşık {words(d)} kilometre."),
    (14.55, "Doğrulanmadı. Tek kaynak Ukrinform. Bağımsız teyit yok."),
    (17.55, "Karadeniz, eylülde veri setimizin en yoğun bölgesi: iki yüz altmış yedi kayıt."),
]

t0 = time.time()
model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
print(f"model loaded in {time.time() - t0:.0f} s", flush=True)
for i, (at, text) in enumerate(SEGMENTS):
    t1 = time.time()
    wav = model.generate(text, language_id="tr", exaggeration=0.45, cfg_weight=0.5)
    path = OUT / f"seg{i}.wav"
    torchaudio.save(str(path), wav, model.sr)
    dur = wav.shape[-1] / model.sr
    print(f"seg{i} at {at:5.2f}s  {dur:4.1f}s audio  {time.time() - t1:5.1f}s to make  {text}", flush=True)
(OUT / "segments.txt").write_text("\n".join(f"{at}\tseg{i}.wav" for i, (at, _) in enumerate(SEGMENTS)), encoding="utf-8")
