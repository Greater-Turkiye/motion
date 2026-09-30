# Yeni harita tasarım yönleri: araştırma raporu (WebGL2 dikey haber videosu)

Mevcut dört stilimiz şunlar: A gece kırmızısı, B harekât laciverti, C editoryal, D uydu gecesi. Aşağıdaki sekiz yön bunlarla çakışmayacak şekilde seçildi. Hepsi ülke kimliği dokusu (country-id), mesafe alanı (SDF) sınırlar ve kart katmanı içeren aynı boru hattına eklenebilir.

---

## 1. Önerilen yeni yönler

### E. "Ateşböceği / Firefly Glow"
- **Ruh hali ve kullanım:** Tek bir şeyin yandığı karanlık dünya. Füze ve İHA saldırıları, boru hatları, enerji kesintileri, protest dalgaları ve "X ülkesi tek başına" anlatısı için uygun. John Nelson'ın tarifindeki üç unsuru uygular: soluk koyu altlık, maskeli vurgu ve vinyet, tek bir parlak tema.
- **Palet:**

  | Rol | Hex |
  |---|---|
  | Zemin | `#05070B` |
  | Kara | `#12161D` |
  | Sınır | `#262D3A` |
  | Parıltı çekirdeği | `#FFF4D6` |
  | Orta ton | `#FFB547` |
  | Hale | `#FF6A00` |
  | İkincil soğuk vurgu | `#7FE3FF` |

- **Tipografi:** Inter Tight (OFL 1.1) başlık ve 800 ağırlık; IBM Plex Mono (OFL) sayılar.
- **Harita:** Ortografik küre veya Equal Earth. Rölyef yok ya da %8 opaklıkta hillshade. Sınırlar 1 px, %40 alfa. Etiketler küçük ve harf aralıklı.
- **Hareket:** Yavaş yörünge, ardından hedefe "dolly-in" (ease-in-out-cubic, 2,5–3 sn). Parıltı "nefes alır": yoğunluk 0.85–1.0 aralığında, 2 sn periyotla. Hat üzerinde akan kıvılcım parçacıkları.
- **WebGL2 uygulaması:** Özne maskesinden (countryId == subject) Jump Flooding Algorithm ile mesafe alanı üretilir: 2048² dokuda 11 geçiş, kamera zoom seviyesi başına bir kez. Parıltı şu formülle hesaplanır: `core = exp(-d/2px)`, `mid = exp(-d/12px)`, `halo = exp(-d/60px)`. Bunlar HDR tampona eklemeli (additive) yazılır, üzerine Dual Kawase bloom (5 mip) ve öznenin merkezine göre ağırlıklandırılmış radyal vinyet uygulanır. Nokta verisinde Nelson'ın katmanlama tekniği kullanılır: büyük renkli hale ile küçük beyaz çekirdek üst üste.

### F. "Saha Defteri / Field Journal" (Johnny Harris ve Vox Borders çizgisi)
- **Ruh hali ve kullanım:** Muhabirin masası; kanıttan bağlama giden anlatı. Tarihsel arka plan, sınır anlaşmazlıkları ve "bu çizgi neden burada" türü açıklayıcılar için.
- **Palet:**

  | Rol | Hex |
  |---|---|
  | Kâğıt | `#EFE6D2` |
  | Mürekkep | `#2B2A26` |
  | Keçeli kalem kırmızısı | `#D7263D` |
  | Fosforlu sarı | `#F5D547` |
  | Deniz | `#BFD3D6` |
  | Kurşun kalem | `#6B6B6B` |

- **Tipografi:** Başlıkta Fraunces (OFL, değişken, "SOFT" ekseniyle). Notlarda Caveat (OFL, el yazısı). Künyede Courier Prime (OFL).
- **Harita:** Mercator yerine Equal Earth ya da yerel konformal projeksiyon. Soluk topografya ve kâğıt dokusu. Sınırlar el çizimi hissi verir; vurgu fosforlu kalem darbesiyle yapılır.
- **Hareket:** GEOlayers mantığıyla beş parametre canlandırılır: enlem, boylam, zoom, bearing, pitch. Bearing anahtar kareleri kaydırılarak "inip yörüngeye girme" etkisi elde edilir. Maske ile açılış (reveal) geçişleri. Bant veya kağıt kesiği sahne değişimi.
- **WebGL2 uygulaması:** Kâğıt albedo ve normal dokusu CC0 kaynaklardan alınır (ambientCG, Poly Haven), multiply ile karıştırılır ve normalle hafif ışık sızdırılır. El çizimi sınır için SDF sınır örneklemesinin UV'si fbm ile domain-warp edilir. "Boiling line" etkisi için gürültü tohumu 8–12 fps'lik basamaklı zamanla değiştirilir: `floor(t*10)`. Çizginin çizilerek açılması için özne merkezine göre `atan2` açısı ve zaman eşiği kullanılır, çünkü country-id kaynaklı sınırlarda yay uzunluğu parametresi yoktur. Fosforlu kalem şeridi yarı saydam multiply ile uygulanır ve kenarları gürültülüdür.

### G. "İsviçre Rölyefi / Swiss Relief" (Imhof mirası)
- **Ruh hali ve kullanım:** Sakin, otoriter, "atlas" ağırlığı. Dağlık cephe ve sınırlar (Kandil, Karabağ, Keşmir, Golan), su ve baraj krizleri, boğazlar için.
- **Palet:**

  | Rol | Hex |
  |---|---|
  | Ova | `#A9B89A` |
  | Orta yükselti | `#D9CFA6` |
  | Yüksek | `#F1EBDC` |
  | Gölge tonu (mavimsi gri) | `#5B6E82` |
  | Işık | `#FFF6E0` |
  | Su | `#A7C5D9` |
  | Özne sınırı | `#7A1F2B` |
  | Türkiye dolgusu | `#E30A17` (%55) |

- **Tipografi:** Source Serif 4 (OFL) başlık; Source Sans 3 (OFL) etiketler, küçük büyük harf ve +80 harf aralığı.
- **Harita:** Hipsometrik renk, çok yönlü hillshade ve hava perspektifi birlikte kullanılır. Imhof'un ilkesiyle, yüksek alanlar yüksek kontrastla, ovalar düşük kontrastla ve hafif yeşil-gri tonla verilir.
- **Hareket:** Çok yavaş, neredeyse statik. Güneş azimutu 315°'den 290°'ye kayar ve "gölgeler döner". Kesmeler yerine yavaş çapraz geçiş (crossfade).
- **WebGL2 uygulaması:** ETOPO yükseklik dokusundan Sobel ile normal çıkarılır. Hillshade şu şekilde hesaplanır: `0.6*dot(N,L315) + 0.25*dot(N,L270) + 0.15*dot(N,L0)`. Hava perspektifi: `contrast = mix(0.35, 1.0, smoothstep(0, 3000, h))`. Ucuz ortam gölgelemesi (AO) için `h - blur(h, 16px)` farkı kullanılır. İsteğe bağlı olarak Tanaka aydınlatılmış kontur eklenebilir: `fract(h/interval)` ile fwidth kenarı; ışığa bakan kenar beyaz, gölgedeki siyah, kalınlık `abs(dot(N.xy, L.xy))` ile modüle edilir.

### H. "Gizliliği Kaldırılmış / Declassified Dossier"
- **Ruh hali ve kullanım:** CIA World Factbook ve fotokopi arşiv estetiği. İstihbarat ve casusluk haberleri, sızıntılar, tarihî antlaşmalar (Sykes-Picot, Lozan), soğuk savaş karşılaştırmaları için.
- **Palet:**

  | Rol | Hex |
  |---|---|
  | Kâğıt | `#E9E4D8` |
  | Toner | `#1A1A1A` |
  | Mühür kırmızısı | `#B3261E` |
  | Okyanus (Factbook soluk mavisi) | `#C9D6DF` |
  | Mavi kalem | `#3A5A8C` |
  | İşaretleyici | `#E8D36A` |

- **Tipografi:** IBM Plex Mono (OFL) gövde; Courier Prime (OFL). Mühür ve damgalar için Big Shoulders Stencil (OFL). Türkçe glifleri (ğ, ş, İ, ı) mutlaka test edin; Special Elite (Apache 2.0) bu glifleri eksik taşıyabilir.
- **Harita:** Düz Robinson ya da Mercator; gri ton rölyef ve halftone. İnce siyah sınırlar, kesik çizgili özne sınırı. Kutu içi etiketler.
- **Hareket:** 12 fps "stop-motion" titreme (1 px kayma ve 0,2° dönme). Sansür çubukları kayarak açılır. "GİZLİ" damgası 3 kare içinde ölçek 1.4'ten 1.0'a iner ve ekran sarsılır.
- **WebGL2 uygulaması:** Fotokopi eşiği `smoothstep(t-0.08, t+0.08, luma + noise*0.1)`. Toner beneği için eşiklenmiş beyaz gürültü. Kenar kararması ve tarama çizgisi bantları. Halftone gri tonlama için 45° dönük nokta ızgarası (AM screen). Kâğıt ve mürekkep multiply ile karıştırılır.

### I. "Harekât Paftası / Field Operations Sheet" (APP-6 ve MIL-STD-2525)
- **Konumlandırma:** B stilindeki koyu HUD'dan farklı olarak açık zeminli, basılı askerî topografya paftası. Cephe hattı değişimleri, kara harekâtları, tampon bölgeler, tatbikatlar için.
- **Palet:**

  | Rol | Hex |
  |---|---|
  | Pafta zemini | `#F2EFE4` |
  | Kontur kahvesi | `#A0703C` |
  | Bitki örtüsü | `#CFE3B4` |
  | Su | `#9CC7E0` |
  | Izgara | `#1D1D1D` (%35) |
  | Dost | çerçeve `#0070C0`, dolgu `#80E0FF` |
  | Hasım | çerçeve `#D40000`, dolgu `#FF8080` |
  | Tarafsız | `#AAFFAA` |
  | Bilinmeyen | `#FFFF80` |

  Dolgu değerleri MIL-STD-2525 dolgu RGB'lerine karşılık gelir: 128,224,255 ve 255,128,128.
- **Tipografi:** B612 ve B612 Mono (OFL; Airbus kokpit fontu, okunabilirlik için tasarlandı). Başlıkta Barlow Condensed 700 (OFL).
- **Harita:** UTM benzeri yerel projeksiyon; MGRS ya da km ızgarası ve kenar koordinat etiketleri. Kontur ve hillshade. APP-6 çerçeveleri: dost dikdörtgen, hasım elmas, tarafsız kare, bilinmeyen yonca.
- **Hareket:** Taarruz ekseni okları kalın, uçları çatallı, dash-offset ile "ilerler". Faz hatları kesik çizgiyle çizilir. Birim sembolleri sıçramasız, lineer kayar.
- **WebGL2 uygulaması:** Semboller `milsymbol` (MIT) ile SVG olarak üretilir ve doku atlasına rasterize edilir. Oklar polyline SDF ile çizilir: segment başına kapsül mesafesi ve ok ucu üçgen SDF'i. Izgara `abs(fract(p/step)-0.5)` ve fwidth kenar yumuşatmasıyla ekran uzayında sabit genişlikte kalır.

### J. "Riso Baskı / Risograph Print"
- **Ruh hali ve kullanım:** Samimi, grafik, genç. Seçimler, göç ve diaspora, ekonomi ve fiyatlar, hafta sonu açıklayıcıları için. Sert askerî haberde kullanılmamalı.
- **Palet:** Riso mürekkep yaklaşık değerleri.

  | Rol | Hex |
  |---|---|
  | Kâğıt | `#F4F0E6` |
  | Fluorescent Pink | `#FF48B0` |
  | Blue | `#0078BF` |
  | Yellow | `#FFE800` |
  | Teal | `#00838A` |
  | Siyah | `#1E1E1E` |

  En fazla 2–3 mürekkep kullanılır.
- **Tipografi:** Space Grotesk (OFL) ve Archivo Black (OFL).
- **Harita:** Düz Equal Earth. Rölyef halftone yoğunluğuyla verilir; sınırlar mürekkep kenarı olarak görünür.
- **Hareket:** Kayıt kayması (misregistration) her mürekkep için 8 fps'te 1–3 px zıplar. Sayfa çevirme geçişi. Büyük sayı sayaçları.
- **WebGL2 uygulaması:** Sahne ışıklığı mürekkep kanallarına ayrılır. Her kanala farklı açıda AM halftone uygulanır (15°, 75°, 45°; moiré'yi önlemek için). Kanallar kâğıt üzerine multiply edilir. Mürekkep yoğunluğu düşük frekanslı gürültüyle oynatılır; üstüne grain eklenir.

### K. "Çini Atlas / İznik Atlas" (Osmanlı ve Türk mirası)
- **Ruh hali ve kullanım:** Türkiye merkezli, vakur, kültürel. Diplomasi, Türk dünyası, yıldönümleri, Mavi Vatan ve deniz yetki alanları için.
- **Palet:** Olgun İznik altılısı: kobalt, turkuaz, mercan veya bolus kırmızısı, zümrüt, siyah kontur, beyaz zemin.

  | Rol | Hex |
  |---|---|
  | Zemin | `#F7F3EA` |
  | Kobalt | `#1F3F8F` |
  | Turkuaz | `#2FA7A8` |
  | Bolus kırmızısı (Türkiye) | `#B8322A` |
  | Zümrüt | `#2E8B57` |
  | Kontur | `#1B1B1B` |
  | Tezhip altını | `#C9A227` |

- **Tipografi:** EB Garamond veya Cormorant (OFL) başlık. Osmanlıca ve Arapça vurgular için Amiri (OFL). Modern kart için Rubik (OFL).
- **Harita:** Piri Reis tarzı portolan: pusula güllerinden 32 yöne rumb hatları. Okyanusta %6 opaklıkta çini deseni. Siyah ve net sınırlar. Kartuşu tezhip bordür çevreler.
- **Hareket:** Ebru (marbling) sahne geçişleri; pusula gülünün açılması; yavaş, tören havasında ease-in-out-sine.
- **WebGL2 uygulaması:** Rumb hatları için her pusula merkezine göre `a = atan(y,x)*16/π` hesaplanır ve `abs(fract(a)-0.5)` ile fwidth ince çizgi üretir. Ebru geçişi, UV'nin curl-noise ile zamanla artan adveksiyonu ve iki sahnenin çarpıtılmış maskeyle karıştırılmasıyla yapılır. Çini deseni prosedürel olabilir (radyal simetri ve SDF lale motifi) ya da doku olarak eklenebilir.

### L. "Kabartma Maket / Tabletop Diorama" (Scott Reinhard ve Daniel Huffman çizgisi)
- **Ruh hali ve kullanım:** Masadaki fiziksel maket; kuvvetli derinlik. Toprak değişimi, stratejik boğaz ve arazi (Hürmüz, Tayvan Boğazı, Boğazlar, Golan), "şu tepe neden önemli" anlatıları için.
- **Palet:**

  | Rol | Hex |
  |---|---|
  | Kil ve arazi | `#E8DCC8` |
  | Gölge | `#6B5B4E` |
  | Sığ deniz | `#8FB3C9` |
  | Derin deniz | `#4E7894` |
  | Kalkan özne | `#E30A17` ya da hasım `#C8102E` |
  | Etiket | `#1E1E1E` |

- **Tipografi:** Inter Tight (OFL) ve Newsreader (OFL).
- **Harita:** 20–50 kat dikey abartmalı gerçek 3B arazi, alçak güneş açısı (15–25°) ve eğik kamera (pitch 45–60°). Özne ülke "yapboz parçası" gibi 3–5 birim yükselir ve yan duvarları görünür.
- **Hareket:** Kamera ağır, yörüngeli ve paralakslı hareket eder. Tilt-shift alan derinliği minyatür hissi verir. Özne yükselirken zemine düşen gölge uzar.
- **WebGL2 uygulaması:** ETOPO veya Copernicus bölgesel yama, 1024×1024 bir ızgarada vertex displacement ile yükseltilir. Gölge için fragmanda yükseklik alanı ray-march yapılır (güneş yönünde 24–32 adım) ya da ışık uzayında gölge haritası kullanılır. Ek olarak ufuk tabanlı AO. Tilt-shift için CoC ekranın dikey koordinatının fonksiyonudur ve yarım çözünürlükte gather bokeh uygulanır. Offline render'da zaman sınırı olmadığından gölge ışınları 64 adıma çıkarılabilir.

**Bilinçli olarak ertelenen: Neon ve synthwave.** Pembe ve camgöbeği tel çerçeve arazi (`#0B0221`, `#FF2A6D`, `#05D9E8`, font olarak Chakra Petch, OFL) haber güvenilirliğini zedeleyebilir. Yalnızca siber saldırı, uzay veya yapay zekâ konularında I ya da E stilinin alt varyantı olarak önerilir.

---

## 2. Algılanan kaliteyi en çok artıran teknikler

Maliyetler 1080×1920 çözünürlükte ve kare başına verilmiştir. Offline video render ettiğimiz için gerçek zaman kısıtı yoktur; pahalı teknikler de kullanılabilir.

| # | Teknik | Uygulama notu | Maliyet |
|---|---|---|---|
| 1 | **Alt-kare birikimli hareket bulanıklığı** | Kare başına 8–16 alt-kare render edilip ortalaması alınır (180° shutter). Gerçek sinema hissi veren en önemli tek adımdır; hızlı dönüşlerdeki takılmayı yok eder. | N× render; offline'da kabul edilebilir |
| 2 | **Sabit genişlikli, kenar yumuşatmalı sınırlar** | Country-id dokusunda komşu kimlik farkından kenar bulunur, JFA ile mesafe alanı üretilir (önceden, zoom seviyesi başına). Genişlik `fwidth` ile ekran pikseline sabitlenir. | JFA ~11 geçiş, önbelleğe alınır |
| 3 | **Terminatör aydınlatma** | `smoothstep(-0.1, 0.2, dot(N,L))` ile gündüz ve gece dokusu karıştırılır; geçişte turuncu ton (`#FF8A3D`, %30) kullanılır. | Yaklaşık 0 |
| 4 | **Atmosfer saçılması** | Ucuz yol: Fresnel kenar parıltısı `pow(1-dot(N,V), 3)`. Kaliteli yol: O'Neil (GPU Gems 2, bölüm 16) tek saçılma, yalnız atmosfer kabuğunda 8–16 örnek. En iyisi: Bruneton ön hesaplı LUT'lar (WebGL2 demosu mevcut). | Düşük, orta, orta |
| 5 | **HDR, bloom ve tonemap** | Parıltılar ve vurgular HDR'da tutulur. Dual Kawase (Bjørge, SIGGRAPH 2015) Gaussian'dan 1,5–15 kat hızlıdır. Ardından AgX ya da ACES tonemap. | Yaklaşık 0,3 ms |
| 6 | **Blue-noise dithering** | Koyu gradyanlarda YouTube/Reels sıkıştırması bantlaşma üretir; ±0,5/255 blue-noise eklemek bunu önler. | Yaklaşık 0 |
| 7 | **Film grain** | Tonemap sonrasında, ışıklığa bağlı %2–4 genlikle, her kare farklı tohumla. Uyarı: grain bit hızını yer; dikey video için ince tutulmalı. | Yaklaşık 0 |
| 8 | **Optimal zoom-pan yolu** | van Wijk ve Nuij "smooth and efficient zooming and panning" (`d3.interpolateZoom`). Uzak iki nokta arasında zoom önce dışarı, sonra içeri gider; kamera "uçar". | Yaklaşık 0 |
| 9 | **Paralaks etiketler** | Etiketler küre yüzeyinden 1–2% yukarıda 3B çapaya bağlanır ve `dot(N,V) < 0.15` iken solar. Çarpışma ekranda çözülür. | Düşük |
| 10 | **Alan derinliği ve tilt-shift** | Yalnızca harita katmanına; metin keskin kalmalıdır. Yarım çözünürlükte CoC gather. | Orta |
| 11 | **Kromatik sapma** | Yalnızca geçiş anlarında, kenarlarda 0,5–1,5 px, radyal. Kalıcı kullanıldığında ucuz görünür. | Yaklaşık 0 |
| 12 | **2× süper örnekleme** | Offline render'da 2160×3840 çizilip küçültülür; ince sınır ve metin için en güvenilir kenar yumuşatma. | 4× piksel |
| 13 | **Easing dili** | Stil başına tek bir eğri ailesi: E ve L için expo in-out, H ve J için basamaklı (stepped), K için sine. Tutarlılık "profesyonel" algısının ana kaynağıdır. | 0 |

---

## 3. Açık veri ve doku kaynakları

| Kaynak | Çözünürlük | Boyut | Lisans |
|---|---|---|---|
| **NOAA ETOPO 2022** | 15″ (~450 m), 30″, 60″. Yüzey (ice surface) ve bedrock sürümleri; GeoTIFF ve NetCDF. 15″ veri 15°×15° karolar halinde. | 60″ global GeoTIFF **444 MB** | ABD federal verisi, kullanım kısıtı yok. Atıf önerilir: DOI 10.25921/fd45-gt74 |
| **GEBCO 2025 Grid** | 15″, 86400×43200. Buz altı sürümü de var. Özel alan indirilebilir (GeoTIFF). | Global netCDF **4 GB** (açılmış 7,5 GB) | Kamu malı, atıf istenir |
| **NASA Blue Marble NG** | 500 m, 12 aylık kompozit; topografya ve batimetri gölgeli sürümler | 21600×10800 JPEG yaklaşık **26 MB**, PNG 180 MB | Serbest (ticari dahil); zorunlu kredi: "NASA Earth Observatory" (Reto Stöckli) |
| **NASA Black Marble 2016** | 3600×1800; 13500×6750 (3 km); 86400×43200 (500 m, 21600² karolar) | SVS 5760×3240 PNG **6,3 MB** | Kredi: NASA Goddard Space Flight Center |
| **Black Marble VNP46 (günlük)** | Kesinti ve savaş karşılaştırmaları için ideal | — | NASA Earthdata hesabı ister. Sahibin elle kimlik bilgisi girme adımı istememesi nedeniyle **önerilmez** veya tek seferlik çözülmelidir. |
| **Natural Earth rasterleri** | 1:10m, HR 21600×10800 ve LR 16200×8100. Shaded Relief, NE I/II, Manual Shaded Relief. | Shaded Relief Basic HR **42,3 MB** | Kamu malı |
| **Copernicus DEM GLO-30 / GLO-90** | 30 m ve 90 m; 1° karolar, AWS Open Data üzerinde | — | Ücretsiz, atıf zorunlu: "produced using Copernicus WorldDEM-30 © DLR e.V. 2010-2014 and © Airbus Defence and Space GmbH 2014-2018 provided under COPERNICUS by the European Union and ESA" |
| **Kâğıt, grain, çini dokuları** | ambientCG, Poly Haven | — | CC0 |
| **Askerî semboller** | milsymbol | — | MIT |

Copernicus GLO-30 için bir not: kaynağa göre iki ülke 30 m'de hariç tutuluyor. Bunlar büyük olasılıkla Ermenistan ve Azerbaycan, yani Kafkasya haberleri için doğrudan ilgili. Bölge için GLO-90 ile doğrulayın.

**Font notu:** Önerilen tüm fontlar Google Fonts üzerinde OFL 1.1 lisanslıdır. Kullanmadan önce her fontta ğ, Ğ, ş, Ş, ı ve İ glifleri test edilmeli; özellikle stencil ve daktilo aileleri eksik olabilir.

---

## 4. Önerilen öncelik

1. **E Ateşböceği:** En düşük maliyet, en yüksek "vay" etkisi. Mevcut JFA ve bloom altyapısını yeniden kullanır.
2. **G İsviçre Rölyefi:** ETOPO normal haritası tek seferlik bir yatırım; L stili de aynı altlığı kullanır.
3. **K Çini Atlas:** Kanala özgü kimlik; rakiplerde benzeri yok.
4. **H Gizliliği Kaldırılmış** ve **I Harekât Paftası:** Haber türüne göre özel stiller.
5. **F**, **J** ve **L:** Daha fazla sanat yönetimi gerektiriyor.

Tekniklerde ilk yapılacaklar alt-kare hareket bulanıklığı ile blue-noise dithering. İkisi de ucuz ve mevcut dört stilin kalitesini de doğrudan artırır.

---

### Kaynaklar
- Nelson, Firefly: [Adventures in Mapping](https://adventuresinmapping.com/2016/10/17/firefly-cartography/), [Mapbox – firefly technique](https://medium.com/mapbox/glow-effect-the-firefly-technique-23eff7297075), [Esri – Steal this Firefly Style](https://www.esri.com/arcgis-blog/products/mapping/mapping/steal-this-firefly-style-please)
- Johnny Harris ve Vox: [aescripts – How Johnny Harris Makes Maps](https://aescripts.com/learn/post/how-johnny-harris-makes-maps), [aescripts – Map Montage](https://aescripts.com/learn/post/create-a-johnny-harris-style-animated-map-montage)
- Imhof ve rölyef: [Swiss-style relief shading (ICC 2009)](https://icaci.org/files/documents/ICC_proceedings/ICC2009/html/nonref/25_4.pdf), [Aerial perspective for shaded relief](https://www.researchgate.net/publication/344526502_Aerial_perspective_for_shaded_relief), [shadedrelief.com Swiss](http://www.shadedrelief.com/shading/Swiss.html), [Huffman – Shaded Relief in Blender](https://somethingaboutmaps.wordpress.com/2017/11/16/creating-shaded-relief-in-blender/), [Stamen – shadows on maps (Reinhard)](https://stamen.com/shadows-on-maps-are-getting-a-lot-more-exciting-and-heres-why/), [Tanaka – riatelab](https://github.com/riatelab/tanaka)
- Editoryal paletler: [Economist design system](https://www.shadcn.io/design/economist), [FT design system](https://www.shadcn.io/design/ft)
- Askerî semboloji: [NATO Joint Military Symbology](https://en.wikipedia.org/wiki/NATO_Joint_Military_Symbology), [MIL-STD-2525C](https://worldwind.arc.nasa.gov/milstd2525c/Mil-STD-2525C.pdf), [milsymbol](https://github.com/spatialillusions/milsymbol/issues/355)
- Riso ve çini: [Risograph hex](https://www.omoro.io/palettes/risograph), [Iznik pottery](https://en.wikipedia.org/wiki/Iznik_pottery), [Piri Reis map](https://en.wikipedia.org/wiki/Piri_Reis_map)
- Teknik: [GPU Gems 2 bölüm 16](https://developer.nvidia.com/gpugems/gpugems2/part-ii-shading-lighting-and-shadows/chapter-16-accurate-atmospheric-scattering), [Bruneton WebGL2 demo](https://ebruneton.github.io/precomputed_atmospheric_scattering/demo.html), [Dual Kawase – Bjørge 2015](https://community.arm.com/cfs-file/__key/communityserver-blogs-components-weblogfiles/00-00-00-20-66/siggraph2015_2D00_mmg_2D00_marius_2D00_slides.pdf), [Dual Kawase açıklaması](https://blog.frost.kiwi/dual-kawase/), [JFA – demofox](https://blog.demofox.org/2016/02/29/fast-voronoi-diagrams-and-distance-dield-textures-on-the-gpu-with-the-jump-flooding-algorithm/), [Halftone shader – Heckel](https://blog.maximeheckel.com/posts/shades-of-halftone/), [CMYK Halftone Shadertoy](https://www.shadertoy.com/view/Mdf3Dn)
- Veri: [ETOPO](https://www.ncei.noaa.gov/products/etopo-global-relief-model), [ETOPO 60s dizini](https://www.ngdc.noaa.gov/mgg/global/relief/ETOPO2022/data/60s/60s_surface_elev_gtif/), [GEBCO 2025](https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2025-grid), [GEBCO 2024 boyutları](https://www.gebco.net/data-products-gridded-bathymetry-data/gebco2024-grid), [Blue Marble topo/bathy](https://visibleearth.nasa.gov/images/73580/january-blue-marble-next-generation-w-topography-and-bathymetry), [Black Marble 2016 SVS](https://svs.gsfc.nasa.gov/30876/), [Black Marble çözünürlükler](https://earthobservatory.nasa.gov/Features/NightLights), [Earthdata Black Marble](https://www.earthdata.nasa.gov/data/projects/black-marble), [NASA görsel kullanım politikası](https://www.naturalhazards.nasa.gov/image-use-policy), [Natural Earth 10m Shaded Relief](https://www.naturalearthdata.com/downloads/10m-raster-data/10m-shaded-relief/), [Copernicus DEM lisansı](https://docs.sentinel-hub.com/api/latest/static/files/data/dem/resources/license/License-COPDEM-30.pdf), [Copernicus DEM AWS](https://registry.opendata.aws/copernicus-dem/)
