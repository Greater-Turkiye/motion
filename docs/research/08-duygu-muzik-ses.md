# Motion: kısa haber videosunda duygu, ses ve lisans araştırması

**Arama notu:** WebSearch kotası dolmuştu. Aşağıdaki kaynakların hepsini WebFetch ile doğrudan açarak kontrol ettim (PubMed E-utilities, Crossref, PMC, platform yardım sayfaları, lisans sayfaları, YouTube RSS). Doğrulayamadığım yerleri ayrıca belirttim.

## Özet
- "Dopamin vuruşu" bir mecaz. Ölçülmüş olan şey ödül tahmin hatası ve "isteme". Bilginin kendisi de ödül gibi değerlendiriliyor. Tasarım hedefi şu olmalı: izleyicinin beklediğinden biraz daha zengin bir cevap vermek.
- Hayranlık (awe) paylaşım olasılığını öfkeye yakın oranda artırıyor: +30%, öfkede +34%. Pratik değer de +30%. İzin verdiğimiz duygularla öfkenin sağladığı artışa yaklaşmak mümkün. Ama tehdit kaynaklı hayranlık korku üretiyor; saldırı haberlerinde "ölçek" coğrafi olmalı, yıkıcı güç olmamalı.
- Deneyimin nasıl hatırlandığını zirve ve son belirliyor (reklamlarda da ölçüldü). 20 sn'lik videoda zirve 12–15. saniyeye, son ise sakin ve net bir çözülmeye gitmeli.
- Yükselen yoğunluk, pürüzlü ses ve ani patlama tınıları ölçülmüş tehlike işaretleri. Saldırı haberinde bunlar patlama çağrıştırır, kullanmamalıyız.
- En güvenli ses yığını: Kenney ve Freesound'dan CC0 efektler, müzik için de Tone.js/WebAudio ile deterministik prosedürel üretim. Sonniss ve Pixabay dosyaları herkese açık repoya commit edilmemeli.

---

## 1. İzin verilen duyguların psikolojisi

**Dopamin: gerçekte ölçülen ne?**
- Dopamin nöronları ödülün kendisini değil, **tahmin hatasını** kodluyor. Beklenenden iyi olana tepki veriyor ([Schultz ve ark. 1997](https://pubmed.ncbi.nlm.nih.gov/9054347/)). [measured]
- Dopamin "hoşlanma" değil, **"isteme"** (teşvik belirginliği) sistemi ([Berridge ve Robinson 1998](https://pubmed.ncbi.nlm.nih.gov/9858756/)). [measured]
- Maymunlarda dopamin nöronları, ödül hakkında **önceden bilgi almayı** tercih ettiğini gösteriyor. Bilginin kendisi ödül gibi işleniyor ([Bromberg-Martin ve Hikosaka 2009](https://pubmed.ncbi.nlm.nih.gov/19607797/)). [measured]
- Yenilik SN/VTA bölgesini tek başına aktive ediyor ([Bunzeck ve Düzel 2006](https://pubmed.ncbi.nlm.nih.gov/16880131/)). [measured]
- Dopamin sistemi ödüle olduğu kadar **itici ve alarm veren** uyaranlara da tepki veriyor ([Bromberg-Martin ve ark. 2010](https://pubmed.ncbi.nlm.nih.gov/21144997/)). Öfke ve korkunun "tutmasının" nedeni bu. Etik çerçevemiz bir yan etki değil, bilinçli bir tasarım kısıtı. [measured → own inference]
- "Her kaydırmada dopamin salgılanır" türü iddiaların Shorts izleyicisinde doğrudan ölçümünü bulamadım. [own inference]

**Merak boşluğu**
- Merak ödül devresini (kaudat) aktive ediyor. Merak, kişinin cevaptan **orta düzeyde emin** olduğu yerde en yüksek (ters U eğrisi). İnsanlar cevap için bedel ödemeye razı oluyor ve şaşırtıcı cevabı 1–2 hafta sonra daha iyi hatırlıyor ([Kang ve ark. 2009](https://pubmed.ncbi.nlm.nih.gov/19619181/)). [measured]
- Gruber'in deneyinde soru ile cevap arasında **14 sn** bekleme vardı ve bu süreç ortasında alakasız bir yüz gösterildi. Yüksek merakta bu yüzler daha iyi tanındı (%42,4, düşük merakta %38,2). Etki ertesi gün de sürdü ([Gruber ve ark. 2014](https://pmc.ncbi.nlm.nih.gov/articles/PMC4252494/)). [measured, laboratuvar]
  - Bizim formatımıza uyarlaması: boşluk açıkken gösterilen ara bilgiler daha iyi akılda kalır. [own inference]
- Öğrenmeyi, cevabın beklenenden ne kadar iyi olduğu (**bilgi tahmin hatası**) yönlendiriyor. Olumlu bilgi daha çok isteniyor ([Marvin ve Shohamy 2016](https://pubmed.ncbi.nlm.nih.gov/26783880/)). [measured]

**Şaşırma ve yenilik**
- TV izlerken bakış kaymalarının %72'si "Bayesçi sürpriz" içeren bölgelere gidiyor ([Itti ve Baldi 2009](https://pubmed.ncbi.nlm.nih.gov/18834898/)). [measured]
- Pratik kural: videoda tek bir sürpriz olsun, göz nereye bakacaksa oraya konsun. [own inference]
- Paylaşım verisinde sürprizin etkisi +14% ([Berger ve Milkman 2012](https://jonahberger.com/wp-content/uploads/2013/02/ViralityB.pdf)). [measured]

**Hayranlık ve ölçek**
- Hayranlığın iki çekirdeği var: **algılanan büyüklük** ve **zihnin buna uyum sağlama ihtiyacı** ([Keltner ve Haidt 2003](https://pubmed.ncbi.nlm.nih.gov/29715721/)).
- Hayranlık "küçük benlik" duygusu yaratıyor ve toplum yanlısı davranışı artırıyor (5 çalışma, N=2.078; [Piff ve ark. 2015](https://pubmed.ncbi.nlm.nih.gov/25984788/)). Zamanı daha geniş algılatıyor ([Rudd ve ark. 2012](https://pubmed.ncbi.nlm.nih.gov/22886132/)). [measured]
- Berger ve Milkman, NYT'nin en çok e-postalanan listesine girme olasılığındaki değişimi 1 SS artış için ölçtü: hayranlık +30%, öfke +34%, kaygı +21%, ilgi +25%, pratik değer +30%, üzüntü −16%. Mekanizma fizyolojik uyarılma. [measured]
- **Tehdit kaynaklı hayranlık** (kasırga, terör saldırısı) korku, sempatik uyarılma ve güçsüzlük üretiyor, iyi oluşa katkı sağlamıyor ([Gordon ve ark. 2017](https://pubmed.ncbi.nlm.nih.gov/27929301/)). [measured]
  - Sonuç: ölçeği mesafe ve coğrafyayla verin ("İstanbul–Ankara kadar"). Füze menzili çemberini Türkiye'nin üstüne kırmızı bir tehdit gibi basmayın. [own inference]

**Akıcılık ve "aha" anı**
- Kolay işlenen uyaran estetik zevk veriyor ([Reber ve ark. 2004](https://pubmed.ncbi.nlm.nih.gov/15582859/)).
- "Aha" anı, işlemede ani bir akıcılık artışı olarak tanımlanıyor ([Topolinski ve Reber 2010](https://doi.org/10.1177/0963721410388803)).
- **Karanlık yüzü:** Yapay olarak tetiklenmiş "aha" anları, yanlış olsa bile yanındaki ifadeyi daha doğru hissettiriyor (d=.63; [Laukkonen ve ark. 2020](https://pubmed.ncbi.nlm.nih.gov/31759277/)). [measured]
  - Kural: "aha" anı yalnızca doğrulanmış bir olguya bağlansın. Hemen ardından doğrulanmamış bir iddia gelmesin. [own inference]

**Zirve ve son**
- Hasta hafızasında ağrının ne kadar kötü hatırlandığını zirve ve son 3 dakika belirliyor, süre değil ([Redelmeier ve Kahneman 1996](https://pubmed.ncbi.nlm.nih.gov/8857625/)).
- Randomize bir denemede işlemin sonuna daha hafif bir aralık eklemek, hatırlanan ağrıyı azalttı ve hastaların tekrar gelme oranını artırdı ([Redelmeier ve ark. 2003](https://pubmed.ncbi.nlm.nih.gov/12855328/)).
- Film kliplerinde süre büyük ölçüde göz ardı ediliyor ([Fredrickson ve Kahneman 1993](https://pubmed.ncbi.nlm.nih.gov/8355141/)).
- **Reklamlarda da** genel yargıya zirve, son an ve iyileşme hızı hakim. Gecikmeli zirve ve güçlü son tercih ediliyor ([Baumgartner ve ark. 1997](https://doi.org/10.1177/002224379703400203)). [measured]

**Döngü ve platform sinyalleri**
- TikTok, videoyu baştan sona izlemeyi güçlü bir ilgi sinyali olarak daha ağır tartıyor ([TikTok](https://newsroom.tiktok.com/en-us/how-tiktok-recommends-videos-for-you)). [platform]
- TikTok'un reklam önerileri: ilk 3 sn'de ne vaat ettiğini söyle, kancayı ilk 6 sn içinde kur. Önerilen metin hızı saniyede 5–10 kelime ([TikTok Ads](https://ads.tiktok.com/help/article/creative-best-practices)). [platform]
  - Bu hız reklam için; haber metninde saniyede ≤3–4 kelime öneriyorum. [own inference]
- YouTube 24 Ağustos 2026'dan beri görüntülemeyi oynatma başladığı anda sayıyor. YPP geliri "engaged views" üzerinden hesaplanıyor ([YouTube](https://support.google.com/youtube/answer/2991785)). [platform]
- Aynı izleyicinin tekrar izlemesinin nasıl sayıldığını doğrulayamadım.

**20 sn'lik video için zamanlama kuralları** [own inference, yukarıdaki ölçümlere dayalı]
| Zaman | Kural |
|---|---|
| 0,0 sn | İlk kare zaten bilgi versin, harita hareket halinde olsun. Logo girişi ve siyah kare olmasın. |
| ≤1,5 sn | Somut önerme: ne + nerede. Soru cümlesi olmasın. |
| 1,5–4 sn | Mikro boşluk: etiketsiz nokta nabız gibi atsın, etiket 1–2 sn içinde gelsin. Kısa, ödüllendirilen bir kapanış olur. |
| ~2 sn → 12–14 sn | Ana boşluk görsel olarak açılır (ör. mesafe çizgisi çizilmeye başlar), ölçek anında kapanır. Olgular bu arada verilir. |
| 12–15 sn (%60–75) | **Tek zirve.** Olumlu veya nötr bir "aha": ölçek, mesafe ya da örüntü. |
| 17–20 sn | Çözülme. Zirveden sakin ama "netlik" hissi yükselen bir son. Yeni gerilim açılmasın. Son kare ilk kareyle aynı kompozisyonda olsun (kesintisiz döngü). Kaynak ve tarih döngü uğruna kesilmesin, sürekli görünen bir alt bantta dursun. |

---

## 2. Müzik ve sesin duygusal etkisi

**Ölçülmüş bulgular**
- **Tempo:** Hızlı tempo uyarılmayı artırıyor ama duygu durumunu değiştirmiyor. **Majör/minör** ise duygu durumunu değiştiriyor, uyarılmayı değil ([Husain ve ark. 2002](https://doi.org/10.1525/mp.2002.20.2.151)). [measured]
- Hızlı, vurgulu ve staccato müzik solunumu, deri iletkenliğini ve kalp hızını artırıyor ([Gomez ve Danuser 2007](https://pubmed.ncbi.nlm.nih.gov/17516815/)). [measured]
- **Sessizlik:** Parçalar arasındaki duraklamalar kalp hızı, kan basıncı ve solunumu başlangıç düzeyinin **altına** indiriyor ([Bernardi ve ark. 2006](https://pubmed.ncbi.nlm.nih.gov/16199412/)). Kısa bir sessizlik "sıfırlama" işlevi görür. [measured]
- **Beklenti ve zirve:** Beklenti sırasında kaudat, zirve anında nucleus accumbens dopamin salıyor ([Salimpoor ve ark. 2011](https://pubmed.ncbi.nlm.nih.gov/21217764/)). Müzikte ürperme anları ödül bölgelerini aktive ediyor ([Blood ve Zatorre 2001](https://pubmed.ncbi.nlm.nih.gov/11573015/)). Gerilim→çözülme kurgusu buna dayanıyor. [measured]
- **Disonans** paralimbik "hoş değil" yanıtlarıyla birlikte değişiyor ([Blood ve ark. 1999](https://pubmed.ncbi.nlm.nih.gov/10204547/)). [measured]
- **Yükselen yoğunluk** (yaklaşan ses) amigdalayı aktive eden temel bir uyarı işareti ([Bach ve ark. 2008](https://pubmed.ncbi.nlm.nih.gov/17490992/)). Yükselen tonlar algıda abartılıyor ([Neuhoff 1998](https://pubmed.ncbi.nlm.nih.gov/9744266/)). [measured]
- **Pürüzlülük** (30–150 Hz modülasyon) çığlıkları konuşmadan ayırıyor ve hızlı tehlike değerlendirmesini tetikliyor ([Arnal ve ark. 2015](https://pubmed.ncbi.nlm.nih.gov/26190070/)). [measured]
- Korku filmleri doğrusal olmayan gürültü ve frekans sıçramalarını fazlaca kullanıyor ([Blumstein ve ark. 2010](https://pubmed.ncbi.nlm.nih.gov/20504815/)). Görsel bağlam bu etkiyi değiştiriyor ([2012](https://pubmed.ncbi.nlm.nih.gov/22696288/)). [measured]
- **Alçak ve kaba ses = düşmanlık, yüksek ve tonal ses = yatıştırma** (hayvan seslerinde "motivasyon-yapı kuralları"; [Morton 1977](https://doi.org/10.1086/283219)). [measured, hayvan verisi → own inference: derin gürleme tehdit çağrıştırır. Telefon hoparlörleri zaten bu frekansları vermiyor, practitioner]
- **Hoş olmayan sesler** daha büyük irkilme refleksi üretiyor ([Bradley ve Lang 2000](https://pubmed.ncbi.nlm.nih.gov/10731770/)). [measured]
- **Shepard tonu:** Hiç tırmanmadan sürekli yükseliyormuş gibi gelen bir illüzyon. Dunkirk'teki kesintisiz gerilim bununla kuruldu ([Vox videosu](https://www.youtube.com/watch?v=LVWTQcZbLgY), [Wikipedia](https://en.wikipedia.org/wiki/Shepard_tone)). [practitioner]
- **Anlatımın altındaki müzik ve efektler öğrenmeyi düşürüyor** (tutarlılık ilkesi; [Moreno ve Mayer 2000](https://doi.org/10.1037/0022-0663.92.1.117)). [measured]
- **Tabloid biçim özellikleri** sakin haberde hafızaya yardım ediyor, uyarıcı haberde işlem kapasitesini aşırı yüklüyor ve haberi **daha az güvenilir** gösteriyor ([Grabe, Lang ve Zhao 2003](https://doi.org/10.1177/0093650203253368); ayrıca [Lang ve ark. 1999](https://doi.org/10.1080/08838159909364504)). [measured]
  - Doğrudan sonucu: saldırı kayıtlarında efekt yoğunluğu, diplomasi kayıtlarındakinden düşük olmalı. [own inference]

**Kanallar sesi nasıl kullanıyor**
- Johnny Harris'in video açıklamalarında "Original music … composed by Tom Fox" yazıyor, yani özgün beste kullanıyor ([RSS](https://www.youtube.com/feeds/videos.xml?channel_id=UCmGSJVG3mCRXVOP4yZrU1Dw)). [platform]
- Kings and Generals açıklamalarında "Production Music courtesy of Epidemic Sound" yazıyor ([RSS](https://www.youtube.com/feeds/videos.xml?channel_id=UCMmaBzfCCwZ2KqaBJjkj0fw)). [platform]
- Vox ve TLDR açıklamalarında müzik künyesi yok. Inside Geopolitics'i kontrol edemedim.
- Genel üsluba dair gözlemim: anlatımın altında alçak bir müzik yatağı, grafik hareketlerinde yumuşak "whoosh", açıklamadan önce kısa bir yükselme. Bu doğrulanmamış bir gözlem. [practitioner]

**Neden manipülatif hissettiriyor:** Ses içerikten bağımsız bir uyarılma yarattığında, yani olgu olmayan bir gerilim ürettiğinde. Örnekler: çözülmeyen yükselme, darbe sesi, siren, kayıplar üzerine duygu sömüren piyano. [own inference]

**Vuruş türüne göre duygusal skor** [own inference; müzik yoğunluğu 0–5. Saldırı kayıtlarında −1, diplomasi ve tatbikat kayıtlarında +1]
| Vuruş | Hedef duygu | Ses işareti | Müzik | Görsel kaldıraç |
|---|---|---|---|---|
| Kanca 0–2 sn | Yenilik, merak | Kısa, yumuşak "tik/pluck" (≈−18 dBFS). Müzik yatağı pad olarak girer | 2 | Hareket halinde harita, etiketsiz nabız noktası, somut isim + sayı |
| Yer 2–5 sn | Akıcılık | Alçak geçiren filtreli whoosh, etiket "pop" | 2 | Tanıdık şehirden hedefe zoom |
| Olgular 5–10 sn | Netlik | Her olguda tek UI tiki. Anlatım varsa müzik ≈15–20 dB kısılır | 1–2 | Kart başına tek olgu, kısa sayaç |
| Mesafe/ölçek 10–14 sn | Olumlu hayranlık, zirve | ≤2–3 sn'lik hafif yükselme, **darbeyle değil** açık bir akorla çözülür | 3–4 | Zoom out, mesafe çizgisi, tanıdık kıyas |
| Yakın örüntü 14–16 sn | "Aha" | Önceki her olay için sessiz ritmik tik | 3 | Haritada zaman çizelgesi noktaları |
| Durum 16–18 sn | Güven | 0,3–0,5 sn sessizlik, ardından nötr ton | 1 | "Doğrulandı / İddia / Resmî" rozeti, kaynak ve tarih |
| Kapanış/döngü 18–20 sn | Çözülme, paylaşım değeri | Tonik/kök akoru. Kuyruk girişteki pad'e bağlanır | 1 | Tek cümlelik özet, ilk kareyle eş kompozisyon |

Genel ayarlar:
- **Tempo:** Saldırı ve açıklama kayıtlarında 70–90 BPM, diplomasi ve tatbikatta 90–110 BPM. [own inference]
- **Armoni:** Belirgin minör (hüzün) ya da parlak majör (zafer) yerine modal veya suspended armoni. [own inference]
- **Kaçınılacaklar:** Pürüzlülük, sub-bass drone ve darbeye giden yükselme. [own inference]
- **Loudness:** Yaklaşık −14 LUFS, gerçek tepe ≤ −1 dBTP. [practitioner]

---

## 3. Ücretsiz ses kaynakları (lisans sayfaları kontrol edildi)

| Kaynak | Lisans | Atıf | Content ID riski | Herkese açık repoya commit? |
|---|---|---|---|---|
| [Kenney](https://kenney.nl/support) (10 ses paketi, ör. [Interface Sounds](https://kenney.nl/assets/interface-sounds), 100 dosya) | CC0, ticari kullanım serbest | Gerekmez | Çok düşük | Evet |
| [Freesound](https://freesound.org/help/faq/) CC0 filtresi | CC0 / CC BY / CC BY-NC | CC0'da gerekmez, BY'de gerekir, NC yasak | Düşük. Eşleşme olursa itiraz yolu tarif edilmiş | CC0 için evet |
| Freesound API ([dokümantasyon](https://freesound.org/docs/api/resources_apiv2.html)) | Filtre sözdizimi: `filter=license:"Creative Commons 0"`. **[API şartları](https://freesound.org/help/tos_api/): ticari kullanım UPF ile vaka bazında müzakere ediliyor** | — | — | Çalışma anında API çağırmayın. Elle seçip künyeli bir manifest tutun |
| [OpenGameArt](https://opengameart.org/content/faq) | Varlık bazında (CC0 / BY / SA) | Lisansa göre | Düşük | CC0 için evet |
| [Sonniss GDC](https://sonniss.com/gdc-bundle-license/) | Royalty-free, ticari kullanım serbest, sınırsız proje | Gerekmez | Düşük | **Hayır.** "Ses efekti olarak" yeniden dağıtım yasak. **Yapay zekâ eğitimi yasak** |
| [Pixabay](https://pixabay.com/service/license-summary/) | Pixabay Lisansı | Gerekmez | **Var.** Kalkan ikonlu parçalar Content ID'ye kayıtlı ([SSS](https://pixabay.com/service/faq/)) | **Hayır.** Tek başına dağıtım yasak |
| [Mixkit](https://mixkit.co/free-stock-music/) | Mixkit Free License | Gerekmez | Belirtilmemiş | Riskli. **TV ve radyo yayını yasak** |
| [Incompetech](https://incompetech.com/music/royalty-free/faq.html) | CC BY 4.0 | Zorunlu (kalıp: "Title Kevin MacLeod (incompetech.com)…") | **Artık Content ID'ye kayıtlı.** İtirazla ≤72 saatte kaldırılıyor ([sayfa](https://incompetech.com/music/royalty-free/youtube-contentid.html)) | Evet, künyeyle |
| [YouTube Ses Kitaplığı](https://support.google.com/youtube/answer/3376882) | YouTube lisansı / CC | CC parçalarda açıklamaya künye gerekli | "Talep edilmez" deniyor | YouTube dışında kullanım bu sayfada açık değil |

- **Content ID ilkesi:** CC, kamu malı ve münhasır olmayan lisanslı içerik Content ID'ye **uygun değil** ([YouTube](https://support.google.com/youtube/answer/2605065)). Bu yüzden CC0 seslere gelen talepler genelde hatalı ve itiraz edilebilir. [platform]
- **Epidemic Sound:** Uygulayıcı bilgisine göre abonelik tabanlı ve parçaları Content ID'ye kayıtlı; lisans sayfası 404 verdi, doğrulayamadım. Uppbeat sayfası 429 döndü, BBC Sound Effects'e erişilemedi.

**Prosedürel ve deterministik müzik**
- [Tone.js](https://github.com/Tonejs/Tone.js) MIT lisanslı. [ZzFX](https://github.com/KilledByAPixel/ZzFX) de MIT; küçük prosedürel efektler üretiyor.
- [OfflineAudioContext](https://developer.mozilla.org/en-US/docs/Web/API/OfflineAudioContext) ses grafiğini donanıma çalmadan, olabildiğince hızlı bir AudioBuffer'a işliyor.
- Kayıt kimliğinden türetilmiş bir seed, seed'li bir PRNG ve sabitlenmiş bir Chromium sürümüyle deterministik render mümkün. Sabit bir akor sözlüğü de kullanılmalı. [own inference; kayan nokta farkları yüzünden tarayıcı sürümü sabitlenmeli]
- Content ID riski pratikte yok.
- YouTube'un açıklama politikası "AI generated music"i açıklanması gerekenler arasında sayıyor ([YouTube](https://support.google.com/youtube/answer/14328491)). Kural tabanlı sentez GenAI değil. Tamamen animasyon bir füze açıklama gerektirmiyor. [platform + own inference]

---

## 4. Kaçınılacak manipülatif teknikler

1. **Sahte aciliyet.** Eski bir kayda "SON DAKİKA" demek. FTC sahte kıtlık ve aciliyeti "karanlık örüntü" olarak sınıflıyor ([FTC 2022](https://www.ftc.gov/reports/bringing-dark-patterns-light)).
2. **Sahte geri sayım.** "3-2-1" sonrası açıklama. FTC bunu "Baseless Countdown Timer" olarak adlandırıyor.
3. **Öfke yemi ve dış-grup dili.** Her dış-grup terimi paylaşım olasılığını %67 artırıyor ([Rathje 2021](https://doi.org/10.1073/pnas.2024292118)). Ahlaki-duygusal kelimeler kelime başına +%20 yayılım sağlıyor ([Brady 2017](https://doi.org/10.1073/pnas.1618923114)). İşe yaradığı ölçülmüş, zarar verdiği için yasak.
4. **Olumsuzluk yığma.** Her olumsuz kelime tıklanmayı %2,3 artırıyor ([Robertson 2023](https://doi.org/10.1038/s41562-023-01538-4)). Başlığa olumsuz sıfat eklenmez.
5. **Soru başlıkları** ("Savaş mı başlıyor?"). Daha az güvenilir bulunuyor ve etkileşimi **düşürüyor** ([Scacco ve Muddiman 2016](https://mediaengagement.org/research/clickbait-headlines/)). Yani bu yasak bize bir şey kaybettirmiyor.
6. **Yanıltıcı ilk kare veya kapak.** Bir açıklama haberinde patlama görseli kullanmak. YouTube bunu "malicious clickbait" olarak ihlal sayıyor ([politika](https://support.google.com/youtube/answer/2801973)).
7. **Patlama çağrıştıran ses.** Bum, darbe sesi, siren, pürüzlü doku, darbeyle biten yükselme. Bunlar ölçülmüş alarm işaretleri (Bach 2008, Arnal 2015, Bradley ve Lang 2000). Ayrıca gerçek bir uyarıyla karıştırılabilir. [own inference]
8. **Çözülmeyen Shepard yükselmesi.** İçerikten bağımsız, kaygıya benzer bir uyarılma yaratır.
9. **Tehdit ölçeği.** Menzil çemberini Türk şehirlerinin üstüne tehdit olarak çizmek (Gordon 2017).
10. **"Aha" anından hemen sonra doğrulanmamış iddia.** Yanlış bilgi daha doğru hissedilir (Laukkonen 2020).
11. **Uyarıcı haberde tabloid biçim.** Flaş, sarsıntı, glitch efektleri. Güvenilirliği düşürüyor (Grabe 2003).
12. **Sentetik sesi gerçek bir spiker veya yetkili gibi sunmak.** Ayrıca gerçekçi yapay zekâ olay görüntüsü kullanmak. Her ikisinde de açıklama gerekiyor ([YouTube](https://support.google.com/youtube/answer/14328491)). "Sentetik ses" etiketi her zaman konmalı.
13. **Döngü uğruna kaynak ve tarihi kesmek.** Ya da duygu sömüren müzik kullanmak: kayıp sayılarının üstüne hüzünlü piyano, saldırının üstüne zafer marşı.

**Sınırlar:** Kanalların ses tasarımına dair notlar büyük ölçüde gözlem (açıklamalardaki künyeler dışında). Ölçülmüş bulguların çoğu laboratuvar veya uzun biçimli içerikten geliyor. 20 sn'lik dikey formata aktarılması benim çıkarımım; A/B testiyle doğrulanmalı.
