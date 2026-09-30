# Tipografi ve kinetik metin: Greater-Turkiye/motion için araştırma raporu

**Kapsam ve yöntem.** Hiçbir dosyaya ya da repoya dokunulmadı. Web arama kotası (200/200) oturumun başında dolmuştu. Bu yüzden kaynaklar bilinen URL'lerden doğrudan çekildi, GitHub API ve Crossref ile doğrulandı.

Her font için üç şey kontrol edildi. İlk ikisi google/fonts reposundaki (main, 2026-09-30) gerçek TTF'ten okundu: `cmap` tablosu ve `fvar` eksenleri. Lisans da aynı klasördeki `METADATA.pb` dosyasından alındı. Dosyalar bellekte ayrıştırıldı, diske bir şey yazılmadı. **"Doğrulandı"** demek şu: ğ Ğ ş Ş ı İ ç Ç ö Ö ü Ü ve â î û karakterlerinin hepsi fontun cmap tablosunda var.

Lisans tarafında OFL FAQ 1.1 "video titling" kullanımına açıkça izin veriyor. 1.1.1'e göre üretilen görsel ya da video OFL kapsamına girmiyor. 1.12 fontun gömülmesine, subset olarak da, izin veriyor. Kaynak: https://openfontlicense.org/ofl-faq/

---

## 1. Font adayları

Repo yolu her satırda `https://github.com/google/fonts/tree/main/<yol>`. "TRK locl" sütunu, fontun GSUB tablosunda Türkçe dil sistemi bulunup bulunmadığını gösteriyor.

| # | Font (yol) | Rol | Lisans | Variable eksenler | TR glifleri | TRK locl | Neden uygun |
|---|---|---|---|---|---|---|---|
| 1 | **Anton** (`ofl/anton`) | Hook başlık, ağır condensed | OFL | yok (static) | doğrulandı | var | Tek kelimelik vuruşlu hook için en yoğun siyah. `tnum` yok. |
| 2 | **Big Shoulders** (`ofl/bigshoulders`) | Condensed display | OFL | wght 100–900, opsz 10–72 | doğrulandı | var | Chicago kamu tabelası için yapılmış "American Gothic". Aynı ailede Stencil ve Inline kardeşleri var. |
| 3 | **Big Shoulders Stencil** (`ofl/bigshouldersstencil`) | **Stencil** | OFL | wght 100–900, opsz 10–72 | doğrulandı | var | Askeri ve lojistik konular için tek sistem içinde kalan stencil. |
| 4 | **Archivo** (`ofl/archivo`) | Grotesk, condensed'den wide'a | OFL | wght 100–900, **wdth 62–125** | doğrulandı | var | "Highlights and headlines" için tasarlanmış. Tek dosya hem dar hem geniş başlığı karşılıyor. `tnum` var. |
| 5 | **Anybody** (`ofl/anybody`) | **Wide extended display** | OFL | **wdth 50–150**, wght 100–900 | doğrulandı | var | Eurostile havası var, uç genişliklere çıkabiliyor. Harita üstünde bölge adı için iyi. |
| 6 | **Unbounded** (`ofl/unbounded`) | Wide display | OFL | wght 200–900 | doğrulandı | var | Latin ve Kiril destekli. Rusya/Ukrayna konularında çift alfabe gerekince işe yarar. |
| 7 | **Montserrat** (`ofl/montserrat`) | Altyazı ana fontu | OFL | wght 100–900 | doğrulandı | var | Geniş ve geometrik. i noktası, ğ breve ve ş cedilla ağır kesimde bile net kalıyor. |
| 8 | **Schibsted Grotesk** (`ofl/schibstedgrotesk`) | Haber markası grotesk | OFL | wght 400–900 | doğrulandı | var | Schibsted medya grubunun matbu yayıncılık mirasından geliyor. |
| 9 | **Sofia Sans Extra Condensed** (`ofl/sofiasansextracondensed`) | Dar etiket ve veri | OFL | wght 1–1000 | doğrulandı | var | Dar sütun ve tablo için. `tnum` var. |
| 10 | **Newsreader** (`ofl/newsreader`) | **Haber serifi** | OFL | wght 200–800, opsz 6–72 | doğrulandı | var | Production Type çizmiş, ekran için yapılmış. opsz 72'de manşet, 16'da gövde metni. |
| 11 | **Instrument Serif** (`ofl/instrumentserif`) | Condensed editoryal serif | OFL | yok | doğrulandı | var | Büyük boyut için yapılmış, çağdaş old-style. Johnny Harris / Vox tonuna yakın. [practitioner] |
| 12 | **Fraunces** (`ofl/fraunces`) | Yumuşak serif display | OFL | opsz 9–144, wght 100–900, SOFT 0–100, WONK 0–1 | doğrulandı | **yok** | İznik ve atlas estetiği için. SOFT ekseni animasyonla oynatılabiliyor. |
| 13 | **Martian Mono** (`ofl/martianmono`) | **Teknik mono** | OFL | wght 100–800, wdth 75–112.5 | doğrulandı | var | Koordinat, saat damgası ve HUD için. Width ekseni olan tek mono aday. |
| 14 | **JetBrains Mono** / **IBM Plex Mono** (`ofl/jetbrainsmono`, `ofl/ibmplexmono`) | Mono yedek | OFL | JBM: wght 100–800 · Plex: static | doğrulandı | JBM var, Plex yok | Tablo ve sayaç. Mono olduğu için rakamlar zaten eşit genişlikte. |
| 15 | **Black Ops One** / **Saira Stencil One** (`ofl/blackopsone`, `ofl/sairastencilone`) | Stencil ve damga | OFL | yok | doğrulandı | var | Black Ops One "military stencil lettering"den geliyor. Mühür ve damga için. |
| 16 | **Special Elite** (`apache/specialelite`) | Daktilo (dossier) | **Apache 2.0** | yok | doğrulandı | yok | Smith Corona ve Remington taklidi. Google yalnızca "latin" subset'i listeliyor ama cmap Türkçe glifleri içeriyor. Alternatif: **Courier Prime** (OFL, doğrulandı). |
| 17 | **Shantell Sans** (`ofl/shantellsans`) | **Marker ve el yazısı, harita notu** | OFL | wght 300–800, **INFM 0–100, BNCE −100–100**, SPAC | doğrulandı | var | Informality ve Bounce eksenleri deterministik biçimde "el titremesi" veriyor. Yedekler: **Caveat**, Caveat Brush, Sedgwick Ave Display (hepsi doğrulandı). |
| 18 | **Cinzel** (`ofl/cinzel`) | Kitabe tarzı büyük harf (İznik atlas) | OFL | wght 400–900 | doğrulandı | var | Klasik atlas kartuşu için. |

**Kaçınılacaklar (cmap ile doğrulandı).** Şu fontlarda **ğ Ğ ş Ş İ yok**:
- Permanent Marker (Apache): marker olarak en popüler seçenek, ama Türkçe için kullanılamaz.
- Rock Salt
- Gochi Hand
- Reenie Beanie
- Stardos Stencil
- Allerta Stencil

Covered By Your Grace ve Nothing You Could Do fontlarında **ı yok**.

Özet kural: Google'ın "latin-ext" etiketine güvenmeyin, font eklerken CI'da cmap testi yapın. Special Elite tersinin örneği: etiketi yalnızca "latin" ama glifler tam.

**Türkçe için mühendislik notları**
- **Büyük harfe çevirme.** `'istanbul'.toUpperCase()` sonucu `ISTANBUL`, yani yanlış. `toLocaleUpperCase('tr-TR')` sonucu `İSTANBUL` (https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/String/toLocaleUpperCase). Node ile denendi: `'IŞIK'.toLowerCase()` sonucu `işik` çıkıyor. `'İ'.toLowerCase()` ise 2 code unit döndürüyor (i + birleşik nokta). Bu yüzden önce NFC normalize edin, glifleri `Intl.Segmenter` ile grapheme bazında bölün.
- **`ctx.lang = 'tr'`.** Chrome 136+ ve Firefox 151+ destekliyor, Safari desteklemiyor (MDN BCD: https://github.com/mdn/browser-compat-data/blob/main/api/CanvasRenderingContext2D.json). MDN'nin kendi örneği Türkçe "fi" ligatürü (https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/lang). **Caveat** fontunda `f_i` ligatürü var ama TRK locl yok, bu yüzden Türkçe metinde `liga` kapatılmalı.
- **Variable eksenler.** Canvas 2D'de sayısal `font-weight` çalışıyor. `fontStretch` ise yalnızca anahtar kelime kabul ediyor (https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/fontStretch). wdth, opsz, SOFT ya da BNCE'yi animasyonla sürmek için öneri **harfbuzzjs** (MIT): `Font.setVariations()`, ardından `shape()`, ardından `glyphToPath()` ile `Path2D`'ye çizim (https://github.com/harfbuzz/harfbuzzjs, `src/font.ts`). Bunun ek faydaları:
  - Glif başına konum kerning ile birlikte gelir, per-glyph animasyonda kerning bozulmaz.
  - İşletim sisteminin rasterizer farkı ortadan kalkar, determinizm artar.
- **Rakam genişliği.** Anton, Big Shoulders ve Oswald'da `tnum` yok. Sayaçlarda her rakamı sabit genişlikte bir hücreye ortalayın. Hücre genişliği = en geniş rakamın advance değeri.
- **Sayı biçimi.** `Intl.NumberFormat('tr-TR')` sonuçları: `%50` ve `1.234.567,89` (Node ile doğrulandı). Yüzde işareti sayının önüne geliyor.

---

## 2. Kinetik teknikler (60 fps, deterministik)

**Ortak kurallar**
- Zaman yalnızca `t = frame/60` üzerinden hesaplanır. `Math.random` ya da `Date` kullanılmaz; seed'li PRNG kullanılır (ör. mulberry32).
- Metin düzeni blok başına **bir kez** hesaplanır, her karede yeniden ölçülmez. Aksi halde kerning karede karede zıplar.
- Fontlar yerel dosyadan `FontFace` ile yüklenir ve `await document.fonts.ready` beklenir.

**Easing sabitleri** (https://github.com/ai/easings.net/blob/master/src/easings.yml):

| Ad | cubic-bezier |
|---|---|
| outCubic | (0.33, 1, 0.68, 1) |
| outQuart | (0.25, 1, 0.5, 1) |
| outQuint | (0.22, 1, 0.36, 1) |
| outExpo | (0.16, 1, 0.3, 1) |
| inOutCubic | (0.65, 0, 0.35, 1) |
| inOutQuart | (0.76, 0, 0.24, 1) |
| outBack | (0.34, 1.56, 0.64, 1), c1 = 1.70158 |

Frame tabanlı spring için referans Remotion'ın varsayılanları: mass 1, damping 10, stiffness 100 (https://www.remotion.dev/docs/spring).

**Teknikler**

1. **Kelime kelime karaoke vurgusu**
   - Uygulama: TTS ya da forced-alignment çıktısındaki kelime zaman damgalarından sayfalar kurulur. Remotion'daki `combineTokensWithinMilliseconds` mantığı referans alınabilir; şablonu 1200 ms kullanıyor (https://www.remotion.dev/docs/captions/create-tiktok-style-captions).
   - Zamanlama: aktif kelime rengi, kelime başlangıcından **2–3 kare (33–50 ms) önce** değişmeli. Dayanak ITU-R BT.1359-1: ses görüntünün önüne geçtiğinde +45 ms'den, geride kaldığında −125 ms'den itibaren fark ediliyor; kabul edilebilirlik sınırı +90 / −185 ms (https://www.itu.int/rec/R-REC-BT.1359-1-199811-I/en) [measured; bu standart dudak senkronu için ölçülmüş, metne uygulanması bir çıkarım].
   - Seçenek: aktif kelimenin arkasında kayan bir "hap" plaka. Eski kutudan yenisine 6 karede, inOutCubic ile geçer.
   - Haber tonunda: her zaman uygun. Ucuz durduğu yer: her kelimeye ayrı renk verip zıplatmak.

2. **Kilit sayıda scale-punch**
   - Uygulama: 0–4. karede ölçek 1'den 1.15'e (outQuad), 4–14. karede 1.15'ten 1'e (outBack). Aynı anda 2 karelik vurgu rengi flaşı.
   - Uygun: sahne başına **tek** sayı için. Ucuz: her kelimede.

3. **Maske reveal (alttan yükselme)**
   - Uygulama: satır kutusuna `ctx.clip()` uygulanır. Kelimelerin y ofseti 1.1 × satır yüksekliğinden 0'a iner. Süre 18–24 kare, outExpo, kelimeler arası 3 kare gecikme.
   - En "prestijli" giriş bu. Uzun cümlelerde yavaş kalır.

4. **Slot makinesi rakam yuvarlama**
   - Uygulama: her hanede 0–9 dizilmiş dikey bir şerit, hücreye clip edilir. Hedef ofset `(hedef + 10k) × satır yüksekliği`. Süre 36–48 kare, outQuart; haneler arasında sağdan sola 3–4 kare gecikme.
   - Hareket bulanıklığı istenirse aynı karede 3 alt örnek alfa ile üst üste çizilir; bu da deterministik.
   - Uygun: bütçe, kayıp sayısı gibi değerler. Ucuz: küçük sayılarda.

5. **Fosforlu kalem süpürmesi**
   - Uygulama: kelimenin arkasına bir dikdörtgen çizilir. Yükseklik 0.62 em, x-height çevresinde. Genişlik 0'dan w'ye 14–20 karede, inOutCubic ile büyür. −2° ile −3° arası eğim verilir, kenar pürüzü seed'li gürültüyle üretilir.
   - Kağıt zeminde `globalCompositeOperation = 'multiply'`, renk #FFE14D, alfa %85.
   - Johnny Harris kupür estetiği [practitioner/gözlem]. Kağıt ve dosya stillerinde çok iyi. Gece haritasında ucuz durur.

6. **Split-flap**
   - Uygulama: her hücre sabit bir alfabede ilerler. Türkçe 29 harf sırası: A B C Ç D E F G Ğ H I İ J K L M N O Ö P R S Ş T U Ü V Y Z. Her 3 karede bir flip yapılır: üst yarı scaleY 1'den 0'a 1.5 karede, alt yarı 0'dan 1'e. Hücre başına 2 kare başlangıç gecikmesi.
   - Uygun: zaman çizelgesi ve "kalkış tahtası" anları. Ucuz: 12 karakteri aşan metinde.

7. **Hatasız daktilo**
   - Uygulama: tüm dize bir kez shape edilir. Görünürlük grapheme sayacıyla açılır, 2 karede 1 grapheme (30 cps). Caret 30 karelik periyotla yanıp söner.
   - Alt dizeyi her karede yeniden ölçmeyin; aksi halde harfler titrer.
   - Dossier stili için ideal.

8. **Harita yolu üzerinde metin**
   - Uygulama: coğrafi çizgi her karede ekran uzayına projekte edilir, kümülatif yay uzunluğu hesaplanır. Her glif `s0 + advance_i` noktasına yerleştirilir ve oradaki teğet açısıyla döndürülür. Teğet, glif genişliği boyunca ortalanarak yumuşatılır. Açı 90°'yi geçerse yol ters çevrilir, böylece yazı baş aşağı dönmez.
   - Uygun: nehir, sınır, rota. Ucuz: kıvrımlı yolda uzun cümle.

9. **Alt çizgi çizimi**
   - Uygulama: `setLineDash([L, L])` ve `lineDashOffset = L × (1 − p)`. Süre 12–18 kare, outCubic. El çizimi varyantı için seed'li, hafif dalgalı bir bezier.

10. **Üstü çizili düzeltme (iddia → gerçek)**
    - Uygulama: çizgi 10 karede çizilir. Yanlış kelime %40 opaklığa iner. 12 kare sonra doğru kelime marker fontla (Shantell Sans) üstünde belirir.
    - Uygun: fact-check anları. Ucuz: şaka amaçlı kullanım.

11. **Sticker ve rozet pop**
    - Uygulama: ölçek 0 → 1.1 → 1, 10–14 karede outBack. Dönüş −6°'den −3°'ye. Sert gölge (6 px, 6 px, blur 0).
    - Uygun: "DOĞRULANDI" rozeti ya da kaynak etiketi. Ucuz: gradyan, bevel, parlaklık efektleri.

12. **3D perspektif eğim**
    - Canvas 2D yalnızca affine dönüşüm yapabiliyor. Metin offscreen canvas'a çizilir, sonra mevcut **WebGL2** katmanında perspektifli bir quad olarak gösterilir: rotateX 0°'den 12°'ye, 30 kare, inOutQuart. Harita kamerasıyla paralaks verilebilir.
    - Ucuz durduğu yer: WordArt gibi dönen metin.

13. **Tracking-in başlık**
    - Uygulama: `ctx.letterSpacing` 0.25 em'den 0.02 em'e, 30 karede outQuart; opaklık 0'dan 1'e. Chrome 99+ destekliyor.
    - Sinematik bir giriş. Yalnızca bölüm başlıklarında kullanılmalı.

---

## 3. Sessiz izlemede retention'ı artıran altyazı stili

**Kanıtlar**
- [measured, platform içi test] Meta: altyazılı video reklamlar izlenme süresini ortalama **%12** artırıyor (https://www.facebook.com/business/news/updated-features-for-video-ads).
- [practitioner/yayıncı beyanı] Facebook videolarının **%85**'i sessiz izleniyor. Digiday, 2016 (https://digiday.com/media/silent-world-facebook-video/).
- [measured, anket, n=5.616, 2019] Verizon Media ve Publicis: izleyicilerin **%80**'i altyazı varsa videoyu sonuna kadar izleme ihtimalinin daha yüksek olduğunu söylüyor (https://www.3playmedia.com/blog/verizon-media-and-publicis-media-find-viewers-want-captions/).
- [measured, derleme] Gernsbacher 2015: 100'den fazla çalışma altyazının anlama, dikkat ve hatırlamayı artırdığını gösteriyor (https://pmc.ncbi.nlm.nih.gov/articles/PMC5214590/).
- [platform guidance] Netflix Türkçe altyazı kılavuzu: en fazla 2 satır. Okuma hızı yetişkin içerikte **17 karakter/sn**, çocuk içeriğinde 13. 1–9 arası sayılar yazıyla, 9'un üstü rakamla yazılıyor (https://partnerhelp.netflixstudios.com/hc/en-us/articles/215342858-Turkish-Timed-Text-Style-Guide).
- [practitioner] Remotion TikTok şablonunun değerleri (https://github.com/remotion-dev/template-tiktok/blob/main/src/CaptionedVideo/Page.tsx):
  - Font boyutu 120 px, metin genişliğin %90'ına sığdırılıyor.
  - 20 px siyah stroke, `paint-order: stroke` ile; dışarıda görünen kısım yaklaşık 10 px.
  - Aktif kelime rengi **#39E508**.
  - Alttan 350 px yukarıda.
  - Giriş: spring damping 200, 5 kare; ölçek 0.8 → 1, y ofseti 50 → 0.
  - Kullandığı "The Bold Font" OFL değil, lisansı belirsiz; kullanmayın.

**Safe zone**
- [platform guidance, TikTok'un resmi In-Feed şablon PNG'sinden piksel ölçümü] 1080×1920 için güvenli alan iki parça:
  - Üst bölge: x 120–960, y 240–840.
  - Alt bölge: x 120–780, y 840–1260. Sağdaki buton sütunu nedeniyle sağ marj burada 300 px.
  - Kaynak: https://ads.tiktok.com/help/article/video-ads-specifications?lang=en. TikTok, alanın reklam metninin satır sayısına göre değiştiğini belirtiyor.
- [ikincil kaynak] Reels: üstte %14 (250 px), altta %20 (340 px) boş bırakılmalı (https://sproutsocial.com/insights/social-media-video-specs-guide/). Meta'nın resmi sayfası makine tarafından okunamadı: https://www.facebook.com/business/help/980593475366490
- YouTube Shorts için resmi piksel değeri doğrulanamadı. En sıkı zarf olarak TikTok'unkini kullanın.

**Önerilen spesifikasyon**
- **Font:** Montserrat 800 ya da Archivo 800. Büyük harf yalnızca 1–2 kelimelik sayfalarda ve `tr-TR` locale ile.
- **Boyut:** 76–96 px. 660 px maksimum genişliğe sığdırın. "Cumhurbaşkanlığı" gibi 16 harfli kelimeler olağan.
- **Stroke:** Dış kenar 7–9 px. Önce `strokeText` (lineWidth 14–18, `lineJoin = 'round'`), **sonra** `fillText`. Ters sırada çizerseniz stroke glifi inceltir, i noktasını ve ğ breve'sini yer.
- **Plaka:** Uydu görüntüsü gibi yoğun zeminlerde rgba(10,10,12,0.72), radius 14, padding 18/10.
- **Aktif kelime rengi:** Tek bir vurgu rengi (#FFD400 ya da marka rengi). Söylenmemiş kelimeler ya gizli ya %55 opaklıkta.
- **Sayfa kuralları:**
  - Sayfa başına 1–3 kelime, en fazla 16 karakter, en fazla 1200 ms.
  - Sayfa süresi en az `karakter / 17` saniye; daha kısaysa sayfaları birleştirin.
  - Özel adları ("Kızıl Deniz"), sayı ile birimi ("3,2 milyar $") bölmeyin.
- **Konum:** Altyazı bandı y 1040–1240, x merkezi yaklaşık 450. Hook başlık bandı y 240–600.

---

## 4. Görsel stil eşleştirmeleri

| Stil | Font eşleşmesi | Hareket dili |
|---|---|---|
| Karanlık gece haritası | Big Shoulders 800 (opsz 72) + Martian Mono 400 | Maske ile yükselme, sayılarda slot yuvarlama, koordinatlarda 30 cps daktilo. Glow yalnızca vurguda. |
| Uydu | Archivo 800 wdth 75 + JetBrains Mono | Zorunlu plaka. HUD köşe braketleri lineDash ile çiziliyor, callout çizgileri 12 karede uzuyor, scan-line reveal. |
| Editoryal kağıt | Newsreader 700 (opsz 72) + Schibsted Grotesk 500 | Fosforlu kalem süpürmesi (multiply), alt çizgi çizimi, üstü çizili düzeltme. |
| Fotokopi dossier | Special Elite / Courier Prime + Black Ops One (damga) | Grapheme daktilo. Damga vuruşu: ölçek 1.4 → 1, 6 karede, ardından 2 karelik seed'li sarsıntı. Karartma çubuğu reveal. |
| Topografik pafta | Archivo wdth 62, büyük harf, tracking +%8, + Martian Mono | Kontur ve nehir boyunca path üzerinde metin, leader çizgileri. Yavaş (inOutCubic, 24–36 kare). |
| İznik çini atlas | Cinzel 700 + Fraunces italik (opsz 144, SOFT 50) | Kartuş çerçevesi çizimi, glif başına 2 kare gecikmeli fade. Zıplama yok. Renkler: kobalt #1F4E9C, mercan #C8342B, turkuaz #2A9D8F. |
| Ateş böceği glow | Unbounded 300–500 + Martian Mono | İki geçişli `shadowBlur` (8 px ve 24 px). Harfler sırayla yanıyor, seed'li 3 karelik titreme. |
| İsviçre rölyef | Schibsted Grotesk 500/700 + Newsreader italik (su adları) | Minimal hareket: opaklık ve 8 px y ofseti, 18 kare outQuart. Kartografik kural: su adları italik, bölgeler büyük harf ve açık aralıklı. |

---

## 5. Ucuz görünen hatalar

1. Türkçe harf hataları: `ISTANBUL`, glif eksikliğinden fallback fonta düşen ğ ve ş. Türk izleyicinin ilk fark edeceği ucuzluk sinyali bu.
2. Condensed görünümü `scaleX` ile taklit etmek, faux bold ya da faux italic kullanmak. Bunun yerine gerçek wdth ve wght eksenleri kullanılmalı.
3. İkiden fazla aile (mono hariç) ya da ikiden fazla vurgu rengi.
4. Her kelimede outBack zıplaması ya da scale-punch.
5. Stroke'u fill'in üstüne çizmek, miter uçlarında sivri çıkıntılar, büyük yumuşak gri gölge, bevel, gradyan dolgu.
6. Platform arayüzünün altına düşen metin. Ekrandaki başlıkla altyazının çakışıp aynı metnin iki kez görünmesi.
7. 17 cps'yi aşan altyazı sayfaları. Karaoke vurgusunun sesten 45 ms'den fazla geride kalması.
8. Sayaçlarda orantılı rakamlar yüzünden titreme. "50%" ile "%50" ya da "1,234.5" ile "1.234,5" gibi locale karışıklıkları.
9. Ciddi çatışma haberlerinde meme fontları (Impact, Komika), glitch ya da RGB-split geçişler.
10. Emoji ve sticker yığını; ikinci satırda tek başına kalan kelime.

---

**Açık kalanlar**
- Kanal atıfları (Johnny Harris, Vox, TLDR) gözleme dayanıyor, kaynakla doğrulanmadı.
- Meta Reels ve YouTube Shorts için resmi safe-zone sayfaları okunamadı.
- Rashid ve ark. 2008, "Dancing with Words" (animasyonlu altyazı) çalışmasının varlığı DOI ile doğrulandı (10.1080/10447310802142342), ancak özetine ulaşılamadığı için bulguları aktarılmadı.

Web araması yeniden gerekirse `CLAUDE_CODE_MAX_WEB_SEARCHES_PER_SESSION` değerinin yükseltilmesi gerekiyor.
