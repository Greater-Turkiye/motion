# motion — Greater Türkiye animasyon motoru

Kısa jeopolitik video kartları üreten motor: dönen kabartmalı küre, ülke ve ittifak vurgusu, haber
kartı. Videolar veri setindeki kaynaklı kayıtlardan **otomatik** üretilir.

A motion engine for short geopolitical video cards — a relief globe, country and alliance
highlights, a news card — produced **automatically** from the sourced records of the dataset.

**Durum / Status:** M1 çalışıyor: deterministik saat, sahne dosyası, küre ve kanca şablonu, çakışmasız
etiketler, Chrome'dan ffmpeg'e kare kare 60 fps dışa aktarım, dört stil. Plan: [PLAN.md](PLAN.md). Dört tasarım yönü, dördü de seçilebilir:
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
| Dışa aktarım | `export/render.mjs` — kareler birbirinden bağımsız; `--workers` sekme sayısı |
| Amblemler | `assets/emblems/manifest.json` — Wikidata/Commons, yalnızca kamu malı ve serbest lisans; dosyalar git'te değil |
| CI | `.github/workflows/render.yml` — tip denetimi, dört stilde video, determinizm; videolar artefakt |

Bu makinede (GTX 660) dört saniyelik dikey kanca dört sekmeyle ~33 saniyede işleniyor.
