# Reference voice clips

Drop the owner's reference recordings here as WAV files, named exactly as
`../references.json` lists them:

- `ref_1_japonticarethacmi.wav`
- `ref_2_tanklar.wav`
- `ref_3_ihasaldirisi.wav`

Each file's spoken content must match its `text` in `../references.json` word
for word — that transcript conditions Fish S2 Pro's voice cloning. Mono WAV,
16 kHz or higher, a few seconds to a minute each.

Until these files exist the pipeline falls back to the single root
`referans.wav`, so adding them here is the only step that switches the
production voice. The clips travel to Kaggle inside the private job dataset;
the recordings are Greater Türkiye's own, rights reserved.
