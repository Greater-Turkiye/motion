#!/usr/bin/env python3
"""Submit one narration to a preconfigured Kaggle Fish S2 Pro notebook."""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import zipfile
from pathlib import Path

import tr_tts_prep


def command(*args, cwd=None, capture=False):
    return subprocess.run(
        [sys.executable, "-m", "kaggle", *map(str, args)],
        cwd=cwd,
        check=True,
        text=True,
        capture_output=capture,
    )


def arguments():
    parser = argparse.ArgumentParser(description="Produce Fish S2 Pro narration through Kaggle.")
    parser.add_argument("narration", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--reference", type=Path, default=Path("referans.wav"))
    parser.add_argument("--reference-text", type=Path, required=True)
    parser.add_argument("--notebook", type=Path, default=Path("tools/voice-lab/kaggle-fish-s2-pro.py"))
    parser.add_argument("--timeout", type=int, default=3300)
    return parser.parse_args()


def main():
    args = arguments()
    if not os.environ.get("KAGGLE_API_TOKEN", "").strip():
        raise SystemExit("KAGGLE_API_TOKEN is required.")
    if not args.narration.is_file() or not args.reference.is_file() or not args.reference_text.is_file():
        raise SystemExit("Narration, reference WAV, or reference transcript is missing.")
    narration = json.loads(args.narration.read_text(encoding="utf-8"))
    segments = narration.get("segments")
    if not isinstance(segments, list) or not segments:
        raise SystemExit("Narration has no segments.")

    with tempfile.TemporaryDirectory(prefix="motion-kaggle-") as temporary:
        root = Path(temporary)
        input_dir = root / "input"
        kernel_dir = root / "kernel"
        input_dir.mkdir()
        kernel_dir.mkdir()
        command("datasets", "init", "-p", input_dir)
        command("kernels", "init", "-p", kernel_dir)
        dataset_metadata_path = input_dir / "dataset-metadata.json"
        kernel_metadata_path = kernel_dir / "kernel-metadata.json"
        dataset_metadata = json.loads(dataset_metadata_path.read_text(encoding="utf-8"))
        kernel_metadata = json.loads(kernel_metadata_path.read_text(encoding="utf-8"))
        owner, separator, _ = kernel_metadata.get("id", "").partition("/")
        if not separator or not owner or owner == "USERNAME":
            raise SystemExit("Kaggle could not determine the authenticated account name.")
        dataset = f"{owner}/motion-fish-s2-voice-job"
        kernel = f"{owner}/motion-fish-s2-pro"
        # Fish reads the grapheme stream it is given and slips into an English
        # accent on Latin acronyms and foreign spellings. Rewrite the spoken
        # text into Turkish graphemes so synthesis stays monolingual; this
        # changes pronunciation only, never a fact (CLAUDE.md section 2). The
        # original segments keep driving clips.json and the on-screen scene.
        spoken = [{**segment, "text": tr_tts_prep.prepare(segment.get("text", ""))} for segment in segments]
        job = {
            "reference_audio": "referans.wav",
            "reference_text": args.reference_text.read_text(encoding="utf-8").strip(),
            "segments": spoken,
        }
        (input_dir / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        shutil.copyfile(args.reference, input_dir / "referans.wav")
        dataset_metadata.update({"id": dataset, "title": "Motion Fish S2 voice job", "licenses": [{"name": "other"}]})
        dataset_metadata_path.write_text(json.dumps(dataset_metadata, indent=2) + "\n", encoding="utf-8")
        try:
            command("datasets", "version", "-p", input_dir, "-m", "Update daily Motion voice job")
        except subprocess.CalledProcessError:
            command("datasets", "create", "-p", input_dir)

        shutil.copyfile(args.notebook, kernel_dir / args.notebook.name)
        # When the operator has published the bf16 weights as a private dataset
        # (tools/voice-lab/kaggle_model_bf16.py) and set FISH_MODEL_DATASET to
        # its slug, attach it so the kernel loads the model from /kaggle/input
        # instead of downloading and converting ~11 GiB on every run. Until then
        # the slug is empty and the kernel falls back to the live download, so a
        # fresh account keeps working with no manual step (CLAUDE.md section 1).
        model_dataset = os.environ.get("FISH_MODEL_DATASET", "").strip()
        dataset_sources = [dataset] + ([model_dataset] if model_dataset else [])
        kernel_metadata.update({
            "id": kernel,
            "title": "Motion Fish S2 Pro",
            "code_file": args.notebook.name,
            "language": "python",
            "kernel_type": "script",
            "is_private": True,
            "enable_gpu": True,
            "enable_internet": True,
            "dataset_sources": dataset_sources,
        })
        kernel_metadata_path.write_text(json.dumps(kernel_metadata, indent=2) + "\n", encoding="utf-8")
        command("kernels", "push", "-p", kernel_dir, "--accelerator", "GPU", "-t", args.timeout)

        deadline = time.monotonic() + args.timeout
        while True:
            status = command("kernels", "status", kernel, capture=True).stdout.lower()
            if "complete" in status:
                break
            if any(word in status for word in ("error", "failed", "cancelled")):
                raise SystemExit(f"Kaggle Fish job failed: {status.strip()}")
            if time.monotonic() >= deadline:
                raise SystemExit("Timed out waiting for the Kaggle Fish job.")
            time.sleep(30)

        downloaded = root / "downloaded"
        downloaded.mkdir()
        command("kernels", "output", kernel, "-p", downloaded, "-o", "--file-pattern", "voice-artifact.zip")
        archive = downloaded / "voice-artifact.zip"
        if not archive.is_file():
            raise SystemExit("Kaggle completed without voice-artifact.zip.")
        args.output.mkdir(parents=True, exist_ok=True)
        with zipfile.ZipFile(archive) as artifact:
            artifact.extractall(args.output)
    expected = [args.output / f"seg{index}.wav" for index in range(len(segments))]
    for index, target in enumerate(expected):
        numbered = args.output / f"{index:03d}.wav"
        if not target.is_file() and numbered.is_file():
            numbered.rename(target)
    missing = [str(path.name) for path in expected if not path.is_file() or path.stat().st_size < 1024]
    if missing:
        raise SystemExit(f"Kaggle artifact is missing usable clips: {', '.join(missing)}")
    # retime.mjs reads clips.json to lengthen each block to its voice clip, the
    # same manifest tools/audio/tts.py writes for the other engines. Fish runs on
    # Kaggle without the ASR check, so the clarity error (cer) is recorded as 0.
    clips = [{**segment, "file": f"seg{index}.wav", "cer": 0.0} for index, segment in enumerate(segments)]
    (args.output / "clips.json").write_text(json.dumps(clips, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    (args.output / "engine.txt").write_text("fish-s2-pro\n", encoding="utf-8")
    print(f"Kaggle Fish S2 Pro wrote {len(expected)} clips to {args.output}")


if __name__ == "__main__":
    main()