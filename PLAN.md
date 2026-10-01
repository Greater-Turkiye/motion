# Plan — Greater Türkiye motion engine

> **Durum: plan, onay bekliyor. Sahibin isteğiyle hat tam otomatik tasarlandı (bölüm 10).** Tasarım, yazı tipi ve kod bu plan onaylandıktan sonra başlar.
> **Status: plan awaiting approval.** No design, type or code before the plan is agreed.

Bu belge, kısa jeopolitik video kartları üreten bir animasyon motorunun planıdır. Örnekleri dönen,
kabartmalı bir küre, bir ülkenin ya da ittifakın vurgulanması, bir amblem ve alt yarıda bir haber
kartı. Hedef bunu **bizim verimizle**, **bizim kurallarımızla** ve yayın kalitesinde yapmak.

This is the plan for an animation engine that produces short geopolitical video cards: a rotating
relief globe, a country or an alliance highlighted, a mark, and a news card in the lower half —
made from **our own records**, under **our own rules**, at broadcast quality.

---

## 1. Ne üretir / What it produces

| Çıktı | Boyut | Kare hızı | Kullanım |
|---|---|---|---|
| Dikey kart | 1080×1920 | 60 fps | Telegram, Instagram/YouTube kısa video, X |
| Yatay kart | 1920×1080 | 60 fps | Site, sunum, YouTube |
| Kare | 1080×1080 | 60 fps | Bluesky, Mastodon |
| Tek kare | PNG, aynı boyutlar | — | Kapak, bülten |

Kodlama: H.264 (her yerde oynar), isteğe bağlı HEVC ve ProRes 4444 (şeffaf katman, kurgu için).
Bir kart 8–20 saniye.

## 2. Temel karar: deterministik, kare kare işleme / The core decision

Akıcılığın sırrı gerçek zamanda hızlı çizmek değil, **her kareyi zamandan bağımsız çizmek**.

- Sahne, `t` zamanını alıp o anın görüntüsünü veren **saf bir fonksiyondur**. Rastgelelik tohumlu,
  animasyon yalnızca `t`'ye bağlı.
- Dışa aktarımda tarayıcı gerçek saate göre değil, **sanal saatle** ilerler: kare 0, kare 1, … kare
  N. Her kare tam çizilir, yakalanır, ffmpeg'e verilir. Makine ne kadar yavaş olursa olsun çıktı
  **kusursuz 60 fps** olur; hiçbir kare düşmez, hiçbir kare iki kez gelmez.
- Aynı kod önizlemede gerçek zamanda çalışır; önizleme ile çıktı piksel piksel aynı sahneyi gösterir.

Rendering is a pure function of time. Export steps a virtual clock frame by frame in headless
Chrome and pipes each finished frame to ffmpeg, so the output is a perfect 60 fps however slow the
machine is. The live preview runs the same code on the real clock.

## 3. Teknik yığın / Stack

| Katman | Seçim | Neden |
|---|---|---|
| Dil | TypeScript | Tipler, sahne tanımlarının doğrulanması |
| Çizim | **WebGL2**, kendi ince katmanımız (three.js yok) | Kürede ışık, kabartma, sınır çizgisi ve maske gölgelendiricide; kontrol bizde |
| Yazı | **MSDF** (çok kanallı mesafe alanı) glif atlasları | Her ölçekte keskin kenar, animasyonda titremeyen yazı |
| Sınır çizgileri | Ekran uzayında kalınlığı sabit, kenarı yumuşatılmış çizgi geometrisi | Yakın ve uzak planda aynı incelik, pikselleşme yok |
| Önizleme | Vite geliştirme sunucusu, tarayıcıda | Anında görüntü |
| Dışa aktarım | Node + Chrome DevTools Protocol (sanal zaman) → ffmpeg | Deterministik kare, platformdaki CDP araçlarıyla aynı yol |
| Paketleme | Vite derlemesi (yalnız bu repoda; site deposunun "derleme yok" kuralı orada kalır) | GLSL ve TS için gerekli |

Remotion'ı değerlendirdik ve seçmedik. Üç kişiden büyük kuruluşlarda ücretli şirket lisansı
istiyor ve topluluk büyüdükçe bu bir maliyete dönüşür. Motion Canvas MIT lisanslı ama 2B tuval
üzerine kurulu, kabartmalı küre için yetmez. Kendi motorumuz daha fazla iş ama sıfır bütçe ve tam
kontrol demek.

## 4. Görüntü kalitesi / Image quality

**Küre:**
- Kabartma: NOAA **ETOPO1** yükseklik verisinden (kamu malı, 4 yay dakikası) 4096×2048 normal
  haritası (`tools/data/build_relief.py`, 38× dikey abartı, deniz düz). Işık gölgelendiricide:
  Imhof'un kuzeybatı ışığı, batı ve kuzeyden iki yardımcıyla; ovalar sessiz, dağlar belirgin; ana
  ve konu ülke dolgusu kabartmanın yarısını alır ki renk okunur kalsın. ✅
- Yüzey rengi: tek renk koyu zemin + kabartma gölgesi (örneklerdeki gibi), isteğe bağlı NASA Blue
  Marble (kamu malı).
- Atmosfer ve kenar ışığı, çok hafif film greni, vinyet. Hepsi kapatılabilir.
- Kutup ve antimeridyen çevresinde bozulma olmaması için küre gerçek 3B küre olarak çizilir, düz
  harita dokusu değil.

**Sınırlar ve ülkeler:**
- Natural Earth 1:10m, platform deposundaki **Türkiye görüşüne göre** sınır düzeltmeleriyle aynı
  kaynak (ADR 0013): KKTC, işgal altındaki topraklar, Mavi Vatan aynı kurallarla.
- Ülke vurgusu bir kimlik dokusuyla yapılır: her ülke bir renk kimliği, vurgu gölgelendiricide.
  Böylece "Rusya'yı kırmızı yak, NATO'yu mavi yak" tek bir değer değişikliğidir, geometri yeniden
  kurulmaz.
- Sınır çizgisi ekranda 0,6–2 px sabit kalınlıkta, yumuşatılmış kenarla; 4× süper örnekleme ile
  dışa aktarılır, ardından küçültülür.

**Yazı:** Montserrat (site ile aynı marka) ve bir mono yazı tipi. İkisi de OFL lisanslı. Türkçe
karakterler (ğ, ş, ı, İ) atlasta baştan var.

## 5. Sahne dili / Scenes as data

Bir video bir **sahne dosyasıdır** (YAML). Kod değil, veri. Örnek:

```yaml
format: vertical            # vertical | landscape | square
duration: 12s
record: evt_01m392q98mejqst3x8pzhnpek9   # başlık, tarih, kaynak, durum kayıttan gelir
shots:
  - at: 0s
    camera: { focus: [37.6, 55.7], distance: 2.4, tilt: 18 }
    highlight: { countries: [RUS], style: adversary }
    mark: { glyph: eagle-generic, label: "RUSYA FEDERASYONU" }
  - at: 5s
    camera: { focus: [-30, 62], distance: 2.8, ease: inOutCubic }
    highlight: { group: nato, style: alliance }
    mark: { glyph: compass-rose, label: "NATO" }
card:
  kicker: ÖNEMLİ GELİŞME
  headline_from: record.title
  body_from: record.summary
  source_from: record.sources
```

- Kart metni **kayıttan** gelir: başlık, tarih, kaynaklar, doğrulama durumu. Elle yazılan metin de
  mümkün, ama kaynak satırı zorunlu.
- Kamera geçişleri küre üzerinde büyük daire boyunca, kuaterniyon ara değerlemeyle; yumuşatma
  eğrileri hazır (`inOutCubic`, `outExpo`, …).
- Şablonlar: **Önemli gelişme kartı**, **harita çağrısı** (bir noktaya iğne ve açıklama), **sayaç**
  (kayıt sayısı, ticaret rakamı), **zaman çizelgesi**, **iki ülke karşılaştırması**.

## 6. Kurallar videoya da geçerli / Our rules apply to video

- **Kaynak zorunlu.** Her karede kaynak satırı; kayıt `unverified` ise "DOĞRULANMADI" etiketi
  kartın üstünde durur. Kaynağı olmayan bir iddia sahne dosyası doğrulamasından geçmez.
- **Türk kuvvetleri kırmızı çizgisi aynen.** Türk kuvvetlerine ait konum, hareket ya da
  konuşlanma içeren kayıttan video üretilmez; doğrulayıcı bunu sahne aşamasında reddeder.
- **Hedef dili yok.** Tesis vurgusu, "kritiklik puanı", nişan noktası görünümü yok.
- **Amblemler (sahibin kararı, 2026-09-30):** devlet armaları ve ittifak amblemleri kullanılır,
  yalnızca **haber bağlamında**: kaydın konusu olan devletin ya da kuruluşun üstünde, haritada;
  logomuzun yanında değil, onay ya da bağ izlenimi vermeden. Rusya arması kamu malıdır (Rus Medeni
  Kanunu md. 1259); NATO amblemi Paris Sözleşmesi md. 6ter kapsamında korunur, haberde tanıtıcı
  kullanım bu sınırda kalır. Her amblemin kaynağı ve lisansı `assets/emblems/SOURCES.md`'de durur.
  Koyu stillerde amblem beyaz tek renk, açık stilde asıl renkleriyle çizilir.
- **Tahmin piyasası yok.** Örneklerdeki "Polymarket %24" gibi bahis oranları kullanılmaz:
  sponsorlu ve kaynaklanamayan bir sayı. Onun yerine kendi verimizden sayı gösterilir
  (ör. "Bu hafta Karadeniz'de 54 kayıt").
- **Kanallara otomatik gönderim ayrı bir karardır.** Üretim baştan sona otomatiktir (bölüm 10).
  Telegram, Bluesky, X gibi kanallara kendiliğinden gönderim ADR 0007'yi değiştirir; bunun için yeni
  bir ADR ve kanal hesaplarının belirteçleri gerekir. O ana kadar videolar sitede ve sürüm
  sayfasında yayımlanır, kanallar için hazır bekler.

## 7. Performans hedefleri / Performance targets

| Ölçüt | Hedef |
|---|---|
| Dışa aktarılan video | Her karede tam 60 fps, düşen kare yok (tasarım gereği) |
| Önizleme, tümleşik GPU | ≥ 60 fps, 1080×1920 |
| Kare süresi bütçesi (önizleme) | p95 ≤ 12 ms |
| 12 saniyelik dikey kartın dışa aktarımı | ≤ 2 dakika, dizüstü |
| Aynı sahne iki kez işlenince | Aynı işlem içinde bit bit aynı; iki ayrı tarayıcı işleminde büyük yazının kenarlarında en fazla 2/255 fark, baytların < %0,01'i (testle ölçülür) |

Ölçümü platformdaki `measure.mjs` ve `smoke.mjs` ile aynı yoldan, CDP üzerinden yaparız.

## 8. Depo yapısı / Repository layout

```
motion/
  engine/        çekirdek: saat, sahne grafiği, kamera, yumuşatma, WebGL2 katmanı
  globe/         küre, kabartma, sınır çizgisi, ülke kimlik dokusu, atmosfer
  text/          MSDF atlas üretimi ve yazı çizimi
  templates/     kart şablonları (önemli gelişme, çağrı, sayaç, zaman çizelgesi)
  scenes/        örnek sahne dosyaları (YAML)
  export/        CDP + ffmpeg dışa aktarımı
  tools/data/    veri üreticileri: sınırlar, kabartma, ülke kimlikleri (girdiler repo dışında önbellekte)
  assets/        derlenmiş veri, yazı tipleri, işaretler
  docs/          kararlar ve tasarım notları
```

## 9. Aşamalar / Milestones

| # | Aşama | Çıktı | Kabul ölçütü |
|---|---|---|---|
| M0 | Plan | bu belge | Sahibin onayı |
| M1 | İskelet ✅ | saat, sahne, CDP dışa aktarımı, kanca şablonu, dört stil, amblem manifesti | 1080×1920 60 fps MP4, iki çalıştırma tolerans içinde aynı |
| M2 | Küre ✅ | WebGL2 küre ve düz harita, WebCodecs dışa aktarım, ETOPO1 kabartması ✅ | Önizleme ≥ 60 fps, geçişte titreme yok |
| M3 | Sınırlar ve vurgu | Türkiye görüşüne göre sınırlar, ülke/ittifak vurgusu | 1:10m sınır 4× örneklemede pürüzsüz |
| M4 | Yazı ve kart (yarısı ✅) | tam video şablonu (kanca + beş bölüm, döngü), kalıcı durum ve kaynak satırı, güvenli alan denetimi ✅; MSDF yazı sırada | Türkçe karakterler, animasyonda titreme yok |
| M5 | Veriden sahne ✅ | `tools/scene/generate.mjs`: kayıttan sahne (kanca, beş bölüm, kamera, süre, stil), doğrulayıcı (okuma hızı, kaynak kelimeleri, yasak kelimeler), kırmızı çizgi reddi; CI her çalışmada en yeni beş kayıttan üretir | Kırmızı çizgi kaydı reddedilir ✅ |
| M6 | Şablonlar | çağrı, sayaç, zaman çizelgesi, karşılaştırma | Her şablondan örnek video |
| M7 | Tam otomasyon (yarısı ✅) | Bölüm 10'daki hat: kayıttan videoya, insansız; seçici, üretici, işleyici ve GitHub sürümü olarak yayın ✅; site sayfası ve kanallar sırada | Altı saatte bir runner'da üretim, sitede yayında |

## 10. Tam otomatik hat / The fully automatic pipeline

Sahibin isteği: sistem kendi kendine çalışsın. Hat şöyle:

```
toplayıcı (6 saatte bir) ─▶ otomatik kayıtlar (auto-data) ─▶ seçici ─▶ sahne üretici ─▶ işleyici ─▶ yayın
```

1. **Seçici** ✅ (`tools/scene/select.mjs`). Son 48 saatin videosu olmayan kayıtları research/04'ün
   haber değeri puanıyla sıralar: güncellik (24 saatte yarıya iner; akışlar altı saatlik partilerle
   geldiği için araştırmanın 12 saati parti zamanını cezalandırıyordu), tür büyüklüğü (başlıkta ölü ya da
   yaralı varsa en yüksek; olağan diplomatik temas düşük), Türkiye'ye
   yakınlık, ayrı yayıncı sayısı, doğrulama durumu, yenilik (son videolarla aynı tür ve bölge
   puanı düşürür), konum. Doğrulanmamış kayıt dışlanmaz, sırası düşer (ADR 0023). Çalışma başına
   bir video, altı saatte bir: günde en çok dört. İş akışı saatte üç kez (:07, :27, :47) uyanır, son video
   5 sa 30 dk'dan yeniyse saniyeler içinde çıkar; GitHub'ın düşürdüğü bir uyanış yirmi dakika
   kaybettirir. Saatte bir yetmedi: 1 Ekim gecesi GitHub dört saatlik uyanıştan yalnızca birini
   çalıştırdı (datasets ve platform depolarında da aynısı) ✅.
2. **Sahne üretici** ✅ (`tools/scene/generate.mjs`). Kayıttan sahne: kanca, bölümler, kamera, süre,
   stil. Metin kaydın metnidir; yeni iddia üretmez. Türk kuvvetleri, geri çekilmiş ya da yanlış
   kayıt, haritada yeri olmayan kayıt reddedilir.
3. **Doğrulayıcı** ✅. Sahne motorun `validate()`'inden geçer (okuma hızı, kaynak kelimeleri, yasak
   kelimeler); yazı güvenli alandan taşarsa dışa aktarım durur.
4. **İşleyici** ✅. Runner'da başsız Chrome, WebGL SwiftShader'da, WebCodecs H.264; 24 saniyelik
   video yaklaşık dört dakika, 8 Mbps.
5. **Yayın** ✅ (`.github/workflows/produce.yml`). MP4 ve ilk kare, `video-<kayıt kimliği>`
   etiketli bir GitHub sürümüne çıkar; sürüm notu başlık, durum, tarih, kaynaklar ve "otomatik
   üretildi, kimse okumadı" beyanıdır. Sürümler defterdir: sürümü olan kayıt bir daha seçilmez.
   Son yirmi video `videos.json` ile bu deponun Pages sitesine çıkar; platformun "Videolar" sayfası
   onu aynı kökten okur (Cloudflare adresinde `apps/site` vekil olur) ✅. Kanallara gönderim
   (Telegram, Bluesky, Mastodon, Instagram; research/04 bölüm 4) sırada; hesaplar sahibin kararı ve
   kendi işidir.
6. **Gözetim.** Sitedeki tarayıcı denetimi gibi: üretilen her videodan kareler örneklenir, boş
   kare, taşan yazı ya da eksik kaynak satırı varsa iş kırmızıya düşer ve sağlık raporuna girer
   (sırada). Acil durdurma: depo değişkeni `MOTION_PRODUCE=off` ✅.

## 11. Tasarım tipleri / Design directions

`docs/mockups/` içinde gerçek bir kayıtla çizilmiş dört yön var (tek kare, 1080×1920):

| | Ad | Karakter |
|---|---|---|
| A | **Gece kırmızısı** | Örneklere en yakın: siyah zemin, kabartmalı kara, hasım kırmızı ışıltıyla, sarı başlık kutusu |
| B | **Harekât lacivert** | Harekât ekranı: lacivert, camgöbeği sınırlar, köşe çerçeveleri, mono etiketler, üç kutulu istatistik |
| C | **Editoryal** | Gazete sayfası: açık zemin, düz harita, Türkiye kırmızı, siyah ağır başlık |
| D | **Uydu gecesi** | Uzaydan küre, soğuk ışık, buzlu cam kart, sade |

| E | **Ateşböceği** ✅ | Karanlık dünyada tek şey yanar: konu ülke turuncu hale, Türkiye soğuk ince çizgi; saldırı ve enerji haberleri |
| G | **İsviçre rölyefi** ✅ | Imhof: yükseltiye göre renk (ova yeşil-gri, dağ açık), mavi-gri gölge, sıcak ışık; dağlık cepheler, su, boğazlar |
| K | **Çini atlas** ✅ | İznik paleti, Piri Reis tarzı 32 yönlü rumb hatları, denizde çini deseni; diplomasi, Mavi Vatan |

| H | **Gizliliği kaldırılmış** ✅ | Fotokopi dosya: kâğıt, toner, yarım ton kabartma, benek, 12 fps kamera |
| I | **Harekât paftası** ✅ | Basılı pafta: yeşil ova, kahverengi eş yükselti eğrileri, 1° ızgara. APP-6 birlik sembolleri bilerek yok: dost/hasım çerçevesi hedefleme görünümü okunur (kırmızı çizgi) |

Hareket seçenekleri ✅: yazı girişi (yükselme, silme, daktilo, kelime kelime), kamera (süzülme, uçuş =
van Wijk'in önce uzaklaşıp sonra yaklaşan yolu, sert geçiş), hikâye tarzı ilerleme çubuğu, alt-kare
hareket bulanıklığı ve dither. Sırada: F saha defteri, J riso baskı, L kabartma maket; bloom (E için),
2× süper örnekleme.

**Sahibin kararı (2026-09-30): hepsi kalır, sahne dosyasında `style:` ile seçilir.**
Otomatik hatta seçici, olayın türüne göre varsayılan bir stil atar (ör. kinetik ve deniz olayları
A, diplomasi ve anlaşmalar C) ve istenirse günlük dönüşümlü kullanır.

Her stil için üç kare çizildi (`docs/mockups/tasarimlar-hepsi.png`): **kanca** (videonun ilk 1,5
saniyesi: dev olgu yazısı, Türkiye'ye mesafe), **NATO karesi** (ittifak mavisi, pusula amblemi) ve
**kapanış kartı** (başlık, özet, sayı, kaynak). Karelerde kalan etiket çakışmalarını motor otomatik
etiket yerleşimiyle çözer (M3).

## 12. Viral olmak: kanca, tempo, döngü / Going viral: hook, pace, loop

Amaç videoların yayılması. Platformların 2026'da açıkça söylediği ve ölçülen şeyler:

- **İlk 1–3 saniye her şeydir.** YouTube Shorts'ta ilk ölçüt "izlendi mi, kaydırıldı mı"; yaklaşık
  %70 izlenme oranı dağıtımın bir sonraki basamağını açıyor. Mobil izleyicilerin yaklaşık üçte ikisi
  ilk üç saniyede ilgilenmezse geçiyor.
- **Ölçülen şey izlenme süresi, yeniden izleme ve paylaşım.** Instagram'da sıralamanın ilk ölçütü
  toplam izlenme süresi ve yeniden izleme; DM ile gönderim beğeniden kat kat ağır. Önce küçük bir
  deneme kitlesine gösterilir, oradaki izlenme ve paylaşım genişlemeyi belirler.
- **Uzunluk:** 20–45 saniye bandı en güçlü; sonuna kadar izlenen 15 saniyelik video, yarısı
  izlenen 60 saniyelikten iyi sıralanır. Son kare ilk kareye bağlanırsa döngü ek izlenme sayılır.
- **Açıklayıcı haber içeriğinde** kazanan şey sade, kısa cümleler, yoğun olgu ve yargısız ton.

### Bizim kurallarımızla kanca / Hooks within our rules

Kanca **kayıttaki en somut, doğru olgudur**; abartma, soru işaretiyle ima ya da kaynağın
söylemediği bir iddia yok. Motor her kayıttan bu kancaları kendisi üretir:

| Kanca türü | Örnek (kaydın kendi olgusu) | Nereden gelir |
|---|---|---|
| **Somut olgu** | "KAPTAN ÖLDÜ" dev yazı, harita zaten hareket halinde | kayıt başlığının fiil + nesnesi |
| **Türkiye'ye mesafe** | "İstanbul Boğazı'na ~450 km" | kaydın konumu ile Türkiye noktaları arası hesap |
| **Sayı** | "Karadeniz'de 30 günde 146 kayıt" | veri setinin kendi sayımı |
| **Karşıtlık** | iki ülke aynı karede, iki renk | kaydın ülkeleri |
| **Dizi** | "Bu hafta 3. gemi saldırısı" | aynı türdeki kayıtların sayımı |

"Türkiye'ye mesafe" ve "neden bizi ilgilendiriyor" satırı ayırt edici yanımız: aynı olayı anlatan
yabancı kanallar bunu söylemez.

### Zaman çizelgesi (dikey, ~22 saniye) / Beat sheet

| Saniye | Olan |
|---|---|
| 0.0–1.5 | **Kanca.** İlk karede kamera zaten hareketli, hedef bölge yanıyor, dev kanca yazısı. Logo yok, giriş animasyonu yok. |
| 1.5–6 | Harita geri çekilir: nerede, kim, Türkiye'ye mesafe. |
| 6–15 | 2–3 saniyede bir yeni olgu: yakınlaşma, vurgu, sayaç. Her vuruşta görüntü değişir, izleyici kaydırmaz. |
| 15–20 | "Neden önemli": Türkiye bağlamı ve kendi sayımız. Kaynak satırı ve DOĞRULANMADI etiketi burada büyür. |
| 20–22 | Son kare, ilk karenin kompozisyonuna döner: döngü dikişsiz. |

### Üretim kuralları / Production rules

- **Güvenli alanlar:** dikeyde üst ~220 px ve alt ~420 px ile sağ ~120 px platform düğmelerine
  ait; hiçbir önemli yazı oraya düşmez. Doğrulayıcı bunu denetler.
- **Altyazı gömülü.** Çoğu kişi sessiz izler; her olgu ekranda yazı olarak var.
- **Ses:** kendi ürettiğimiz kısa efektler (geçiş, vurgu, sayaç), telif sorunu yok. İsteğe bağlı
  Türkçe seslendirme için açık lisanslı bir metinden sese modeli araştırılır; lisansı uygun değilse
  seslendirme yok.
- **Her olay için iki kanca varyantı** üretilir; kanallar bağlanınca hangisinin daha iyi izlendiği
  ölçülüp seçici öğrenir. Platform istatistikleri kanal hesabı ister (sahibin işi).
- **Şeffaflık avantajdır.** Instagram 2026'da kaynak ve köken sinyallerine ağırlık verdiğini
  söylüyor; bizim her videoda kaynak satırı ve kayıt kimliği taşımamız bunu karşılar. Otomatik
  üretildiği açıklamada belirtilir.

Kaynaklar: Kapwing kısa video istatistikleri 2026; vidIQ ve Gyre, YouTube Shorts algoritması 2026;
Dataslayer ve Socialync, Instagram sıralama sinyalleri 2026; Reuters Institute, viral haber açıklayıcısı.

## 13. Karar bekleyenler / Open decisions for the owner

1. ~~Tasarım yönü~~ — karar verildi: dördü de, seçilebilir (bölüm 11).
2. **Repo adı:** `motion`. (Alternatif: `studio`.)
3. **İlk format:** önce dikey 1080×1920 mi, yoksa üçü birden mi?
4. ~~Amblemler~~ — karar verildi: devlet armaları ve ittifak amblemleri, haber bağlamında (bölüm 6).
5. **Ses:** kendi efektlerimiz (önerilen) mi, yoksa Türkçe seslendirme de mi (lisansı uygunsa)?
6. **Kanallar:** hangi hesaplar açılacak (Instagram, YouTube, TikTok, Telegram, X)? Otomatik gönderim ve istatistik bunları ister.

## 14. Araştırmadan motora geçen kurallar / Rules taken from the research

Kaynak ve kanıt düzeyleri: [docs/research](docs/research). Rakamların çoğu uygulayıcı görüşü; A/B
ile sınanana kadar varsayılan değerdir, kural değil. Uygulananlar ✅.

**Zaman ve okuma**
- İlk karede somut özne + fiil + yer; fade-in yok, kamera 0. karede hareket halinde. ✅
- Yazı hızı ≤ 15 karakter/sn (≈ 2 Türkçe kelime/sn); blok süresi = karakter ÷ 15, en az 1,2 sn. ✅ (doğrulayıcı)
- Her 1,5–2,5 sn'de bir anlamlı görsel değişim; saniyede bir kesme yok (haber zaten uyarıcı).
- Süre 15–25 sn; "ne anlama geliyor" satırı 8–15. saniyede, doruk son %20'de, son kare ilk karenin
  kamera açısına döner (döngü). ✅ (`karadeniz-gemi`)

**Güven**
- Durum etiketi (DOĞRULANMADI / DOĞRULANDI / GELİŞEN) her videoda, ilk 2 sn'de ve son karede. ✅
- Kaynak satırı sürekli ekranda, okunur boyutta; yalnız son karede değil. ✅
- Hook'taki her içerik kelimesi kaynak metinde karşılık bulmalı; bulamazsa sahne reddedilir. ✅
- Kara liste: dış grup düşmanlığı ve ahlaki öfke kelimeleri (hain, rezil, küstah …); soru hook'u yok. ✅
- Kaygı yerine ölçek ve yenilik çerçevesi: mesafe ("Boğaz'a 430 km") ✅, "ilk kez" yalnızca veri
  setinden hesaplanabiliyorsa.

**Kompozisyon**
- Güvenli alan (üç platformun kesişimi): üst %14, alt %35, sol 65 px, sağ 180 px. Hook, durum ve
  kaynak satırı bu kutuda; alt bantta yalnızca dekor. ✅ (alt sınır TikTok'un 400 px'i; Meta'nın %35'i
  yazıya yalnızca 980 px bırakırdı)
- Taraf renkleri kırmızı-yeşil değil; renk her zaman amblem ya da desenle desteklenir.
- Aynı gün aynı düzen tekrarlanmaz; en az 5–6 düzen (YouTube "inauthentic content" politikası).

**Hat**
- Seçim puanı S = 100·D·(0,30M + 0,20P + 0,20C + 0,15R + 0,15N)·(0,8 + 0,2G), kesin elemelerden
  sonra; turda 1, günde 2–6 video (ayrıntı: research/04).
- Metin LLM'e yazdırılmaz; kayıt alanlarından deterministik şablon cümleleri.
- Ses: prosedürel efektler (WebAudio, kamu malı jsfxr); seslendirme adayı Chatterbox (MIT), Türkçe
  kalitesi ölçülmeden açılmaz. Ticari olmayan lisanslı sesler (Piper dfki, XTTS, MMS) kullanılmaz.
- Yayın: Telegram, Bluesky, Mastodon, Instagram Reels otomatik; YouTube denetim onayına kadar
  private; TikTok ve X otomatik değil. `published.json` defteri tekrar gönderimi engeller.
- CI'da GPU yok: Chrome `--use-angle=swiftshader-webgl --enable-unsafe-swiftshader` ✅; WebCodecs
  High profil runner'da çalıştı, olmazsa Baseline (`avc1.42E033`) ✅; çıktı ffprobe ve blackdetect
  kapısından geçer (sırada).

## 15. Sahibin ilk incelemesinden sonra / After the owner's first review (2026-09-30)

Sahibin gözlemi: etiketler kayıyor ve zıplıyor; yazı animasyonu stille uyuşmuyor; hepsi tek bir olay
tipinin (gemi saldırısı) aynı videosunun varyantı; veri setinde çok olay türü var. Kararlar (sahip
"sen hallet" dedi):

1. **Çekirdek** ✅: kararlı etiketler (yer bir kez seçilir, kapanınca solar), en yakın Türk şehrine
   mesafe ("TÜRKİYE'YE UZAKLIK" 700 km üstünde), bağlam satırı olay noktasının 150 km çevresinden
   (son 7 gün), sayı kalıplarında kelime sınırı.
2. **Stil paketleri** ✅ (hareket ve yazı tipleri): yazı animasyonu, kamera, geçiş ve ilerleme çubuğu stilin parçası; serbest
   karıştırma yalnızca denemede. Tek parametre (`style`) her şeyi birlikte değiştirir.
3. **Olay ailesi şablonları** ✅: saldırı (nokta + son 7 günün deseni + en yakın Türk şehri), diplomasi
   (iki ülke + başkentler arası yay + amblemler), tatbikat (katılımcılar + deniz alanı + Türkiye'ye
   mesafe), açıklama (konuşan ülke + alıntı kartı), sayı iddiası (büyük sayı + kimin iddiası).
4. **Kancalar kaydın alanlarından** ✅: can kaybı, yer + olay türü (türün başlıkta kanıtı varsa), iki
   ülke, tatbikat adı; başlıktan rastgele kelime seçimi kalkar. Konuşan taraf yalnızca kaynağın alan
   adından ya da başlıktaki "X statement" kalıbından belirlenir: "Rusya hakkında İngiltere açıklaması"
   Rusya'nın açıklaması değildir (ilk denemede tam bu hata vardı).
5. **Stüdyo**: aynı haber tüm stillerde yan yana; varsayılan stil olay ailesine göre.
6. **Ses tasarımı**: prosedürel ses (`export/score.mjs`) sahibin dinlemesinde reddedildi ("rezalet");
   kapalı. Yerine CC0 kayıtlardan beş set hazırlandı (`tools/audio/mix.mjs`, dinleme odası); sahip bir
   set seçene kadar videolarda müzik ve efekt yok.
7. **Seslendirme** ✅ (2026-10-01): sahip "sorma, sen karar ver" dedi. Karar ve gerekçe:
   - Model **Chatterbox Multilingual** (MIT, Resemble AI), varsayılan ses, CPU'da runner'da. Her klip
     PerTh filigranı taşır.
   - **FreyaTTS-small denendi, alınmadı** (2026-10-01, karadeniz-gemi, aynı metin): kısa cümlelerde
     kusursuz ve 3–5 kat hızlı, ama uzun cümlelerde dağılıyor. Whisper'ın duyduğu: "Tek kaynağı, kaynak,
     tek renform", son cümle anlamsız. Harf hata oranı en kötü kliplerde 0,37 ve 0,46; Chatterbox'ın
     altı klibi 0,00–0,12. Eğitim verisinin lisansı da yayımlanmamış. `voice-sample` iş akışında
     `engine=freya` ile denemeye açık kalır; yeni sürümü çıkınca yeniden ölçülür.
   - **Her klip yayından önce dinlenir** (`tools/audio/tts.py`): Whisper (small, int8) klibi yazıya
     döker, duyduğu harfler verilen metnin harfleriyle karşılaştırılır (sayılar iki tarafta da yazıyla).
     Hata 0,20'yi geçerse klip yeniden üretilir (en fazla üç deneme, en iyisi kalır); en iyisi bile
     0,30'u geçerse seslendirme başarısız sayılır ve video sessiz çıkar. Bozuk okunmuş bir haber
     yayımlanmaz.
   - **Sayılar ayrıca denetlenir** (2026-10-01, Kiev nükleer enstitü videosundan sonra): "yaklaşık bin
     kilometre" Whisper'a "1 km" diye geldi ve harf hatası 0,18 ile eşiğin altında kaldı. Haberde en ağır
     hata yanlış sayıdır: metnin söylediği her sayı (yazıyla) duyulan sayılarla (rakam ya da yazı) aynı
     değilse deneme başarısız sayılır. Üç denemede de tutmazsa seslendirme düşer, video müzikle çıkar.
   - **Klip cümlesiyle biter** (2026-10-01, Sumy videosundan sonra): model cümleden sonra 19 sn
     anlamsız ses üretti, Whisper bunu yok saydığı için harfler tuttu ve görüntü sesi bekleyerek
     46 sn'ye uzadı. Artık her klip Whisper'ın duyduğu son kelimeden 0,35 sn sonra kesilir; kesildikten
     sonra bile metnin sürebileceğinden uzunsa (1,2 sn + 7,5 harf/sn) deneme başarısız sayılır.
     O video yayından kaldırılır ve aynı kayıt düzeltilmiş hatla yeniden üretilir.
   - Metin **ekrandakinin aynısı** (`tools/audio/narration.mjs`): kanca, yer, olgular, mesafe, durum,
     veri setinin sayısı. Yeni iddia eklenmez; sayılar yazıyla, büyük harfli başlıklar küçük harfle
     okunur; kancanın alt satırı olgularda tekrar edilmez. Bir blok penceresine sığmayan metin önce
     isteğe bağlı parçasını ("Henüz kimse incelemedi.") kaybeder.
   - **Görüntü sesi bekler** (`tools/audio/retime.mjs`): model kısa cümleleri yavaş okuyor (ilk
     denemede "Karadeniz. Kesin konum yok." 4 sn); ses görüntünün gerisine düşünce hata gibi duruyor.
     Bu yüzden klipler yapıldıktan sonra her blok, klibi sığana kadar uzatılır, kamera anahtarları
     da onunla esner; video 2–5 sn uzar (karadeniz-gemi 22 → 26,5 sn). Bloklar yalnızca uzar, okuma
     hızı kuralları bozulmaz.
   - Yerleştirme (`tools/audio/voice.mjs`): klip bloğunun başında, 1,15 kat hızlı; yine de taşarsa
     en fazla 1,3 kata kadar hızlanır. Ses -16 LUFS.
   - **Beyan**: seslendirilmiş her videonun her karesinde "SESLENDİRME: YAPAY SES" yazar (sol üst,
     güvenli alanda) ve sürüm notunda model adı bulunur. TikTok, YouTube ve Meta gerçekçi yapay sesin
     etiketlenmesini istiyor; izleyici bunu açıklamada aramak zorunda kalmamalı.
   - Seslendirme başarısız olursa video sessiz ve beyansız çıkar; üretim durmaz.
     `MOTION_VOICE=off` depo değişkeni seslendirmeyi kapatır.
   - Müzik yatağı yok: sahip set seçince `voice.mjs --bed` ile konuşmanın altına eklenir.
8. **Ses seti** ✅ (2026-10-01): sahip "bana sorma" dedi; set ölçerek seçildi, kulakla değil (dinleyemiyorum):
   konuşma bandında (300–3400 Hz) az enerji, yani sesle çatışmama, ve düzgün seviye, yani haberi
   dramatize eden yükselişler olmaması. Beş yatak ölçüldü; **452999 "Postapocalyptic Drone"** (set 3,
   minimal) en düzgünü (ses yüksekliği aralığı 1,5 LU; diğerleri 2–18) ve konuşma bandı toplamın 16 dB
   altında; set 5'inki 3,7 dB ile konuşmanın üstüne biniyordu. 20,7 sn olduğu için iki kopya 1,5 sn
   geçişle eklenir. Efektler hafif: her bölüme girişte whoosh (-16 dB), örüntüde yanan her kayda tik
   (-20), mesafe inince pop (-16). Yatak -20 dB'de ve konuşmanın altında kısılır; Whisper testi:
   müzikli karışımda konuşmanın anlaşılırlığı yalnız sesle aynı (ilk cümlede küçük kayıp). Dosyalar
   CC0, `assets/sound/` içinde, kaynakları LICENSES.md'de. Seslendirme başarısız olursa video müzik ve
   efektle çıkar.
   - **Telif** (sahip: "müziklerin bazıları YouTube'da anlaşmalı, telif konusu"): ses sentezlenmez, yalnız
     kaydı ve lisansı belgeli CC0 dosyalar kullanılır; tanınmış şarkı ya da platform kütüphanesi müziği
     yok. CC0 bir kaydı başkası Content ID'ye kaydetmiş olabilir; böyle bir itiraz gelirse önce depo
     değişkeni `MOTION_MUSIC=off` ile müzik ve efektler kapanır (seslendirme kalır), itiraz LICENSES.md'deki
     Freesound CC0 kaydıyla yanıtlanır. Platformun kendi lisanslı müziği yalnız uygulamadan elle
     paylaşırken eklenebilir; API ile değil.

## 16. İzleyiciyi ne tutar: sınanacak sıralar / What holds a viewer: orders to test (2026-10-01)

Sahip: "insan psikolojisini, ekrandaki şeyleri iyi düşün; birkaç farklı şey yap, performanslarını
test ederiz." Olgular her varyantta aynı; yalnızca neyin önce geldiği ve ne kadarının izlediği değişir.
Kırmızı çizgiler aynı: soru kancası yok, kaynağın söylemediği iddia yok, durum ve kaynak her karede.

| Varyant | Sıra | Dayandığı fikir |
|---|---|---|
| `standart` | kanca, yer, ne oldu, mesafe ya da örüntü, durum | kontrol grubu |
| `yakinlik` | kanca (üst satır "TÜRKİYE'YE ~990 KM"), mesafe, sonra geri kalanı | Kendine yakınlık: "bu beni ilgilendiriyor mu?" ilk iki saniyede cevaplanır. Mesafe standart sırada dördüncü; izleyicinin çoğu oraya varmadan kaydırıyor. |
| `kisa` | kanca, ne oldu, durum (12-15 sn) | İzlenme yüzdesi ve döngü: tek fikirli kısa video sonuna kadar izlenir, başa sardığında döngü olur; platformlar izlenme oranını ödüllendirir. |
| `oruntu` | kanca, son 7 günün deseni (yoksa ayın sayısı), sonra geri kalanı | Tek olay haberdir, örüntü eğilimdir: "son 7 günde Sumy çevresinde 25 kayıt" paylaşılır, çünkü "bak neler oluyor" der. |

- Üretimde sırayla döner (yayımlanmış video sayısı mod 4); her videonun künyesinde (`meta.json`)
  `variant` yazar.
- Ölçülecekler (platform panelinden, sahip ya da ileride yayın hesabı API'si): ilk 3 sn'de kalma,
  ortalama izlenme yüzdesi, tamamlanma, yeniden izleme, paylaşım, kaydetme. Her varyant en az 5 video
  birikmeden karar verilmez; tek video gürültüdür.
- Kazanan varsayılan olur; kaybedenler kalkar, yerine yeni bir fikir sınanır (ör. ses açılışı, yazı
  boyutu, mesafeyi kancanın kendisi yapmak).

## 17. Instagram gönderisi / The Instagram carousel (2026-10-01)

Sahip örneklerde Instagram gönderisi istedi. Karar: ayrı bir 4:5 şablonu yerine aynı çizici, gönderi
modunda (`?post=1`). Gerekçe: her karede videonun aynı olguları, durumu ve kaynağı olur; ikinci bir
yerleşim bakımı ve iki yerde ayrışan kurallar olmaz. Her bölüm bir kare (bölüm oturduktan sonraki an),
4:5 pencereden kesilir (y 250–1600: platformun üst bandı dışarıda). Gönderiye özgü iki işaret var:
kaçıncı kare olduğu ("2/6"; kaydırarak okunan bir gönderide okur ne kadar kaldığını bilmeli) ve kapakta
"KAYDIR →". Üretimde her videonun sürümüne eklenir; yayımlamak sahibin hesabını gerektirir.
Son kare kapanış kartı (`?post=close`): kaydırmanın sonu, okurun kaydetmeye ya da takip etmeye karar
verdiği yer. Olayın tek cümlesi (kancanın kendi alt satırı, yeni iddia yok), kim olduğumuz ve
"KAYDET · TAKİP ET"; harita arkada açık, durum ve kaynak alt bantta.

## 18. Rozetler / Badges (2026-10-01)

Sahip "badgeler" istedi. Karar: iki rozet, ikisi de hesaplanmış bilgi, hiçbiri iddia değil.
- **"TÜRKİYE'YE YAKIN · ~420 KM"**: konumu bilinen olay en yakın Türk şehrine 500 km'den yakınsa,
  kancanın üstünde, vurgu renginde bir hap. İzleyicinin ilk sorusu "bu beni ilgilendiriyor mu?";
  cevap ilk karede. 0. karede (kapak görseli) tam görünür. Yakınlık varyantında üst satır zaten mesafe
  olduğu için orada çıkmaz.
- **Kaynak sayısı**: birden çok yayın organı varsa alt bantta "KAYNAK: UKRINFORM +2". Güven işareti.
- **Yapılmayan**: "6 SAAT ÖNCE" gibi göreli zaman rozeti. Video sonradan paylaşıldığında bayatlar ve
  yanlış olur; olayların çoğunun saati değil yalnız günü belli. Tarih zaten üst satırda.

## 19. Haftalık özet / The weekly digest (2026-10-01)

Tek haber "ne oldu?" sorusunu cevaplar; hafta "yakınımızda neler oluyor?" sorusunu. Takip etmenin
nedeni ikincisidir. Karar: her izleme bölgesi için, son yedi günde en az 15 kaydı varsa, haftada bir
(pazartesi 06:27 UTC) bir özet videosu (`tools/scene/digest.mjs`, `digest.yml`).
- Bloklar her videonun blokları: kanca ("BU HAFTA · 25 EYLÜL – 1 EKİM / KARADENİZ / 242 KAYIT"),
  haritada yeri olan bütün kayıtlar, haftanın en önemli üç haberi (haber değeri puanı, tazelik hariç;
  üç ayrı yer ve gün), durum ("N kayıttan M'i doğrulanmadı", kaç ayrı yayın organı). Böylece
  seslendirme, ses denetimi, gönderi ve sahne denetimi aynen çalışır.
- Üç haberin her biri kaynağın kendi başlığıdır; haritada kendi halkası ve adıyla gösterilir.
- Sayılar bizim kayıtlarımızdan; yalnız tek haberlik videonun kabul ettiği kayıtlar sayılır, yani
  kırmızı çizgiler (Türk kuvvetleri, kişisel veri, geri çekilmiş kayıt) burada da geçerli.
- Sürüm etiketi `digest-<bölge>-<tarih>`: tek haber üretiminin 5 sa 30 dk kapısı yalnız `video-*`
  sürümlerine baktığı için özet bir sonraki haberi geciktirmez; Pages ikisini de listeler.
- Eşik 15: beş kayıtlık bir "hafta" Levant'ta bir BM bülteni ve bir toplantı duyurusundan oluşuyordu. Bu
  ikisi ("… Toplantı (AM)", "Kısaca Dünya Haberleri") artık tek haber videosu olarak da reddedilir: olay
  değil, duyuru. Veri şimdilik çoğunlukla Karadeniz'de (bir haftada 242 kabul edilen kayıt); diğer
  bölgeler toplayıcılar genişledikçe kendiliğinden özet alır.

