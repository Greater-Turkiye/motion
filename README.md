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
| Sahne üretici | `tools/scene/generate.mjs` — kayıttan sahne, insansız ve dil modelsiz. Olay türü bir **şablon ailesi** seçer: **saldırı** (kanca: can kaybı ya da yer + tür; yer, olgular, en yakın Türk şehrine mesafe, kayıtlarımızda son 7 günün noktaları, durum), **anlaşma/temas** (kanca: iki ülke; başkentler arası yay ve bayrak çipleri, olgular, durum, ikilinin son 12 ayı), **tatbikat** (kanca: tatbikatın adı; katılımcı bayrakları, deniz alanı, Türkiye'ye mesafe), **açıklama** (konuşan taraf yalnızca kaynağın alan adından ya da "X statement" kalıbından bilinirse; alıntı kartı), **sayı iddiası**. Tür etiketi ("İHA SALDIRISI") yalnızca başlıkta o türün kanıtı varsa kullanılır. Ülkeler `assets/data/countries.json`'dan (236 ülke). Yer adları Türkçe yazılır (Kyiv → Kiev, Brăila → BRAİLA). Alt satır yalnızca fiille biten tam bir cümle parçasıdır; virgülde kesilmiş yarım liste gösterilmez. Kancası "BÖLGE / GELİŞME" olup altında cümle bulunmayan kayıt reddedilir (seçici bir sonrakine geçer). Türk kuvvetleri, geri çekilmiş ya da yanlış kayıt reddedilir |
| Otomatik üretim | `.github/workflows/produce.yml` — altı saatte bir (datasets otomatik kayıtlarından 40 dk sonra) `tools/scene/select.mjs` en iyi yeni kaydı seçer, sahne ve video üretilir, MP4, kapak karesi ve künyesi (`generate.mjs --meta`) `video-<kayıt>` etiketli GitHub sürümü olarak yayımlanır; ikinci iş son yirmi videoyu `videos.json` ile bu deponun Pages sitesine (greater-turkiye.github.io/motion/, `tools/scene/site.mjs`) koyar, platformun **Videolar** sayfası oradan aynı kökten okur; durdurmak için depo değişkeni `MOTION_PRODUCE=off` |
| Ses | `export/score.mjs` — tamamen prosedürel, dosya ve lisans yok, sahneden deterministik: stile göre açık beşli yatak (minör yok, melodi yok), bölüm geçişlerinde whoosh, tek zirve (mesafe ya da örüntü bölümünden önce kısa yükseliş, darbe değil açık akor), haritada yanan her kayıt için tik, daktilo stillerinde tuş sesi, durum rozetinden önce 0,35 sn sessizlik, döngü noktasında açılış sesi. Saldırı haberlerinde yatak daha alçak, patlama çağrıştıran ses yok. **Şimdilik kapalı** (`--audio` ile açılır): sahibin ilk dinlemesinde ucuz bulundu; yerine lisansları kayıtlı, seçilmiş gerçek kayıtlardan bir kütüphane kuruluyor. Araştırma: `docs/research/05`, `08` |
| Etiketler | `src/render/labels.ts` — her etiketin yeri video başında bir kez, kamera yolunun örnek anlarından seçilir ve değişmez (kare kare zıplama yok); bir etiketin yerden birkaç çapası olabilir (TÜRKİYE: merkez, Karadeniz kıyısı, batı, doğu), haritayla birlikte hareket eder. Kapanan etiket zıplamaz, kapandığı oranda solar; TÜRKİYE yalnızca kadrajdan çıkınca solar |
| Yazı tipleri | Her stilin üç yazı ailesi var (başlık / metin / mono), Türkçe glifleri doğrulanmış açık lisanslı fontlardan: A Big Shoulders, B ve I Archivo, C Newsreader + Schibsted, E Unbounded, G Schibsted, H Black Ops One + Special Elite, K Cinzel + Fraunces (`docs/research/06`) |
| Hareket | Her stilin kendi hareket dili var (`src/styles.ts` → `motion`): A kelime kelime + sert kamera, B daktilo + süzülme, C ve G silerek, D ve E yükselen + uçuş, H daktilo + 12 fps, I silerek + sert, K ağır süzülme; stil değişince hepsi birlikte değişir. Deneme için sahnede `anim` ya da adreste parametre: yazı girişi `text=rise|wipe|type|pop` (yükselme, silme, daktilo, kelime kelime), kamera `camera=glide|fly|snap` (süzülme, yükselip inen uçuş, sert geçiş), `progress=1` (hikâye tarzı ilerleme çubuğu), `blur=0` (hareket bulanıklığını kapatır). Dışa aktarımda kamera hızlıysa kare 2–6 alt kareden ortalanır (180° obtüratör) ve her kare yarım seviye titreşimle (dither) yazılır (`src/gl/accum.ts`) |
| Varyant galerisi | `node tools/gallery.mjs` — aynı haberi on iki farklı stil ve hareketle çizer, 720p önizlemeler `out/gallery/preview` |
| Stüdyo | `tools/scene/studio.mjs` + `.github/workflows/studio.yml` — her olay ailesinden güncel bir haber dokuz stilde, üçer kare; haftalık ve `config/styles.yaml` değişince yenilenir, greater-turkiye.github.io/motion/studio/ adresinde varsayılan işaretli görünür. Varsayılanı değiştirmek: `config/styles.yaml`'da harf |
| Sahne denetimi | `src/engine/scene.ts` `validate()` — okuma hızı ≤ 15 karakter/sn, kancadaki ve olgulardaki her içerik kelimesi `source_text`'te, yasak öfke kelimeleri, soru kancası yok; bir sorun varsa sahne çizilmez |
| Stiller | `src/styles.ts` — A gece kırmızısı, B harekât lacivert, C editoryal, D uydu gecesi, E ateşböceği, G İsviçre rölyefi (yükseltiye göre renk, mavi-gri gölge), H gizliliği kaldırılmış (fotokopi: yarım ton kabartma, toner beneği, 12 fps kamera), I harekât paftası (eş yükselti eğrileri, 1° ızgara; birlik sembolü yok), K çini atlas (portolan rumb hatları, çini deseni) |
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
