# Otomatik OSINT video hattı: 2026 araştırma raporu

Bu rapor yalnızca web araştırmasına dayanıyor. Hiçbir dosyaya veya repoya dokunulmadı.

---

## 1. Hangi kayıt videoya dönüşmeli: haber değeri puanlaması

**Kuramsal temel.** Galtung ve Ruge'nin 1965 taksonomisini Harcup ve O'Neill önce 2001'de, sonra 2017'de güncelledi. 2017 listesinde büyüklük (magnitude), çatışma, sürpriz, ilgililik (relevance), takip haberi (follow-up) ve görsel-işitsel malzeme gibi değerler yer alıyor ([White Rose](https://eprints.whiterose.ac.uk/id/eprint/95423/), [AJE özeti](https://ajeuk.org/news-values-revisited-again/)). Hesaplamalı yaklaşımlar da buna benziyor:
- **Reuters Tracer**, olayları "küresel etkili / yerel etkili / değersiz" diye üç kademede sınıflıyor ([arXiv 1711.04068](https://arxiv.org/pdf/1711.04068)).
- **Samar**, önce güncellik ve ilgililik puanını hesaplıyor, sonra seçilen kümeye çeşitlilik katıyor ([ACM](https://dl.acm.org/doi/fullHtml/10.1145/3184558.3186937)).
- **GDELT**, olayın önemini kaç kaynakta geçtiğine (NumSources) ve kaç kez anıldığına (NumMentions) bakarak ölçüyor ve bu sayıların dönemin ortalamasına göre normalize edilmesini öneriyor. Goldstein ölçeği ise yalnızca olay türüne bakıyor: 10 kişilik bir isyanla 10.000 kişilik bir isyan aynı puanı alıyor ([GDELT Codebook](http://data.gdeltproject.org/documentation/GDELT-Event_Codebook-V2.0.pdf)). Bu yüzden olay türü tablosu tek başına yetmez.

**Tekilleştirme.** Başlıklar ve özet metinler kelime parçalarına (shingle) bölünüp MinHash-LSH ile karşılaştırılabilir. Örneğin eşik 0,8 ve 128 permütasyonla benzer kayıtlar yakalanır ([datasketch](https://ekzhu.com/datasketch/lsh.html)). Buna yapısal bir anahtar da eklenmeli: aynı `event_type`, yaklaşık 50 km'lik aynı coğrafi hücre ve ±24 saat içindeki kayıtlar tek küme sayılır. Günlük seçimde çeşitlilik için MMR yöntemi kullanılır ([Carbonell & Goldstein 1998](https://aclanthology.org/X98-1025.pdf)).

**Önerilen formül.** Her puan bileşeni 0 ile 1 arasında bir değer alıyor:

| Bileşen | Kayıttaki alan | Hesap |
|---|---|---|
| M: büyüklük / olumsuzluk | `event_type` | Sabit tablo: silahlı saldırı veya can kaybı 1,0 · askerî harekât 0,9 · afet 0,9 · diplomatik anlaşma 0,6 · açıklama 0,3 |
| P: yakınlık | `country`, `region` | TR 1,0 · proje bölgesi veya Türk dünyası 0,8 · diğerleri 0,4 |
| C: teyit | `sources` | min(1, log2(1+n) / log2(6)); 5 kaynakta doyuma ulaşır |
| R: güvenilirlik | reliability grade | A 1,0 · B 0,8 · C 0,5 · daha düşük 0 |
| N: yenilik | kümeleme | 1 − (son 72 saatte yayımlanan videolara en yüksek benzerlik) |
| G: görselleştirilebilirlik | location present | Konum varsa 1,0, yoksa 0,3 |
| D: güncellik | `date` | 2^(−yaş_saat / 12); yarı ömür 12 saat |

**S = 100 · D · (0,30M + 0,20P + 0,20C + 0,15R + 0,15N) · (0,6 + 0,4G)**

**Kesin eleme kuralları** (formülden önce uygulanır, olgusallık bunlarla korunur):
- R en az B olmalı.
- En az 2 kaynak olmalı. Tek kaynak ancak A dereceli resmî kaynaksa kabul edilir.
- Kayıt en fazla 48 saatlik olmalı.
- Aynı olay kümesi daha önce yayımlanmamış olmalı. Yeni bir olgu varsa +0,05 "takip" bonusu verilir.

**Günlük seçim:**
- Her 6 saatlik turda S ≥ 55 olan en iyi kayıt seçilir. Seçimde MMR kullanılır (λ = 0,7); benzerlik ölçüsü olay türü ve ülke örtüşmesidir.
- S ≥ 80 olan kayıtlar "son dakika" sayılır ve ek slot açar. Günlük üst sınır 6'dır.
- Gün sonunda 2'den az video çıktıysa, günün en iyi 3 kaydından bir "günün özeti" videosu üretilir. Bu, hem en az 2/gün hedefini tutturur hem de kalıp tekrarını azaltır.

## 2. Türkçe seslendirme

| Seçenek | Lisans / yayın durumu | CPU'da çalışır mı | Değerlendirme |
|---|---|---|---|
| Piper `tr_TR-dfki` | Veri seti CC BY-NC-SA 4.0 ([model kartı](https://huggingface.co/rhasspy/piper-voices/blob/6fb8245d6d27fef8988272e0c8e9f5018da1bbbf/tr/tr_TR/dfki/medium/MODEL_CARD)) | Evet, çok hızlı | **Ticari olmayan kullanım.** Bunun dışında, üç Türkçe sesin hepsi lessac modeli üzerine ince ayarlanmış. Lessac'ın Blizzard lisansı ticari ses sentezini yasaklıyor ([tartışma #271](https://github.com/rhasspy/piper/discussions/271)). |
| Piper `fettah` / `fahrettin` | Fettah'ın verisi CC0 ama o da lessac tabanlı ([kart](https://huggingface.co/rhasspy/piper-voices/blob/6fb8245d6d27fef8988272e0c8e9f5018da1bbbf/tr/tr_TR/fettah/medium/MODEL_CARD)) | Evet | **İkisi de katkıda bulunanların isteğiyle depodan kaldırıldı.** Güncel ağaçta yalnızca `dfki` kaldı ([HF ağacı](https://huggingface.co/rhasspy/piper-voices/tree/main/tr/tr_TR)). Kullanılmamalı. |
| Coqui XTTS-v2 | CPML: model ağırlıkları ve üretilen ses yalnızca ticari olmayan kullanım için. Coqui 2024'te kapandığı için ticari lisans alınabilecek bir muhatap da yok ([analiz](https://localaimaster.com/blog/xtts-coqui-commercial-license), [lisans](https://huggingface.co/coqui/XTTS-v2/blob/main/LICENSE.txt)) | Yavaş | Uygun değil. |
| Meta MMS-TTS `tur` | CC-BY-NC 4.0 ([HF](https://huggingface.co/facebook/mms-tts-tur)) | Hızlı | Uygun değil (ticari olmayan). |
| F5-TTS ve Anka-TTS (F5 tabanlı Türkçe) | F5 ağırlıkları Emilia veri seti yüzünden CC-BY-NC ([F5](https://github.com/SWivid/F5-TTS/discussions/129)); Anka ağırlıkları CC-BY-NC-4.0 ([Anka](https://huggingface.co/krmkayabasi/Anka-TTS)) | GPU gerekir | Uygun değil. |
| Fish Speech / OpenAudio S1 | CC-BY-NC-SA-4.0 ([HF](https://huggingface.co/fishaudio/openaudio-s1-mini)) | GPU gerekir | Uygun değil. |
| Kokoro | Apache-2.0 | Evet | Türkçe desteği yok ([issue #204](https://github.com/hexgrad/kokoro/issues/204)). |
| Microsoft Edge TTS (`edge-tts`) | Ticari kullanımı açıkça düzenleyen kamuya açık bir belge yok. Microsoft Q&A cevapları ticari iş için ücretli Azure TTS'yi işaret ediyor; hizmet Edge'in sesli okuma özelliği için tasarlanmış ([MS Q&A](https://learn.microsoft.com/en-us/answers/questions/2088770/are-opensource-edge-tts-free-for-commercial-use)) | Bulut hizmeti | Hukuki risk var, erişim her an kesilebilir. |
| Google Cloud TTS | Aylık 4 milyon karakter (Standard/WaveNet) ücretsiz, ama faturalandırma hesabı zorunlu ([fiyatlar](https://cloud.google.com/text-to-speech/pricing)) | Bulut hizmeti | Kredi kartı gerektiği için "sıfır bütçe, manuel adım yok" kuralıyla çelişiyor. |
| eSpeak-NG | GPL-3 | Aşırı hızlı | Kalitesi zayıf, açıkça sentetik duyuluyor ([karşılaştırma](https://www.ablt.dev/blog/turkish-tts/)). Yalnızca acil durum yedeği. |
| **Chatterbox Multilingual V3** | **MIT.** Türkçe (`tr`) resmî dil listesinde. Her klibe gömülü PerTh filigranı var ([GitHub](https://github.com/resemble-ai/chatterbox), [Resemble](https://www.resemble.ai/learn/models/chatterbox-multilingual)) | 0,5 milyar parametre; CPU'da çalışıyor ama çok dilli modelin CPU hızı yayımlanmamış | **Önerilen.** |
| FreyaTTS-small (Temmuz 2026) | Kod ve ağırlıklar Apache-2.0. Yedi açık Türkçe model arasında WER 8,0% ile üçüncü ([GitHub](https://github.com/freyavoiceai/FreyaTTS)) | Apple M3'te RTF 0,70 | Yedek. Eğitim verisinin lisansı belgelenmemiş, kullanmadan önce doğrulanmalı. |
| turkish-tts-model (Çağlar, 2026) | Kod ve ağırlıklar Apache-2.0, 2.724 saatlik korpus ([GitHub](https://github.com/serdarildercaglar/turkish-tts-model)) | ~63 milyon parametre | Deneysel. Korpus sesli kitaplardan geliyor, kaynak hakları doğrulanmalı. |

**Öneri:** Chatterbox Multilingual V3.
- Modelin varsayılan sesi, ya da sahibin rıza vererek kaydettiği 10 saniyelik kendi sesi kullanılmalı. Başka birinin sesi klonlanmamalı.
- Gömülü filigran, "sentetik ses" beyanına teknik bir kanıt sağlıyor.
- Türkçe telaffuz kalitesi ve 4 vCPU'lu runner'daki hız ilk iş olarak ölçülmeli. İkisi de doğrulanmadı.
- Metin TTS'e gitmeden önce deterministik bir Türkçe normalleştiriciden geçmeli: sayılar, tarihler, kısaltmalar.
- TTS başarısız olursa video sessiz ama altyazılı yayımlanmalı. Lisansı ticari olmayan bir sese düşülmemeli.

## 3. Müzik ve ses efektleri

- **Prosedürel üretim (birincil seçenek).** jsfxr "Unlicense" (kamu malı) lisanslı, Node'da çalışıyor ve `toWave()` ile doğrudan WAV üretiyor ([GitHub](https://github.com/chr15m/jsfxr)). Whoosh ve vuruş sesleri ile alttaki drone/pad katmanı, render sayfasında WebAudio'nun OfflineAudioContext'iyle deterministik olarak üretilebilir. Böylece Content ID riski sıfıra iner. Üretimde generative AI müzik kullanılmamalı: YouTube, "AI tarafından üretilmiş müzik" için beyan istiyor ([YouTube Help](https://support.google.com/youtube/answer/14328491?hl=en)).
- **Mixkit.** Ücretsiz lisans YouTube ve sosyal medyayı kapsıyor, atıf istemiyor ([Mixkit bilgi sayfası](https://mixkit.co/llm-info/)). Yayın (TV/radyo) kullanımı hariç tutuluyor.
- **Pixabay.** Atıf gerekmiyor, sosyal medyada kullanılabiliyor ([lisans özeti](https://pixabay.com/service/license-summary/)). Ancak bazı sanatçılar parçalarını Content ID'ye kaydediyor. Olası bir talebi itiraz etmek için indirirken lisans sertifikasını saklamak gerekiyor ([Pixabay blog](https://pixabay.com/blog/posts/how-to-clear-a-youtube-content-id-claim-with-a-pix-190/)).
- **Freesound.** API'de lisans filtresiyle yalnızca CC0 sesler seçilmeli. Önizleme dosyaları OAuth gerektirmiyor, orijinal kalite gerektiriyor ([API docs](https://freesound.org/docs/api/overview.html)).
- **Kaçınılacaklar:**
  - YouTube Audio Library: platform dışı kullanım parça parça değişiyor ([analiz](https://usethirdchair.com/blog/can-you-use-youtube-audio-library-music-on-instagram)).
  - Uppbeat ücretsiz katman: ayda 3 indirme ve her video için ayrı atıf kodu gerekiyor ([Uppbeat](https://uppbeat.io/blog/royalty-free-and-copyright-free-music/uppbeats-music-licenses)).
  - Free Music Archive: her parçanın lisansı farklı ve Content ID riski var ([FMA SSS](https://freemusicarchive.org/FAQ_For_Videos/), [Silverman](https://www.silvermansound.com/creative-commons-music-licensing-guide)).

## 4. Yayın API'leri: 2026'da gerçekçi otomasyon

| Platform | Kimlik doğrulama / onay | Ücretsiz sınır | Dikkat edilecekler | Sıfır maliyetle otomatik? |
|---|---|---|---|---|
| **Telegram Bot API** | Bot token | Video en fazla 50 MB ([Bot API](https://core.telegram.org/bots/api)) | Kanal yöneticisi yapılmalı | **Evet** |
| **Bluesky** | Uygulama şifresi; ilk video yüklemesinden önce e-posta doğrulanmış olmalı | Günde 25 video / 10 GB; dosya < 300 MB; en fazla 10 dakika (Ağustos 2026 itibarıyla) ([PublishQ](https://publishq.com/blog/bluesky-api-post-limits), [AgentSky](https://useagentsky.com/blog/bluesky-video-limits)) | Profile "automated" öz-etiketi eklenmeli ([Bluesky bots](https://docs.bsky.app/docs/starter-templates/bots)) | **Evet** |
| **Mastodon** | Erişim token'ı | Tipik video sınırı 99 MB; video işleme asenkron, API 202 döner ([docs](https://docs.joinmastodon.org/methods/media/), [fedi.tips](https://fedi.tips/how-do-i-post-images-videos-or-audio-in-mastodon-what-can-i-attach-to-a-post-how-do-i-post-gifs/)) | Hesapta bot bayrağı açılmalı; sunucu kuralları kontrol edilmeli | **Evet** |
| **YouTube Data API v3** | OAuth; `videos.insert` artık ayrı "Video Uploads" kotasında ve yükleme başına 1 birim ([videos.insert](https://developers.google.com/youtube/v3/docs/videos/insert)). 1.600 birim bilgisi eskidi: Aralık 2025'te ~100'e indi, Haziran 2026'da ayrı kovaya taşındı ([revizyon geçmişi](https://developers.google.com/youtube/v3/revision_history)) | Denetimden geçmemiş projelerin yüklemeleri **zorla "private"** kalıyor; kaldırmak için ücretsiz uyum denetimi gerekiyor ([form](https://support.google.com/youtube/contact/yt_api_form)) | OAuth izin ekranı "Testing" durumundaysa refresh token 7 günde ölüyor; ekran "In production" yapılmalı ([DEV](https://dev.to/ko-hi/googles-oauth-testing-mode-expires-refresh-tokens-in-7-days-publish-the-consent-screen-before-24hm)). API'de `status.containsSyntheticMedia` alanı var | **Denetim onayından sonra evet** |
| **Instagram Graph API (Reels)** | Profesyonel hesap. Kendi hesabı için uygulama geliştirme modunda, tester rolüyle, App Review gerekmeden çalışıyor ([Blotato](https://www.blotato.com/blog/instagram-posting-api)) | 24 saatte 100 gönderi ([Meta docs](https://developers.facebook.com/docs/instagram-platform/content-publishing/)) | Video **herkese açık bir URL'de** barındırılmalı (ör. GitHub Release). Uzun ömürlü token 60 gün geçerli, otomatik yenilenebilir ([refresh](https://developers.facebook.com/docs/instagram-platform/reference/refresh_access_token/)). Yalnızca H.264 MP4/MOV, en fazla 90 saniye ([Postproxy](https://postproxy.dev/blog/instagram-reels-api-publishing-guide/)) | **Evet** |
| **TikTok Content Posting API** | Denetimsiz istemciler yalnızca SELF_ONLY (private) paylaşabiliyor. Denetim yönergeleri "kendi hesaplarınıza yükleme yapan araçları" açıkça reddediyor ([Guidelines](https://developers.tiktok.com/docs/en/content-sharing-guidelines)) | Oluşturucu başına günde ~15 gönderi | Kullanıcının önizleyip onay vermesi zorunlu, yani insansız yayın politikaya aykırı | **Hayır** |
| **X API** | Yeni geliştiriciler için ücretsiz katman 6 Şubat 2026'da kalktı; kullandıkça öde modeli geldi | Gönderi başına $0,015, URL içeren gönderi $0,20 ([Outstand](https://www.outstand.so/blog/x-api-pricing), [Postproxy](https://postproxy.dev/blog/x-api-pricing-2026/)) | Ücretli | **Hayır** (sıfır bütçeyle) |

## 5. Platform politikaları ve tasarımda kalıcı çözümler

- **YouTube "inauthentic content".** 15 Temmuz 2025'te "repetitious content" politikasının adı değişti. Şablonla üretilmiş, az çeşitlilik gösteren, ölçekte kolayca kopyalanabilen videolar ve "minimal anlatılı kayan metin" içerikleri para kazanamıyor ([YouTube Help](https://support.google.com/youtube/answer/1311392?hl=en), [Social Media Today](https://www.socialmediatoday.com/news/youtube-clarifies-monetization-update-inauthentic-repeated-content/752892/)). "Reused content" ise başkasının materyalini katkı eklemeden okumayı kapsıyor.
- **YouTube sentetik içerik beyanı.** Beyan, gerçekçi ve yanıltıcı olabilecek içerik için zorunlu. Açıkça animasyon olan içerik ve üretim yardımı muaf. Kişinin kendi sesini klonlaması beyan gerektirmiyor, AI müzik gerektiriyor ([YouTube Blog](https://blog.youtube/news-and-events/disclosing-ai-generated-content/), [Help](https://support.google.com/youtube/answer/14328491?hl=en)).
- **Meta.** Nisan 2026'dan beri ağırlıklı olarak yeniden paylaşım yapan hesaplar öneri yüzeylerinden çıkarılıyor ([PetaPixel](https://petapixel.com/2026/04/30/new-instagram-policies-target-reposted-content/), [Tubefilter](https://www.tubefilter.com/2026/04/30/instagram-removes-algorithm-recommendations-repost-content-aggregator/)). AI içerik C2PA/IPTC sinyalleriyle etiketleniyor ([Meta Transparency](https://transparency.meta.com/governance/tracking-impact/labeling-ai-content)).
- **TikTok.** Gerçekçi AI içerik için etiket zorunlu. API'de `is_aigc` alanı var ([Direct Post](https://developers.tiktok.com/docs/en/content-posting-api-reference-direct-post), [TikTok](https://newsroom.tiktok.com/en-us/new-labels-for-disclosing-ai-generated-content)).

**Hattın tasarımına yansıması:**
1. **Metin LLM'e yazdırılmamalı.** Sahne metni kayıt alanlarından deterministik olarak üretilmeli. Ekrana her iddianın kaynağı ve güvenilirlik derecesi basılmalı.
2. **Özgün analiz eklenmeli.** Projenin kendi veri setinden hesaplanan bağlam cümleleri kullanılabilir: "bu ay bölgedeki X. olay", 30 günlük eğilim, önceki olayla mesafe. Bu, "tekrarlayan şablon" riskine karşı en güçlü savunma.
3. **Görsel dilbilgisi çeşitlendirilmeli.** Sahne düzeni coğrafyaya ve olay türüne göre değişmeli; en az 5–6 düzen, harita yakınlığı ve süre değişken olmalı. Aynı gün aynı düzen tekrarlanmamalı. Haftalık özet ayrı bir format olmalı.
4. **Açık beyan yapılmalı.** Her açıklamada "Otomatik üretilmiştir; seslendirme sentetiktir (TTS); kaynaklar: …" yazmalı.
   - YouTube'da `containsSyntheticMedia` için muhafazakâr seçim `true` olmalı. İçerik gerçekçi görüntü değil grafik olduğu için etiket zarar vermez.
   - TikTok'ta `is_aigc=true` işaretlenmeli.
   - Bluesky'de "automated" etiketi, Mastodon'da bot bayrağı açılmalı.
5. **Gelir hedefi olmamalı.** Hat erişim için kurulmalı. YPP'den ret bir yasak değil, ama spam sinyalleri dağıtımı düşürür.

## 6. Güvenilirlik mühendisliği

- **Runner kaynakları.** Açık (public) repolarda standart Ubuntu runner ücretsiz ve sınırsız: 4 vCPU, 16 GB RAM, 14 GB disk ([GitHub Docs](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)).
- **GPU'suz WebGL.** Chrome 137, WebGL için otomatik SwiftShader yedeğini kaldırdı. Bayraksız çalıştırmada WebGL bağlamı oluşturulamaz ([Chrome 137](https://winaero.com/google-releases-chrome-137-with-new-features-and-security-enhancements/), [Chromium issue](https://issues.chromium.org/issues/40277080)). CI için önerilen bayraklar: `--use-gl=angle --use-angle=swiftshader-webgl --enable-unsafe-swiftshader` ([Chromium docs](https://chromium.googlesource.com/chromium/src/+/main/docs/gpu/swiftshader.md)). SwiftShader tamamen CPU'da çalışıyor. Hattın gerçek zamanlı olmayan, kare kare deterministik saatle render etmesi gerekir.
- **WebCodecs ile H.264.** Chrome, yazılım kodlaması için derlenmiş OpenH264 kullanıyor ([chromestatus](https://chromestatus.com/feature/6417796455989248)). OpenH264 pratikte yalnızca Baseline profilini destekliyor, bu yüzden `avc1.42E0xx` istenmeli ([w3c/webcodecs #394](https://github.com/w3c/webcodecs/issues/394)). Playwright'ın paketlediği Chromium'da `isConfigSupported('avc1…')` false dönebiliyor ([issue](https://github.com/OpenIPC/website/issues/330)). Remotion da CPU render için Chrome Headless Shell öneriyor ([Remotion](https://www.remotion.dev/docs/miscellaneous/chrome-headless-shell)).
- **Yedek zinciri:**
  1. WebCodecs `avc1` Baseline
  2. WebCodecs VP9, ardından ffmpeg ile H.264'e dönüştürme (Instagram H.264 istiyor)
  3. PNG kareleri, ardından ffmpeg `libx264`
- **Doğrulama kapıları.** Her çalıştırma render'dan önce bir ön kontrol yapmalı: WebGL bağlamı açılabiliyor mu, `isConfigSupported` ne dönüyor, 1 saniyelik deneme render'ı başarılı mı. Çıktı ffprobe ile doğrulanmalı: codec, 1080×1920, süre, ses akışı. Kara kare kontrolü ffmpeg `blackdetect` ile, ses normalizasyonu `loudnorm` ile yapılmalı.
- **İzleme ve idempotency.**
  - Yayımlanan kayıtların kimlikleri ve platform URL'leri `auto-data` dalındaki bir `published.json` defterinde tutulmalı. Böylece aynı video iki kez gönderilmez.
  - Her platform ayrı bir job olmalı; biri başarısız olursa diğerleri devam etmeli.
  - Hatalar GitHub Issue olarak açılmalı ve job özeti yazılmalı.
  - Açık repolarda zamanlanmış workflow'lar 60 gün commit gelmezse devre dışı kalıyor ([GitHub Docs](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/disable-and-enable-workflows)). Bu sayacın yalnızca varsayılan daldaki commit'lerle mi sıfırlandığı kontrol edilmeli.
- **Cloudflare Workers.** Ücretsiz planda çağrı başına 10 ms CPU ve en fazla 5 cron tetikleyici var ([CF docs](https://developers.cloudflare.com/workers/platform/pricing/)). Render ve TTS için uygun değil. Yalnızca hafif işler için kullanılabilir: yedek bir cron ile Actions'ı `workflow_dispatch` üzerinden tetiklemek, Instagram token yenilemek.

---

## Önerilen mimari

1. **Seç** (6 saatte bir, `auto-data` commit'inden sonra). Önce kesin eleme kuralları uygulanır, sonra S puanı hesaplanır. Ardından MinHash ve coğrafi hücreyle tekilleştirme, MMR ile çeşitlilik sağlanır. Sınırlar: tur başına 1 video, günde 2–6. Gerekirse günün özeti eklenir.
2. **Yaz.** Deterministik Türkçe şablon cümleleri kullanılır, 6 düzen varyantı arasından seçilir. Veri setinden hesaplanan bağlam cümlesi eklenir. Kaynaklar ve güvenilirlik derecesi ekrana yazılır. LLM kullanılmaz.
3. **Seslendir.** Chatterbox Multilingual V3 (MIT) önce Türkçe normalleştiriciden geçen metni okur. Yedek FreyaTTS-small, son çare sessiz ve altyazılı video.
4. **Ses tasarımı.** jsfxr ve WebAudio ile prosedürel efekt ve müzik üretilir. Gerekirse Mixkit'ten seçilmiş birkaç parça sabit dosya olarak repoda tutulur.
5. **Render.** Chrome Headless Shell SwiftShader bayraklarıyla çalışır; WebCodecs H.264 Baseline kullanılır, yukarıdaki yedek zinciri devreye girer. Çıktı ffprobe, blackdetect ve loudnorm kapılarından geçer.
6. **Yayımla.** MP4 bir GitHub Release'e yüklenir; bu aynı zamanda Instagram'ın istediği herkese açık URL'yi sağlar. Sıralama:
   - Hemen: Telegram, Bluesky, Mastodon, Instagram Reels.
   - YouTube Shorts: uyum denetimi onaylanana kadar `private` yüklenir ve kuyrukta bekletilir.
   - TikTok ve X: kapsam dışı.
7. **Beyan ve izleme.** Beyan metni ve platform bayrakları her gönderiye eklenir. `published.json` defteri, hata durumunda açılan Issue ve 60 gün koruması devrede olur.

---

**Doğrulanmamış noktalar:**
- Chatterbox'ın Türkçe kalitesi ve CPU hızı yayımlanmamış. İlk iş olarak 4 vCPU runner'da ölçülmeli.
- FreyaTTS'in eğitim verisi lisansı belgelenmemiş.
- YouTube Video Uploads kovasının günlük üst sınırı konusunda kaynaklar çelişiyor. Bir kaynak "günde 100 çağrı", Google'ın revizyon özeti "10.000 birim" diyor. 2–6 video/gün için bu fark önemli değil.
