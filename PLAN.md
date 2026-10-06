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
   - **Tek cümle bütün sesi düşürmez** (haftalık özetin ikinci üretimi): kanca cümlesi üç denemede de
     sayı denetimini geçemedi ("266", "ekiyüz otuz altı") ve bütün seslendirme düştü, özet müzikle çıktı.
     Artık: sayı içeren cümleye 5 deneme; Whisper'ın sayı yazımları tanınır ("ekiyüz" → iki yüz, bir
     harf farklı sayı kelimesi yanında başka bir sayı kelimesi varsa); netleşmeyen cümle tek başına
     bırakılır (bölümü yazısıyla sessiz geçer), seslendirme ancak cümlelerin yarısından fazlası
     netleşmezse düşer.
   - **Cümleden sonra konuşma yok** (ilk haftalık özet): ikinci deneme "Bu hafta Karadeniz 236 kayıt"tan
     sonra "yan sekt" diye devam etti; harf hatası 0,20 ile sınırda geçti, çünkü yalnız kuyruk yanlıştı.
     Duyulan harfler metnin harflerinden %12'den fazla uzunsa deneme başarısız sayılır.
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
   - **Seviyeler** (2026-10-02, sahip: "seslere bak … orantısızdı"): ilk ayarda müzik konuşma aralarında
     -34/-40 LUFS'a düşüyordu (konuşma -14): ses "konuşma, sessizlik, konuşma" diye kesik kesik geliyordu;
     geçiş whoosh'u konuşmadan yüksekti (-11,7). Yatak -20 dB'den -11 dB'ye, kısma 8:1'den 3:1'e (yumuşak),
     efektler 6-8 dB aşağı. Ölçüm: aralar -22/-27 LUFS, konuşmanın 10-12 dB altında, konuşma aynı.
   - **Haritada oranlar** (2026-10-02, sahip: "ülke isimleri, konumları orantısızdı"): amblem 200 px'ten
     140 px'e (Ukrayna'nın iki katı bir tryzub yoktu artık); ad harf aralığı 0,4-0,45 em'den 0,22-0,3 em'e
     (bir ad altındaki ülkeden geniş taşmıyor); halkanın çevresi 190 px etiket koymama alanı (adlar şok
     dalgalarının üstüne binmiyordu); iki ad birbirine değerse biri tümüyle çekilir. Ülke adı başkentte
     değil ülkenin en büyük kara parçasının ortasında; yalnız ~2 milyon km2'den büyükse (Rusya: ortası
     Sibirya) başkentte kalır. Deniz adlarının birkaç açık su noktası var, planlayıcı en boşunu seçer.
     Ad boyu kameranın yakınlığına bağlı (zoom^0,25, 0,85-1,25 kat): geniş açılışta küçük bir ülkenin
     yanında iri, yakın çekimde ülkenin üstünde ufak kalmıyor.
     Adların çevresinde kâğıt renginde ince bir hale var: küçük bir ülkenin adı komşunun dolgusuna ya da
     sınıra taşsa da okunuyor (BULGARİSTAN, Türkiye'nin kenarında). TÜRKİYE'de hale yok, kendi dolgusunda.
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
- Bloklar her videonun blokları: kanca ("25 EYLÜL – 1 EKİM / BU HAFTA KARADENİZ'DEN / 240 KAYIT DERLENDİ";
  önceden "KARADENİZ / 242 KAYIT", bölüm 20'deki kuralla cümleye çevrildi; "Karadeniz'de" değil "Karadeniz'den":
  bölgeye dosyalanan bir Kiev saldırısı denizde olmadı),
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


## 20. Şablon-reel görünümü yasak / No template-reel look (2026-10-02)

Sahip, tipik bir haber reel'ini gösterdi (buzdağı çizimi, sayarak büyüyen "826 MİLYAR ₺", yan
istatistik hapları, "Ama suyun altında:" kancası, "5. BÖLÜM" etiketi, parıltı ve yıldızlar) ve
"bu tarz tasarımlar, sayaç vs. çöp tasarım; kurallara yaz, AI slop kullanman yasak" dedi. Kural
CLAUDE.md bölüm 4'te. Motorda aynı ailenin izleri vardı; hepsi söküldü:

- **Sayaç**: mesafe ve örüntü bölümlerinde 200 px'lik sayı 0'dan yukarı sayıyordu. Artık sayı
  ölçtüğü şeyle aynı satırda, olgular boyunda ve ilk karesinden tam değeriyle: "Kiev → Sinop:
  ~1000 km", "Kiev çevresinde, 150 km içinde: 80 kayıt." Örüntüde haritada yanan noktalar kalır
  (veri), tik sesi gider.
- **Parıltı**: A, B, D ve E stillerinde öznenin neon parıltısı ve kürenin atmosfer halesi kapandı;
  ülke dolgusu ve sınır çizgisi yeterli.
- **Zıplama**: amblem, bayrak çipleri, kelime kelime yazı ve mesafe ucu `outBack` ile hedefini
  aşıp geri geliyordu; artık yumuşak duruş (`outCubic`).
- **Efekt sesleri**: whoosh, tik ve pop kaldırıldı; ses yalnız seslendirme ve kısık müzik yatağı.
- **İlerleme çubuğu**: hikâye tarzı bölüm çubuğu ("kalmak için bir sebep") hiçbir stilde yok.
- **Rozet hapı**: "TÜRKİYE'YE YAKIN · ~460 KM" dolgu kutulu ve zıplayan bir etiketti; artık
  künyenin üstünde düz bir satır.

Kalanlar ve gerekçesi: katılımcı bayrakları (kim katıldı bilgisi; dekor değil), DOĞRULANMADI
çerçevesi (durum kuralı gereği her karede), kancanın iki satırı (olgu; ikinci satır vurgu rengi).
Yapay seslendirme tek üretilmiş öğe: ekranda yazılı, `MOTION_VOICE=off` ile kapanır.
- **Gönderide çağrı**: kapakta "KAYDIR →", her karede "3/7" sayacı ve kapanışta "KAYDET · TAKİP ET"
  kaldırıldı (bölüm 17'deki karar bu bölümle değişti); Instagram kendi kare noktalarını gösterir.
- **Sayı kancası**: "1470 / ASKER" ve "3 / KİŞİ YARALANDI", büyük satırda tek başına duran bir sayı ve
  altında birimiydi: sahibin örneğindeki "826 MİLYAR ₺" kalıbı. Artık sayı saydığı şeyle ve fiille
  aynı başlıkta, kaynağın kendi sözleriyle: "1470 ASKERİNİ / DAHA KAYBETTİ", "3 KİŞİ / YARALANDI".
  Fiili olmayan sayı (en çok üç kelimede çekimli fiille bitmeyen) kanca olmaz; seçici başka kancaya geçer.
- **"GELİŞME" kancası**: "KİEV / GELİŞME" en büyük yazıya hiçbir şey söylemeyen bir kelime koyuyordu.
  Kaydın kendi cümlesi başlık olacak kadar kısaysa (en çok altı kelime, çekimli fiille biter) kanca o
  olur, virgülle ayrılmış kısa özne de gelir: "KHMARA, ADF KOMUTA / NOKTALARINI ZİYARET ETTİ"; yer
  künyede kalır. Uzun cümlede "YER / GELİŞME" ve altında cümle sürer.
- **Seslendirme**: başlıkta büyük harfle yazılan kısa kısaltmalar ("ADF", "DTEK") okunurken küçük harfe
  inmez; yer adları ad gibi okunur ("Sinop", "sinop" değil); sayı kancası özneyi de içeren cümleyi
  okur ("Rus kuvvetleri … bin dört yüz yetmiş askerini daha kaybetti"); cümle yerle başlıyorsa yer
  önce ayrıca söylenmez ("Kiev. Kiev'de …" değil); olgular bölümü kancanın aynısıysa atlanır.
- **Yeri olmayan savaş kaydı**: Ukrinform akışının konumsuz kayıtları Karadeniz bölgesine dosyalanıyor;
  "Rus kuvvetleri 1470 askerini daha kaybetti" künyede ve kancada "KARADENİZ" diyordu. İngilizce
  başlık Ukrayna'yı anıyorsa yer Ukrayna'dır ("Kesin konum yok: halka ülkeyi gösterir."); mesafe
  bölümü olmaz (bir ülkenin ortasından ölçülen mesafe kaydın söylediği bir şey değil).
  Aynısı her bölgede (2026-10-03): yeri olmayan bir kaydın İngilizce başlığı Türkiye ve ABD dışında tek
  bir ülke anıyorsa halka o ülkededir ("Exercise Phoenix Express 2026 begins in Tunisia": "KUZEY
  AFRİKA" değil "TUNUS"). Kıbrıs hariç: başlıktaki "Cyprus" adadır, bölge zaten "KIBRIS" gösterir;
  tablodaki CYP ise "GKRY", kaynağın kullanmadığı bir ad.
  Ülke ve taraf adları da ad gibi okunur ("Katılanlar: Yunanistan, Mısır", "Bulgaristan, Romanya";
  önceden "yunanistan", "romanya"); tatbikatın adı kancada söylendiyse katılımcı bölümü doğrudan
  "Katılanlar: …" ile başlar ("Medusa iki bin yirmi altı" iki kez söylenmez).

## 21. Saat / The clock (2026-10-02)

GitHub'ın zamanlayıcısı saat değil: `produce` saatte üç kez uyanacak şekilde kuruluydu, ama 1-2 Ekim'de
yaklaşık dört saatte bir çalıştı (17:27, 21:58, 01:39, 07:33 UTC); 12:00'de sırası gelen video elle
başlatıldı. Diğer depoların zamanlayıcıları da aynı şekilde kaydı. Karar: saat `timer.yml`. Her üretimin
sonunda bir timer çalışması başlar, son videodan 5 sa 30 dk sonrasına kadar uyur (en çok 5 sa 45 dk;
işin 6 saat sınırı; daha uzaksa yeni bir çalışmaya devreder), sonra `produce`'u başlatır. Aynı anda tek
timer yaşar. Gizli anahtar yok: çalışmanın kendi jetonu workflow_dispatch başlatabilir. Bir runner
saatlerce uyuyarak meşgul olur; açık depoda bunun maliyeti yok. Zamanlayıcı ikinci hat olarak kalır.
`MOTION_PRODUCE=off` ikisini de durdurur.
- **Karadeniz'e dosyalanmış diğer savaş kayıtları**: yeri olmayan ve İngilizce başlığı Rusya ya da
  Ukrayna'yı anan ama Ukrayna kuralına girmeyen kayıtlar (Rusya'nın kayıpları, Rusya'ya yaptırımlar)
  künyede "KARADENİZ" demez, yalnız tarih; bölge kancası "KARADENİZ" yerine başlığın andığı ülkeyi
  yazar; "NEREDE / KARADENİZ" bölümü olmaz. Haritadaki bölge görünümü kalır; bölge kapanışı
  ("Karadeniz'den 305 kayıt") bizim dosyalamamızı anlatır, olayın yerini değil.
- **Tahmin haber değildir**: Türkçe başlığı gelecek zamanla biten kayıt ("Putin … saldırılarını
  artıracak") bir öngörüdür, olay değil; video olmaz. Bu kayıt "UKRAYNA / SALDIRI" diye çıkıyordu.
- **Adsız tatbikatın yeri**: başlık tek ülke adıyorsa bulunma eki o ülkeye gelir ("ROMANYA'DA /
  TATBİKAT"), yoksa bölgeye ("EGE'DE / TATBİKAT").

## 22. Seçicide çeşitlilik ve yakınlık / Variety and proximity in the selector (2026-10-03)

2-3 Ekim'de art arda dört otomatik video Ukrayna'daki kayıplardı (Harkov, Harkov, Dnipro, Kiev). Platform
Türkiye'nin bütün çevresini izliyor, ama veri setinin kaynaklarının büyük çoğunluğu tek bir akış
(Ukrinform: ~400 kaynaktan 322'si). Seçicide üç değişiklik (`tools/scene/select.mjs`):
- **Yakınlık noktadan**: konumlu kaydın P'si bölge tablosundan değil, Türkiye'ye gerçek uzaklığından
  (Harkov ~850 km → 0,66; Ege kıyısı → ~1). Bölge tablosu Harkov'u da Ege'yi de "yakın" sayıyordu.
- **Çeşitlilik**: son üç videodan aynı izleme bölgesinde olan her biri kaydın puanını %10 düşürür
  (üçü de aynıysa %30). Yalnız yakın puanları ayırır; yedi yaralılı bir saldırı rutin bir açıklamaya
  kaybetmez (%40 ile denendi: Romanya'da polis tatbikatı ve Yemen'de gıda krizi öne geçti).
- **Savunma haberi olmayanlar**: polis, isyan, jandarma, gıda güvenliği, insani yardım, mülteci geçen ve
  can kaybı olmayan başlıkların büyüklüğü 0,3 (akışın tür kuralları bunları tatbikat ya da çatışma diye
  dosyalıyor).
Asıl çeşitlilik veri tarafında: Ege, Kıbrıs, Suriye, Kafkasya için daha fazla akış (datasets toplayıcıları).

## 23. Ses ekranı okumaz / The voice does not read the screen (2026-10-03)

Sahip: "videodaki metinlerle anlatım metni birebir aynı olmamalı; anlatıcı farklı bir şey anlatmalı, önde
video oynamalı; okunca aptal gibi oluyor." Karar: ekran kısa başlığı ve olguları gösterir, ses haberi
cümleyle anlatır. Olgular aynıdır (yeni iddia yok), sözler farklıdır:
- **Açılış**: ekranda "KİEV BÖLGESİ / SALDIRI"; seste "Ukrinform bildiriyor: Hostomel'e Rus saldırısından
  kaynaklanan kayıplar dörde yükseldi." Kaynağın adı başta, haberin tamamı tek cümlede.
- **Olgular bölümü** sesle tekrar edilmez; aynı cümleyi göz okur, altında müzik.
  Olgular bölümü olmayan kısa sahnede açılış cümlesi kaydın Türkçe başlığının tamamıdır (ekranda iki
  satıra kısalmış hali). Tırnak işaretleri okunmaz ("'Burebista 26'tatbikatı" → "Burebista 26 tatbikatı").
- **Katılanlar** yalnızca haber cümlesinin saymadığı bir ülke varsa söylenir; tek taraf (düzenleyen) söylenmez.
- **Yer**: "Olay yeri Kiev Bölgesi; harita, haberde geçen yer adından yaklaşık konumu gösteriyor."
- **Mesafe**: "Türkiye'den en yakın şehir Sinop; arada kuş uçuşu yaklaşık bin kilometre var."
- **Örüntü**: "Kayıtlarımızda Kiev bölgesi çevresinde son bir haftada seksen olay var."
- **Durum**: "Kaynak yalnızca Ukrinform; bilgi henüz doğrulanmadı." / "Bilgi iki ayrı kaynağa dayanıyor."
- **Bölge kapanışı**: "Eylül ayında Karadeniz'den üç yüz yedi kayıt derledik; en yoğun bölge burası."
Haftalık özet aynı kalır (maddeleri zaten sesle anlatılır). Özetin haritası haftanın yeri olan kayıtlarını gösterir, açılıştaki sayıdan azdır: ses "Haritada bunlardan yeri belli olan yüz beş kayıt görünüyor" der ("yüz beş olay var" açılıştaki "yüz elli üç kayıt" ile çelişiyordu); durum "Kayıtlar dört ayrı yayın organından; hiçbiri henüz doğrulanmadı" (önce yanlışlıkla "Tek bir kaynak var"). Ses modeli ayrı karar: bölüm 24.

## 24. Ses motoru / The voice engine (2026-10-03)

The owner: the Chatterbox voice "çok yapay duruyor"; find a more realistic free one (OpenRouter and
NVIDIA Build NIM keys were offered). Decision, after comparing what is free and allowed in a
published, automatic pipeline:

- **Gemini Flash TTS** (Google AI Studio, free tier) is the production voice when the repository
  secret `GEMINI_API_KEY` is set: natural Turkish, 30 prebuilt voices (we use `Charon`, a calm male
  reading; `GEMINI_VOICE` changes it), and its delivery is steered with a style note ("haber spikeri
  gibi, sakin, abartısız"). The words are the narration's own; the note only says how to read them.
  Every clip carries Google's SynthID watermark, and the video still says "SESLENDİRME: YAPAY SES".
- **Chatterbox stays as the fallback**: with no key, or when any Gemini call still fails after five
  tries (quota, outage), the whole narration is made again with Chatterbox. One video, one voice.
- The Whisper gate is unchanged and hears every clip, whichever engine made it.
- Not chosen: NVIDIA NIM (no Turkish voice; trial terms exclude production use), OpenRouter (no
  free TTS), edge-tts (an unofficial use of a browser endpoint), XTTS / F5-Turkish / MMS
  (non-commercial licences). Second choice if Gemini's free tier goes: Azure Speech F0 (free
  500 000 characters a month, `tr-TR-AhmetNeural`), then a local open model (VoxCPM2, Supertonic).
- One step is the owner's: create a free key at aistudio.google.com ("Get API key") and add it with
  `gh secret set GEMINI_API_KEY -R Greater-Turkiye/motion` (the command asks for the value; it is
  never pasted into a chat, an issue or a file).

## 25. İzlenme süresi / Watch time (2026-10-04)

Sahip: "internette adamlar çok güzel haber sunumları yapıyor … psikolojiye oyna, amaç izlenme süresi,
viral olmak; bazı haberlerde video, resim kaynağı da eklenebilir." Araştırma (Reuters Institute 2023
yayıncı görüşmeleri, YouTube ve Meta yaratıcı kılavuzları, Barrio vd. CHI 2016, Molyneux ve Coddington
2019) ve kendi videolarımız üzerine kararlar:

**Yapılanlar (bu bölümle):**
- **İlk saniye olgu**: ses haberle açılır, kaynak cümlenin sonundadır ("Rus kuvvetleri Odesa'ya saldırdı,
  altyapı hasar gördü; Ukrinform'a göre."). "Ukrinform bildiriyor:" ilk saniyeyi bir ada harcıyordu;
  yayıncılar ilk üç saniyeyi "en kritik" sayıyor. Kaynak ekranda baştan sona yazılı kalır.
- **Yakınlık üçüncü saniyede, tanıdık bir mesafeyle**: "Türkiye'ye uzaklığı: İstanbul Boğazı'na kuş uçuşu
  yaklaşık altı yüz kilometre, Ankara ile Trabzon arası kadar." Türk izleyici için haberin "beni ne
  ilgilendirir" cevabı bu; önce on ikinci saniyedeydi. Sayı tanıdık bir şeyin yanında daha iyi
  anlaşılıp hatırlanıyor (Barrio vd.). Karşılaştırma iki Türk şehrinin kuş uçuşu mesafesinden
  hesaplanır (`tools/scene/likeness.mjs`), %12 içinde uyan yoksa söylenmez. Ekrandaki mesafe satırı da
  aynısını yazar (sessiz izleyen için). Mesafe bir kez söylenir: yer ve mesafe bölümlerinden önce gelen.
  Noktası olmayan Kıbrıs kaydında da mesafe söylenir: bölge adanın kendisidir, ortasından Türkiye'ye
  ölçülen mesafe doğru bir şey söyler ("Taşucu'ya kuş uçuşu yaklaşık yüz elli kilometre"); büyük bir
  bölgenin ortası için söylenmez. Bölge kapanışı ("Kıbrıs'tan bir kayıt") en az üç kayıtla çıkar: bir
  ya da iki kayıt örüntü değildir.

- **Uydu bölümü (NASA FIRMS)**: saldırı haberinde, olay yerinin 25 km çevresinde o gün ve ertesi gün
  NASA uydusunun gördüğü ısı noktaları. 25 km haritanın her yakınlığında birkaç piksel, bu yüzden olay
  yerinin üstünde 25 km'yi okunur ölçekte çizen bir büyüteç dairesi: yer artı işareti, tespitler
  gerçek uzaklıklarında küçük kareler (kayıtlarımızın yuvarlak noktalarından ayrı), kenarında "25 KM".
  Uydu aynı yangını birkaç geçişte görür, kareler üst üste düşer; 1,5 km içindeki tespitler tek yer
  sayılır ve cümle kaç yerde olduğunu söyler ("2-3 Ekim, Dnipro çevresinde 25 km içinde: 1 noktada
  3 ısı tespiti."), altında "Uydu ısı tespiti; yangın olduğu ya da saldırıyla bağı doğrulanmadı." Ses:
  "NASA uydusu bu çevrede o gün ve ertesi gün bir noktada üç ısı tespit etti; saldırıyla bağı
  doğrulanmadı." Veri VIIRS NOAA-20, son yedi gün, anahtarsız indirilen bölge dosyaları (Europe ve
  Russia_Asia; ikisi Ukrayna'yı kapsar), kamu malı; künyede ve paylaşım metninde anılır. Koşullar:
  yalnız Karadeniz bölgesi (Irak ve Suriye'de asla: Türk kuvvetlerinin harekât alanı), yalnız saldırı
  ailesi, yer en az 25 km kesinlikte (bir bölgenin ortası değil), en az iki tespit, ve askeri bir
  nesneye (depo, mühimmat, fırlatma alanı, hava savunma, radar, üs, havaalanı, komuta, rafineri)
  yapılan saldırıda hiç: ısı noktaları orayı işaretler, bu bir hedefleme görünümüdür (CLAUDE.md
  bölüm 2). Son haftanın 268 sahnesinden 26'sında çıkıyor.

**Sırada:**
- Copernicus Sentinel öncesi/sonrası görüntüsü ("Contains modified Copernicus Sentinel data [yıl]");
  hedefleme görünümü kuralına karşı her sahne denetlenir.
- **Gerçek görseller**: yalnız telifsiz ya da açık lisanslı kaynaklar: ABD savunma görselleri (DVIDS,
  kamu malı; "The appearance of U.S. Department of War (DoW) visual information does not imply or
  constitute DoW endorsement." notu), AB görsel-işitsel servisi (CC BY 4.0, "© European Union"),
  Ukrayna Savunma Bakanlığı ve ArmyInform (CC BY 4.0). Görsel yalnız kaydın kendi haberine aitse
  kullanılır; başka bir olayın fotoğrafı bu olayınmış gibi gösterilmez. Ukrinform, Reuters, AP
  fotoğrafları kullanılmaz (telif).
  **Denendi, durduruldu (2026-10-04):** 6. Filo haberlerinin DVIDS'teki kendi fotoğrafı başlıkla
  eşleşip indirilebiliyor (media.defense.gov her istemciye 403 veriyor; DVIDS'in görsel sunucusu 1000
  px veriyor). Ama örnek iki fotoğrafın ikisi de tanınabilir yüz gösteriyordu (yakın planda bir
  denizci, toplantıdaki subaylar); askeri basın fotoğraflarının çoğu insan. Yüz kişisel veridir
  (CLAUDE.md bölüm 2) ve bölüm 4 resimde yüzü açıkça yasaklar; yüzsüz fotoğrafı otomatik seçmek
  güvenilir değil. Fotoğraf eklenmez; sahibin kuralı değişirse yeniden açılır.
- **YouTube "özgün olmayan içerik" riski** (Temmuz 2025'ten beri şablon hissi veren seri üretim para
  kazanamıyor): her videonun kendi hikâyesi, kendi kamera yolu ve kendi "neden önemli" cümlesi
  (yakınlık) olmalı; yalnız metni değişen videolar riskli.

**Kuralla çatışan popüler teknikler (sahibin kararı, CLAUDE.md bölüm 4 geçerli):** soru ya da merak
kancası (araştırma güvenilirliği düşürdüğünü gösteriyor, yasak doğru), sunucu yüzü (gerçek fotoğrafla
kısmen karşılanabilir), trend müzik (lisans sorunu), hızlı kesme + efekt sesi (yayımlanmış ölçüm yok).

**Köşe ve TÜRKİYE adı (2026-10-06, sahip):** sol üstteki "SESLENDİRME: YAPAY SES" yerine işaretimiz
(organizasyonun GitHub simgesi) ve "greaterturkiye.org"; yapay ses beyanı paylaşım metnine ve sürüm
notuna taşındı. TÜRKİYE adı artık hep ortasında: başka bir ad ya da halka ona değince kaymak yerine
öteki ad çekilir.

## 26. Olay türüne göre görsel dil / A visual language by event kind (2026-10-06)

Sahip: "hep aynı tür videolar yapmışsın; haberler farklı farklı, bazen rotasında giden gemi bombalanıyor,
bazen uçak düşüyor, bazen silahlı saldırı, ama anlatım tarzı, animasyon hep aynı." Her olay aynı
nabız atan halkayla çiziliyordu. İlk adım: olayın yerinde, türüne göre bir harita işareti (basılı
haritanın lejantı gibi düz, tek renk; parıltı, gölge yok, CLAUDE.md bölüm 4) ve türüne göre hareket:

| Tür | İşaret | Yerin hareketi |
|---|---|---|
| İHA saldırısı | delta kanat | kısa dalgalar |
| Füze | füze gövdesi ve kanatçıkları | hızlı, keskin dalga |
| Hava saldırısı, hava olayı | uçak (üstten) | dalga yok |
| Deniz | gövde (üstten, pruva yukarı) | yavaş, geniş, yassı dalga (yalnız denizi ya da adası bilinen olayda da çizilir) |
| Topçu atışı | askeri haritanın topçu işareti (halkada dolu nokta) | kısa dalgalar |
| Çatışma, saldırı | çapraz çizgi | seyrek dalga |
| Tatbikat | açık baklava | dalga yok |
| Görüşme, anlaşma | birleşik iki nokta | dalga yok |

Sırada: türe göre sahne akışı (deniz olayında deniz alanı ve kıyıya uzaklık, hava olayında hava
sahası), türe göre kamera.

## 30. Kısa video ve ilk kare / Shorter videos and the first frame (2026-10-06)

Sahip: "viral viral viral". Araştırmanın en güçlü iki bulgusu (bölüm 25, 28): ilk kare ve ilk saniye
kalmayı belirler; 20–35 sn'lik kısa videolar sonuna kadar izlenir, kısa olan döngüye girer.
Ölçüm: son on haber videosu 14–35 sn, saldırı haberleri 26–35 sn. Neden: ses haberin tamamını kancada
okuyordu, `retime.mjs` kancayı sesin sonuna kadar (7–8 sn) ekranda tutuyordu; ardından aynı cümle
"KAYNAĞA GÖRE" bölümünde sessiz 7–8 sn daha duruyordu. Yer bölümü ("Konum başlıktaki yer adından:
±100 km", 4 sn) aynı yeri birazdan gösterecek mesafe bölümünden önce geliyordu.
Yapılanlar:
- Her sırada olgular kancanın hemen ardından gelir; sesin bir bölümü ardındaki sessiz bölümleri de
  kapsar (`narration.mjs`), `retime.mjs` yalnız sesin bittiği bölümü gerekiyorsa uzatır: haber sesi
  kancada başlar, olguların altında biter.
- Mesafe ya da son 7 gün bölümü varsa ayrı yer bölümü kalkar; konumun ne kadar kesin olduğu satırı
  ("Konum yaklaşık: ±100 km.") mesafenin altına, mesafe yoksa durumun altına geçer. Kesin konumu
  olmayan kayıt ("Kesin konum yok…") yer bölümünü korur.
- Süre sınırı 22 sn (`BUDGET`): aşan video önce ayın sayısını, sonra son 7 günü bırakır; örüntü
  sırasında son 7 gün kalır, mesafe gider. Olgular, uydu ve durum hep kalır.
- Kancanın alt satırı 0,95 sn'de belirmek yerine ilk karede tam: kapak karesi başlığın tamamını taşır.
Sonuç (aynı dört kayıt, ses dahil tahmini): Poltava 35 → ~22 sn, Sumy 30 → ~21, Dnipro 31 → ~21,
Kerkük 24 → ~20.

## 27. Viral müzik / Trending music (2026-10-06)

Sahip: "YouTube'da telifsiz viral müzikler ekleyebilir miyiz? Viral müzik diyorum." Karar: trend
şarkılar telifli; videonun içine otomatik konursa YouTube Content ID sesi kısar ya da hak talep eder,
tekrarı hesaba ihtar getirir. Yasal yol, paylaşırken uygulamanın kendi ses kütüphanesinden eklemek
(Reels, TikTok, Shorts bu müziklerin lisansını kendisi alır). Bunun için her seslendirilmiş üretimin
sürümünde ikinci bir kopya var: `<sahne>-muziksiz.mp4`, yalnız seslendirme, müzik yatağı yok;
uygulamada eklenen trend ses bizim yatağımızla çakışmaz. Müzikli kopya (CC0 yatak) aynen kalır; site
müzikli kopyayı gösterir.



## 28. Son araştırma / Final research check (2026-10-06)

Sahip: "kanıtla, videolar viral olacak mı? Son araştırma, son kontrol." Bulgular (kaynaklar PR'da):
Instagram ve YouTube 2026'da özgün içeriği öne çıkarıyor (Mosseri 24 Eylül; YouTube Shorts 1 Ekim);
izlenme oranı, tamamlama, tekrar izleme ve paylaşım (DM) başlıca sinyaller; Meta gerçekçi yapay sesi
etiketsiz paylaşmayı cezalandırabiliyor; YouTube'un Temmuz 2025 "özgün olmayan içerik" kuralı şablon
hissi veren seri üretimi para kazanmadan çıkarıyor; Instagram ağırlıklı yazı olan reel'leri ve siyasi
içeriği takip etmeyenlere daha az gösteriyor (savaş haberinin sayılıp sayılmadığı belirsiz); Türkiye'de
büyük YouTube kanalları RTÜK lisansına tabi.
Yapılanlar: paylaşım metninin başına paylaşan için bir kontrol listesi (Instagram yapay zekâ etiketi,
YouTube "değiştirilmiş içerik" sorusu, trend müzik için müziksiz kopya); paylaşılmaz.
Sırada: her videoya şablonun ötesinde yazılmış bir bağlam cümlesi (çalışan bir dil modeli anahtarıyla),
Instagram için daha az yazılı bir sürüm, Trial Reels ile kanca denemesi.
Gerçekçi beklenti (ölçüm değil, tahmin): ilk 1–3 ayda çoğu Shorts 50–1000 izlenme, haber dalgasına denk
gelen birkaç video 5–50 bin; viral olma bir plan değil, şans.

## 29. Haberin fotoğrafı / The story's own photograph (2026-10-06)

Sahip ikinci kez: "habere görsel, video kaynağı da eklemeni istedim; bazılarında ekleyebilirsin." İlk
deneme (4 Ekim) yüzler yüzünden durmuştu. Şimdi bir yüz denetimi var: `tools/scene/faces.py` (OpenCV
yüz ve profil dedektörü) bir yüzün kutusu görüntü genişliğinin %4'ünü geçerse fotoğrafı kullanmaz.
Denendi: yakın plan denizci, brifing salonu, grup fotoğrafı reddedildi; açık denizde gemiler kabul
edildi. `tools/scene/photo.mjs` kaynağın aynı habere iliştirdiği fotoğrafı bulur (6. Filo ve AFRICOM
haberleri, DVIDS'te başlıkla ya da bağlantıyla eşleşir; ABD federal eseri, kamu malı), indirir, yüz
denetiminden geçirir; sahne kancanın hemen ardından 3,4 saniyelik bir fotoğraf bölümü alır ("KAYNAĞIN
FOTOĞRAFI", altında kaynağı ve lisansı), ses o sırada susar. Künye ve paylaşım metni fotoğrafı anar.
Ukrinform, Shafaq, Reuters, AP fotoğrafları telifli, hiç kullanılmaz; bu yüzden fotoğraf yalnız bir
kısım haberde çıkar. CLAUDE.md bölüm 4'e istisna olarak yazıldı.

## 31. Tasarım incelemesi: küreden açılış / Design review: the globe opening (2026-10-06)

Sahip: "Tasarımdaki detayları da düşün, viral olmalıyız; global dünyayı da mı görsek bilmiyorum, ince
düşün her detayı." Sonra: "Viral olabilecek ne yenilik ekleyebilirsin, sana bırakıyorum kararları."
Son örneklerin 2 sn'lik kare dizileri incelendi. Bulgular:
- İlk kare (kapak) karanlık bir bölge haritasıydı; olay işareti 0,35 sn'de beliriyordu, kapakta yoktu.
  Akışta duran parmağı tutacak tanıdık bir şekil yoktu.
- Kaynak ve durum satırı 22 px: telefonda karenin üçte biri boyutunda 7-8 punto, okunmuyor (araştırma
  02: 32-36 px).
- Mesafe bölümünde çizginin Türkiye ucu ve "SİNOP" adı TÜRKİYE yazısının harflerinin üstüne düşüyordu.
- Bloklar 4-8 sn aynı kareyle duruyordu (bölüm 30 kısalttı).
Kararlar:
- **Küreden açılış.** İlk kare bütün dünya küresi (koyu stillerde 420 px'lik disk, ince bir kenar
  çizgisiyle; düz haritalı stillerde dünyanın üçte biri), üstünde kırmızı Türkiye ve olay işareti.
  Kamera kancanın ilk iki saniyesinde olay yerine iner; son kare yine küre, döngü dikişsiz. Dayanak:
  araştırma 01 (ilk 0,5 sn'de hareket, beklenmedik kilitlenme), araştırma 02 format 2 "konum zoom'u".
  Kenar bir çizgi; parıltı ya da atmosfer yok (CLAUDE.md bölüm 4).
- **"Global dünya" sorusu: görüntüde evet, kapsamda hayır.** Her video dünyadan başlar ve Türkiye'ye
  göre yerini gösterir; ama kanal küresel haber kanalı olmaz. Küresel gündemde büyük kanallarla
  yarışılmaz; ayırt edici olan Türkiye'nin çevresi ve Türkiye'ye uzaklık. Küresel bir olay ancak
  Türkiye'ye ya da komşularına dokunuyorsa girer (NATO kararı, Doğu Akdeniz'e gelen uçak gemisi,
  İsrail–İran). Asıl sorun kapsam değil tekdüzelik: son 7 günün 235/290 kaydı Karadeniz (Ukrayna).
  Bölge çeşitliliği seçicide ağırlaştırılır (ayrı PR).
- Kaynak ve durum satırı 28 px (uzun çiftte en az 22 px'e küçülür).
- Mesafe bölümünde çizginin Türkiye ucu TÜRKİYE yazısına 200 × 90 px'ten yakınsa yazı çekilir; ucun
  kendi adı (SİNOP) yeri söyler.
- `export/render.mjs` sayfa hazır olmazsa nedenini yazar (eksik amblem, sahne denetimi); önceden
  40 sn bekleyip yalnız "page never became ready" diyordu.

## 32. Her kapakta Türkiye'ye uzaklık / Distance from Türkiye on every cover (2026-10-06)

Bölüm 18'in yakınlık rozeti yalnız 500 km içindeki olaylarda çıkıyordu; videoların çoğu (Ukrayna,
700-1000 km) kapakta Türkiye'yle bağını göstermiyordu. Türk izleyicinin ilk sorusu "bu beni ilgilendiriyor
mu?"; ve bu satır başka hiçbir kanalın videosunda yok, bizim imzamız. Karar: konumu bilinen her olay
2000 km'ye kadar kancanın üstünde uzaklığı taşır; "YAKIN" yalnız 500 km içinde ("TÜRKİYE'YE ~720 KM").
Hesaplanmış bilgi, iddia değil (bölüm 18'in kuralı).
Seçicide bölge çeşitliliği cezası %10'dan %15'e çıkarılarak denendi: son 48 saatin havuzunda aynı altı
seçim çıktı, çünkü havuz neredeyse bütünüyle Karadeniz. Tekdüzeliğin kaynağı seçici değil veri: son
7 günün 290 kaydının 207'si tek yayın organından (Ukrinform). Değişiklik geri alındı; çözüm yeni
kaynaklar (platform deposu, Türkiye'nin çevresinden: Ege, Kıbrıs, Doğu Akdeniz, Kafkasya, İran–İsrail,
deniz kuvvetleri haberleri).
