"""Local TTS evaluation harness — the approval gate before any local model ships.

    python -u tools/audio/local_tts_eval.py [--ref referans.wav] [--out out/tts-eval]
                                            [--engines f5-tr,xtts] [--text "..."]

Generates one clip per candidate model from the project's reference voice (referans.wav)
and a representative news sentence, so the owner can listen and pick the voice BEFORE it
is wired into production (owner directive, 9 October: no local model reaches main until
the owner has heard it and approved). Nothing here touches the pipeline; it only writes
wavs under --out for a listen (or for upload as a GitHub Actions artifact).

Candidates that fit this machine's 4 GB laptop GPU (RTX 3050 Ti):
  f5-tr  — F5-TTS with the Turkish weights Karayakar/F5-TTS-Turkish (base code MIT,
           weights trained on Mozilla Common Voice TR, CC0). Clean licence, native
           Turkish. Emotion follows the reference clip; no separate instruct knob.
  xtts   — XTTS-v2 (coqui-tts fork). Turkish is one of its 17 languages, 6 s cloning.
           Licence is the Coqui Public Model Licence (non-commercial) — review before use.

Each engine is isolated: one failing to install or run never stops the others, so a
partial run still produces something to compare. Models load and unload one at a time,
because 4 GB will not hold two at once.
"""
import argparse, gc, os, sys, time, pathlib

# The Windows console is cp1252 and cannot encode Turkish letters in the status prints;
# force UTF-8 so logging the sample text never crashes the run.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8")
    except Exception:
        pass

# A real line from the auto pipeline's narration, numbers spelled the way tts.py expects
# them said, so the sample exercises the hard parts (place names, a spoken number).
SAMPLE_TEXT = (
    "Kiev'in Holosiivskyi bölgesine düşen Rus insansız hava aracı enkazı bir kişiyi "
    "öldürüp birkaç kişiyi yaraladı. Türkiye'ye uzaklığı, Sinop'a kuş uçuşu yaklaşık "
    "bin kilometre; İstanbul ile Trabzon arası kadar."
)


def unload():
    gc.collect()
    try:
        import torch
        if torch.cuda.is_available():
            torch.cuda.empty_cache()
    except Exception:
        pass


def device():
    try:
        import torch
        return "cuda" if torch.cuda.is_available() else "cpu"
    except Exception:
        return "cpu"


def run_f5(ref, text, out):
    """F5-TTS with the Turkish weights. ref_text left empty so F5 transcribes the
    reference with its own ASR; the Turkish checkpoint and its vocab come from the Hub."""
    from huggingface_hub import hf_hub_download, list_repo_files
    from f5_tts.api import F5TTS

    repo = os.environ.get("F5_TR_REPO", "Karayakar/F5-TTS-Turkish")
    files = list_repo_files(repo)
    ckpt_name = next((f for f in files if f.endswith((".safetensors", ".pt"))), None)
    vocab_name = next((f for f in files if f.endswith("vocab.txt")), None)
    if not ckpt_name:
        raise RuntimeError(f"no .safetensors/.pt checkpoint in {repo}")
    ckpt = hf_hub_download(repo, ckpt_name)
    vocab = hf_hub_download(repo, vocab_name) if vocab_name else ""

    model = F5TTS(model="F5TTS_Base", ckpt_file=ckpt, vocab_file=vocab, device=device())
    model.infer(ref_file=str(ref), ref_text="", gen_text=text, file_wave=str(out))


def run_xtts(ref, text, out):
    """XTTS-v2 via the maintained coqui-tts fork; Turkish is language 'tr'."""
    os.environ.setdefault("COQUI_TOS_AGREED", "1")
    from TTS.api import TTS

    tts = TTS("tts_models/multilingual/multi-dataset/xtts_v2").to(device())
    tts.tts_to_file(text=text, speaker_wav=str(ref), language="tr", file_path=str(out))


ENGINES = {"f5-tr": run_f5, "xtts": run_xtts}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--ref", default="referans.wav")
    ap.add_argument("--out", default="out/tts-eval")
    ap.add_argument("--text", default=SAMPLE_TEXT)
    ap.add_argument("--engines", default="f5-tr,xtts")
    args = ap.parse_args()

    ref = pathlib.Path(args.ref).resolve()
    if not ref.is_file():
        sys.exit(f"reference audio not found: {ref}")
    out_dir = pathlib.Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"device: {device()}   reference: {ref.name}   text: {args.text[:60]}...", flush=True)
    results = []
    for name in [e.strip() for e in args.engines.split(",") if e.strip()]:
        fn = ENGINES.get(name)
        if not fn:
            print(f"[{name}] unknown engine, skipping", flush=True)
            continue
        out = out_dir / f"{name}.wav"
        t0 = time.time()
        try:
            fn(ref, args.text, out)
            ok = out.is_file() and out.stat().st_size > 1000
            results.append((name, ok, round(time.time() - t0, 1), str(out) if ok else "no output"))
            print(f"[{name}] {'ok' if ok else 'FAILED'} in {time.time() - t0:.1f}s -> {out}", flush=True)
        except Exception as e:
            import traceback
            results.append((name, False, round(time.time() - t0, 1), f"{type(e).__name__}: {e}"))
            print(f"[{name}] FAILED in {time.time() - t0:.1f}s: {type(e).__name__}: {str(e)[:300]}", flush=True)
            traceback.print_exc()
        finally:
            unload()

    print("\n=== summary ===", flush=True)
    for name, ok, secs, info in results:
        print(f"  {name:8} {'OK  ' if ok else 'FAIL'} {secs:6.1f}s  {info}", flush=True)
    print(f"\nListen to the wavs in {out_dir}/ and pick the voice.", flush=True)


if __name__ == "__main__":
    main()
