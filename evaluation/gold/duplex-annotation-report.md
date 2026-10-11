# Duplex altın standart etiketleme raporu

- **Veri seti:** Duplex Apartment (buildingSMART, CC BY 4.0). Federe proje: `Duplex_A_20110907.ifc` (mimari) + `Duplex_MEP_20110907.ifc` (MEP), IFC2X3, Revit 2011. İki dosyanın da site/bina yerleşimi (0,0,0) ve birimi metre olduğundan ortak dünya koordinatlarında çakıştırıldı.
- **Kural seti:** `rules/default.json` (7 kural).
- **Etiketleyen:** Bağımsız LLM uzman ajanı (Claude), IfcOpenShell 0.8.5 + numpy 2.4.4. İnsan örneklem doğrulaması bekliyor.
- **Tarih:** 2026-10-11
- **Betik:** `evaluation/gold/annotators/duplex_annotate.py` (`.venv/bin/python -I evaluation/gold/annotators/duplex_annotate.py --root .`)
- **Çıktı:** `evaluation/gold/duplex.json`, 145 etiket

## 1. Bağımsızlık

Etiketler, değerlendirilen sistemin kodu (`packages/`, `apps/`, `tools/`), çıktıları (`evaluation/results/`), dokümanları (`docs/`) ve Neo4j veritabanı hiç açılmadan üretildi. Yalnızca şunlar okundu: `rules/default.json`, `tools/datasets/README.md`, `evaluation/README.md`, `evaluation/gold/TEMPLATE.json` ve iki IFC dosyası. Seçici değerlendirme, özellik okuma, geometri, kesişim ve hacim hesabının hepsi betikte sıfırdan yazıldı.

## 2. Yöntem

### 2.1 Seçiciler
- **Sınıf:** `is_a(sınıf)`, alt tipler dahil (örneğin `IfcWall` içine `IfcWallStandardCase` de girer).
- **IFC4 → IFC2X3 eşlemesi:**
  - `IfcBuiltElement` → `IfcBuildingElement`.
  - IFC2X3'te bulunmayan oluşum sınıfları (`IfcDuctSegment`, `IfcPipeSegment`, `IfcDamper` vb.) tip nesnesiyle eşlenir: elemanın tip nesnesi `<sınıf>Type` olmalıdır (`IfcDuctSegmentType` gibi).
  - Sonuç: 2 kanal segmenti, 407 boru segmenti ve 18 kablo segmenti var (`IfcCableSegmentType`, konduitler). Toplam 427 `IfcFlowSegment` eder.
- **Özellikler:** Elemanın kendi pset'lerine, tip nesnesinden miras gelen pset'ler eklendi. `name` niteliği `Name` alanından, `predefinedType` önce elemandan, `NOTDEFINED` ise tip nesnesinden okundu.
- **`exists`:** Değer var ve boş değil. Değer yalnızca özelliğin adını tekrar ediyorsa (`"FireRating"`, `"Fire Rating"`) doldurulmamış bir Revit yer tutucusu sayılır ve "yok" kabul edilir; her durum ayrıntı dosyasına yazılır. Bu projede kuralların hedeflediği duvar ve döşemelerde böyle bir durum çıkmadı (bkz. §5).

### 2.2 Kesişim kuralları
1. **Geometri:** IfcOpenShell iterator'ı dünya koordinatlarında üçgen ağı üretir. Açıklıklar duvar ve döşemeden çıkarılmıştır, yani elemanın fiziksel hali kullanılır.
   - Revit'in eşlenmiş boru prizmalarında ters dönmüş kapak üçgenleri bulunuyor. Bu, hem hacim hem içerde/dışarda testini bozduğu için her kabuğun üçgen yönleri komşuluk taramasıyla tutarlı hale getirildi.
   - Bütün segmentler ve duvar/döşeme/kaplama/kiriş ağları kapalı (manifold). Kapı, pencere, korkuluk ve merdiven kolu ağları açık; bunlar için genelleştirilmiş sargı sayısı yaklaşık sonuç verir.
2. **Geniş faz:** Eksen hizalı sınır kutuları (AABB) her eksende 1 mm'den fazla örtüşmeli. Bu yalnızca gerekli bir koşuldur.
3. **Örtüşme hacmi:** Kayan kafes kestiricisi kullanıldı. İki AABB'nin kesişim kutusuna rastgele kaydırılmış düzenli bir ızgara yerleştirilir. Her iki kapalı ağın da içinde kalan (genelleştirilmiş sargı sayısı > 0,5) nokta sayısı h³ ile çarpılır. Bu kestirici yansızdır.
   - İki bağımsız kaydırma hesaplanır; aralarındaki fark örnekleme belirsizliğini gösterir.
   - **Doğrulama:** 35 elemanın kendi kendisiyle örtüşmesi, diverjans teoremiyle bulunan kesin hacimle karşılaştırıldı. Ortalama hata +%0,1, standart sapma %0,8.
   - **Tam içerilme:** Bir elemanın tüm yüzey noktaları (köşeler, kenar ortaları, yüz merkezleri) diğerinin içindeyse örtüşme o elemanın tamamıdır. Bu durumda hacim kesin ağ hacminden alınır ("exact-contained"). 93 benzersiz aday çift bu yolla kesin hesaplandı.
4. **Delip geçme (1 mm tolerans):** Örtüşme bölgesinin kalınlığı ≥ 1 mm olmalı. Kalınlık, örtüşme noktaları üzerinde min(A yüzeyine uzaklık, B yüzeyine uzaklık) değerinin en büyüğünün iki katı olarak hesaplandı (örtüşmeye sığan en büyük kürenin çapı). Yüz yüze temas ihlal sayılmaz.
5. **minVolume:** En iyi kestirim ≥ minVolume olmalı.
   - Eşiğin ±%25'i içindeki çiftler 10 kat yoğun kafes ve 4 kaydırmayla yeniden hesaplandı ve "sınırda" olarak listelendi.
   - Eşiğin ±%5'i içinde olanlar ya da kaydırmaları eşiğin iki yanına düşenler "karar-kritik" olarak işaretlendi.
6. **mitigation:** Uyan bir elemanın ağı, örtüşme noktalarının ağırlık merkezine `maxDistance` mesafeden yakınsa ihlal iptal edilir. Bu projede uyan eleman yok (bkz. §3).
7. **IfcOpenShell `geom.tree` çapraz kontrolü:** Görevde istenen `clash_intersection_many`, `clash_collision_many` ve `clash_clearance_many` denendi.
   - Bu kurulumda hiçbir çift için sonuç döndürmediler. Aynı dosyada döşeme üzerinde duran duvarlar (57 duvar × 21 döşeme) için bile çakışma ve 50 mm açıklık sonucu 0 çıktı. Aynı ağaçta `select_box` ise çalışıyor.
   - `add_file`, `add_iterator`, `opencascade`/`cgal`/`hybrid` kütüphaneleri ve farklı çıktı türleri denendi; sonuç değişmedi.
   - Bu yüzden ağaç hiçbir kararda kullanılmadı. Betik her çalıştırmada bu durumu `tree_diagnostic` ile kayda geçirir.
   - Çapraz doğrulama yerine, kafes kestiricisi kesin hacimlerle doğrulandı (madde 3).

## 3. Kural bazında ölçütler ve sonuçlar

| Kural | Ölçüt | İncelenen | Etiket |
|---|---|---|---|
| INFO-WALL-01 | Bütün `IfcWall` (alt tipler dahil) için `Pset_WallCommon.FireRating` var mı | 57 duvar | **57** |
| FS-DUCT-WALL-01 | Kanal segmenti × FireRating'i tanımlı duvar | 2 kanal × **0** duvar | **0** |
| FS-DUCT-SLAB-01 | Kanal segmenti × FireRating'i tanımlı döşeme | 2 kanal × **0** döşeme | **0** |
| FS-PIPE-WALL-01 | Boru segmenti × FireRating'i tanımlı duvar | 407 boru × **0** duvar | **0** |
| CLASH-MEP-STR-01 | `IfcFlowSegment` × `IfcBuildingElement`, delip geçme ve ≥ 1 L | 427 × 157; **591** AABB adayı; 462 geometrik çakışma | **58** |
| FS-PARTY-WALL-01 | Adında "Party Wall" geçen `IfcWall` için FireRating var mı | 4 duvar | **4** |
| FS-PARTY-WALL-02 | `IfcFlowSegment` × "Party Wall" duvarı, delip geçme (minVolume 0) | 427 × 4; **64** AABB adayı | **26** |
| **Toplam** | | | **145** |

**INFO-WALL-01 / FS-PARTY-WALL-01:** Modeldeki hiçbir duvarda `Pset_WallCommon.FireRating` özelliği yok. Pset'in kendisi var; içinde Reference, LoadBearing, ExtendToStructure ve IsExternal bulunuyor. Duvarların tip nesnesi olmadığından miras gelecek bir değer de yok. Ham dosyada `FireRating` geçen 44 satırın hepsi pencere ve kapılara ait. Bu nedenle 57 duvarın tamamı ihlal. Party Wall seçicisi 4 duvar seçiyor (1 `IfcWall`, 3 `IfcWallStandardCase`); dördü de ihlal.

**FS-DUCT-WALL-01 / FS-DUCT-SLAB-01 / FS-PIPE-WALL-01:** Nesne seçicisi FireRating değeri olan duvar ya da döşeme istiyor. Modelde böyle bir eleman olmadığı için nesne kümesi boş ve kural gereği ihlal yok. Bu sonuç, eksik verinin denetimi sessizce devre dışı bıraktığını gösteriyor; tezde vurgulanması önerilir.
- Bilgi için: İki kanal segmenti (`2cBXEHhbv7WxAj1MwZ5Ik2`, `3pumjEMRj8WfnEQMDxBrk9`) çatı döşemesini (`3ThA22djr8AQQ9eQMA5s7I`, ~22,4 L) ve birer alçıpan asma tavanı (~2,8 L) geometrik olarak delip geçiyor. Bu çiftler CLASH-MEP-STR-01'de etiketli.
- Modelde `IfcDamperType` ya da yangın damperi yok; mitigation kümesi boş. Duvarlar FireRating taşısaydı bile hiçbir geçiş damperle iptal edilemezdi.

**CLASH-MEP-STR-01:** 591 AABB adayının 462'si 1 mm toleransla gerçek delip geçme; 404'ü 1 L eşiğinin altında kalıyor (medyan 0,08 L). 58 ihlal, 53 farklı segment ve 26 farklı yapı elemanını kapsıyor.
- **Nesneye göre:**
  - Exterior Brick on Block: 22
  - Interior Furring 152 mm: 13
  - Party Wall: 9
  - Interior Partition 92 mm: 6
  - Foundation 435 mm: 1
  - Alçıpan asma tavan (`IfcCovering`): 4
  - Çatı döşemesi: 2
  - Ahşap kirişli kat döşemesi: 1
- **Segment türüne göre:** 50 boru, 4 kanal, 4 konduit.
- 31 ihlalde segment tamamen duvarın içinde (duvar boşluğunda yatay ya da düşey ilerleyen boru). Bunlar fiziksel olarak gerçek kesişim, kuralın tanımına da uyuyor ("yapı elemanının içinden geçmesi"). Uzman notu: Hafif çelik veya ahşap dikmeli duvarlarda tesisatın duvar boşluğundan geçmesi uygulamada olağandır. Duvarlar tek parça katı olarak modellendiği için çakışma görünüyor. Kural bunları dışlamadığı için etiketlendi.
- Kapı (2) ve kiriş (1) kesişimleri 0,02 L'nin altında, yani eşik altı.
- `IfcRoof` ve iki `IfcStair` kapsayıcıdır, kendi geometrileri yok. Parçaları (çatı döşemesi, merdiven kolları, kirişler, korkuluklar) ayrı ayrı denetlendi.

**FS-PARTY-WALL-02:** 64 adaydan 26'sı delip geçiyor (0,0016–2,54 L, kalınlık 6,9–47 mm). Bunların 24'ü boru, 2'si konduit; 4'ü duvarın içinde tamamen kalıyor. Çakışmayan 38 adayın örtüşme hacmi tam 0. Bu kuralda sınırda vaka yok, ayrım net.

## 4. Sınırda / belirsiz vakalar

### 4.1 CLASH-MEP-STR-01'de 1 L eşiğine yakın çiftler (karar en iyi kestirimle verildi)

Karar-kritik (±%5):

| Segment | Eleman | Hacim | Yöntem | Karar |
|---|---|---|---|---|
| `0IWYz6Nx91YhGoaGRcM9Mo` (sıcak su) | `0iEHWY1$XA8eQeeULq4j_U` Furring | 1,003 L | kesin (tam içerilme) | **İhlal** |
| `0$NxBsKq91n8kPqH4KSep1` (sıcak su) | `0iEHWY1$XA8eQeeULq4jDb` Furring | 0,988 L (4 kaydırma: 0,982–0,995) | yoğun kafes | ihlal değil |
| `2$kWvGjlnF5ee4F23d4sPx` (atık su) | `0iEHWY1$XA8eQeeULq4j_U` | 0,986 L | kesin | ihlal değil |
| `3dGHknFZr6jx2fputwRzpC` (atık su) | `0iEHWY1$XA8eQeeULq4jDb` | 0,986 L | kesin | ihlal değil |
| `3SjNOa1Aj1NQy_HHBUTvTT` (mekanik) | `2O2Fr$t4X7Zf8NOew3FNr2` Brick | 0,980 L | kesin | ihlal değil |
| `214kk$_0PEUvVStO70oaMy` (mekanik) | `2O2Fr$t4X7Zf8NOew3FNtn` Brick | 0,974 L | kesin | ihlal değil |

- Kesin hacimler modelin üçgenlenmiş geometrisinden hesaplandı. 24 kenarlı prizma gerçek silindirden ~%1,1 küçüktür.
- İkiz görünen `0IWYz6…` ve `0$NxBs…` farklı sonuç verdi. İlki duvarın içinde tamamen kalıyor; ikincisinin ucu duvardan ~%1,5 taşıyor.
- Analitik silindir hacmi kullanan bir sistem 0,97–0,99 L'lik çiftleri eşiğin üstünde bulabilir. Bu yüzden insan doğrulamasında öncelik bunlara verilmeli.

±%25 bandındaki diğer çiftler (yoğun kafes ya da kesin hesapla kararları sağlam):
- **İhlal değil:**
  - `0quQz8L7D2gB0SDpzXgSjl` ve `0f9KwjuGbB3Bk56rNJOALp` × Foundation `2O2Fr$t4X7Zf8NOew3FKE5`: 0,755 L
  - `0_dkc9hC11lA4ntVXLyrTT` ve `0tdBYZ_1n4Hwqj0yrnFuz$` × çatı döşemesi: 0,827 L
  - `1KQk2kPOb2lRaeDTHcSljP`: 0,863 L
  - `0t5Il02n51tQ1GK4OsvuEB`: 0,866 L
  - `1SEEl_3N1649G1FNumeBoq` ve `336ajHRPXDE8$eoXtNDAE2` × Party Wall: 0,89 L
  - `2zBavrf4H0$vUGejezuG6q` × kat döşemesi: 0,909 L
- **İhlal:**
  - `08ayqJVPzCnPvZ0wv8Gs_7`, `3fq8s9NyLB19dgP900nV9R`: 1,055 L
  - `3T5Rd$BhX5YQB2DUuD6Yfm`, `3D7$N30LL0pBnXNmQY36yU`: 1,146 L
  - `08zr6JNBDBDATCIEkAVgHh` × asma tavan: 1,147 L (kaydırmalar 1,095–1,167)
  - `1AE8TeH3D87eRKclepfjI5`: 1,178 L
  - `08bJ5GciX44RctWg3I8Yp1`, `3SxW3p0SzBdhood6G7P9qz`: 1,205 L

### 4.2 1 mm toleransa yakın ince örtüşmeler
- **Kalınlığı 1–2,5 mm olan 9 çakışma:** Örneğin `0pAp3Xisv7QvVlEvVGjK9c` × `2O2Fr$t4X7Zf8NOew3FKIu` 1,05 mm; konduit dirsekleri `3oHfnTBz5C$R5u3CRLso*` × kat döşemesi ~2,5 mm. Hacimleri 0,002 L'nin altında.
- **Kalınlığı < 1 mm olduğu için çakışma sayılmayan 6 çift:** `2TAzfNf1j94uj2yMPneX4$`, `2SoPeCb2D87xSg3et19Mx1` (0,9997 mm); `3WPhAcJVf6iO7Y1t_js2Y7`, `1jM$idYtH0Wfvjr2fV6BBx` × asma tavan (0,74 mm).
- Kafes aralığı bu çiftlerde ~0,4–0,6 mm olduğundan kalınlık kestirimi tam toleransta güvenilir değil.
- Bu çiftlerin hepsi CLASH kuralının 1 L eşiğinin çok altında ve hiçbiri Party Wall'a ait değil. Hiçbir etiketi etkilemiyorlar.

## 5. Veri kalitesi gözlemleri
- **FireRating:** Duvar ve döşemelerin hiçbirinde yok.
  - Pencerelerde `Pset_WindowCommon.FireRating = "FireRating"`, kapılarda `Pset_DoorCommon.FireRating = "Fire Rating"` var; tip pset'lerinde de aynı değerler duruyor.
  - Bunlar Revit'in parametre adını değer olarak dışa aktardığı, doldurulmamış yer tutucular.
  - Mevcut kuralların hiçbiri pencere ya da kapıyı hedeflemediği için hiçbir etiketi etkilemiyorlar. Ancak "exists" kontrolünü yer tutucuya karşı denetlemeyen bir sistem, bu değerleri gerçek değer sanabilir.
- **Kapsayıcı elemanlar:** `IfcRoof` (`0jf0rYHfX3RAB3bSIRjmxl`) ve iki `IfcStair` (`0wkEuT1wr1kOyafLY4v_O1`, `21ldoMpbP4VfsJ0XGY_34d`) kendi geometrisi olmayan kapsayıcılar. Geometri, parçalarında.
- **Ağ yönü:** Eşlenmiş boru geometrilerinde kapak üçgenleri ters dönmüş. Ağlar kapalı ama tutarlı yönlü değil; düzeltilmeden hesaplanan hacim 6 kata kadar hatalı çıkıyor.
- **Tip sınıflandırması:** Konduitler `IfcCableSegmentType` olarak dışa aktarılmış. IFC2X3'te doğru sınıf `IfcCableCarrierSegmentType` olurdu. "Conduit Elbow" adlı 8 dirsek fitting değil, segment olarak modellenmiş. Kurallar `IfcFlowSegment` seçtiği için hepsi kapsamda.
- **Kanallar:** Modelde yalnız 2 kanal segmenti ("Round Duct:Taps") var; damper hiç yok.
- **Ayırıcı duvar:** Adlandırma tutarlı ("Party Wall - CMU Residential Unit Dimising Wall"). Birimleri ayıran başka duvar adı görülmedi.

## 6. Bilinen sınırlamalar
1. Etiketler tek bir LLM ajanınca üretildi. İnsan uzman doğrulaması henüz yapılmadı.
2. **Hacim:**
   - Kesin hacim yalnız tam içerilme durumunda hesaplandı. Diğer çiftler örneklemeyle kestirildi (doğrulanmış hata ~%1).
   - Analitik silindir hacmi ya da başka bir kestirici kullanan bir sistem, eşiğe ±%5 yakın 6 çiftte farklı karar verebilir.
3. **Kalınlık ölçütü:** Örneklenen noktalarla hesaplandığı için gerçek kalınlığı biraz eksik tahmin eder (en çok yaklaşık h·√3/2). Bu yalnız §4.2'deki 1 mm civarındaki çiftleri etkiler; hiçbiri etiketlenmedi.
4. **`geom.tree`:** IfcOpenShell'in kendi BVH çakışma algılayıcısı bu kurulumda sonuç vermediği için ikinci bir bağımsız geometri motoruyla çapraz doğrulama yapılamadı.
5. **Açık ağlar:** Kapı, pencere, korkuluk ve merdiven kolu ağları açık. Sargı sayısı bunlarda yaklaşık olsa da ilgili kesişimler (kapı 2, kiriş 1) eşiğin çok altında.
6. **Kuralın kelimesi kelimesine uygulanması:** Duvar boşluğunda ilerleyen tesisat (31 vaka) ve alçıpan asma tavan geçişleri (4 vaka) etiketlendi, çünkü kural bunları dışlamıyor. Bir mühendis bunların bir kısmını "olağan uygulama" sayabilir.
7. **Çalışma süresi ve tekrar üretim:**
   - Son çalıştırma 1993 s (~33 dk duvar saati; CPU ~14,5 dk; makine o sırada başka işlerle yüklüydü).
   - Çalıştırmadan sonra betikte yalnız ayrıntı kayıtlarındaki `clash`/`violation` alanlarının JSON'a numpy bool yerine Python bool olarak yazılması düzeltildi. Bu değişiklik `duplex.json`'u etkilemez.
   - Rastgelelik sabit tohumlarla belirlendiği için yeniden çalıştırma aynı etiketleri üretmelidir.

## 7. İnsan doğrulaması için örneklem (tabakalı, tohum 20261011)

Görüntüleyicide (örneğin BIMvision, Solibri, BlenderBIM) iki dosya birlikte açılıp kontrol edilmeli.

| # | Kural | GlobalId'ler | Not |
|---|---|---|---|
| 1 | INFO-WALL-01 | `2O2Fr$t4X7Zf8NOew3FLCm` | Interior Plumbing 152 mm, FireRating yok |
| 2 | INFO-WALL-01 | `2O2Fr$t4X7Zf8NOew3FLOH` | Exterior Brick on Block |
| 3 | INFO-WALL-01 | `2O2Fr$t4X7Zf8NOew3FKST` | Interior Partition 92 mm |
| 4 | INFO-WALL-01 | `2O2Fr$t4X7Zf8NOew3FNr2` | Exterior Brick on Block |
| 5 | FS-PARTY-WALL-01 | `2O2Fr$t4X7Zf8NOew3FKau` | Party Wall (`IfcWall`) |
| 6 | FS-PARTY-WALL-01 | `2O2Fr$t4X7Zf8NOew3FKRH` | Party Wall |
| 7 | CLASH-MEP-STR-01 | `2_nWSI38z1MQowEuvpwI2C`, `2O2Fr$t4X7Zf8NOew3FNr2` | Boru duvarın içinde, 5,45 L |
| 8 | CLASH-MEP-STR-01 | `2oUDfYEAjDzQSvWL1eupfi`, `2O2Fr$t4X7Zf8NOew3FNr2` | Boru duvarın içinde, 2,26 L |
| 9 | CLASH-MEP-STR-01 | `27fGOYnQj8MQqqFxq21fgv`, `2O2Fr$t4X7Zf8NOew3FNau` | Boru duvarın içinde, 2,19 L |
| 10 | CLASH-MEP-STR-01 | `08ayqJVPzCnPvZ0wv8Gs_7`, `2O2Fr$t4X7Zf8NOew3FNhv` | 1,055 L, eşiğe yakın |
| 11 | CLASH-MEP-STR-01 | `0uq3rG9sb5iPszypOTBXZb`, `0iEHWY1$XA8eQeeULq4jE6` | Boru duvarı kesiyor, 2,45 L |
| 12 | CLASH-MEP-STR-01 | `36PHY8l$rBmPsWvnnIIhcd`, `2O2Fr$t4X7Zf8NOew3FNqI` | Duvarın içinde, 1,71 L |
| 13 | CLASH-MEP-STR-01 | `2zJ3WP6bzE_u5MgDrNcyfs`, `2O2Fr$t4X7Zf8NOew3FNhv` | Duvarın içinde, 1,71 L |
| 14 | CLASH-MEP-STR-01 | `3ZpZg5x6L8RhsGp3tg8aGD`, `0iEHWY1$XA8eQeeULq4jE6` | Konduit duvarı kesiyor, 1,80 L |
| 15 | FS-PARTY-WALL-02 | `0Tjs7l9CPAQxN9XnigQv$l`, `2O2Fr$t4X7Zf8NOew3FNbT` | 0,012 L, 14 mm |
| 16 | FS-PARTY-WALL-02 | `0qhCU2klz4GAVI0SV1Z_kT`, `2O2Fr$t4X7Zf8NOew3FKRi` | Duvarın içinde, 2,19 L |
| 17 | FS-PARTY-WALL-02 | `1XvfWvgFP6gPrew2jqx$Dn`, `2O2Fr$t4X7Zf8NOew3FKRH` | En küçük geçiş, 0,002 L, 12 mm |
| 18 | FS-PARTY-WALL-02 | `0NtcwyHBzBVA6ASoO0BEYM`, `2O2Fr$t4X7Zf8NOew3FKRH` | Soğuk su, 1,42 L |
| 19 | FS-PARTY-WALL-02 | `15$tmU0G9ARvozWPzAruwE`, `2O2Fr$t4X7Zf8NOew3FKRH` | Sıcak su, 0,016 L |
| 20 | FS-PARTY-WALL-02 | `1SEEl_3N1649G1FNumeBoq`, `2O2Fr$t4X7Zf8NOew3FKRi` | Atık su, 0,89 L |

Örnekleme ek olarak, §4.1'deki 6 karar-kritik çiftin ve kanal–çatı geçişlerinin (`2cBXEHhbv7WxAj1MwZ5Ik2`, `3pumjEMRj8WfnEQMDxBrk9` × `3ThA22djr8AQQ9eQMA5s7I`) de görsel olarak kontrol edilmesi önerilir.
