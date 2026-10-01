# Lisanslar / Licences

| Varlık | Kaynak | Lisans |
|---|---|---|
| Motor kodu | bu depo | MIT (`LICENSE`) |
| Üretilen videolar | bu depo | CC BY 4.0 |
| `assets/data/countries-50m.json` | [world-atlas](https://github.com/topojson/world-atlas) 2.0.2, Natural Earth 1:50m | ISC (paket), Natural Earth kamu malı |
| `assets/data/relief.png` | NOAA [ETOPO1](https://www.ncei.noaa.gov/products/etopo-global-relief-model) (4 yay dakikası, ERDDAP üzerinden), `tools/data/build_relief.py` ile normal haritasına çevrilir | Kamu malı (ABD federal verisi) |
| `assets/data/disputed-tur-view.geojson` | Greater-Turkiye/platform, Türkiye görüşüne göre işgal altındaki topraklar (handbook ADR 0014) | CC BY 4.0 |
| `assets/fonts/montserrat-*.woff2` | [Montserrat](https://github.com/JulietaUla/Montserrat) | SIL Open Font License 1.1 |
| `assets/fonts/plexmono-*.woff2` | [IBM Plex Mono](https://github.com/IBM/plex) | SIL Open Font License 1.1 |
| `assets/fonts/*.ttf` (Big Shoulders, Archivo, Newsreader, Schibsted Grotesk, Unbounded, Martian Mono, JetBrains Mono, Courier Prime, Black Ops One, Cinzel, Fraunces) | [google/fonts](https://github.com/google/fonts) @ `9710da1e` | SIL Open Font License 1.1 (`assets/fonts/licenses/*-OFL.txt`); video başlığı ve gömme serbest (OFL FAQ 1.1, 1.12) |
| `assets/fonts/specialelite-regular.ttf` | [google/fonts](https://github.com/google/fonts/tree/main/apache/specialelite) @ `9710da1e` | Apache License 2.0 (`assets/fonts/licenses/specialelite-LICENSE.txt`) |
| `assets/data/countries.json` | Unicode CLDR 48.2.3 `codeMappings` (ISO kodları), Natural Earth (ağırlık merkezleri), elle yazılmış başkent koordinatları; `tools/data/build_countries.mjs` | Unicode License v3; Natural Earth kamu malı |
| `assets/emblems/**` | Wikimedia Commons, Wikidata üzerinden | Her dosyanın lisansı ve yazarı `assets/emblems/manifest.json`'da; yalnızca kamu malı, CC0, CC BY, CC BY-SA |
| earcut (paketlenir) | [mapbox/earcut](https://github.com/mapbox/earcut) | ISC |
| mp4-muxer (paketlenir) | [Vanilagy/mp4-muxer](https://github.com/Vanilagy/mp4-muxer) | MIT |
| `assets/sound/bed-452999.mp3` | Freesound 452999 "Postapocalyptic Drone", Breviceps (https://freesound.org/people/Breviceps/sounds/452999/) | CC0 1.0 |
| `assets/sound/whoosh-169867.mp3` | Freesound 169867 "swoosh", Halgrimm (https://freesound.org/people/Halgrimm/sounds/169867/) | CC0 1.0 |
| `assets/sound/tick-683048.mp3` | Freesound 683048 "Click / Tick", Squirrel_404 (https://freesound.org/people/Squirrel_404/sounds/683048/) | CC0 1.0 |
| `assets/sound/pop-653369.mp3` | Freesound 653369 "SharpClick.wav", TriqyStudio (https://freesound.org/people/TriqyStudio/sounds/653369/) | CC0 1.0 |
| Seslendirme modeli (runner'da indirilir, depoya girmez) | [Chatterbox Multilingual](https://github.com/resemble-ai/chatterbox), Resemble AI | MIT; üretilen her klip PerTh filigranı taşır, videoda "SESLENDİRME: YAPAY SES" yazar |
| ffmpeg (`ffmpeg-static`, yalnız geliştirme) | [ffmpeg-static](https://github.com/eugeneware/ffmpeg-static) | GPL-3.0 ikili; depoya girmez, videoya gömülmez |

Amblem kullanım kuralı (PLAN.md bölüm 6, ADR 0026): yalnızca haber bağlamında, konusunun üstünde,
logomuzun yanında değil ve onay izlenimi vermeden. CC BY ve CC BY-SA dosyalar kullanıldığında
yazar, videonun açıklamasında manifest'teki `author` alanıyla anılır.
