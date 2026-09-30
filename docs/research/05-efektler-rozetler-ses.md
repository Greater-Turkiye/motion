# Harita tabanlı haber shortları: efekt, rozet, geçiş ve ses rehberi (motion için araştırma raporu)

**Kanıt etiketleri:** [measured] ölçüm ya da uygulayıcı ölçümü · [platform] resmî doküman, API veya standart · [practitioner] sektör blogu ya da eğitim · [own inference] benim çıkarımım.

**Süreç notu:** Oturumdaki WebSearch kotası (200/200) araştırmanın ortasında doldu. Sonrasında yalnızca bilinen URL'leri WebFetch ile okudum. Bazı sayfalar okunamadı (403/404). Bu yüzden Johnny Harris / aescripts ve dev.to davul sentezi atıfları yalnızca arama sonucu özetine dayanıyor. Hiçbir dosyayı ya da repoyu değiştirmedim.

---

## 0. Tüm efektler için ortak kurallar [own inference]

- **Determinizm:** Tek zaman kaynağı `t = frameIndex / 60`. `Math.random`, `Date.now` ve `performance.now` hiç kullanılmaz. Rastgelelik, kayıt id'siyle tohumlanan bir PRNG'den (mulberry32 gibi) gelir. Canvas 2D metni çizmeden önce `document.fonts.ready` beklenir. Ses tarafındaki noise buffer'lar da aynı PRNG ile doldurulur. MDN örneği `Math.random()` kullanıyor; deterministik render için bunun yerine tohumlu PRNG gerekir ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques)).
- **Maliyet:** Headless Chrome GPU bulamazsa SwiftShader'a (CPU) düşer. O durumda 1080×1920'de her tam ekran pass yaklaşık 2 MP piksel demek ve pahalıdır. Kareye 2–3 ek pass'tan fazlası render süresini katlar. Maliyet etiketleri: **D** düşük (geometri veya tek uniform), **O** orta (1–2 offscreen pass), **Y** yüksek (blur zinciri veya çift viewport).
- **H.264 tuzakları:** 4:2:0 chroma subsampling, koyu zemin üstündeki 1 px kırmızı çizgiyi bulaştırır. Kırmızı stroke en az 2–3 px olmalı. Glow gradyanlarında banding oluşur; ±1/255 hash dither eklenmeli. Yoğun film grain bitrate'i yer.
- **Işık ve yanıp sönme:** Saniyede 3'ten fazla flaş olmamalı. Bu, WCAG 2.3.1'deki genel eşik ve "red flash" eşiğidir ([W3C](https://www.w3.org/WAI/WCAG22/Understanding/three-flashes-or-below-threshold.html)) [platform]. Pulse ve shockwave efektleri doğrudan bu kurala tabidir.
- **Kırmızı çizgiler (görsel dil):** Şunlar hiç kullanılmaz: artı/nişangâh, HUD reticle, FLIR benzeri monokrom, silah menzil halkası, "patlama yarıçapı", askerî tesis üzerinde ondalıklı koordinat, füze silüetli ok başı. Saldırı konumu bina değil, kaynağın belirttiği il veya bölge düzeyinde gösterilir. Her karede kaynak çipi ve doğrulama rozeti görünür.

## 1. Efekt kataloğu (26 efekt)

Referans üretim zinciri GEOlayers 3 + After Effects ([aescripts](https://aescripts.com/geolayers/)) [practitioner]. Vox ve Johnny Harris çizgisinin imza öğeleri şunlar: saf beyaz yok; kâğıt dokusu, grain, hafif light leak ve kenarda chromatic aberration; kamera 5 eksende animasyonlu (lat, lon, zoom, bearing, pitch); bearing keyframe'leri kaydırılarak "inip yörüngeye girme" hissi veriliyor ([aescripts](https://aescripts.com/learn/post/how-johnny-harris-makes-maps), [easy-peasy](https://easy-peasy.ai/blog/how-to-make-vox-style-videos-with-ai)) [practitioner, arama özetinden]. Reuters'ın haber altlığı ilkesi ise "destekleyici, tarafsız, otoriter", ince hillshade ve zoom'a bağlı etiket hiyerarşisi ([Scott Reinhard/Reuters](https://scottreinhardmaps.com/blogs/custom-mapping-projects/custom-reuters-open-source-mapping)) [practitioner].

| # | Efekt | Ne anlatır / hangi olay ailesi | Deterministik uygulama, maliyet | "Ucuz" riski ve kırmızı çizgi |
|---|---|---|---|---|
| 1 | Great-circle arc + comet trail | Kaynağın bildirdiği çıkış bölgesi → hedef bölge. Saldırı, İHA, diplomatik ziyaret rotası | Tessellate edilmiş polyline, vertex başına `a_dist ∈[0,1]`. Fragment: `a = smoothstep(head−L, head, d)·step(d, head)`, `head = easeInOut(t)`. Kenar sönümü `exp(−3|side|)` ([ArcGIS](https://developers.arcgis.com/javascript/latest/sample-code/custom-gl-animated-lines/)) [platform]. Başa additive sprite. **D** | Neon gökkuşağı ve aşırı bloom ucuz durur. Uç nokta bölge centroid'i olur. Kaynak "iddia" diyorsa kesikli çizilir (globe.gl `arcDashLength/Gap/AnimateTime`, [globe.gl](https://github.com/vasturiano/globe.gl)) [platform] |
| 2 | Radar/sonar sweep | "İzleniyor, alarm". Hava sahası kapanması, deniz olayı | `ang = atan(p.y,p.x)`, `a = exp(−k·mod(θ(t)−ang, 2π))` ([Godot radar](https://godotshaders.com/shader/radar-scanner/)) [practitioner]. **D** | **En yüksek risk**: hedefleme arayüzü ya da oyun gibi okunur. Yalnızca locator inset'te, olay noktasına ortalanmadan kullanılmalı [own inference] |
| 3 | Shockwave/pulse ring | "Olay burada". Saldırı, açıklama (yumuşak tonda) | SDF: `abs(length(p)−r(t)) < w`, r easeOutCubic ile büyür, alfa söner. globe.gl varsayılanları: 700 ms tekrar, 2° max yarıçap [platform]. **D** | Patlama yarıçapı gibi okunmamalı. Ekran-uzayında sabit boyut ve 2–3 halka ile sınırlı; ≤3 Hz |
| 4 | Yoğunluk/heat map (7–30 gün) | Tırmanma bağlamı. Tüm aileler | Noktalar R16F FBO'ya additive gaussian splat edilir, sonra 1D LUT ile renklendirilir. Alternatif H3 hexbin (globe.gl `hexBinResolution` vb.). **O** | "Ateş" rampası sansasyonel durur; tek tonlu sıralı rampa tercih edilmeli. Altyazıda "derlenmiş N kayıt, eksik olabilir" |
| 5 | Choropleth reveal | Ülke durumu: yaptırım, tutum, imzacı | Mevcut country-id texture + 256×1 veri texture'ı. Ülke başına gecikme = kaynağa uzaklık, `mix(base,c,smoothstep(dl,dl+.3,t))`. **D** | Gökkuşağı palet ve 5'ten fazla sınıf ucuz durur. FT Visual Vocabulary: oranlar için choropleth, toplamlar için proportional symbol ([FT](https://github.com/Financial-Times/chart-doctor/tree/main/visual-vocabulary)) [platform] |
| 6 | Border draw-on | Kim, nerede. Tümü | id texture'da komşu id farkı ile kenar tespiti; açı veya mesafe maskesiyle açılış. Ya da kümülatif uzunluklu polyline'da dash reveal. **D** | **Siyasi risk**: tartışmalı sınırlar (Kıbrıs, Kırım, Keşmir). Yazılı bir sınır politikası gerekir; fiilî hatlar kesikli [own inference] |
| 7 | Country extrude/lift | Odak aktör(ler). Diplomasi, anlaşma | Ucuz yol: ülke maskesi + ofsetli blur gölge + %2 scale. Pahalı yol: normal boyunca vertex displacement. **O** | Plastik 3D ve PowerPoint gradyanı ucuz durur. Lift ≤ 12 px |
| 8 | Parallax etiket katmanları | Derinlik, yön bulma | Canvas 2D'de 3 katman, pan faktörleri 1.0/0.85/0.7. Çakışma çözümü önceden, deterministik. **D** | Etiketler yüzer ya da titrer. Hareket bitince tam piksele snap |
| 9 | Camera push + DoF | Bölgeye odak. Tümü | Ease'li dolly. Odak noktasına ekran mesafesiyle ölçeklenen iki geçişli separable blur (tilt-shift). **O–Y** | Aşırı blur "minyatür" gibi durur; yarıçap ≤ 6 px |
| 10 | Arazi üzerinde light sweep | Premium bölüm açılışı. Rölyef stilleri | Hillshade'de güneş azimutu animasyonu ya da `exp(−(dot(uv,dir)−s(t))²/w)` bandı. **D** | Metin ve rozetler üzerinde ucuz "parlama"; yalnızca arazide kullanılmalı |
| 11 | Day/night terminator | Yerel saat bağlamı (gece saldırısı, saat dilimi) | `blend = smoothstep(−0.05, 0.08, dot(N, sunDir))`, dar alacakaranlık bandı `·0.1` sönümle ([dev.to](https://dev.to/timetate/drawing-day-and-night-on-a-3d-globe-the-shader-behind-my-world-clock-391k)) [practitioner]. Kaynaktaki UTC ile deterministik. **D** | Yalnızca kaynaklı zaman damgasıyla ve "yerel saat" etiketiyle kullanılmalı |
| 12 | Bulut/hava katmanı | Deniz ve hava durumu bağlamı; çoğunlukla dekor | Statik bulut texture'ı yavaş kayar. Atmosfer halkası Mapbox `horizon-blend`/`star-intensity` mantığıyla ([Mapbox](https://docs.mapbox.com/style-spec/reference/fog/)) [platform]. **D** | O günün gerçek havası sanılabilir. Dekor ise çok soluk tutulmalı |
| 13 | Gemi için noktalı rota | Deniz olayı, koridor (Hürmüz, Kızıldeniz, Karadeniz) | `step(fract(d·freq − t·v), duty)`, başta gemi glifi. TripsLayer `trailLength/fadeTrail` modeli ([deck.gl](https://deck.gl/docs/api-reference/geo-layers/trips-layer)) [platform]. **D** | AIS kesinliği ima edilmemeli; "temsilî rota" ya da "AIS: kaynak" etiketi şart |
| 14 | Callout leader line | Şehir veya kurum + tek olgu | Canvas 2D'de dirsekli çizgi 250 ms'de çizilir, ardından metin, bir de anchor nokta. **D** | Aynı anda en çok 3 callout. Askerî tesise nokta atışı yapılmaz (aimpoint yasağı) |
| 15 | Locator globe / inset | Tanıdık olmayan yerde yön bulma | Köşede scissor'lı ikinci globe viewport + ana görüş çerçevesi. **O** | Telefonda okunmaz; genişlik ≥ 280 px |
| 16 | Split-screen | İki tarafın açıklaması, iddiaya karşı iddia | 9:16'da üst/alt iki viewport. **Y** | "VS" dövüş kartı çerçevesi sansasyoneldir; nötr etiket kullanılmalı |
| 17 | Before/after wipe | Uydu görüntüsü karşılaştırması | `mix(A,B,step(x, w(t)))` + 2 px ayraç. **D** | Görüntü lisanslı ve tarihli olmalı (ör. Copernicus Sentinel). AI ile iyileştirme yok [own inference] |
| 18 | Timeline/scrubber | Olay zinciri, müzakere takvimi | Canvas 2D bar, playhead ve olay noktaları; harita senkron. **D** | 7'den fazla olay kalabalık yapar; tarih doğruluğu kritik |
| 19 | Counter/odometer | Sayısal iddia (önlenen İHA, miktar) | Hane başına sütun kaydırma, 800–1200 ms easeOut, bitişte kaynak satırı. **D** | **Kayıp sayılarında yasak**: yukarı sayan ölü sayısı oyunlaştırma olur. Kayıplarda statik sayı + fade, tick sesi yok [own inference] |
| 20 | Sparkline | Trend (aylık olay sayısı, petrol fiyatı) | Polyline draw-on, uç nokta ve değer. **D** | Eksensiz trend yanıltır; min/max etiketi zorunlu |
| 21 | İkon sistemi | Olay türü glifleri | 24 px grid, 2 px stroke, tek aile. Liveuamap'in tür bazlı ikon mantığı referans ([Wikipedia](https://en.wikipedia.org/wiki/Liveuamap)) [practitioner]. **D** | Clip-art karışımı ucuz durur. Silah silüeti yerine soyut glif |
| 22 | Proportional symbol | Konuma göre büyüklük | Alan değerle orantılı, yani `r ∝ √v`. **D** | r ∝ v hatası büyük değeri abartır |
| 23 | Kinetic quote | Açıklamalar | Kelime kelime reveal, TTS zamanlamasıyla senkron. **D** | Aşırı zıplayan tipografi |
| 24 | Focus glow/bloom | Odak ülke | Maske → mesafe alanı ya da 2 pass blur halo. **O** | Neon ucuzluğu; yoğunluk ≤ %35 |
| 25 | Film grain/kâğıt | El işi hissi (editorial) | `hash(uv, frame)` grain, düşük genlik. Aynı zamanda dither işi görür. **D** | Bitrate'i yer; büyük taneli ve soluk tutulmalı |
| 26 | Kontur çizgisi reveal | Arazi ve topoğrafya | DEM'den `fract(h/interval) < w` ile izohips, maskeyle açılış. **D** | Zayıf |

## 2. Rozet, lower-third ve durum sistemleri

**Güven ve clickbait bulguları:**
- Clickbait başlıklar güvenilirliği düşürüyor. Push bildirimi çalışmasında "breaking" etiketinin kendisi clickbait işlevi görebiliyor ([MDPI 2025](https://www.mdpi.com/2673-5172/6/3/96), [Social Sci. 2024](https://doi.org/10.3390/socsci13080430)) [measured].
- DNR 2025: katılımcıların %58'i neyin doğru olduğunu ayırt edebileceğinden endişeli. İzleyiciler kaynakların daha açık gösterilmesini istiyor. Sosyal videodan haber tüketimi 2020'de %52 iken 2025'te %65 ([Reuters Institute](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2025/dnr-executive-summary)) [measured].
- BBC Verify, "nasıl doğruladık"ı gösteren ayrı bir marka olarak konumlandı ([Wikipedia](https://en.wikipedia.org/wiki/BBC_Verify)) [platform].
- 2025 yayın paketleri gürültülü değil sistematik: ABC News Live'ın "tab" motifi ve yaklaşık 300 yerleşim; MS NOW bayrak-şerit formu ([NewscastStudio](https://www.newscaststudio.com/graphics/abc-news-live/), [MS NOW](https://www.newscaststudio.com/2025/11/17/ms-now-graphics/)) [practitioner].
- **Güvenilir okunanlar:** sabit konum, sakin renk, metin + ikon + şekil üçlüsü, zaman damgası. **Clickbait okunanlar:** yanıp sönen kırmızı, ünlem, "ŞOK", büyük emoji [own inference].

**Hareket:** Girişler easeOutCubic, çıkışlar easeInCubic ve girişin yaklaşık %65'i uzunlukta. Süreler 60 fps'e göre kare cinsinden (f) [own inference].

| # | Rozet | Şekil | Renk mantığı | Giriş / çıkış |
|---|---|---|---|---|
| B1 | **SON DAKİKA** (yalnızca olay 3 saatten yeni ve en az bir ajans veya resmî teyit varsa; yoksa **GELİŞME**) | 2 px köşeli dikdörtgen çip, condensed büyük harf, 44 px yükseklik | Tek düz aksan (koyu mercan, #D23B2E civarı), beyaz metin. **Yanıp sönme yok** | Soldan clip-path wipe 180 ms (11 f) + metin 120 ms gecikmeli / 150 ms (9 f) |
| B2 | **Doğrulama durumu** (4 durum) | Pill + ikon: ✓ DOĞRULANDI (dolu), ◐ KISMEN (yarı dolu), " " İDDİA / DOĞRULANMADI (kesikli kontur, tırnak), ⊘ ÇELİŞKİLİ (çapraz) | Teal / amber / nötr gri / magenta. Renk körlüğüne karşı şekil ve metin taşıyıcı | Scale 0.92→1 + fade 240 ms (14 f). Durum değişimi 300 ms morph; çıkış yok, hep ekranda |
| B3 | **Kaynak çipi** | Hairline konturlu kutu + kaynak tipi ikonu (ajans / resmî / OSINT / sosyal medya), en çok 2 çip + "+N" | Monokrom, zeminin %80 kontrastında | Fade + 8 px yukarı kayma 200 ms / 140 ms; sahne boyunca sabit |
| B4 | **Seri bug'ı** | Köşede küçük logotype + bölüm no. | Stil paletinin nötr tonu, %70 opaklık | İlk 500 ms'de 300 ms fade, sonra sabit |
| B5 | **Bayrak/aktör çipi** | 40 px daire bayrak, 1 px halka + ISO3 kodu. Devlet dışı aktörler yalnızca metin (amblem propagandası riski) | Bayrak doğal renkte, halka nötr | Pop 1.0→1.06→1.0, 220 ms / 120 ms |
| B6 | **Sayı rozeti** | Büyük rakam + zorunlu alt satır: "iddia · Kaynak X", aralık varsa "12–20", "resmî / tahmin" etiketi | Nötr zemin, rakam beyaz; kayıplarda aksan rengi yok | Odometer 900 ms (54 f), kayıpta 250 ms fade / 180 ms |
| B7 | **Konum pini ↔ bölge halkası** | Pin yalnızca kaynağın coğrafi konum doğrulaması (geolocation) varsa. Yoksa kesikli bölge halkası ("yaklaşık bölge") | Pin dolu, halka kesikli ve daha soluk | Pin drop 250 ms + %8 overshoot; halka draw-on 400 ms (24 f) |
| B8 | **Zaman damgası / görüntü etiketi** | Monospace satır: "30 Eyl 2026 · 14:20 TSİ itibarıyla". Görüntü varsa "ARŞİV" / "TEMSİLÎ" | Nötr gri | 200 ms fade, sabit |

**Lower-third:** İki satır (başlık en çok 32 karakter, alt satırda kaynak ve tarih). Üst güvenli alanda platform UI'sına dikkat [own inference]: TikTok ve Shorts'ta sağ kenardaki ikon sütunu ile alttaki yaklaşık 20%'lik şerit güvenli alan dışında kalır.

## 3. Beat geçişleri

| Geçiş | Premium mu? | Uygulama, maliyet | Not |
|---|---|---|---|
| **Match cut** (ülke şekli → aynı şekil yakın plan; locator → ana globe) | Evet, en "editoryal" geçiş | Kameranın her iki beat'te aynı ekran konumuna oturması; sıfır ek pass | Planlama ister, en yüksek değeri verir [practitioner/own] |
| **Zoom-through** (uzaydan bölgeye, etiketin içinden geçiş) | Evet | Kamera dolly + 150 ms cross-fade, **D** | Harita haberciliğinin imza hamlesi |
| **Maske wipe** (ülke sınırı, graticule, rölyef luma'sı ya da çini deseni maskesi) | Evet, stil kimliği taşır | Mevcut id veya height texture'ı luma matte olur: `step(mask, t)`, **D** | Wipe'ı içerikten türetmek şablon hissini kırar |
| **Whip pan + motion blur** | Orta; seride en çok 1 kez | Hız vektörü boyunca 8–12 tap yönlü blur ya da subframe accumulation, **O–Y** | Sık kullanılırsa TikTok klişesi |
| **Push/slide kartları** | Nötr, güvenli | Canvas transform, **D** | Swiss ve ops stillerinde iyi çalışır |
| **Cross-dissolve** | Nötr | **D** | Kayıp beat'lerinde saygılı seçenek |
| **Light leak / film burn** | Ucuz ve aşırı kullanılmış | Additive gradyan, **D** | Yalnızca editorial paper'da %10 opaklıkla |
| **Glitch / RGB split** | Hayır | **D** | Sansasyonel ve "dezenformasyon" çağrışımlı; yasaklanmalı [own inference] |

## 4. Ses tasarımı

**Seslerin rolleri [practitioner]** ([esecut](https://esecut.com/blog/sound-effects-that-boost-engagement), [creatorsfx](https://creatorsfx.in/blog/best-sound-effects-for-reels-and-shorts)):
- Whoosh kesmeyi yumuşatır, pop/click metni "yerine oturtur", riser bir reveal'ı önceden haber verir, hit bir istatistiği "indirir".
- En sık hata aşırı kullanım. Öneri: videonun en önemli 3–5 beat'ine ses koymak, aynı kategoride 3–5 varyasyon döndürmek, whoosh seviyesini narasyonun %50–70'inde tutmak.

**20 saniyelik bütçe [own inference, practitioner kuralından türetildi]:**
- Sürekli 1 drone/bed.
- Beat değişimlerinde 3–4 whoosh.
- Kahraman reveal ve ana sayı için 1–2 hit.
- En çok 1 riser ya da açılışta 1 sub-drop.
- Rozet girişlerinde en çok 3 çok sessiz blip.
- Tick yalnızca sayaç sırasında.
- Toplam 6–9 cue, bunların 3–5'i "büyük".
- Kayıp beat'inde hit, riser ve tick yok; bed −6 dB, kısa bir sessizlik.
- Silah veya patlama kaydı hiç kullanılmaz; impact soyut bir "veri vuruşu" olmalı.

**Loudness:** Master için −14 LUFS integrated, true peak ≤ −1 dBTP (tercihen −1.5).
- YouTube ve Shorts'ta −14 hedefi pratikte yerleşik; yüksek miksleri yalnızca kısıyor ([clickyapps](https://clickyapps.com/creator/video/guides/lufs-targets-2025)) [measured/practitioner].
- TikTok ve Reels için bazı uygulayıcılar −10 ile −12 arası daha yüksek miks öneriyor ([trackgleam](https://trackgleam.com/learn/master-for-tiktok-reels-shorts)) [practitioner]. Tek master için −13/−14 önerilir.
- Mobil hoparlörde orta frekans netliği bastan önemli.
- İç dengeler [own inference]: VO (TTS) kısa vadede yaklaşık −16 LUFS, müzik/drone bed −28 ile −30 arası, VO sırasında 6–9 dB ducking (atak 80 ms, bırakma 300 ms).
- OfflineAudioContext LUFS ölçemez. ITU-R BS.1770 K-weighting (iki biquad) + 400 ms gating JS ile uygulanmalı ([ITU](https://www.itu.int/rec/R-REC-BS.1770)) [platform]. `DynamicsCompressorNode` true-peak limiter değildir; render sonrası buffer'a 4× oversample'lı lookahead limiter yazılmalı [own inference].

**Prosedürel tarifler (48 kHz OfflineAudioContext, tohumlu noise):** Temel dayanaklar MDN Advanced techniques, dev.to davul sentezi ve Tsugi noise tasarımı ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API/Advanced_techniques), [dev.to davul](https://dev.to/sendotltd/sample-free-drum-synthesis-in-web-audio-building-kick-snare-and-hi-hat-from-oscillators-in-60-2c0k), [Tsugi](https://tsugi-studio.com/blog/2024/09/17/design-sounds-from-noise-source-1/)) [platform/practitioner]. Parametre değerleri benim önerim [own inference]. `exponentialRamp` 0'a inemez; 0.001'e iner, sonra linear ile 0'a çekilir (MDN).

- **Whoosh (700 ms):** Pembe noise → paralel iki bandpass (Q 1.2 ve Q 6). Merkez frekansı 300 Hz → (%55'te) 2.5 kHz → 600 Hz. Gain envelope aynı eğriyi izler: 0→1 (385 ms, exp), 1→0 (315 ms). StereoPanner −0.6→+0.6 kamera yönünde. Tepe −18 dBFS.
- **Impact / "veri vuruşu" (600 ms):** Sinüs 110→45 Hz, 120 ms exp; gain 1→0.001, 600 ms. Üstüne noise burst → lowpass 1.8 kHz, 40 ms decay. Tohumlu, 1.2 s üstel sönen noise IR ile ConvolverNode, wet %15. Hafif WaveShaper `tanh(1.5x)`.
- **Tick (30 ms):** Sinüs 2.4 kHz, atak 1 ms, decay 25 ms. Üstüne highpass 5 kHz noise, 10 ms. Tohumlu ±50 cent detune. Hız ≤ 12–15/s, yoksa "makineli tüfek" gibi duyulur.
- **Riser (2 s):** 3 sawtooth (±7 cent) 200→800 Hz exp, lowpass 400 Hz→6 kHz. Highpass noise 1→8 kHz. Gain linear 0→0.5. Beat karesinden 1 kare önce kesin kesilir.
- **Sub-drop (1.2 s):** Sinüs 80→30 Hz, 900 ms exp; gain 0.8→0.001. Telefonda duyulsun diye WaveShaper ile 2. harmonik eklenir (60–160 Hz).
- **Radar/sonar ping (1.4 s):** Sinüs 1320 Hz→1300 Hz, atak 5 ms, 1.2 s exp decay. Geri beslemeli DelayNode 280 ms, feedback 0.35, döngüde lowpass 3 kHz. Yalnızca locator ya da "izleme" bağlamında.
- **Typewriter (karakter başına):** Noise 8 ms → bandpass 3.5 kHz Q 2, üstüne sinüs 180 Hz / 15 ms "thunk" −12 dB. Tohumlu ±8 ms jitter, boşluklar atlanır, en çok 20 karakter/s.
- **UI blip:** Üçgen dalga 880→1320 Hz, 60 ms, −24 dBFS. Çıkış sesi aynasıdır ve 3 dB daha sessizdir.
- **Drone bed:** Sawtooth 55 + 82.4 Hz (boş beşli; minör üçlü yok, melodram olmasın) → lowpass 300 Hz, cutoff'u 0.07 Hz LFO ±80 Hz. Pembe noise lowpass 500 Hz, −30 dB.
- **Pluck (paper, İznik, firefly için):** Karplus-Strong. 1/f uzunlukta tohumlu noise buffer + ortalama alma, 0.996 geri besleme.
- Hazır alternatif: **ZzFX** (MIT lisanslı, 20 parametre, buffer üretir) ([GitHub](https://github.com/KilledByAPixel/ZzFX)) [platform].

**Ücretsiz ve ticari kullanıma uygun SFX kaynakları:**

| Kaynak | Lisans | Atıf | Not |
|---|---|---|---|
| [Kenney Interface/UI Audio](https://kenney.nl/assets/interface-sounds) | CC0 | Gerekmez | UI blip ve click |
| [Freesound](https://freesound.org/help/faq/) (yalnızca CC0 filtresiyle) | CC0 / CC-BY | CC0'da gerekmez | CC-BY ve CC-BY-NC karışmasın |
| [Sonniss GDC bundle](https://sonniss.com/gdc-bundle-license/) | Royalty-free | Gerekmez | Ham SFX olarak yeniden dağıtım ve **AI eğitimi yasak** |
| [Mixkit SFX](https://mixkit.co/free-sound-effects/) | Mixkit License | Gerekmez | Müzik lisansı ayrı |
| [Pixabay](https://pixabay.com/service/license-summary/) | Pixabay Content License | Gerekmez | Tek başına dağıtım yasak; müzikte Content ID riski |
| [Zapsplat](https://www.zapsplat.com/license-type/standard-license/) | Standard | Ücretsiz planda **zorunlu** | Premium'da atıf gerekmez |
| BBC SFX Archive | RemArc | — | **Ticari kullanıma kapalı** ([MusicTech](https://musictech.com/news/music/the-bbc-sound-effects-archive-over-33000-free-samples/)) |

**Content ID tuzakları:**
- YouTube kuralına göre SFX, soundbed, production loop, CC ve public domain içerik ile münhasır olmayan lisanslar Content ID referansı olamaz ([YouTube Help](https://support.google.com/youtube/answer/2605065)) [platform].
- Buna rağmen popüler ücretsiz paketler ve özellikle müzikli stinger'lar yanlışlıkla ya da kötüye kullanımla eşleşebiliyor. Pixabay'deki bazı besteciler parçalarını Content ID'ye kaydediyor; itiraz lisans sertifikasıyla yapılıyor ([Pixabay blog](https://pixabay.com/blog/posts/how-to-clear-a-youtube-content-id-claim-with-a-pix-190/), [videoeditingsfx](https://videoeditingsfx.com/will-free-sound-effects-get-copyright-claimed/)) [practitioner].
- **Öneri [own inference]:** Tamamen prosedürel ses, yani sıfır dış dosya. Bu hem determinizmi hem claim riskini çözer. Dış dosya kullanılırsa yalnızca CC0 veya Sonniss, işlenmiş ve katmanlanmış olarak; kaynak, lisans ve indirme tarihi bir manifestte tutulur. Müzik stinger'ı hiç kullanılmaz.

## 5. Stil başına efekt kiti [own inference]

| Stil | 3–5 efekt | Rozet görünümü | Geçiş | Ses paleti |
|---|---|---|---|---|
| **Night red** | Pulse ring (2 halka), 7 günlük tek tonlu yoğunluk haritası, border draw-on, camera push, callout | Kırmızı yalnızca B1'de ve karenin %10'undan azında; diğer rozetler beyaz kontur. Kırmızı stroke ≥ 3 px (chroma) | Zoom-through, hard cut | Drone (boş beşli), soyut impact, açılışta sub-drop; radar yok |
| **Ops navy** | Inset locator + sonar ping, noktalı gemi rotası, graticule, parallax etiket, timeline | Kare köşeli monospace çipler, teal doğrulama pill'i. APP-6 sembolü ya da HUD yok | Graticule maske wipe, en çok 1 whip pan | Ping (yalnızca inset), blip, tick, temiz drone |
| **Editorial paper** | Kâğıt grain, mürekkep border draw-on, taralı choropleth, callout, before/after | Serif, damga benzeri dikdörtgenler. SON DAKİKA blok değil başlık üstünde kırmızı çizgi | Mürekkep maske wipe; en çok %10 light leak | Kâğıt hışırtısı (bandpass noise 2–5 kHz), kaynaklar için typewriter, pluck |
| **Satellite night** | Terminator, comet arc, atmosfer halkası, light sweep, DoF push | Koyu cam çipler, ince kontur | Uzaydan zoom-through; şehir ışıklarında match cut | Hava pad'i (noise + beşli), kamera whoosh'u, reveal'de sub-drop |
| **Firefly glow** | Additive olay noktaları, comet arc, glow'lu sparkline, olayları yakan timeline | Glow konturlu sayı rozetleri, minimal | Bloom üzerinden dissolve (≤ 250 ms) | Olay türüne göre pentatonik pluck (kayıplarda yok), tick |
| **Swiss relief** | Rölyefte güneş azimutu sweep'i, hipsometrik renk, parallax etiket, proportional symbol, inset | Izgaraya oturan düz dikdörtgenler, grotesk yazı; kırmızı yalnızca B1 | Grid'e hizalı push/slide, match cut | Minimal: click, sinüs bed, az whoosh |
| **Declassified dossier** | Typewriter reveal, damga rozeti (−3°, scale 1.3→1, 120 ms), redaksiyon çubuğu wipe, grain | "DOSYA / ARŞİV" motifi. Gerçek gizlilik ibaresi ("TOP SECRET") ya da kurum mührü **asla** kullanılmaz; sahte belge izlenimi kırmızı çizgi | Redaksiyon wipe | Typewriter, damga "thud"u (impact + noise), kâğıt kayması |
| **Topographic sheet** | Kontur reveal, koordinat ızgarası, ölçek çubuğu ve kuzey oku, başkentler arası mesafe yayı (silah menzili yok) | Pafta lejantı kutuları | Pafta kayması, kontur maske wipe | Kalem cızırtısı (modüle highpass noise), tick, yumuşak drone |
| **Iznik atlas** | Kobalt, turkuaz ve mercan paletinde desen dolgulu choropleth, varak çizgili border draw-on, varak shimmer (light sweep), kartuş inset | Kartuş formlu çipler (yuvarlak uç, çentik); SON DAKİKA mercan kırmızısı | Çini tesselasyon maske wipe | Kanun benzeri Karplus-Strong pluck, bendir benzeri alçak thump. Oryantalist klişeden (ney + makam bed) kaçınılmalı |

## Seçenekler

1. Bölüm 4'teki sekiz ses tarifini, bir manifestten 20 saniyelik mikse render eden bir `sfx` modülü olarak motion'a eklemek (BS.1770 ölçer ve limiter dahil).
2. Bölüm 2'deki rozet setini (B1–B8), doğrulama durumu ve SON DAKİKA koşulunu kayıt şemasına bağlayan bir tasarım ADR'ına dönüştürmek.
3. Önce yalnızca night red ve ops navy kitlerini, en ucuz 8 efektle (#1, 3, 5, 6, 13, 14, 15, 19) prototiplemek ve SwiftShader'da render süresini ölçmek.
4. Sınır ve kırmızı çizgi politikasını (tartışmalı sınırlar, pin ile halka ayrımı, kayıp gösterimi) ayrı bir kural belgesine yazıp CLAUDE.md'ye bağlamak.
