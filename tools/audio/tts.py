"""The narrator: one clip per segment of tools/audio/narration.mjs, in Turkish.

    python -u tools/audio/tts.py <narration.json> <out dir> [omnivoice|edge|gemini|chatterbox|freya]

gemini (production when the GEMINI_API_KEY secret is set, PLAN.md 24): Google's Gemini Flash TTS on
the free AI Studio tier, a human-sounding Turkish news reading in one of its prebuilt voices
(GEMINI_VOICE, default Charon). Every clip carries Google's SynthID watermark and the video says it
is synthetic on screen. With no key the run uses chatterbox; a call that still fails after its
retries (quota, outage) ends the run with code 3; on any failure the workflow makes the whole
narration again with chatterbox, so a video never mixes two voices.
chatterbox (the fallback): Chatterbox Multilingual (Resemble AI, MIT licence), its default voice, on
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
import json, os, re, sys, time, pathlib, subprocess, tempfile
import base64, io, wave, urllib.error, urllib.request
import numpy as np
import torch, torchaudio
import soundfile as sf
from faster_whisper import WhisperModel

# Audio file I/O goes through soundfile (libsndfile), not torchaudio.load/save: on the
# CPU-only Actions runner torchaudio's default I/O backend pulls in torchcodec, whose
# library load fails ("libnvrtc.so.13: cannot open shared object file"), which crashed
# every engine here — OmniVoice and the Edge fallback alike — before a clip was written.
# torchaudio stays only for functional.resample, which is pure tensor maths.
def load_wav(path):
    data, sr = sf.read(str(path), dtype="float32", always_2d=True)  # (frames, channels)
    return torch.from_numpy(np.ascontiguousarray(data.T)), sr       # (channels, frames)
def save_wav(path, wav, sr):
    data = wav.detach().cpu().numpy()
    if data.ndim == 1:
        data = data[None, :]
    sf.write(str(path), data.T, int(sr))                            # soundfile wants (frames, channels)

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
            flush()
            v = int(re.sub(r"[.,](?=\d{3}\b)", "", tok).split(",")[0].replace(".", ""))
            # a round figure in digits can go on in words, the way Whisper writes it: "200 otuz altı" is 236
            if v and v % 10 == 0:
                state.update(cur=v, inside=True, last=1000 if v % 1000 == 0 else 100 if v % 100 == 0 else 10)
            else:
                out.append(v)
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
if engine == "gemini" and not os.environ.get("GEMINI_API_KEY"):
    print("no GEMINI_API_KEY: chatterbox instead", flush=True)
    engine = "chatterbox"
if engine == "gemini":
    import base64, io, urllib.error, urllib.request, wave
    URL = "https://generativelanguage.googleapis.com/v1beta/interactions"
    MODEL = os.environ.get("GEMINI_TTS_MODEL", "gemini-3.8-flash-tts")
    VOICE = os.environ.get("GEMINI_VOICE", "Charon")
    # how it is read, never what: the words are the narration's own
    STYLE = ("Türkçe bir haber spikeri gibi oku: sakin, net, ölçülü bir tempoyla, abartısız ve heyecansız; "
             "rakamları ve yer adlarını açık söyle.")
    def audio_in(node):
        """The base64 audio of an answer: interaction.output_audio.data, or the first audio part anywhere."""
        if isinstance(node, dict):
            for key, v in node.items():
                if "audio" in key and isinstance(v, dict) and isinstance(v.get("data"), str):
                    return v["data"]
            if str(node.get("type", "")).startswith("audio") or str(node.get("mime_type", "")).startswith("audio"):
                if isinstance(node.get("data"), str):
                    return node["data"]
            node = list(node.values())
        if isinstance(node, list):
            for v in node:
                found = audio_in(v)
                if found:
                    return found
        return None
    def speak(text):
        body = json.dumps({
            "model": MODEL,
            "input": [{"type": "user_input", "content": [{"type": "text", "text": text,
                       "annotations": [{"type": "speech_metadata", "style": STYLE}]}]}],
            "response_format": {"type": "audio"},
            "generation_config": {"speech_config": [{"voice": VOICE}]},
        }).encode()
        for k in range(5):
            req = urllib.request.Request(URL, body, {"Content-Type": "application/json",
                                                     "x-goog-api-key": os.environ["GEMINI_API_KEY"]})
            try:
                with urllib.request.urlopen(req, timeout=120) as r:
                    data = json.load(r)
                break
            except urllib.error.HTTPError as e:
                # the free tier allows a few requests a minute: a 429 or a 5xx waits and tries again
                if e.code not in (429, 500, 502, 503, 504) or k == 4:
                    print(f"gemini: HTTP {e.code} {e.read()[:300]!r}", flush=True)
                    sys.exit(3)
                time.sleep(15 * (k + 1))
            except (urllib.error.URLError, TimeoutError) as e:
                if k == 4:
                    print(f"gemini: {e}", flush=True)
                    sys.exit(3)
                time.sleep(15 * (k + 1))
        audio = audio_in(data)
        if not audio:
            print(f"gemini: no audio in the answer: {json.dumps(data)[:300]}", flush=True)
            sys.exit(3)
        raw = base64.b64decode(audio)
        if raw[:4] == b"RIFF":
            with wave.open(io.BytesIO(raw)) as w:
                sr, raw = w.getframerate(), w.readframes(w.getnframes())
        else:
            sr = 24000  # bare PCM: 16-bit mono at 24 kHz
        pcm = np.frombuffer(raw, dtype="<i2").astype(np.float32) / 32768.0
        return torch.from_numpy(pcm.copy()).reshape(1, -1), sr
elif engine == "azure":
    raise SystemExit("azure TTS was removed; choose hf-edge, gemini, or chatterbox")
elif engine == "omnivoice":
    from gradio_client import Client, handle_file
    OMNIVOICE_SPACE = os.environ.get("OMNIVOICE_SPACE", "k2-fsa/OmniVoice").strip()
    OMNIVOICE_REFERENCE = pathlib.Path(os.environ.get(
        "HF_TTS_REFERENCE_AUDIO", pathlib.Path(__file__).resolve().parents[2] / "referans.wav"
    )).resolve()
    OMNIVOICE_LANGUAGE = os.environ.get("OMNIVOICE_LANGUAGE", "Turkish").strip()
    OMNIVOICE_REFERENCE_TEXT = os.environ.get("OMNIVOICE_REFERENCE_TEXT", "").strip() or None
    OMNIVOICE_INSTRUCT = os.environ.get(
        "OMNIVOICE_INSTRUCT", "female, middle-aged, moderate pitch"
    ).strip()
    OMNIVOICE_STEPS = int(os.environ.get("OMNIVOICE_STEPS", "").strip() or "48")
    OMNIVOICE_GUIDANCE = float(os.environ.get("OMNIVOICE_GUIDANCE", "").strip() or "2.0")
    OMNIVOICE_SPEED = float(os.environ.get("OMNIVOICE_SPEED", "").strip() or "0.92")
    OMNIVOICE_DENOISE = os.environ.get("OMNIVOICE_DENOISE", "true").lower() == "true"
    OMNIVOICE_PREPROCESS = os.environ.get("OMNIVOICE_PREPROCESS", "true").lower() == "true"
    OMNIVOICE_POSTPROCESS = os.environ.get("OMNIVOICE_POSTPROCESS", "true").lower() == "true"
    if os.environ.get("HF_TTS_LICENSE_ACCEPTED", "").lower() != "true":
        raise RuntimeError("set HF_TTS_LICENSE_ACCEPTED=true to enable the selected OmniVoice model")
    if not OMNIVOICE_REFERENCE.is_file():
        reference_repo = os.environ.get("HF_TTS_REFERENCE_REPO", "").strip()
        reference_file = os.environ.get("HF_TTS_REFERENCE_FILE", "").strip()
        if not reference_repo or not reference_file:
            raise RuntimeError("reference WAV not found; configure HF_TTS_REFERENCE_REPO and HF_TTS_REFERENCE_FILE for a private dataset")
        from huggingface_hub import hf_hub_download
        OMNIVOICE_REFERENCE = pathlib.Path(hf_hub_download(
            repo_id=reference_repo,
            filename=reference_file,
            repo_type="dataset",
            token=os.environ.get("HF_TOKEN") or None,
        ))
    if not 4 <= OMNIVOICE_STEPS <= 64:
        raise RuntimeError("OMNIVOICE_STEPS must be between 4 and 64")
    if not 0.5 <= OMNIVOICE_SPEED <= 1.5:
        raise RuntimeError("OMNIVOICE_SPEED must be between 0.5 and 1.5")
    client = Client(
        OMNIVOICE_SPACE,
        token=os.environ.get("HF_TOKEN") or None,
        verbose=False,
        httpx_kwargs={"timeout": 180},
    )
    def speak(text):
        result = client.predict(
            text,
            OMNIVOICE_LANGUAGE,
            handle_file(str(OMNIVOICE_REFERENCE)),
            OMNIVOICE_REFERENCE_TEXT,
            OMNIVOICE_INSTRUCT,
            OMNIVOICE_STEPS,
            OMNIVOICE_GUIDANCE,
            OMNIVOICE_DENOISE,
            OMNIVOICE_SPEED,
            0,
            OMNIVOICE_PREPROCESS,
            OMNIVOICE_POSTPROCESS,
            api_name="/_clone_fn",
        )
        if not isinstance(result, (tuple, list)) or len(result) < 2:
            raise RuntimeError("OmniVoice Space returned an unexpected response")
        audio, status = result[0], result[1]
        if isinstance(status, str) and status.startswith("Error:"):
            raise RuntimeError(status[:1000])
        if isinstance(audio, dict):
            audio = audio.get("path") or audio.get("name")
        if not audio or not pathlib.Path(audio).is_file():
            raise RuntimeError("OmniVoice Space did not return a downloadable WAV")
        return load_wav(audio)
elif engine == "hf":
    from gradio_client import Client, handle_file
    HF_SPACE = os.environ.get("HF_TTS_SPACE", "").strip()
    HF_REFERENCE = os.environ.get("HF_TTS_REFERENCE_AUDIO", "").strip()
    HF_REFERENCE_REPO = os.environ.get("HF_TTS_REFERENCE_REPO", "").strip()
    HF_REFERENCE_FILE = os.environ.get("HF_TTS_REFERENCE_FILE", "").strip()
    HF_LICENSE_ACCEPTED = os.environ.get("HF_TTS_LICENSE_ACCEPTED", "").lower() == "true"
    if not HF_SPACE:
        raise RuntimeError("HF_TTS_SPACE is unset; refusing to upload speaker audio to an unreviewed public Space")
    if HF_SPACE.lower() == "coqui/xtts":
        raise RuntimeError("coqui/xtts is disabled: it is currently failing to start and may publish reference audio on errors")
    if not HF_LICENSE_ACCEPTED:
        raise RuntimeError("review the XTTS model license, then set HF_TTS_LICENSE_ACCEPTED=true to enable HF synthesis")
    if not HF_REFERENCE and HF_REFERENCE_REPO and HF_REFERENCE_FILE:
        from huggingface_hub import hf_hub_download
        HF_REFERENCE = hf_hub_download(
            repo_id=HF_REFERENCE_REPO,
            filename=HF_REFERENCE_FILE,
            repo_type="dataset",
            token=os.environ.get("HF_TOKEN"),
        )
    if not HF_REFERENCE or not pathlib.Path(HF_REFERENCE).is_file():
        raise RuntimeError("provide an authorized reference via HF_TTS_REFERENCE_AUDIO or a private HF dataset")
    client = Client(
        HF_SPACE,
        hf_token=os.environ.get("HF_TOKEN") or None,
        verbose=False,
        httpx_kwargs={"timeout": 180},
    )
    def speak(text):
        if len(text) > 200:
            raise RuntimeError("XTTS Space accepts at most 200 characters per request")
        result = client.predict(
            text,
            "tr",
            handle_file(HF_REFERENCE),
            None,
            False,
            False,
            True,
            HF_LICENSE_ACCEPTED,
            api_name="/predict",
        )
        if not isinstance(result, (tuple, list)) or len(result) < 2:
            raise RuntimeError("HF Space returned an unexpected response")
        audio = result[1]
        if isinstance(audio, dict):
            audio = audio.get("path") or audio.get("name")
        if not audio or not pathlib.Path(audio).is_file():
            raise RuntimeError("HF Space response did not include a downloadable audio file")
        return load_wav(audio)
elif engine == "edge":
    EDGE_VOICE = os.environ.get("EDGE_TTS_VOICE", "").strip() or "tr-TR-EmelNeural"
    if EDGE_VOICE not in ("tr-TR-EmelNeural", "tr-TR-AhmetNeural"):
        raise SystemExit("EDGE_TTS_VOICE must be tr-TR-EmelNeural or tr-TR-AhmetNeural")
    def speak(text):
        with tempfile.TemporaryDirectory(prefix="gt-edge-tts-") as temp_dir:
            mp3 = pathlib.Path(temp_dir) / "speech.mp3"
            wav = pathlib.Path(temp_dir) / "speech.wav"
            subprocess.run([
                sys.executable, "-m", "edge_tts", "--voice", EDGE_VOICE,
                "--text", text, "--write-media", str(mp3),
            ], check=True, capture_output=True, text=True, timeout=180)
            subprocess.run([
                os.environ.get("FFMPEG_PATH", "ffmpeg"), "-nostdin", "-hide_banner", "-loglevel", "error", "-y",
                "-i", str(mp3), "-ac", "1", "-ar", "24000", str(wav),
            ], check=True, capture_output=True, text=True, timeout=90)
            return load_wav(wav)
elif engine == "freya":
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
    save_wav(out / name, wav, sr)
    print(f"{name} at {seg['at']:5.2f}s  CER {c:.2f}  {seg['text']}", flush=True)
    clips.append({**seg, "file": name, "cer": round(c, 3)})
(out / "engine.txt").write_text(engine, encoding="utf-8")  # the notes name the voice that spoke
(out / "clips.json").write_text(json.dumps(clips, ensure_ascii=False, indent=1), encoding="utf-8")
if engine in ("hf", "omnivoice") and bad:
    sys.exit(f"{engine} voice quality check failed for {len(bad)} clips; restart the whole narration with Edge TTS")
if len(bad) * 2 > len(segments):
    sys.exit(f"most of the narration is not clear: {', '.join(bad)} left out of {len(segments)}")
