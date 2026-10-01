"""The narrator: one clip per segment of tools/audio/narration.mjs, in Turkish.

    python -u tools/audio/tts.py <narration.json> <out dir> [chatterbox|freya]

chatterbox (production): Chatterbox Multilingual (Resemble AI, MIT licence), its default voice, on
the CPU. Every clip carries Resemble's PerTh watermark, so a clip can be shown to be synthetic, and
the video says so on screen (the "YAPAY SES" line).
freya (trial only, PLAN.md 15.7): FreyaTTS-small (Apache-2.0 code and weights, Turkish first, one
fixed voice); its training data's licence is not published, so it is compared, not shipped. Needs
the FreyaTTS repository on PYTHONPATH (voice-sample.yml clones it at a pinned commit).
Writes seg<i>.wav and clips.json ([{at, until, file, text}]).
"""
import json, sys, time, pathlib

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
engine = sys.argv[3] if len(sys.argv) > 3 else "chatterbox"
out.mkdir(parents=True, exist_ok=True)
segments = json.loads(src.read_text(encoding="utf-8"))["segments"]

t0 = time.time()
if engine == "freya":
    from freyatts import FreyaTTS
    model = FreyaTTS.from_pretrained("freyavoice/freya-tts", device="cpu")
    def speak(text, path):
        wav = model.synthesize(text, steps=32)
        model.save_wav(wav, str(path))
        return len(wav) / 48000
else:
    import torchaudio
    from chatterbox.mtl_tts import ChatterboxMultilingualTTS
    model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
    def speak(text, path):
        # a calm reading: little exaggeration, the default pacing guidance
        wav = model.generate(text, language_id="tr", exaggeration=0.45, cfg_weight=0.5)
        torchaudio.save(str(path), wav, model.sr)
        return wav.shape[-1] / model.sr
print(f"{engine} loaded in {time.time() - t0:.0f} s", flush=True)
clips = []
for i, seg in enumerate(segments):
    t1 = time.time()
    name = f"seg{i}.wav"
    secs = speak(seg["text"], out / name)
    print(f"{name} at {seg['at']:5.2f}s  {secs:4.1f}s audio  {time.time() - t1:5.1f}s  {seg['text']}", flush=True)
    clips.append({**seg, "file": name})
(out / "clips.json").write_text(json.dumps(clips, ensure_ascii=False, indent=1), encoding="utf-8")
