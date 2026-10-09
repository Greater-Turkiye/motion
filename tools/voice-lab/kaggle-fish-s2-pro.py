"""Kaggle script kernel: synthesize one Motion narration with Fish Audio S2 Pro.

This runs as a Kaggle *script* kernel, not a notebook. Kaggle strips the
kernelspec from a pushed notebook, which leaves papermill with no kernel to
bind to ("No kernel name found in notebook and no override provided."), so the
job dies before any cell runs. A script kernel is executed as plain Python and
avoids papermill entirely.
"""

import json
import os
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
if torch.cuda.device_count() < 2:
    raise RuntimeError(
        "Fish S2 Pro needs two GPUs on Kaggle (language model on one, codec on the other); "
        f"only {torch.cuda.device_count()} is attached. Select the 2x T4 accelerator."
    )

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
# Kaggle's Python 3.13 image breaks fish-speech's editable install two ways:
# pyaudio has no wheel and needs the portaudio headers to compile, and the
# dependency resolver otherwise settles on an old tokenizers with no 3.13 wheel
# and tries to build it from source (Kaggle's apt Rust is too old). Install the
# portaudio headers for pyaudio, pin transformers to the top of fish-speech's
# allowed range so its tokenizers (0.22, which ships a 3.13 wheel) is locked in,
# and forbid pip from building tokenizers from source at all.
subprocess.run(["bash", "-lc", "apt-get update -qq && apt-get install -y -qq portaudio19-dev"], check=True)
subprocess.run(
    [sys.executable, "-m", "pip", "install", "--quiet", "--only-binary=tokenizers", "-e", ".", "transformers==4.57.3"],
    cwd=repository,
    check=True,
)
subprocess.run(["hf", "download", "fishaudio/s2-pro", "--local-dir", str(repository / "checkpoints" / "s2-pro")], check=True)

inference = repository / "fish_speech" / "models" / "text2semantic" / "inference.py"
# The language model alone nearly fills one T4, so Fish S2 Pro does not fit on
# a single card. Two adjustments make it run on Kaggle's 2x T4:
#   1. Its loader moves the fp32 weights onto the GPU and only then casts them
#      to the inference dtype, briefly needing the full fp32 model (~18 GiB) and
#      OOMing. Cast on the CPU first, then move the half-size weights across.
#   2. Keep the language model on cuda:0 and put the codec (vocoder) on cuda:1,
#      so the two large modules do not share one card's memory.
source = inference.read_text(encoding="utf-8")
source = source.replace(
    "model = model.to(device=device, dtype=precision)",
    "model = model.to(dtype=precision)\n    model = model.to(device=device)",
)
source = source.replace(
    "codec = load_codec_model(codec_checkpoint, device, precision)",
    'codec = load_codec_model(codec_checkpoint, "cuda:1", precision)',
)
source = source.replace(
    "encode_audio(p, codec, device).cpu()",
    'encode_audio(p, codec, "cuda:1").cpu()',
)
source = source.replace(
    "decode_to_audio(merged_codes.to(device), codec)",
    'decode_to_audio(merged_codes.to("cuda:1"), codec)',
)
inference.write_text(source, encoding="utf-8")
# Reduce allocator fragmentation so the ~11 GiB model leaves room for decoding.
environment = {**os.environ, "PYTORCH_CUDA_ALLOC_CONF": "expandable_segments:True"}
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
    ], cwd=repository, check=True, env=environment)
    if not target.is_file() or target.stat().st_size < 1024:
        raise RuntimeError(f"Fish S2 Pro did not write a usable clip for segment {index}.")

archive = workspace / "voice-artifact.zip"
with zipfile.ZipFile(archive, "w", compression=zipfile.ZIP_DEFLATED) as artifact:
    for clip in sorted(outputs.glob("*.wav")):
        artifact.write(clip, clip.name)
print(f"Fish S2 Pro wrote {len(segments)} clips on {torch.cuda.get_device_name(0)} ({vram_gib:.1f} GiB).")
