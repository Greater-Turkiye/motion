# Motion: kısa video anlatı, seslendirme ve TTS araştırma raporu (30 Eylül 2026)

Kanıt etiketleri şöyle: **[measured]** yayımlanmış ölçüm ya da çalışma, **[platform]** platformun kendi kuralı ya da verisi, **[practitioner]** uygulayıcı ya da satıcı beyanı, **[own inference]** benim çıkarımım.

**Kısa sonuç**
- **Kanca:** Soru ve öfke kancaları yasak. Bu durumda en güçlü üç kanca şunlar: (a) yer ve tarih damgası, (b) atıflı sayı, yani kaynak adı ile sayı aynı karede, (c) kendi veri setimizden hesaplanan örüntü ("kayıtlarımızda son 7 günde 23.").
- **Seslendirme:** Harita anlatımında seslendirmenin anlamayı artırdığına dair güçlü dolaylı kanıt var. Ama izleyicinin yarısı sessiz izliyor. Bu yüzden ses yalnızca ekrandaki metni tamamlamalı, onun yerine geçmemeli.
- **Ses–metin eşleme:** Sözcük zamanlaması için WhisperX'in `align()` işlevi (BSD-2) ve Türkçe wav2vec2 modeli (CC-BY-4.0) uygun. Kontrol için MFA'nın Türkçe modeli (CC BY 4.0) kullanılabilir. AGPL lisanslı araçlardan (aeneas, whisper-timestamped) kaçının.
- **TTS önerisi:** Birincil seçenek **FreyaTTS-small** (kod ve ağırlıklar Apache-2.0, önce Türkçe için tasarlanmış, CPU'da gerçek zamandan hızlı). Yedek seçenek **Chatterbox Multilingual v3** (kod ve ağırlıklar MIT, PerTh filigranı hep açık, CPU'da yaklaşık 3 kat yavaş). Pocket TTS Turkish en hızlı ve en anlaşılır model gibi görünüyor, ama eğitim verisinin kaynağı belirsiz; bu netleşene kadar yalnızca test edilmeli.
- **Etiket:** Meta ve TikTok'ta gerçekçi sentetik ses için etiket gerekiyor. YouTube'un üç ölçütüne göre gerçek bir kişiyi taklit etmeyen anlatıcı sesi zorunlu değil. Her üç platformda da açıklamaya sabit bir cümle konmalı.

---

## 1. Kayıt aileleri

### 1.0 Ortak iskelet ve ortak kurallar
**20 saniyelik varsayılan akış:**

| Süre | Vuruş |
|---|---|
| 0–2 s | Kanca: harita görüntüsü ve büyük metin. İlk karede yer ve tarih bilgisi olmalı. |
| 2–7 s | Ne oldu: kaynağın kendi sözcükleri ve atıf ("X'e göre"). |
| 7–12 s | Nerede: kamera hareketi ve konum işareti. |
| 12–17 s | Bağlam: veri setinden hesaplanan tek bir istatistik. |
| 17–20 s | Kaynak, doğrulama rozeti ve "Sentetik ses" etiketi. |

- **Neden ilk 2 saniye kritik:** TikTok ve Instagram'da haber tüketiminin %54–55'i kullanıcı başka bir şeye bakarken, rastlantısal oluyor. YouTube'da ise %55 bilinçli arama var. Kanca hem görsel hem sesli olarak ilk saniyede çalışmalı. [platform/measured, DNR 2026]
- **Platform rehberi:** TikTok ana mesajı ilk 3 saniyede vermeyi, metin katmanında saniyede 5–10 sözcük göstermeyi öneriyor. [platform] Haber içeriği için alt sınır olan 5'te kalın. [own inference]
- **Güven ortamı:** Türkiye'de habere güven %28. 60'ı aşkın oranla haberden kaçınma eğiliminin olduğu dört ülkeden biri. Sakin ton ve kaynağın önde olması bu kitlede avantaj sağlar. [measured, DNR 2026]
- **Hesaplanan bağlamın dili:** Her zaman "kayıtlarımızda" denmeli. Veri setimiz gerçekliğin tamamı değil, bu yüzden "Kiev'e 23 saldırı oldu" denmemeli. [own inference]
- **Konum hassasiyetine dürüstlük:** Konum il ya da ilçe düzeyinde biliniyorsa iğne yerine yarıçaplı daire çizin. Nişangah, kırmızı flaş, patlama ikonu ve 3B dramatik eğim kullanmayın; bunlar hedefleme ve dramatizasyon kırmızı çizgilerine yakın. [own inference]
- **Animasyon:** Aynı anda tek bir değişken animasyonla değişsin. Animasyonlu haritalarda bilişsel yük hızla doluyor (Harrower 2007). Animasyon, statik görsele ancak içerikle uyumlu ve kolay algılanır olduğunda üstün geliyor (Tversky ve ark. 2002). [measured]
- **Şablon riski:** YouTube, "jenerik şablonlarla, seri üretim izlenimi veren" içeriği Temmuz 2025'ten beri "inauthentic content" olarak sayıyor ve YPP gelirinden çıkarabiliyor. [platform] Her videodaki hesaplanan bağlam vuruşu ve seri kimliği bu riske karşı en iyi savunma. [own inference]

### 1.1 Kinetik: saldırı, İHA, füze, topçu, çatışma
**Kancalar:**
1. Yer ve tarih damgası: "HARKİV · 29 EYLÜL · İHA saldırısı".
2. Atıflı sayı: "Vali: 3 ölü, 12 yaralı". Atıf ile sayı hep aynı karede olmalı.
3. Örüntü: "Kayıtlarımızda Kiev çevresinde son 7 günde 23. saldırı".
4. Silah türü etiketi: "Balistik füze · Dnipro".
5. Türkiye'ye mesafe (Karadeniz kayıtları için): "Odesa limanı · İstanbul'a 620 km".
6. "3 maddede" kartı: Ne / Nerede / Kim açıkladı.

**Akış (20 s):**

| Süre | Vuruş |
|---|---|
| 0–2 | Karadeniz çerçevesinde, Türkiye kıyısı görünür durumdayken 0,5 sn bekleme; ardından şehre uçuş. |
| 2–8 | Başlık sözcükleri ve atıf. |
| 8–13 | Konum dairesi; son 7 günün kayıtları gri noktalar halinde 3 sn'lik zaman atlamalı olarak belirir. |
| 13–17 | Bağlam sayacı. |
| 17–20 | Kaynak ve doğrulama. |

**Harita:** Yukarıdan bakan 2B görünüm ve nötr renkler. Seslendirmede şehir adı geçerken hafif yakınlaştırma yapılır.

**Bağlam için hesaplanacaklar:** R km yarıçapta 7 ve 30 günlük kayıt sayısı, aynı yerdeki son kayıttan bu yana geçen gün, bölgenin bu haftaki kayıt payı, Türkiye kıyısına ya da sınırına mesafe.

**Seri:** "Haftanın Haritası" (bölge bazında 7 günlük nokta haritası, 25 sn) ve "Bölge Nabzı: Son 7 Gün".

### 1.2 Diplomatik açıklama ve üst düzey görüşme
**Kancalar:**
1. Doğrudan alıntı ve konuşmacı: "'…' — Dışişleri Bakanı X".
2. İki bayrak, bölünmüş ekran: "Ankara · Bakü".
3. Mekân damgası: "Cenevre · 30 Eylül".
4. Sayaç: "Kayıtlarımızda X–Y arasında bu yıl 4. görüşme".
5. "Kayıtlarımızda ilk" (veri setinin başlangıç tarihiyle birlikte).

**Akış:** 0–3 alıntı kartı · 3–7 kim, nerede · 7–12 başkentten görüşme yerine yay animasyonu · 12–17 son üç görüşme tarihinin zaman çizelgesi · 17–21 kaynak.

**Harita:** İki ülke vurgulanır, büyük daire yayı çizilir. Küçük yerbulucu harita yeterli; ayrıntılı haritaya gerek yok.

**Bağlam için hesaplanacaklar:** İkili arasında 12 aydaki N'inci temas, son temastan bu yana geçen gün, konuşmacının bu konudaki açıklama sayısı.

**Seri:** "Diplomasi Takvimi (haftalık)" ve "İkili Karnesi" (bir ülke çifti, bir yıl).

### 1.3 Savunma anlaşması, tedarik sözleşmesi, üs anlaşması
**Kancalar:**
1. Değer önce (başlıkta varsa): "2,1 milyar dolar · X–Y".
2. Kalem önce: "40 F-16".
3. "İmza: X ve Y".
4. Sayaç: "X'in bu yılki 3. savunma anlaşması".
5. Tedarikçiden alıcıya yay.
6. "Kayıtlarımızda ilk üs anlaşması".

**Akış:** 0–2 · 2–8 taraflar, kalem, değer (kaynak sözcükleriyle) · 8–13 yay ya da ev sahibi ülkenin ülke düzeyinde vurgusu · 13–18 alıcının bu yılki anlaşma ağını gösteren mini ağ grafiği · 18–22 kaynak.

**Harita:** Üs anlaşmalarında yalnızca ülke düzeyinde gösterim yapılır. Türkiye'nin taraf olduğu hiçbir kayıtta tesis ya da birlik konumu gösterilmez. [own inference, kırmızı çizgi]

**Bağlam için hesaplanacaklar:** Çiftin N'inci anlaşması, alıcının bu yılki anlaşma ve ortak sayısı, en sık ortağı.

**Seri:** "Anlaşma Takibi" (aylık) ve "Kim Kimden Alıyor" (ağ haritası).

### 1.4 Askerî tatbikat
**Kancalar:**
1. Ad kartı: "DYNAMIC MANTA 2026".
2. Katılım: "11 ülke · Doğu Akdeniz".
3. Mesafe: "Tatbikat alanı Türkiye kıyısına 90 km".
4. Tarih aralığı: "12–19 Ekim".
5. Sayaç: "Kayıtlarımızda bu yıl Doğu Akdeniz'de 5. tatbikat".

**Akış:** 0–2 ad ve deniz alanı · 2–7 bayrak sırası ve tarihler · 7–13 alan (poligon ya da deniz adı), en yakın Türkiye kıyı noktasına km etiketli çizgi · 13–18 aynı denizde yıllık sayı ve varsa "her yıl yapılıyor" bilgisi · 18–22 kaynak.

**Harita:** Çekişmeli deniz yetki alanı (MEB) çizgileri çizilmez. Mesafe, kıyı çizgisinden düz ölçülür. [own inference]

**Seri:** "Tatbikat Takvimi: Bu Hafta" (Ege, Akdeniz, Karadeniz, Baltık).

### 1.5 Politika ve yaptırım açıklaması
**Kancalar:**
1. Alıntı ve konuşmacı ülke.
2. "Yaptırım: X → Y" oku.
3. Paket numarası (başlıkta varsa): "20. yaptırım paketi".
4. Sayaç: "X'in Y'ye yönelik bu yılki 6. açıklaması".
5. "3 maddede".

**Akış:** 0–3 alıntı · 3–7 kim, hangi görevde · 7–12 ok haritası · 12–17 bağlam · 17–21 kaynak.

**Harita:** En az düzeyde; metin öncelikli, küçük yerbulucu yeterli.

**Seri:** "Yaptırım Defteri".

### 1.6 Tek tarafın kayıp ve sayı iddiası
**Kancalar:**
1. Atıf önce: "Ukrayna Genelkurmayı: 1.540".
2. "Tek taraflı açıklama" rozeti.
3. Aynı kaynağın önceki günüyle kıyas.
4. Aynı kaynağın 7 günlük toplamı (etiket: "kaynağın açıklamalarına göre").
5. "Bağımsız doğrulama yok" bandı.

**Akış:** 0–2 · 2–7 iddia cümlesi aynen · 7–12 aynı kaynağın 30 günlük çubuk ya da çizgi grafiği · 12–16 doğrulama durumu açıkça · 16–20 kaynak.

**Görsel:** Harita değil grafik kullanılır. İnsan ikonu ya da ceset sembolü kullanılmaz. Farklı tarafların iddiaları aynı grafikte toplanmaz. [own inference]

**Seri:** "İddia Defteri" (haftalık; kaynak bazında, kıyas yapmadan).

### 1.7 Deniz olayları
**Kancalar:**
1. Deniz damgası: "Karadeniz · Odesa açığı".
2. Gemi tipi ve bayrak: "Panama bayraklı tanker".
3. Boğaza mesafe: "İstanbul Boğazı'na 380 km".
4. Sayaç: "Kayıtlarımızda bu ay Karadeniz'de 4. deniz olayı".
5. Liman ya da rota bağlamı.

**Akış:** Standart iskelet. 7–13 aralığında yaklaşık konum dairesi, ana rotalar ve limanlar gösterilir. İz animasyonu yalnızca kaynak rota veriyorsa yapılır.

**Seri:** "Karadeniz Günlüğü".

### 1.8 Hava sahası ve hava faaliyeti
**Kancalar:**
1. "Hava sahası · Baltık".
2. Uçak tipi ve sayısı: "2 bombardıman uçağı".
3. FIR adı.
4. Sayaç: "Kayıtlarımızda bu ay Baltık'ta 6."
5. Mesafe.

**Harita:** FIR sınırları gösterilir; radar tarama efekti kullanılmaz. Ege'de 6/10 mil uyuşmazlığı nedeniyle hava sahası sınırı çizilmez. [own inference]

**Seri:** "Hava Sahası Bülteni".

---

## 2. Seslendirme

### 2.1 Kanıt: seslendirme izlenmeyi artırır mı?
- **Modalite etkisi:** Görsel artı anlatım, görsel artı ekran metninden daha iyi öğrenme sağlıyor. Ginns 2005 meta-analizi, etki sistemin hızı belirlediğinde (kısa videoda olduğu gibi) daha güçlü. [measured] Sınırlaması: bu çalışmalar izleme süresini değil, öğrenmeyi ölçüyor.
- **Sessiz izleme:** Yetişkinlerin %50'si "genelde sesi kapalı izlerim" diyor; %80'i altyazı varsa videoyu sonuna kadar izlemeye daha yatkın (Verizon/Publicis, 2019, n=5.616 ABD yetişkini). [measured] Bu yüzden metin katmanı birincil taşıyıcı kalmalı.
- **Sentetik sesin etkisi:** Modern TTS, öğrenme çıktılarında insan sesine yakın sonuç veriyor; eski TTS geride kalıyor (Craig ve Schroeder 2017). [measured]
- **İzleyici tutumu:** "Çoğunluğu yapay zekâ ile, insan denetiminde üretilmiş habere" rahat bakanlar %19; "insanın yapay zekâ yardımıyla ürettiği habere" rahat bakanlar %36. Kamuya dönük çıktılarda açık bildirim bekleniyor (RISJ 2024). [measured]
- **Eksik kanıt:** Harita anlatımlı kısa haber videolarında "sesli / sessiz" A/B testi yayımlanmış bulamadım.
- **Önerilen kendi testiniz:** [own inference]
  - İki hafta boyunca aynı aile için sesli ve yalnızca müzikli varyantları karşılaştırın.
  - Ölçütler: YouTube Shorts'ta "izlendi / kaydırıldı" oranı ve ortalama izlenme yüzdesi.
  - Karar kuralı: Seslendirme kaydırma oranını düşürmüyorsa, sayı okuma hatası riskini taşımaya değmez.

### 2.2 Türkçe haber kısası için yazım kuralları
- **Hızı hece ile ölçün.** Türkçede hece sayısı ünlü harf sayısına eşit, bu yüzden hesaplaması kolay. Hedef saniyede 4,5–5,5 hece. 20 saniyelik ses yaklaşık 90–105 hece, yani yaklaşık 30–38 sözcük eder. [own inference] Diller arası konuşma hızı saniyede 4,3–9,1 hece aralığında değişiyor (Coupé ve ark. 2019). [measured] Kendi TTS çıktınızın gerçek hızını ölçüp bütçeyi ona göre ayarlayın.
- **Cümle yapısı:** Cümle başına en fazla yaklaşık 10 sözcük ya da 25 hece ve tek olgu olmalı. Ortaç zincirlerinden (-dığı, -en) kaçının. Özne–nesne–yüklem dizilişi nedeniyle yer ve zaman öbeği başa gelmeli: "Harkiv'de dün gece…".
- **Atıf cümlenin başında olmalı:** "Bölge valisine göre…". Fiiller nötr olmalı: açıkladı, bildirdi, duyurdu. Ünlem, retorik soru ve yoğunluk sıfatı kullanılmaz.
- **Sayılar:** TTS'e metin olarak açılmış biçimde verilir; ekranda rakam kalır. Karakter düzeyinde çalışan FreyaTTS için bu dönüştürme şart.
  - 1.540 → "bin beş yüz kırk"
  - %12 → "yüzde on iki"
  - 3. → "üçüncü"
  - 12–19 Ekim → "on iki ile on dokuz Ekim arasında"
  - 2,5 milyar → "iki buçuk milyar"
  - Bir cümlede en fazla iki sayı olsun. Koordinat asla okunmaz.
  - Kaynak yuvarlamıyorsa siz de yuvarlamayın.
- **Kısaltma sözlüğü:** Örnekler: NATO → "nato", ABD → "a-be-de", AB → "a-be", BM → "be-me", İHA → "iha", F-16 → "ef on altı", S-400 → "es dört yüz". Sözlük depoda tutulmalı ve her girdinin ses örneği test edilmeli.
- **Yabancı yer adları (TDK kuralları):**
  - Latin alfabeli adlar özgün biçimiyle yazılır.
  - Yerleşik adlar Türkçe biçimiyle yazılır: Atina, Londra, Moskova.
  - Rusça adlar Türk harfleriyle aktarılır: Puşkin, Moskova.
  - Arapça adlar Türkçe ses yapısına göre yazılır: Bağdat.
- **Gazetecide iki alan tutun:** `display_name` (ekranda görünen yazım) ve `tts_name` (sesletim için yazım). Örnekler: Wrocław → "Vrotsuav", Zaporizhzhia → "Zaporijya". Türkçe imla neredeyse fonetik olduğundan, sesletim alanına Türkçe harflerle yazılmış biçimi koymak çoğu modelde telaffuzu düzeltir. [own inference]
- **Kapanış cümlesi sabit olsun:** "Kaynak: X. Bu bilgi bağımsız olarak doğrulanmadı."

### 2.3 Ekran metni ile anlatımı eşleme
**Boru hattı:**
1. Ekran metni ve konuşma metni, eşlemeli belirteçlerle birlikte üretilir.
2. TTS sesi üretir.
3. Zorunlu hizalama (forced alignment) ile sözcük zaman damgaları çıkarılır.
4. Bu damgalar şablon anahtar karelerini, metin vurgusunu, kamera hareketini ve müzik alçaltmayı sürer.
5. ASR gidiş-dönüş kontrolü yapılır.

**Kurallar:** [practitioner/own inference]
- İfade, konuşulmadan 0–200 ms önce ekranda belirir.
- Her ifade ekranda en az 1,2 sn kalır.
- Dikey güvenli alanda en fazla 2 satır × yaklaşık 22 karakter.
- Kamera, yeri anan cümlenin başında hareket etmeye başlar.
- Metin sözcük ortasında değişmez.
- Kaynak alıntısı okunurken karaoke tarzı sözcük vurgusu kullanılır. Bu, aynı metni hem gösterip hem okumanın yarattığı fazlalığı, izleyicinin dikkatini yönlendiren bir işarete dönüştürür. [own inference; Mayer'in işaretleme ve fazlalık ilkelerinden]

**ASR geçidi:** Üretilen ses faster-whisper ile yeniden yazıya dökülür. Sayılar ya da özel adlar tutmazsa ses farklı seed ile yeniden üretilir. İki denemede de tutmazsa video yalnızca metinli sürümle yayımlanır. [own inference]

| Araç | Kod lisansı | Türkçe | Not | Karar |
|---|---|---|---|---|
| WhisperX `align()` | BSD-2 | Evet: `mpoyraz/wav2vec2-xls-r-300m-cv7-turkish`, model lisansı CC-BY-4.0 | CPU'da int8 çalışıyor; bilinen metni hizalıyor | **Birincil** |
| MFA | MIT | Türkçe akustik model v3.0.0 (CV16.1 111 sa + GlobalPhone 17 sa), CC BY 4.0 | Fonem düzeyinde, hızlı, GMM-HMM | **Doğrulama için** |
| stable-ts `align()` | MIT* | Whisper dilleri | Kolay kurulum | Alternatif |
| whisper-timestamped | **AGPL-3.0** | Evet | Deneysel | Kaçının |
| aeneas | **AGPL-3.0** | Evet (eSpeak) | Son sürüm 2017, bakımı yapılmıyor | Kaçının |
| ctc-forced-aligner | BSD-2 | Evet | Varsayılan MMS modeli **CC-BY-NC** | Ancak model değiştirilirse kullanılabilir |

*stable-ts'in MIT lisansını bu oturumda doğrulayamadım.

### 2.4 Müzik alçaltma (ducking) ve ses yüksekliği
- **Yöntem:** Sidechain kompresör yerine kesin (deterministik) ses otomasyonu kullanın. Konuşma aralıkları zaten hizalamadan biliniyor. [own inference]
- **Seviyeler:** Konuşma sırasında müzik sese göre 18–22 dB aşağıda olmalı. İniş 80–150 ms, çıkış 300–500 ms sürmeli. 400 ms'den kısa boşluklarda müzik yükselmemeli, böylece "pompalama" etkisi oluşmaz. [practitioner]
- **Master:** Entegre −14 LUFS, −1 dBTP. ffmpeg `loudnorm` (EBU R128) ile iki geçişte yapılır. `sidechaincompress` yalnızca yedek yöntem.
- **Kinetik aile:** Müzik kullanılmamalı ya da çok alçak nötr bir drone olmalı. Dramatik müzik öfke kırmızı çizgisine yaklaşır. [own inference]

---

## 3. Türkçe TTS seçenekleri (Eylül 2026)

| Model | Kod / ağırlık lisansı | Eğitim verisi | Türkçe kalite kanıtı | CPU | Filigran | Klonlama | Karar |
|---|---|---|---|---|---|---|---|
| **FreyaTTS-small** (Tem 2026, 183M) | Apache-2.0 / Apache-2.0 | "Dahili" korpus, **açıklanmamış** | Freya-TR-Eval'de WER %8,0, CER %3,0, MOS 3,68; 7 model içinde WER'de 3. [practitioner, kendi testi] | M3 CPU RTF 0,70 (gerçek zamandan hızlı) | Yok | Yok, sabit ses ("Leyla") | **Birincil** |
| **Chatterbox Multilingual v3** (10 Haz 2026, 0.5B) | MIT / MIT | 36,7 bin saat, "internetten serbest veri", ayrıntısız | Resemble'a göre Türkçe CER %2–5 bandında; bağımsız MOS yok [practitioner] | Apple CPU'da 1 sn ses için yaklaşık 3 sn [practitioner] | **PerTh her zaman açık** | Sıfır-atış klonlama (rıza şart) | **Yedek** |
| Pocket TTS Turkish (wite-tech, 110M) | ? / CC-BY-4.0 (atıf şart) | 306 saat, **kendi açıklanmamış TTS'lerinden üretilmiş sentetik ses** | WER %1,9 (kendi karşılaştırması: Trendyol %1,1, Qwen3-TR %1,7, Piper %3,2) | Tek iş parçacığında ~5 kat gerçek zamandan hızlı | Yok | Var | Veri kökeni netleşene dek yalnızca test |
| Piper tr_TR-dfki | GPL-3.0 (piper1) / veri **CC BY-NC-SA 4.0** | DFKI verisi | WER %4,4, MOS 3,47 | Çok hızlı | Yok | Yok | Ticari ve kamusal kullanım için uygun değil. fettah ve fahrettin sesleri depodan kaldırılmış |
| XTTS-v2 | MPL / **CPML, ticari olmayan kullanım** | — | MOS 3,82, WER %11,1 | Yavaş | — | Var | Hayır. Coqui kapandığı için ticari lisans da alınamıyor |
| MMS-TTS tur, F5-TTS (Türkçe ince ayarlar), OmniVoice, Voxtral-4B-TTS, Fish S1/S2 | Ağırlıklar NC ya da "Research License" | Emilia vb. | F5: WER %24,3 | — | — | — | Hayır |
| Trendyol-TTS, Kızagan (VoxCPM2 LoRA) | MIT ve Apache / taban Apache | Özel veri (20+ saat) | Trendyol WER %1,1 | **Yalnızca GPU (CUDA)** | Yok | Kızagan: var | Hayır. Trendyol kendini "araştırma/prototip, üretime hazır değil" diye tanımlıyor |
| Orpheus Türkçe ince ayarları | Taban: Llama 3.2 lisansı, 3B | — | Değerlendirme yok | CPU'da pratik değil | — | — | Hayır |
| VibeVoice, Kyutai TTS/Pocket, Dia/Dia2, Sesame CSM, IndexTTS-2, Kokoro, Qwen3-TTS | MIT / Apache / CC-BY | — | **Resmî Türkçe desteği yok.** VibeVoice yalnızca araştırma amaçlı, TTS kodu Eylül 2025'te kaldırıldı | — | VibeVoice'ta sesli uyarı var | — | Hayır |

**Öneri:** Birincil model **FreyaTTS-small**. [own inference] Gerekçeler:
- Lisans net: kod ve ağırlıklar Apache-2.0.
- Önce Türkçe için tasarlanmış ve otoregresif değil. Bu yüzden sözcük atlama ya da tekrar döngüsü riski daha düşük.
- CPU'da gerçek zamandan hızlı.
- Tek, sabit bir ses kullanıyor. Kimse taklit edilmiyor ve marka sesi tutarlı kalıyor.
- Filigran yok. Bunu Resemble'ın MIT lisanslı Perth kütüphanesiyle kendimiz ekleyebiliriz.
- Zayıf yanları: eğitim verisi açıklanmamış ve sürüm henüz 0.1.0.

**Yedek:** **Chatterbox Multilingual v3**. Filigranı dahili ve arkasında bir şirket var. Ancak CPU'da yaklaşık 3 kat yavaş. Otoregresif olduğu için ASR geçidi mutlaka gerekli. Referans ses olarak yalnızca sahibinin kendi sesi ya da açık rıza verilmiş bir ses kullanılmalı.

**Karar kapısı:** Seçimi kesinleştirmeden önce 40 gerçek başlıkla bir günlük karşılaştırma yapın. [own inference]
- Sayı ve özel adlarda Whisper large-v3 ile WER ölçün.
- 3 Türkçe dinleyiciyle MOS puanlaması yaptırın.
- GitHub runner'da CPU süresini ölçün.

Pocket TTS Turkish'in yazarları öğretmen modelin hangi veriyle eğitildiğini açıklarsa, bu model birincil adaya dönüşebilir.

---

## 4. Sentetik ses için açıklama yükümlülükleri (2026)

- **YouTube** [platform]
  - Bildirim şu üç durumda zorunlu: gerçek bir kişiye söylemediği bir şeyi söyletmek, gerçek bir olay ya da yerin görüntüsünü değiştirmek, olmamış gerçekçi bir sahne üretmek.
  - "Kendi sesini klonlayıp seslendirme" ve "altyazı oluşturma" muaf. TTS ayrıca anılmıyor.
  - YouTube, C2PA verisine dayanarak otomatik etiket koyabiliyor. Bildirim yapmamakta ısrar edene yaptırım uygulanabiliyor.
  - Sonuç: Sabit ve gerçek bir kişiye ait olmayan bir anlatıcı sesi için bildirim anahtarı zorunlu değil. Açıklama satırı yine de konmalı.
- **Instagram / Facebook** [platform]: "Dijital olarak oluşturulmuş gerçekçi ses" içeren organik gönderilerde bildirim zorunlu, aksi halde yaptırım uygulanabiliyor. Etiketin adı "AI info". **Paylaşırken "Yapay zekâ etiketi" anahtarını açın.**
- **TikTok** [platform]: "Gerçekçi görüntü, ses ya da video" içeren yapay zekâ içeriği etiketlenmeli. **"Yapay zekâ ile üretilen içerik" ayarını açın.** Etiket ya da açıklama metni kabul ediliyor.
- **AB Yapay Zekâ Yasası, Madde 50** (2 Ağustos 2026'dan beri yürürlükte)
  - Deepfake ifşası, gerçek bir kişiye benzeyen içerik için geçerli; jenerik anlatıcı sesi bu kapsama girmez.
  - Makine tarafından okunabilir işaretleme yükümlülüğü sağlayıcıya ait.
  - Etiketleme Uygulama Kuralları'nın son sürümü Haziran 2026'da yayımlandı ve ortak ikonlar içeriyor.
  - [platform/own inference, hukuki görüş değildir]

**Açıklama metni** (her platformda aynı, en üstte):

> Seslendirme: Yapay zekâ ile üretilmiş sentetik ses (metin okuma). Ses gerçek bir kişiye ait değildir.
> Ekrandaki bilgiler kaynağın kendi ifadeleridir. Kaynak: {kaynak} · Doğrulama durumu: {durum}.
> Bu video Greater Türkiye Motion şablonlarıyla otomatik olarak üretilmiştir. Yöntem ve düzeltmeler: {link}
> Narration: AI-generated synthetic voice, not a real person.

Ekranın son kartında da küçük bir "Sentetik ses" etiketi olmalı. Ancak insan tarafından gözden geçirme yapılıyorsa "editör denetiminden geçti" gibi bir ifade kullanın.

---

**Kaynaklar**
- Reuters Institute DNR 2026: [executive summary](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/dnr-executive-summary), [news video](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/broadcast-streaming-platforms-changing-landscape-news-video), [Turkey](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2026/turkey); [DNR 2024 AI attitudes](https://reutersinstitute.politics.ox.ac.uk/digital-news-report/2024/public-attitudes-towards-use-ai-and-journalism)
- [TikTok creative best practices](https://ads.tiktok.com/help/article/creative-best-practices); [Verizon/Publicis captions (3Play özeti)](https://www.3playmedia.com/blog/verizon-media-and-publicis-media-find-viewers-want-captions/)
- Ginns 2005, doi:10.1016/j.learninstruc.2005.07.001; Craig ve Schroeder 2017, doi:10.1016/j.compedu.2017.07.003; Harrower 2007, doi:10.3138/carto.42.4.349; Tversky ve ark. 2002, doi:10.1006/ijhc.2002.1017; [Coupé ve ark. 2019](https://pmc.ncbi.nlm.nih.gov/articles/PMC6984970/)
- [TDK – yabancı özel adlar](https://tdk.gov.tr/icerik/yazim-kurallari/yabanci-ozel-adlarin-yazilisi/)
- [WhisperX](https://github.com/m-bain/whisperX), [alignment.py](https://raw.githubusercontent.com/m-bain/whisperX/main/whisperx/alignment.py), [mpoyraz TR wav2vec2](https://huggingface.co/mpoyraz/wav2vec2-xls-r-300m-cv7-turkish), [MFA Turkish v3](https://mfa-models.readthedocs.io/en/latest/acoustic/Turkish/Turkish%20MFA%20acoustic%20model%20v3_0_0.html), [stable-ts](https://github.com/jianfch/stable-ts), [whisper-timestamped](https://github.com/linto-ai/whisper-timestamped), [aeneas](https://github.com/readbeyond/aeneas), [ctc-forced-aligner](https://github.com/MahmoudAshraf97/ctc-forced-aligner), [ffmpeg filters](https://ffmpeg.org/ffmpeg-filters.html#sidechaincompress)
- TTS: [FreyaTTS arXiv](https://arxiv.org/abs/2607.09530), [FreyaTTS GitHub](https://github.com/freyavoiceai/FreyaTTS), [HF](https://huggingface.co/freyavoice/Freya-TTS); [Chatterbox v3](https://www.resemble.ai/resources/chatterbox-multilingual-v3-tts-with-embedded-watermarking-for-25-languages), [GitHub](https://github.com/resemble-ai/chatterbox), [HF](https://huggingface.co/ResembleAI/chatterbox), [Perth](https://github.com/resemble-ai/Perth), [chatterbox-mlx CPU hızı](https://pypi.org/project/chatterbox-mlx/1.0.5/); [Pocket TTS Turkish](https://huggingface.co/wite-tech/pocket-tts-turkish), [Kyutai Pocket](https://huggingface.co/kyutai/pocket-tts); [Piper dfki model card](https://huggingface.co/rhasspy/piper-voices/blob/main/tr/tr_TR/dfki/medium/MODEL_CARD); [XTTS-v2](https://huggingface.co/coqui/XTTS-v2); [Trendyol-TTS](https://huggingface.co/Trendyol/Trendyol-TTS), [Kızagan](https://huggingface.co/AlicanKiraz0/Kizagan-TTS-v1.0), [VoxCPM2](https://huggingface.co/openbmb/VoxCPM2); [VibeVoice](https://github.com/microsoft/VibeVoice), [VibeVoice-Realtime](https://huggingface.co/microsoft/VibeVoice-Realtime-0.5B); [F5-TTS](https://huggingface.co/SWivid/F5-TTS); [Fish S2 Pro](https://huggingface.co/fishaudio/s2-pro); [OmniVoice](https://huggingface.co/k2-fsa/OmniVoice); [Qwen3-TTS](https://huggingface.co/Qwen/Qwen3-TTS-12Hz-0.6B-Base); [Kokoro](https://huggingface.co/hexgrad/Kokoro-82M); [Sesame CSM](https://huggingface.co/sesame/csm-1b); [IndexTTS-2](https://huggingface.co/IndexTeam/IndexTTS-2); [HF Türkçe TTS araması](https://huggingface.co/api/models?search=turkish-tts&limit=50&sort=downloads)
- Platform ve hukuk: [YouTube altered/synthetic](https://support.google.com/youtube/answer/14328491?hl=en), [YouTube YPP inauthentic content](https://support.google.com/youtube/answer/1311392?hl=en), [Meta manipulated media](https://transparency.meta.com/policies/community-standards/manipulated-media/), [Meta AI labels](https://about.fb.com/news/2024/04/metas-approach-to-labeling-ai-generated-content-and-manipulated-media/), [TikTok AIGC labels](https://newsroom.tiktok.com/en-us/new-labels-for-disclosing-ai-generated-content), [AI Act Art. 50](https://artificialintelligenceact.eu/article/50/), [EU Code of Practice](https://digital-strategy.ec.europa.eu/en/policies/code-practice-ai-generated-content)

**Bu araştırmanın sınırları:**
- Oturumun web arama kotası çalışma sırasında doldu. Sonraki doğrulamaları bilinen adresleri doğrudan açarak yaptım.
- Doğrulayamadığım noktalar: TikTok'un ayrıntılı AIGC yardım sayfası (JS ile yüklendiği için okunamadı), stable-ts ve MFA'nın kod lisansları (bildiğim kadarıyla MIT), Orpheus'un çok dilli sürümünün dil listesi.
- Türkiye'de sentetik sesi etiketlemeyi bağlayıcı hâle getiren bir düzenleme bu araştırmada karşıma çıkmadı. Ancak bunu ayrıca teyit etmedim.
