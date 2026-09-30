"""The narrator: one clip per segment of tools/audio/narration.mjs, in Turkish.

    python -u tools/audio/tts.py <narration.json> <out dir>

Model: Chatterbox Multilingual (Resemble AI, MIT licence), its default voice, on the CPU. Every clip
carries Resemble's PerTh watermark, so a clip can be shown to be synthetic, and the video says so on
screen (the "YAPAY SES" line). Writes seg<i>.wav and clips.json ([{at, until, file, text}]).
"""
import json, sys, time, pathlib
import torchaudio
from chatterbox.mtl_tts import ChatterboxMultilingualTTS

src, out = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2])
out.mkdir(parents=True, exist_ok=True)
segments = json.loads(src.read_text(encoding="utf-8"))["segments"]

t0 = time.time()
model = ChatterboxMultilingualTTS.from_pretrained(device="cpu")
print(f"model loaded in {time.time() - t0:.0f} s", flush=True)
clips = []
for i, seg in enumerate(segments):
    t1 = time.time()
    # a calm reading: little exaggeration, the default pacing guidance
    wav = model.generate(seg["text"], language_id="tr", exaggeration=0.45, cfg_weight=0.5)
    name = f"seg{i}.wav"
    torchaudio.save(str(out / name), wav, model.sr)
    print(f"{name} at {seg['at']:5.2f}s  {wav.shape[-1] / model.sr:4.1f}s audio  {time.time() - t1:5.1f}s  {seg['text']}", flush=True)
    clips.append({**seg, "file": name})
(out / "clips.json").write_text(json.dumps(clips, ensure_ascii=False, indent=1), encoding="utf-8")
