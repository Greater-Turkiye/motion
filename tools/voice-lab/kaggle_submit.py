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


def references(args):
    """The voice-cloning prompt clips, as (wav_path, transcript) pairs.

    Fish S2 Pro accepts several reference pairs and clones the voice from all of
    them, so the owner's recording is given as the clips listed in
    assets/voice/references.json. Only clips whose WAV is actually present are
    used, which lets the manifest and transcripts be committed before the audio
    lands; until any WAV exists the single root referans.wav is the fallback, so
    nothing breaks (CLAUDE.md section 1). Transcripts must match their audio, so
    they are never run through the Turkish pre-processor.
    """
    if args.references.is_file():
        manifest = json.loads(args.references.read_text(encoding="utf-8"))
        base = args.references.parent
        pairs = []
        for clip in manifest.get("clips", []):
            audio = base / clip.get("audio", "")
            text = str(clip.get("text", "")).strip()
            if audio.is_file() and text:
                pairs.append((audio, text))
        if pairs:
            return pairs
    if args.reference.is_file() and args.reference_text.is_file():
        return [(args.reference, args.reference_text.read_text(encoding="utf-8").strip())]
    raise SystemExit("No reference voice clip is available (checked references.json and referans.wav).")


def arguments():
    parser = argparse.ArgumentParser(description="Produce Fish S2 Pro narration through Kaggle.")
    parser.add_argument("narration", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--reference", type=Path, default=Path("referans.wav"))
    parser.add_argument("--reference-text", type=Path, required=True)
    parser.add_argument("--references", type=Path, default=Path("assets/voice/references.json"))
    parser.add_argument("--lang", default="tr", help="narration language; 'tr' applies the Turkish grapheme pre-processor, others pass the text through")
    parser.add_argument("--notebook", type=Path, default=Path("tools/voice-lab/kaggle-fish-s2-pro.py"))
    parser.add_argument("--timeout", type=int, default=3300)
    return parser.parse_args()


def main():
    args = arguments()
    if not os.environ.get("KAGGLE_API_TOKEN", "").strip():
        raise SystemExit("KAGGLE_API_TOKEN is required.")
    if not args.narration.is_file():
        raise SystemExit("Narration is missing.")
    reference_clips = references(args)
    # Fish clones fine from one clip, and each extra prompt lengthens the
    # language-model context and its KV cache on the first T4 — three ~20 s
    # clips overran it and the kernel errored. Use one clip by default (the
    # first listed) and let FISH_MAX_REFERENCES raise the count deliberately.
    # produce.yml passes the GitHub variable through, and an unset variable
    # arrives as "" (not absent), so `or` past an empty or non-numeric value to
    # the default rather than crashing on int("") — which skipped the whole
    # English track once, since that step passes the variable and Turkish does not.
    try:
        max_references = max(1, int(os.environ.get("FISH_MAX_REFERENCES") or "1"))
    except ValueError:
        max_references = 1
    reference_clips = reference_clips[:max_references]
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
        # accent on Latin acronyms and foreign spellings. For Turkish, rewrite
        # the spoken text into Turkish graphemes so synthesis stays monolingual;
        # this changes pronunciation only, never a fact (CLAUDE.md section 2).
        # The original segments keep driving clips.json and the on-screen scene.
        # The English track (@Conflict-Grid) is English already, so it passes the
        # text through unchanged — the pre-processor is Turkish-specific.
        if args.lang == "tr":
            spoken = [{**segment, "text": tr_tts_prep.prepare(segment.get("text", ""))} for segment in segments]
        else:
            spoken = [dict(segment) for segment in segments]
        # Ship each reference clip under a stable name and record its transcript
        # alongside; the kernel passes every pair to Fish as a prompt. The first
        # pair is also kept under the legacy single-reference keys.
        prompts = []
        for index, (audio, text) in enumerate(reference_clips):
            name = f"referans{'' if index == 0 else index}.wav"
            shutil.copyfile(audio, input_dir / name)
            prompts.append({"audio": name, "text": text})
        job = {
            "reference_audio": prompts[0]["audio"],
            "reference_text": prompts[0]["text"],
            "references": prompts,
            "segments": spoken,
        }
        (input_dir / "job.json").write_text(json.dumps(job, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
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

        def dump_log(reason):
            # On failure the kernel writes no artifact, so pull its log and print
            # the tail — otherwise the CI step shows only "status error" with no
            # cause. The log file is named after the kernel slug.
            print(f"::error::{reason}")
            try:
                logdir = root / "faillog"
                logdir.mkdir(exist_ok=True)
                slug = kernel.split("/")[-1]
                command("kernels", "output", kernel, "-p", logdir, "-o", "--file-pattern", f"{slug}.log")
                logfile = logdir / f"{slug}.log"
                if logfile.is_file():
                    print("----- Kaggle kernel log (tail) -----")
                    print(logfile.read_text(encoding="utf-8", errors="replace")[-8000:])
            except Exception as exc:  # diagnosis only; never mask the original failure
                print(f"(could not fetch Kaggle kernel log: {exc})")

        # The kernel slug is fixed, so `kernels status` reports whatever version ran last. For a few
        # seconds after a push the new version has not registered yet and the status is still the
        # PREVIOUS run's terminal "complete" (or "error"). Accepting that downloads the previous run's
        # voice-artifact.zip — which once shipped a prior English clip under a Turkish video (English
        # voice, Turkish text). So wait for the new run to actually start (a non-terminal status) and
        # only then treat "complete" as this run's result; a 9-second "job" means a stale artifact.
        started_words = ("running", "queued", "pending", "preparing", "scheduled", "busy")
        deadline = time.monotonic() + args.timeout
        start_deadline = time.monotonic() + 900  # the pushed version must register as started within 15 min
        started = False
        while True:
            status = command("kernels", "status", kernel, capture=True).stdout.lower()
            if not started:
                if any(word in status for word in started_words):
                    started = True
                elif time.monotonic() >= start_deadline:
                    dump_log("The pushed Kaggle kernel never started a new run; its status stayed on the "
                             "previous run's terminal state, so no fresh artifact would be produced.")
                    raise SystemExit("The pushed Kaggle kernel never started a new run.")
                # otherwise it is still the previous run's stale terminal status: keep waiting to see the
                # new run start before accepting any "complete".
            else:
                if "complete" in status:
                    break
                if any(word in status for word in ("error", "failed", "cancelled")):
                    dump_log(f"Kaggle Fish job failed: {status.strip()}")
                    raise SystemExit(f"Kaggle Fish job failed: {status.strip()}")
            if time.monotonic() >= deadline:
                dump_log("Timed out waiting for the Kaggle Fish job.")
                raise SystemExit("Timed out waiting for the Kaggle Fish job.")
            time.sleep(15)

        downloaded = root / "downloaded"
        downloaded.mkdir()
        command("kernels", "output", kernel, "-p", downloaded, "-o", "--file-pattern", "voice-artifact.zip")
        archive = downloaded / "voice-artifact.zip"
        # Kaggle sometimes reports the kernel "complete" yet the artifact is missing or a truncated,
        # non-zip download (a late crash, or a bad fetch). Opening it then raised a bare BadZipFile with
        # no hint of why; instead pull the kernel log and print its tail, so a recurrence shows the real
        # cause (OOM, an exception) rather than "File is not a zip file".
        if not archive.is_file() or not zipfile.is_zipfile(archive):
            dump_log(
                "Kaggle reported the job complete but produced no usable voice-artifact.zip "
                f"({'it is missing' if not archive.is_file() else 'it is not a zip file'}); "
                "the kernel likely failed late."
            )
            raise SystemExit("Kaggle completed without a usable voice-artifact.zip.")
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