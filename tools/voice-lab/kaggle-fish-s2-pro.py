"""Kaggle script kernel: synthesize one Motion narration with Fish Audio S2 Pro.

This runs as a Kaggle *script* kernel, not a notebook. Kaggle strips the
kernelspec from a pushed notebook, which leaves papermill with no kernel to
bind to ("No kernel name found in notebook and no override provided."), so the
job dies before any cell runs. A script kernel is executed as plain Python and
avoids papermill entirely.
"""

import json
import subprocess
import sys
import zipfile
from pathlib import Path

import torch

if not torch.cuda.is_available():
    raise RuntimeError(
        "Fish S2 Pro requires a Kaggle GPU accelerator, but CUDA is unavailable "
        f"(torch {torch.__version__}). Enable GPU for this kernel; on an "
        "unverified Kaggle account the GPU toggle is ignored and the job runs on "
        "CPU. Verify the account by phone in Kaggle settings."
    )
vram_gib = torch.cuda.get_device_properties(0).total_memory / 1024**3
if vram_gib < 14.0:
    raise RuntimeError(f"Fish S2 Pro requires at least 14 GiB VRAM; Kaggle assigned {vram_gib:.1f} GiB.")

inputs = list(Path("/kaggle/input").rglob("job.json"))
if len(inputs) != 1:
    raise RuntimeError(f"Expected exactly one job.json input, found {inputs!r}.")
job_path = inputs[0]
reference_audio = job_path.with_name("referans.wav")
if not reference_audio.is_file():
    raise RuntimeError("Reference WAV is missing from the Kaggle dataset.")
job = json.loads(job_path.read_text(encoding="utf-8"))
segments = job.get("segments")
reference_text = job.get("reference_text", "").strip()
if not isinstance(segments, list) or not segments or not reference_text:
    raise RuntimeError("The Kaggle voice job is missing segments or reference text.")

workspace = Path("/kaggle/working")
repository = workspace / "fish-speech"
outputs = workspace / "voice"
outputs.mkdir(exist_ok=True)
subprocess.run(["git", "clone", "--depth", "1", "https://github.com/fishaudio/fish-speech.git", str(repository)], check=True)
subprocess.run([sys.executable, "-m", "pip", "install", "--quiet", "-e", "."], cwd=repository, check=True)
subprocess.run(["hf", "download", "fishaudio/s2-pro", "--local-dir", str(repository / "checkpoints" / "s2-pro")], check=True)

inference = repository / "fish_speech" / "models" / "text2semantic" / "inference.py"
for index, segment in enumerate(segments):
    text = segment.get("text", "").strip() if isinstance(segment, dict) else str(segment).strip()
    if not text:
        raise RuntimeError(f"Narration segment {index} is empty.")
    target = outputs / f"{index:03d}.wav"
    subprocess.run([
        sys.executable, str(inference),
        "--text", text,
        "--prompt-text", reference_text,
        "--prompt-audio", str(reference_audio),
        "--checkpoint-path", str(repository / "checkpoints" / "s2-pro"),
        "--output", str(target),
        "--device", "cuda",
        "--chunk-length", "300",
    ], cwd=repository, check=True)
    if not target.is_file() or target.stat().st_size < 1024:
        raise RuntimeError(f"Fish S2 Pro did not write a usable clip for segment {index}.")

archive = workspace / "voice-artifact.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as artifact:
    for clip in sorted(outputs.glob("*.wav")):
        artifact.write(clip, clip.name)
print(f"Fish S2 Pro wrote {len(segments)} clips on {torch.cuda.get_device_name(0)} ({vram_gib:.1f} GiB).")
