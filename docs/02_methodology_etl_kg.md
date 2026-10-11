# Bölüm 2: Veri Dönüşümü ve Bilgi Grafiği İnşası

## 2.1. IFC Verisinin Ayrıştırılması

### 2.1.1. Araç Seçimi ve Öneri Formundan Sapmanın Gerekçesi

Tez öneri formunda (Bölüm 4.1) IFC dosyalarının Python dili ve IfcOpenShell kütüphanesi ile işlenmesi öngörülmüştür. Uygulama aşamasında ise ayrıştırma katmanı TypeScript dili ve **web-ifc** kütüphanesi (That Open Company, MPL-2.0, sürüm 0.0.78) ile gerçekleştirilmiştir. Bu tercihin gerekçeleri şunlardır:

1. **Uçtan uca tek dil.** Sistemin son kullanıcı arayüzü, tarayıcıda çalışan bir 3B BIM görüntüleyicisi içermektedir. web-ifc hem Node.js sunucusunda hem de tarayıcıda aynı C++/WebAssembly çekirdeğiyle çalışır. Bu nedenle sunucunun denetim için okuduğu geometri ile kullanıcının gördüğü geometri aynı ayrıştırıcıdan üretilmektedir.
2. **Şema kapsamı.** web-ifc IFC2X3, IFC4 ve IFC4X3 şemalarını desteklemektedir. Çalışmada kullanılan örnek modeller IFC4X3_ADD2 şemasındadır.
3. **Yöntemin korunması.** Bu değişiklik yalnızca araç düzeyindedir. Öneri formundaki yöntem, yani IFC → bilgi grafiği → mekansal akıl yürütme → kural denetimi → açıklanabilir raporlama zinciri değişmemiştir.

Araç değişikliğinin sonuçları etkilemediğini göstermek amacıyla iki ayrıştırıcı aynı modeller üzerinde karşılaştırılmıştır: eleman kümeleri ve sınırlayıcı kutu değerleri web-ifc ile IfcOpenShell 0.8.5 arasında kıyaslanmıştır. Sapma 1 mm eşiğinin çok altında kalmıştır (Bkz. Bölüm 2.1.6, `tools/parity`).

### 2.1.2. Çıkarılan Bilgi

Öneri formundaki "veritabanına sadece çakışma analizi için gerekli teknik özelliklerin aktarılması" ilkesi doğrultusunda her ürün (IfcProduct) için yalnızca şu bilgiler çıkarılmıştır:

| Alan | Kaynak | Not |
|---|---|---|
| `globalId` | `IfcRoot.GlobalId` | Birincil anahtar; federasyonda modeller arası eşleştirme anahtarıdır |
| `ifcClass`, `ifcSuperClasses` | Şema kalıtım tanımı | Örn. `IfcWallStandardCase` → `IfcWall`, `IfcBuiltElement`, `IfcElement` |
| `category` | Kalıtım | `physical` (IfcElement alt tipleri) / `spatial` (IfcSpatialElement alt tipleri) |
| `name`, `predefinedType` | Öznitelikler | |
| `properties` | `IfcRelDefinesByProperties`, `IfcRelDefinesByType` | `Pset.Özellik` anahtarlarıyla düzleştirilmiştir |
| `materials` | `IfcRelAssociatesMaterial` | Katman, liste, bileşen ve profil kümeleri dahil |
| `aabb` | Gövde geometrisi | Metre, Z-yukarı dünya koordinatları |

Ataları ayrıca saklanmaktadır, çünkü IFC'de bir kural genellikle bir üst sınıfa yazılır ("her `IfcWall`…"). Atalar saklanmasaydı IFC2X3 modellerindeki `IfcWallStandardCase` örnekleri bu kuralların dışında kalırdı. Önceki prototipte bu hata gözlenmiştir.

**Fiziksel elemanların kapsamı:**
- Fiziksel eleman kümesine `IfcFeatureElement` alt tipleri dahil edilmemiştir (boşluklar, çıkıntılar).
- `IfcVirtualElement` de dahil edilmemiştir.
- Bu elemanların maddi bir varlığı bulunmadığından çakışma adayı olmaları anlamsızdır.

### 2.1.3. Özellik Kümeleri ve Tip/Örnek Semantiği

IFC'de bir özellik hem tip nesnesine (`IfcTypeObject.HasPropertySets`) hem de örneğe (occurrence) atanabilir. Standart semantik gereği önce tip düzeyindeki özellikler uygulanmış, ardından örnek düzeyindeki değerler bunları ezmiştir:

$$P(e) = P_{\text{tip}}(e) \oplus P_{\text{örnek}}(e)$$

Burada $\oplus$ sağdaki değerin önceliğini ifade eder.

**Değer dönüşümleri:**
- `IfcLengthMeasure` türündeki değerler modelin uzunluk birimine göre metreye çevrilmiştir.
- `IfcAreaMeasure` türündeki değerler m²'ye çevrilmiştir.
- `IfcVolumeMeasure` türündeki değerler m³'e çevrilmiştir.
- `IfcLogical` değerleri ikili mantığa indirgenmiş, `UNKNOWN` değeri ise boş bırakılmıştır.

Miktar kümeleri (`IfcElementQuantity`) bilinçli olarak aktarılmamıştır. Denetim kuralları geometrik büyüklükleri doğrudan sınırlayıcı kutulardan hesaplamaktadır.

### 2.1.4. Birimler ve Koordinat Çerçevesi

Örnek modellerin uzunluk birimi milimetredir (`IFCSIUNIT(*,.LENGTHUNIT.,.MILLI.,.METRE.)`).

**Birim ölçekleme:**
- SI önekleri boyut sayısı kadar üslü uygulanmıştır. Bir $d$ boyutlu birim ve $p$ öneki için ölçek $s = p^{d}$ olarak alınmıştır (örn. mm² için $10^{-6}$).
- Dönüşüme dayalı birimler (`IfcConversionBasedUnit`, örn. foot) dönüşüm katsayısı ile temel SI birimi çarpılarak çözümlenmiştir.
- Geometri web-ifc tarafından metreye ölçeklenmektedir.

**Eksen dönüşümü:** web-ifc geometriyi three.js geleneğine uygun olarak Y-yukarı bir çerçevede üretmektedir. Bu davranış deneysel olarak doğrulanmıştır: kanalın IFC'deki düşey aralığı (0,9–4,7 m) web-ifc çıktısında Y ekseninde görülmüştür. Bu nedenle tüm noktalar IFC'nin Z-yukarı dünya çerçevesine şu dönüşümle geri çevrilmiştir:

$$(x, y, z)_{\text{IFC}} = (x,\; -z,\; y)_{\text{web-ifc}}$$

Modeller yeniden merkezlenmeden (`COORDINATE_TO_ORIGIN = false`) okunmuştur. Aynı projeye ait disiplin modelleri ortak bir dünya koordinat sistemini paylaştığından bu tercih, federasyonda ek bir hizalama adımını gereksiz kılmaktadır.

### 2.1.5. Sınırlayıcı Kutu (AABB)

Her elemanın sınırlayıcı kutusu şu adımlarla hesaplanmıştır:
1. Gövde geometrisinin üçgenlenmiş ağı (tessellation) alınır.
2. Ağın tüm köşe noktalarına yerleşim matrisi uygulanır.
3. Dünya koordinatlarındaki noktaların eksen bazında en küçük ve en büyük değerleri alınır:

$$\text{AABB}(e) = \Big[\min_{v \in V_e} v_x,\ \max_{v \in V_e} v_x\Big] \times \Big[\min_{v \in V_e} v_y,\ \max_{v \in V_e} v_y\Big] \times \Big[\min_{v \in V_e} v_z,\ \max_{v \in V_e} v_z\Big]$$

Düzlemsel yüzeylerde bu kutu kesindir. Eğri yüzeylerde ise üçgenleme hassasiyetine bağlı, ihmal edilebilir bir yaklaşım hatası içerir.

AABB eksenlere hizalı olduğundan, eksenlere göre döndürülmüş elemanlarda gerçek hacimden büyük bir kutu üretir. Bu durum çakışma tespitinde yanlış pozitif riski doğurur. Bu sınırlılık Bölüm 3'te ele alınmakta ve Bölüm 5'te kesinlik (precision) metriğiyle ölçülmektedir.

**Geometrisi olmayan elemanlar:** Gövde geometrisi bulunmayan elemanlarda `aabb` boş bırakılmıştır. Bu elemanlar çakışma analizine girmez, ancak grafa düğüm olarak eklenir:
- yalnızca alt parçalardan oluşan birleşik elemanlar (örn. `IfcRoof`),
- gruplayıcı vekil (proxy) elemanlar.

### 2.1.6. Doğrulama ve Gözlemler

Ayrıştırıcının doğruluğu örnek modellerdeki bilinen değerlerle birim testleri üzerinden sınanmıştır (`packages/ifc/test`):
- Kanal elemanının sınırlayıcı kutusu $[7{,}80; 8{,}00] \times [7{,}85; 8{,}05] \times [0{,}90; 4{,}70]$ m olarak elde edilmiştir.
- Döşemenin `Pset_SlabCommon.FireRating = REI30` özelliği okunmuştur.
- Bir alt tipin üst tipiyle birlikte sorgulanması sonucu oluşan çift kayıt sorunu giderilmiştir. Önceki prototipte `IfcAirTerminal` elemanları hem kendi sınıfı hem de `IfcFlowTerminal` üzerinden iki kez sayılmaktaydı.

**Parity karşılaştırması (web-ifc ↔ IfcOpenShell).** Her iki modelin fiziksel elemanları IfcOpenShell 0.8.5 (`use-world-coords`) ile bağımsız olarak okunmuş ve web-ifc çıktısıyla karşılaştırılmıştır (`npm run parity`).

Karşılaştırmada üç kriter kullanılmıştır:
- GlobalId kümelerinin eşitliği,
- sınıf adlarının eşitliği,
- geometri varlığının eşitliği.

Bunlara ek olarak sınırlayıcı kutu köşelerindeki en büyük mutlak sapma ölçülmüştür. Kabul eşiği 1 mm olarak belirlenmiştir.

| Model | Fiziksel eleman | Geometrili | Maks. AABB sapması |
|---|---|---|---|
| Building-Architecture.ifc | 15 | 11 | 0,0001 mm |
| Building-Hvac.ifc | 6 | 5 | < 0,0001 mm |

Her iki model için eleman kümeleri ve sınıflar birebir örtüşmüştür. Sapmalar kayan nokta hassasiyeti düzeyindedir. Bu sonuç, öneri formundaki araçtan sapmanın denetim girdisini değiştirmediğini göstermektedir.

Örnek modellere ilişkin iki gözlem kayda geçirilmiştir:
1. `IfcChimney` elemanı her iki ayrıştırıcıda da geometrisizdir. Bu durum ayrıştırıcıdan değil, modelin kendisinden kaynaklanmaktadır.
2. `IfcSpace` elemanları web-ifc'nin geometri akışına dahil değildir. Mekanlar çakışma adayı olmadığından bu durum denetimi etkilememektedir.

## 2.2. Labeled Property Graph (LPG) Tasarımı

### 2.2.1. Veri Modeli

Ayrıştırılan modeller Neo4j 5.26 (LTS) üzerinde etiketli özellik grafı (Labeled Property Graph, LPG) olarak temsil edilmiştir.

**Düğüm tipleri:**

| Düğüm | Etiketler | Temel özellikler |
|---|---|---|
| Bina elemanı | `:Element` + IFC sınıfı + tüm ataları (örn. `:Element:IfcWallStandardCase:IfcWall:IfcBuiltElement:IfcElement`) | `globalId`, `ifcClass`, `category`, `name`, `predefinedType`, `materials`, `minX…maxZ`, `Pset.Özellik` anahtarları |
| Model | `:Model` | `fileName`, `schema`, `discipline`, `ingestedAt` |

**Etiketleme tercihi:** IFC sınıf adları etiket olarak `Ifc` önekiyle birlikte korunmuştur. Ayrıca sınıfın tüm ataları da etiket olarak eklenmiştir. Önceki prototipte etiketler önek kırpılarak üretiliyordu (örn. `Wall`) ve alt tipler kapsanmıyordu. Bu tasarımda şemaya sadakat sağlanmış ve bir üst sınıfa yazılan sorgu bütün alt tiplerini doğrudan kapsamıştır.

**İlişki tipleri:**

| İlişki | Yön | Kaynak |
|---|---|---|
| `CONTAINED_IN` | eleman → mekansal yapı | `IfcRelContainedInSpatialStructure` |
| `AGGREGATES` | bütün → parça | `IfcRelAggregates` |
| `HOSTED_BY` | dolgu elemanı → taşıyıcı eleman | `IfcRelFillsElement` ∘ `IfcRelVoidsElement` |
| `FROM_MODEL` | eleman → model | Ingest sırasında |
| `INTERSECTS_WITH` | eleman — eleman (simetrik) | Mekansal akıl yürütme (Bölüm 3.1) |

**`HOSTED_BY` türetimi:** IFC'de bir kapı duvara doğrudan bağlanmaz. Kapı, duvarı oyan bir boşluğu (`IfcOpeningElement`) doldurur. Boşluklar maddi eleman olmadığından grafa düğüm olarak alınmamıştır. Bunun yerine iki ilişkinin bileşimi tek bir anlamsal kenara indirgenmiştir:

$$\text{HOSTED\_BY}(d, w) \iff \exists o : \text{Fills}(d, o) \wedge \text{Voids}(w, o)$$

**`INTERSECTS_WITH` özellikleri:** Bu ilişki öneri formundaki adlandırmayla oluşturulmuştur. Kesişim kutusu (`minX…maxZ`), hacim (`volume`), penetrasyon derinliği (`depth`) ve kullanılan tolerans kenar özelliği olarak saklanmaktadır. Böylece her kesişimin sayısal kanıtı graf içinde izlenebilir durumdadır.

**Özellik kümelerinin temsili:** Özellik kümeleri ayrı düğümler yerine `Pset.Özellik` biçiminde düğüm özelliği olarak düzleştirilmiştir. Bu tercih kural sorgularını tek düğüm erişimine indirger: `` n.`Pset_WallCommon.FireRating` ``. Bunun karşılığında özellik kümelerinin kendi kimlikleri (GlobalId) grafa taşınmamaktadır.

### 2.2.2. Federasyon

Disiplin modelleri tek bir grafta birleştirilmektedir.

**Eşleştirme:** Elemanlar `globalId` üzerinden `MERGE` edilir. Birden fazla modelde bulunan bir eleman tek bir düğümde birleşir ve her modele bir `FROM_MODEL` kenarıyla bağlanır.
- Örnek modellerde kat, bina, arsa ve baca elemanları her iki dosyada da aynı GlobalId ile yer almaktadır.
- Bu sayede mimari ve HVAC elemanları ortak kat düğümü üzerinden birbirine bağlanmıştır.

**Aynı dosyanın yeniden yüklenmesi** idempotent olarak tasarlanmıştır:
1. Önce dosyanın önceki katkısı silinir. Yalnızca o modele ait elemanlar silinir; paylaşılan elemanlar korunur.
2. Ardından model yeniden yazılır.

Bu davranış entegrasyon testiyle doğrulanmıştır: yeniden yükleme sonrası düğüm ve kenar sayıları değişmemiştir.

**Kesişimlerin yeniden hesaplanması:** Kesişimler, dosya bazında değil bütün federe graf üzerinden hesaplanır. Fiziksel ve geometrili tüm elemanlar graftan okunur ve sonuç `INTERSECTS_WITH` kümesinin tamamının yerine yazılır. Böylece disiplinler arası çakışmalar, modellerin yüklenme sırasından bağımsız olarak saptanmaktadır.

**Yazım ve tutarlılık:**
- Tüm yazımlar parametreli Cypher ile ve 1000'lik `UNWIND` grupları hâlinde yapılmaktadır.
- Etiket adları Cypher'da parametrelenemediğinden, sorguya girmeden önce `^Ifc[A-Za-z0-9]+$` beyaz listesinden geçirilmektedir.
- `Element.globalId`, `Model.fileName`, `Rule.id` ve `Violation.id` üzerinde tekillik kısıtları tanımlanmıştır.
