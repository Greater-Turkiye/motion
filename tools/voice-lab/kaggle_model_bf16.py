#!/usr/bin/env python3
"""One-time utility: publish the Fish S2 Pro weights as a private bf16 Kaggle dataset.

Downloading fishaudio/s2-pro (~11 GiB) and casting it to bfloat16 on every
production run burns the account's Kaggle GPU quota. Run this script once to
download the model, cast its float weights to bfloat16 (about half the size),
and upload the result as a private Kaggle dataset. Then set the organization
variable FISH_MODEL_DATASET to the printed slug: from that point the production
kernel (tools/voice-lab/kaggle-fish-s2-pro.py) loads the weights straight from
/kaggle/input with no download or conversion.

    KAGGLE_API_TOKEN=... python tools/voice-lab/kaggle_model_bf16.py

Re-running it uploads a new version of the same dataset. Needs torch and the
huggingface + kaggle CLIs on PATH; run it anywhere with internet (it does not
need a GPU). It never runs during daily production.
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

WEIGHT_SUFFIXES = {".pth", ".ckpt", ".bin", ".safetensors"}


def command(*args, cwd=None, capture=False):
    return subprocess.run(
        [sys.executable, "-m", "kaggle", *map(str, args)],
        cwd=cwd,
        check=True,
        text=True,
        capture_output=capture,
    )


def account_owner(workdir):
    """Read the authenticated Kaggle username the way kaggle_submit.py does."""
    probe = workdir / "probe"
    probe.mkdir()
    command("kernels", "init", "-p", probe)
    metadata = json.loads((probe / "kernel-metadata.json").read_text(encoding="utf-8"))
    owner, separator, _ = metadata.get("id", "").partition("/")
    if not separator or not owner or owner == "USERNAME":
        raise SystemExit("Kaggle could not determine the authenticated account name.")
    return owner


def cast_tensor(tensor):
    import torch

    return tensor.to(torch.bfloat16) if tensor.dtype == torch.float32 else tensor


def convert_safetensors(path):
    from safetensors.torch import load_file, save_file

    with open(path, "rb") as handle:
        header_length = int.from_bytes(handle.read(8), "little")
        metadata = json.loads(handle.read(header_length)).get("__metadata__") or {}
    tensors = {name: cast_tensor(tensor) for name, tensor in load_file(path).items()}
    save_file(tensors, path, metadata=metadata)


def convert_torch(path):
    import torch

    checkpoint = torch.load(path, map_location="cpu")

    def walk(value):
        if isinstance(value, torch.Tensor):
            return cast_tensor(value)
        if isinstance(value, dict):
            return {key: walk(item) for key, item in value.items()}
        if isinstance(value, list):
            return [walk(item) for item in value]
        return value

    torch.save(walk(checkpoint), path)


def main():
    parser = argparse.ArgumentParser(description="Publish Fish S2 Pro bf16 weights to a private Kaggle dataset.")
    parser.add_argument("--slug", default="fish-s2-pro-bf16", help="Dataset name under the authenticated account.")
    parser.add_argument("--repo", default="fishaudio/s2-pro", help="Hugging Face model repository to convert.")
    args = parser.parse_args()
    if not os.environ.get("KAGGLE_API_TOKEN", "").strip():
        raise SystemExit("KAGGLE_API_TOKEN is required.")

    with tempfile.TemporaryDirectory(prefix="motion-fish-model-") as temporary:
        workdir = Path(temporary)
        owner = account_owner(workdir)
        dataset = f"{owner}/{args.slug}"
        weights = workdir / "weights"
        weights.mkdir()
        subprocess.run(["hf", "download", args.repo, "--local-dir", str(weights)], check=True)
        shutil.rmtree(weights / ".cache", ignore_errors=True)

        converted = 0
        for path in sorted(weights.rglob("*")):
            if not path.is_file() or path.suffix not in WEIGHT_SUFFIXES:
                continue
            before = path.stat().st_size
            if path.suffix == ".safetensors":
                convert_safetensors(path)
            else:
                convert_torch(path)
            converted += 1
            print(f"bf16 {path.name}: {before / 1024**2:.0f} MiB -> {path.stat().st_size / 1024**2:.0f} MiB")
        if not converted:
            raise SystemExit(f"No weight files found under {args.repo}; nothing to convert.")

        metadata = {
            "title": "Fish S2 Pro (bf16)",
            "id": dataset,
            "licenses": [{"name": "other"}],
        }
        (weights / "dataset-metadata.json").write_text(json.dumps(metadata, indent=2) + "\n", encoding="utf-8")
        try:
            command("datasets", "version", "-p", weights, "-m", "Update bf16 Fish S2 Pro weights", "--dir-mode", "zip")
        except subprocess.CalledProcessError:
            command("datasets", "create", "-p", weights, "--dir-mode", "zip")

    print(f"\nDone. Set the organization variable FISH_MODEL_DATASET to:\n    {dataset}")


if __name__ == "__main__":
    main()
