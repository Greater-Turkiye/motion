# motion — Greater Türkiye animasyon motoru

Kısa jeopolitik video kartları üreten motor: dönen kabartmalı küre, ülke ve ittifak vurgusu, haber
kartı. Videolar veri setindeki kaynaklı kayıtlardan **otomatik** üretilir.

A motion engine for short geopolitical video cards — a relief globe, country and alliance
highlights, a news card — produced **automatically** from the sourced records of the dataset.

**Durum / Status:** M1 ve M2'nin çizim yarısı çalışıyor: harita WebGL2'de (ülke kimliği dokusu, tek geçişte
dolgu, sabit kalınlıkta yumuşatılmış sınırlar), video tarayıcının kendi kodlayıcısıyla (WebCodecs) doğrudan
MP4'e yazılıyor; desteklenmeyen yerde ffmpeg yolu devrede. Kabartma (ETOPO) sırada. Plan: [PLAN.md](PLAN.md). Dört tasarım yönü, dördü de seçilebilir:
[docs/mockups](docs/mockups) (`tasarimlar-hepsi.png`: her stil için kanca, NATO ve kapanış karesi).

| | |
|---|---|
| Karar kaydı | handbook [ADR 0026](https://github.com/Greater-Turkiye/handbook/blob/main/decisions/0026-motion-repository.md) (önerildi) |
| Veri | [datasets](https://github.com/Greater-Turkiye/datasets) kayıtları, `auto-data` dalı dahil |
| Kurallar | handbook kırmızı çizgileri; ADR 0007, 0013, 0023 |
| Lisans | kod MIT, üretilen videolar CC BY 4.0 |

Tasarım örneklerini yeniden çizmek için `docs/mockups` klasörünü bir HTTP sunucusuyla açın ve
`mockups.html?v=A` … `?v=D` sayfalarını 1080×1920 pencerede görüntüleyin.

## Kullanım / Usage

```bash
npm ci
python tools/data/fetch_emblems.py --sync     # 406 arma, bayrak ve amblem; manifest'teki hash'lerle doğrulanır
npm run dev                                   # önizleme: http://localhost:5178/?scene=hook-karadeniz&style=A
npm run render -- --all-styles                # out/hook-karadeniz-{A,B,C,D}.mp4, 1080x1920, 60 fps
npm test                                      # iki ayrı işlemede aynı kareler (tolerans: 2/255)
```

| | |
|---|---|
| Sahneler | `scenes/*.yaml` — kayıt kimliği, kamera, olay, konu ülke ve amblemi, etiketler, kanca metni |
| Stiller | `src/styles.ts` — A gece kırmızısı, B harekât lacivert, C editoryal, D uydu gecesi |
| Harita | `src/gl/globe-gl.ts` (WebGL2), yedek `src/render/globe.ts` (2B) |
| Dışa aktarım | `export/render.mjs` — önce WebCodecs, olmazsa sekmelerde paralel kare + ffmpeg (`--encoder`, `--workers`) |
| Amblemler | `assets/emblems/manifest.json` — Wikidata/Commons, yalnızca kamu malı ve serbest lisans; dosyalar git'te değil |
| CI | `.github/workflows/render.yml` — tip denetimi, dört stilde video, determinizm; videolar artefakt |
| Lisanslar | [LICENSES.md](LICENSES.md) |

| Ölçüm (GTX 660) | M1, 2B tuval | M2, WebGL2 + WebCodecs |
|---|---|---|
| Kare çizimi | ~390 ms | ~1,2 ms |
| 4 sn dikey video, dışa aktarım | 121 sn (tek sekme), 33 sn (dört sekme) | ~5 sn |
| Önizleme | ~3 fps | 57–58 fps (başsız Chrome'un kare zamanlayıcısı sınırı) |

`?renderer=canvas2d` eski 2B çiziciyi açar; WebGL2 olmayan ortamda kendiliğinden devreye girer.
