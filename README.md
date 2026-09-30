# motion — Greater Türkiye animasyon motoru

Kısa jeopolitik video kartları üreten motor: dönen kabartmalı küre, ülke ve ittifak vurgusu, haber
kartı. Videolar veri setindeki kaynaklı kayıtlardan **otomatik** üretilir.

A motion engine for short geopolitical video cards — a relief globe, country and alliance
highlights, a news card — produced **automatically** from the sourced records of the dataset.

**Durum / Status:** M1 ve M2 çalışıyor: harita WebGL2'de (ülke kimliği dokusu, tek geçişte
dolgu, sabit kalınlıkta yumuşatılmış sınırlar), video tarayıcının kendi kodlayıcısıyla (WebCodecs) doğrudan
MP4'e yazılıyor; desteklenmeyen yerde ffmpeg yolu devrede. Kabartma ETOPO1 normal haritasından,
gölgelendiricide kuzeybatı ışığıyla (Imhof) hesaplanıyor; gücü her stilde ayrı (`relief`, `limb`).
İlk tam video hazır: `karadeniz-gemi`, 22 sn, kanca → nerede → ne oldu → ne kadar yakın → durum →
veri setinden bağlam, son kare ilk kareye döner (döngü). Plan: [PLAN.md](PLAN.md). Yedi stil, hepsi seçilebilir (A–D ilk dört yön, E/G/K araştırmadan):
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
python tools/data/build_relief.py             # yalnızca kabartmayı yeniden üretmek için (depoda hazır: assets/data/relief.png)
npm run dev                                   # önizleme: http://localhost:5178/?scene=hook-karadeniz&style=A
npm run render -- --all-styles                # out/hook-karadeniz-{A,B,C,D}.mp4, 1080x1920, 60 fps
npm run render -- --scene karadeniz-gemi --all-styles   # tam video, 22 sn, yedi stil
node tools/scene/generate.mjs --datasets ../datasets --latest 5   # en yeni 5 kayıttan sahne: scenes/auto/
node tools/scene/generate.mjs --datasets ../datasets --id evt_…     # tek kayıttan
npm test                                      # iki ayrı işlemede aynı kareler (tolerans: 2/255)
```

| | |
|---|---|
| Sahneler | `scenes/*.yaml` — kayıt kimliği, kaynak metni, kamera anahtarları, olay, konu ülke ve amblemi, etiketler, kanca, bölümler (`place`, `facts`, `distance`, `status`, `close`) |
| Şablon | `src/templates/video.ts` — kanca ve bölümler; durum ve kaynak ilk kareden son kareye ekranda; yazı yalnızca güvenli alanda (üst 270, alt 400, sağ 180 px boş), taşarsa dışa aktarım durur |
| Sahne üretici | `tools/scene/generate.mjs` — kayıttan sahne, insansız ve dil modelsiz: kanca kaydın kendi kelimeleri (sayı ve adı ya da başlığın kısa cümleciği), olgular başlık ("KAYNAĞA GÖRE"), yer ve kesinliği konumdan, bağlam veri setinden sayılır; stil olay türünden; Türk kuvvetleri, geri çekilmiş ya da yanlış kayıt reddedilir |
| Otomatik üretim | `.github/workflows/produce.yml` — altı saatte bir (datasets otomatik kayıtlarından 40 dk sonra) `tools/scene/select.mjs` en iyi yeni kaydı seçer, sahne ve video üretilir, MP4, kapak karesi ve künyesi (`generate.mjs --meta`) `video-<kayıt>` etiketli GitHub sürümü olarak yayımlanır; ikinci iş son yirmi videoyu `videos.json` ile bu deponun Pages sitesine (greater-turkiye.github.io/motion/, `tools/scene/site.mjs`) koyar, platformun **Videolar** sayfası oradan aynı kökten okur; durdurmak için depo değişkeni `MOTION_PRODUCE=off` |
| Sahne denetimi | `src/engine/scene.ts` `validate()` — okuma hızı ≤ 15 karakter/sn, kancadaki ve olgulardaki her içerik kelimesi `source_text`'te, yasak öfke kelimeleri, soru kancası yok; bir sorun varsa sahne çizilmez |
| Stiller | `src/styles.ts` — A gece kırmızısı, B harekât lacivert, C editoryal, D uydu gecesi, E ateşböceği, G İsviçre rölyefi (yükseltiye göre renk, mavi-gri gölge), K çini atlas (portolan rumb hatları, çini deseni) |
| Harita | `src/gl/globe-gl.ts` (WebGL2), yedek `src/render/globe.ts` (2B) |
| Dışa aktarım | `export/render.mjs` — önce WebCodecs, olmazsa sekmelerde paralel kare + ffmpeg (`--encoder`, `--workers`) |
| Amblemler | `assets/emblems/manifest.json` — Wikidata/Commons, yalnızca kamu malı ve serbest lisans; dosyalar git'te değil |
| CI | `.github/workflows/render.yml` — tip denetimi, datasets `auto-data`'nın en yeni beş kaydından sahne, yedi stilde saniyede bir kare, A stilinde tam video, en yeni üretilmiş sahnenin videosu, determinizm; videolar artefakt. Runner'da GPU yok: SwiftShader, kare başına 0,15–0,35 sn (22 sn video 3–8 dk, runner'a göre) |
| Lisanslar | [LICENSES.md](LICENSES.md) |

| Ölçüm (GTX 660) | M1, 2B tuval | M2, WebGL2 + WebCodecs |
|---|---|---|
| Kare çizimi | ~390 ms | ~1,2 ms |
| 4 sn dikey video, dışa aktarım | 121 sn (tek sekme), 33 sn (dört sekme) | ~5 sn |
| Önizleme | ~3 fps | 57–58 fps (başsız Chrome'un kare zamanlayıcısı sınırı) |
| 22 sn tam video, dışa aktarım | — | ~22 sn |
| Yazılım çizimi (SwiftShader, CI) | — | ~0,5 sn/kare (sınırlar 10° hücrelerde, yalnızca görünenler; örnekleme yok) |

`?renderer=canvas2d` eski 2B çiziciyi açar; WebGL2 olmayan ortamda kendiliğinden devreye girer.
