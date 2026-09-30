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
| M4 | Yazı ve kart | MSDF yazı, "önemli gelişme" kartı, kaynak satırı | Türkçe karakterler, animasyonda titreme yok |
| M5 | Veriden sahne | kayıt kimliğinden sahne, doğrulayıcı (kaynak, kırmızı çizgi) | Kırmızı çizgi kaydı reddedilir |
| M6 | Şablonlar | çağrı, sayaç, zaman çizelgesi, karşılaştırma | Her şablondan örnek video |
| M7 | Tam otomasyon | Bölüm 10'daki hat: kayıttan videoya, insansız | Altı saatte bir runner'da üretim, sitede yayında |

## 10. Tam otomatik hat / The fully automatic pipeline

Sahibin isteği: sistem kendi kendine çalışsın. Hat şöyle:

```
toplayıcı (6 saatte bir) ─▶ otomatik kayıtlar (auto-data) ─▶ seçici ─▶ sahne üretici ─▶ işleyici ─▶ yayın
```

1. **Seçici.** Her çalıştırmada son altı saatin kayıtlarından video değeri en yüksek olanları
   seçer: tür ağırlığı (kinetik, deniz, tatbikat, anlaşma önde), izleme bölgesine yakınlık,
   birden çok kaynak, konumu olması, daha önce video yapılmamış olması. Günde en çok N video
   (başlangıç: 4). Türk kuvvetleri ve `redline_check` her zaman dışarıda.
2. **Sahne üretici.** Kayıttan sahne dosyasını kendisi yazar: türüne göre şablon, konumdan kamera,
   ülkelerden vurgu, bölge kaydı sayısından istatistik, başlık ve kaynak kayıttan. Metin kaydın
   metnidir; yeni iddia üretmez.
3. **Doğrulayıcı.** Sahne; kaynak satırı, durum etiketi, kırmızı çizgi ve metnin taşmaması için
   denetlenir. Geçmeyen sahne işlenmez, günlüğe yazılır.
4. **İşleyici.** GitHub Actions runner'ında başsız Chrome + ffmpeg. GPU yok: WebGL yazılımla
   (SwiftShader) çalışır, yavaş ama deterministik; 12 saniyelik dikey kart birkaç dakikada biter.
   Her video üç boyutta ve bir kapak karesiyle çıkar.
5. **Yayın.** Videolar sitenin "Videolar" sayfasına ve günlük bir sürüm sayfasına otomatik çıkar.
   Kanallara gönderim bölüm 6'daki ayrı kararla açılır.
6. **Gözetim.** Sitedeki tarayıcı denetimi gibi: üretilen her videodan kareler örneklenir, boş
   kare, taşan yazı ya da eksik kaynak satırı varsa iş kırmızıya düşer ve sağlık raporuna girer.
   Acil durdurma: tek bir depo değişkeni (`MOTION_AUTO=off`).

## 11. Tasarım tipleri / Design directions

`docs/mockups/` içinde gerçek bir kayıtla çizilmiş dört yön var (tek kare, 1080×1920):

| | Ad | Karakter |
|---|---|---|
| A | **Gece kırmızısı** | Örneklere en yakın: siyah zemin, kabartmalı kara, hasım kırmızı ışıltıyla, sarı başlık kutusu |
| B | **Harekât lacivert** | Harekât ekranı: lacivert, camgöbeği sınırlar, köşe çerçeveleri, mono etiketler, üç kutulu istatistik |
| C | **Editoryal** | Gazete sayfası: açık zemin, düz harita, Türkiye kırmızı, siyah ağır başlık |
| D | **Uydu gecesi** | Uzaydan küre, soğuk ışık, buzlu cam kart, sade |

**Sahibin kararı (2026-09-30): dördü de kalır, sahne dosyasında `style: A|B|C|D` ile seçilir.**
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
- Yazı hızı ≤ 15 karakter/sn (≈ 2 Türkçe kelime/sn); blok süresi = karakter ÷ 15, en az 1,2 sn.
- Her 1,5–2,5 sn'de bir anlamlı görsel değişim; saniyede bir kesme yok (haber zaten uyarıcı).
- Süre 15–25 sn; "ne anlama geliyor" satırı 8–15. saniyede, doruk son %20'de, son kare ilk karenin
  kamera açısına döner (döngü).

**Güven**
- Durum etiketi (DOĞRULANMADI / DOĞRULANDI / GELİŞEN) her videoda, ilk 2 sn'de ve son karede. ✅ (ilk)
- Kaynak satırı sürekli ekranda, okunur boyutta; yalnız son karede değil.
- Hook'taki her içerik kelimesi kaynak metinde karşılık bulmalı; bulamazsa sahne reddedilir.
- Kara liste: dış grup düşmanlığı ve ahlaki öfke kelimeleri (hain, rezil, küstah …); soru hook'u yok.
- Kaygı yerine ölçek ve yenilik çerçevesi: mesafe ("Boğaz'a 430 km") ✅, "ilk kez" yalnızca veri
  setinden hesaplanabiliyorsa.

**Kompozisyon**
- Güvenli alan (üç platformun kesişimi): üst %14, alt %35, sol 65 px, sağ 180 px. Hook, durum ve
  kaynak satırı bu kutuda; alt bantta yalnızca dekor.
- Taraf renkleri kırmızı-yeşil değil; renk her zaman amblem ya da desenle desteklenir.
- Aynı gün aynı düzen tekrarlanmaz; en az 5–6 düzen (YouTube "inauthentic content" politikası).

**Hat**
- Seçim puanı S = 100·D·(0,30M + 0,20P + 0,20C + 0,15R + 0,15N)·(0,6 + 0,4G), kesin elemelerden
  sonra; turda 1, günde 2–6 video (ayrıntı: research/04).
- Metin LLM'e yazdırılmaz; kayıt alanlarından deterministik şablon cümleleri.
- Ses: prosedürel efektler (WebAudio, kamu malı jsfxr); seslendirme adayı Chatterbox (MIT), Türkçe
  kalitesi ölçülmeden açılmaz. Ticari olmayan lisanslı sesler (Piper dfki, XTTS, MMS) kullanılmaz.
- Yayın: Telegram, Bluesky, Mastodon, Instagram Reels otomatik; YouTube denetim onayına kadar
  private; TikTok ve X otomatik değil. `published.json` defteri tekrar gönderimi engeller.
- CI'da GPU yok: Chrome `--use-angle=swiftshader-webgl --enable-unsafe-swiftshader`; WebCodecs
  H.264 yalnızca Baseline (`avc1.42E0xx`) güvenilir; çıktı ffprobe ve blackdetect kapısından geçer.
