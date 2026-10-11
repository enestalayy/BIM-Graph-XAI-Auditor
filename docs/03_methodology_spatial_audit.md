# Bölüm 3: Mekansal Akıl Yürütme ve Kural Tabanlı Denetim

## 3.1. Kesişim Tespiti

### 3.1.1. Problem Tanımı

Federe modeldeki fiziksel elemanlar kümesi $E$ ve her elemanın sınırlayıcı kutusu $B(e)$ verilsin. Kesişim tespiti, birbirinin içine giren tüm sırasız eleman çiftlerinin bulunmasıdır:

$$I = \{\, \{e_i, e_j\} \subseteq E \;:\; B(e_i) \sqcap_\varepsilon B(e_j) \,\}$$

Sınırlayıcı kutular Bölüm 2.1.5'te tanımlanmıştır.

### 3.1.2. AABB Aralık Örtüşme Testi

İki eksen hizalı kutu $A$ ve $B$ için $k \in \{x, y, z\}$ ekseni üzerindeki örtüşme uzunluğu şöyle tanımlanmıştır:

$$o_k(A,B) = \min(A_k^{\max}, B_k^{\max}) - \max(A_k^{\min}, B_k^{\min})$$

İki kutunun $\varepsilon$ toleransıyla iç içe geçmesi (interpenetration), üç eksenin tamamında örtüşmenin toleransı aşması olarak tanımlanmıştır:

$$A \sqcap_\varepsilon B \iff \forall k \in \{x,y,z\} : o_k(A,B) > \varepsilon$$

Bu test, ayrıştırıcı eksen teoreminin (Separating Axis Theorem) eksen hizalı kutular için yalnızca üç koordinat eksenine indirgenmiş özel bir durumudur. Bu çalışmada yöntem, genel SAT olarak değil **AABB aralık örtüşme testi** olarak adlandırılmaktadır.

**Tolerans.** Katı eşitsizlik ve $\varepsilon = 1$ mm toleransı iki amaçla seçilmiştir:
- yalnızca yüzeyleri temas eden elemanların (örn. döşemeye oturan duvar, $o_k = 0$) çakışma sayılmaması,
- kayan nokta hatalarının elenmesi.

Değer yapılandırılabilir durumdadır.

**Her kesişim için saklanan büyüklükler:**
- **Kesişim kutusu** $A \cap B$: eksen bazında $[\max(A_k^{\min}, B_k^{\min}),\ \min(A_k^{\max}, B_k^{\max})]$.
- **Kesişim hacmi:** $V = \prod_k o_k$.
- **Penetrasyon derinliği:** $d = \min_k o_k$.

Kesişim kutusunun merkezi, kurallarda koruyucu elemanların (örn. yangın damperi) aranacağı referans noktasıdır.

Önceki prototip bu referans noktası olarak iki elemanın ağırlık merkezlerinin ortalamasını kullanmaktaydı. Uzun bir duvar ile uzun bir kanal için bu nokta gerçek geçiş noktasından metrelerce uzakta olabilir. Bu nedenle o yaklaşım terk edilmiştir.

### 3.1.3. Geniş Faz: Sweep and Prune

Tüm çiftlerin denetlenmesi $O(n^2)$ karmaşıklığındadır. Aday çiftleri azaltmak için X ekseni üzerinde **sweep and prune** (sort and sweep) algoritması uygulanmıştır (Baraff, 1992) `[doğrulanacak: tam kaynakça]`.

**Algoritma:**
1. Kutular $\min_x$ değerine göre sıralanır.
2. Sıralı liste taranırken bir aktif küme tutulur.
3. $\max_x$ değeri yeni kutunun $\min_x + \varepsilon$ değerinden küçük kalan kutular aktif kümeden çıkarılır, çünkü sonraki hiçbir kutuyla örtüşemezler.
4. Yeni kutu, aktif kümedeki kutularla üç eksenli testten geçirilir.

**Karmaşıklık ve doğruluk:**
- Karmaşıklık $O(n \log n + n\,k)$'dir. Burada $k$ aktif kümenin ortalama büyüklüğüdür. Bina modellerinde elemanlar uzayda dağınık olduğundan $k \ll n$'dir.
- Algoritma kesindir, yani yanlış negatif üretmez.
- Bu özellik, 300 rastgele kutu üzerinde sonuçların kaba kuvvet $O(n^2)$ taramasıyla birebir aynı olduğu doğrulanarak sınanmıştır (`packages/core/test/intersections.test.ts`).

**Önceki prototiple karşılaştırma:**
- Önceki prototipte aday üretimi Neo4j üzerinde kartezyen çarpımla yapılmaktaydı. Bu yaklaşım hâlâ $O(n^2)$ idi.
- Ayrıca `guid(a) < guid(b)` filtresi tip yönü koşuluyla birlikte uygulandığından, çiftlerin yaklaşık yarısı sessizce kayboluyordu.
- Mevcut tasarımda kesişim ilişkisi simetrik olarak tanımlanmıştır. Çift kimlikleri yalnızca belirlenimci (deterministic) saklama için sıralanmaktadır.

### 3.1.4. Örnek Modellerde Gözlem ve AABB'nin Sınırlılığı

Mimari ve HVAC modelleri federe edildiğinde ($\varepsilon = 1$ mm) 7 kesişim saptanmıştır:

| Eleman A | Eleman B | Hacim (m³) | Derinlik (m) |
|---|---|---|---|
| Duvar (sol dış) | Çatı döşemesi (sol) | 0,600 | 0,200 |
| Çatı döşemesi (sağ) | Duvar (sağ ön) | 0,684 | 0,200 |
| Çatı döşemesi (sağ) | Duvar (tesisat) | 0,068 | 0,024 |
| Çatı döşemesi (sağ) | Hava terminali (baca kapağı) | 0,074 | 0,150 |
| Çatı döşemesi (sağ) | Kanal | 0,129 | 0,200 |
| Çatı döşemesi (sağ) | Duvar (sağ arka) | 0,420 | 0,200 |
| Duvar (sağ ön) | Zemin döşemesi | 0,090 | 0,200 |

Kanal–çatı döşemesi kesişimi fiziksel olarak gerçektir, çünkü baca kanalı çatıdan dışarı çıkmaktadır.

Buna karşın eğimli çatı döşemelerinin sınırlayıcı kutuları, döşemenin altında kalan duvarları da kapsamaktadır. Bu nedenle duvar–çatı kesişimlerinin önemli bir bölümünün AABB yaklaşımının ürettiği **yanlış pozitifler** olması beklenmektedir.

Bu gözlem, AABB'nin geniş faz (broad phase) için uygun olduğunu, ancak tek başına kesinlik açısından yetersiz kalabileceğini göstermektedir. Bu sınırlılık Bölüm 5'te kesinlik metriğiyle nicel olarak raporlanacaktır. Ağ (mesh) düzeyinde bir dar faz testi olası bir iyileştirme olarak değerlendirilmektedir.

## 3.2. Kural Tabanlı Denetim

### 3.2.1. Bildirimsel Kural Dili

Yönetmelik kuralları kod içine gömülmek yerine bildirimsel (declarative) bir JSON dili ile tanımlanmıştır (`rules/*.json`). Bu tercihin üç amacı vardır:

1. **Uzmanın erişebilmesi.** Kurallar programlama bilgisi gerektirmeden arayüzden eklenebilir ve değiştirilebilir.
2. **Tekrarlanabilirlik.** Kural setleri sürüm kontrolünde tutulur. Bir denetim sonucu, kullanılan kural setinin belirli bir sürümüne bağlanabilir.
3. **Şeffaflık.** Her kural, çalıştırılan sorgunun kendisiyle birlikte saklanır (Bölüm 3.2.3).

Kural dili iki yapı taşı üzerine kurulmuştur:

- **Koşul (condition):** bir eleman özelliği üzerinde tanımlanan yüklemdir.
  - Desteklenen işleçler: `exists`, `notExists`, `eq`, `neq`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`.
  - Özellik anahtarı ya sabit bir alan (`name`, `predefinedType`, `ifcClass`, `category`) ya da `Pset.Özellik` biçimindedir.
- **Seçici (selector):** IFC sınıfları ile koşulların birleşimidir. Bir $e$ elemanının, $C$ sınıf kümesi ve $\Phi$ koşul kümesinden oluşan bir seçiciyi sağlaması şöyle tanımlanır:

$$\sigma_{C,\Phi}(e) \iff \big(\exists c \in C : e \preceq c\big) \wedge \bigwedge_{\varphi \in \Phi} \varphi(e)$$

Burada $e \preceq c$, $e$'nin $c$ sınıfının ya da alt tiplerinden birinin örneği olduğunu ifade eder. Bu ilişki graf etiketleri sayesinde doğrudan sorgulanabilmektedir (Bölüm 2.2.1).

**Eksik özellikler:** Karşılaştırma koşullarında eksik bir özellik koşulu sağlamaz. Üç değerli mantıktaki `null`, kesin olarak "yanlış" kabul edilir. Böylece eksik veri hiçbir zaman kuralı geçmiş sayılmaz.

İki kural türü tanımlanmıştır:

**Özellik kuralı (`property`).** Hedef seçiciyi sağlayan her elemanın zorunlu koşulların tamamını sağlaması beklenir:

$$\text{İhlal}_{P}(e) \iff \sigma_{\text{hedef}}(e) \wedge \exists \varphi \in \Phi_{\text{zorunlu}} : \neg\varphi(e)$$

**Kesişim kuralı (`intersection`).** Konu (subject) seçiciyi sağlayan bir eleman, nesne (object) seçiciyi sağlayan bir elemanla kesişiyorsa bir ihlal oluşur. Ancak kesişim kutusunun merkezine $d_{\max}$ mesafede, koruyucu (mitigation) seçiciyi sağlayan bir eleman bulunuyorsa ihlal oluşmaz.

$$\text{İhlal}_{I}(s,o) \iff \sigma_s(s) \wedge \sigma_o(o) \wedge \text{INTERSECTS}(s,o) \wedge V(s,o) \ge V_{\min} \wedge \neg\exists m : \sigma_m(m) \wedge \operatorname{dist}\big(c(s,o), B(m)\big) \le d_{\max}$$

Bu formülde $c(s,o)$ kesişim kutusunun merkezidir. $\operatorname{dist}(p, B)$ bir noktanın bir kutuya Öklid uzaklığıdır; nokta kutunun içindeyse değeri 0'dır.

Öneri formundaki örnek senaryo bu dille şöyle ifade edilir: "Yangın dayanımlı duvarı delen kanalda yangın damperi var mı?"
- konu: `IfcDuctSegment`,
- nesne: `IfcWall` ∧ `Pset_WallCommon.FireRating` mevcut,
- koruyucu: `IfcDamper` ∧ `predefinedType = FIREDAMPER`, $d_{\max} = 0{,}5$ m.

Önceki prototipte iki kusur bulunmaktaydı. Her `IfcDamper` türüne bakılmaksızın yangın damperi sayılmaktaydı. Arama da kesişim noktası yerine iki elemanın merkezlerinin ortasında yapılmaktaydı. Mevcut tanımda damperin türü açıkça sınanmakta ve arama gerçek geçiş noktasında yapılmaktadır.

### 3.2.2. Kuralların Cypher'a Derlenmesi

Öneri formundaki "kuralların Cypher sorgu dili aracılığıyla graf veritabanı üzerinde çalıştırılması" ilkesi doğrultusunda, her kural tek bir salt-okunur ve parametreli Cypher sorgusuna derlenmektedir (`packages/core/src/rules/compile.ts`).

**Seçiciler ve koşullar:**
- Seçiciler etiket ayrımı (`s:IfcWall OR s:IfcCurtainWall`) ve koşul ifadelerinin birleşimine dönüştürülür.
- Kesişim kuralları önceden hesaplanmış `INTERSECTS_WITH` ilişkileri üzerinde çalışır. Böylece geometrik hesaplama (Bölüm 3.1) ile anlamsal denetim birbirinden ayrılmıştır.

**Koruyucu eleman araması:** `OPTIONAL MATCH` ile tüm aday elemanlar aranır. Her adayın kesişim merkezine uzaklığı eksen bazında hesaplanır:

$$\operatorname{dist}(p,B) = \sqrt{\sum_{k} \max\big(B_k^{\min} - p_k,\; 0,\; p_k - B_k^{\max}\big)^2}$$

Adaylar arasından en yakını, satır sırasına bağlı olmayan açık bir indirgeme (`reduce`) ile seçilir. Eşit uzaklıkta GlobalId'ye göre belirlenimci bir seçim yapılır. Kesişen elemanların kendileri aday sayılmaz.

En yakın adayın uzaklığı $d_{\max}$'tan büyükse ya da hiç aday yoksa ihlal raporlanır. Bu durumda en yakın aday ve uzaklığı da kanıt olarak döndürülür (örn. "en yakın yangın damperi 1,9 m uzakta").

**Performans sınırlılığı.** Aday araması kesişim başına tüm adayları tarar. Bu tarama $O(|I| \cdot |M|)$ karmaşıklığındadır; burada $I$ kesişimler, $M$ seçiciyi sağlayan koruyucu elemanlar kümesidir. Bu çalışmanın ölçeğinde sorun oluşturmamaktadır. Büyük modellerde sorgu, kesişim kutusu çevresinde mekansal bir ön elemeyle daraltılabilir.

**Güvenlik:**
- Kullanıcıdan gelen tüm değerler sorgu parametresi olarak iletilir.
- Cypher'da parametrelenemeyen tanımlayıcılar iki yolla korunur:
  - Etiketler (IFC sınıf adları) `^Ifc[A-Za-z0-9]+$` beyaz listesinden geçirilir.
  - Özellik anahtarları desen denetiminden geçirilir ve backtick ile tırnaklanır. Anahtarın içindeki backtick karakterleri Cypher dilbilgisine uygun olarak ikilenir.
- Bu sayede arayüzden girilen kurallar sorgu enjeksiyonuna yol açamaz. Bu durum, saldırgan bir değer ve saldırgan bir özellik anahtarı için birim testlerle doğrulanmıştır.

**Tekillik:**
- İhlal kimlikleri belirlenimcidir: `kuralId:elemanId[:elemanId]`. Aynı kural ve aynı elemanlar her denetimde aynı kimliği üretir.
- Bu özellik, doğrulama aşamasında altın standart ile eşleştirmeyi (Bölüm 5) ve açıklamaların ihlallere kalıcı olarak bağlanmasını mümkün kılar.
- Kesişim simetrik olduğundan, konu ve nesne seçicileri örtüştüğünde aynı çiftin iki yönü tek ihlale indirgenir.

### 3.2.3. İzlenebilirlik ve Kayıt

Denetim sonuçları grafa geri yazılmaktadır:
- `(:Violation)-[:OF_RULE]->(:Rule)`
- `(:Violation)-[:INVOLVES {role}]->(:Element)`
- `(:Violation)-[:FOUND_IN]->(:Audit)`

Saklanan bilgiler:
- **`:Rule` düğümü:** kuralın tam tanımı ve derlenmiş Cypher sorgusu.
- **`:Violation` düğümü:** kanıt paketi (başarısız koşullar ve gerçek değerleri; kesişim kutusu, hacim, derinlik; en yakın koruyucu eleman).
- **`:Audit` düğümü:** kural bazında süre ve ihlal sayıları. Zaman verimliliği metriği bu bilgiden hesaplanır.

Böylece her bulgu için şu zincir graf üzerinde izlenebilmektedir: hangi kural, hangi sorgu, hangi elemanlar, hangi sayısal kanıt. Bu zincir, Bölüm 4'teki açıklama katmanının tek bilgi kaynağıdır.

**Yönetmelik atıfları:**
- Her kural bir `regulation` alanı taşır.
- Madde numaraları (`article`) yönetmeliğin resmî konsolide metninden kontrol edilmiştir. Kaynak: mevzuat.gov.tr, MevzuatNo 200712937; son değişiklik RG 01.07.2025/32943; kontrol tarihi 2026-10-11.
- Kontrol edilen kurallarda `verified = true` değeri verilmiş ve ilgili fıkra `note` alanına alıntılanmıştır. Bir yönetmelik maddesine dayanmayan kurallarda (bilgi gereksinimi, genel koordinasyon) `article` boş bırakılmıştır.
- Önceki prototipte yer alan "BYKHY 2015, Madde 51–53" atıfları resmî metinle karşılaştırılmıştır. Bu maddeler sırasıyla toplantı salonlarında koltuk aralıkları (Madde 51), bir değiştirilmiş madde (Madde 52) ve binaların kritik kısımlarına ilişkin genel hüküm (Madde 53) ile ilgilidir. Hiçbiri tesisat geçişlerini düzenlemediğinden kullanılmamıştır.

| Kural | Madde | İlgili hüküm (özet) |
|---|---|---|
| FS-DUCT-WALL-01, FS-DUCT-SLAB-01 | 87/8 | Kanalın 120 dakika dayanımlı kompartıman duvarını veya katını geçtiği yerde yangın damperi ya da şönt baca, özel kelepçe gibi önlemler alınır. |
| FS-PIPE-WALL-01 | 24/7, 25/2 | Kompartımanlar arasında yangına dayanıksız açıklık bulunamaz. Yangın duvarından geçen tesisatın çevresi, en az duvarın dayanım süresi kadar yalıtılır. |
| INFO-WALL-01 | (24/1 ile ilişkili) | Kompartıman duvarlarının en az dayanım süreleri Ek-3/B'dedir. FireRating bilgisi bu değerlendirmenin ön koşuludur. |

**Kuralların yönetmelik hükmüyle farkı.** Madde 87/8, 120 dakika ve üzeri dayanımlı kompartıman elemanlarını konu alır. Kural ise FireRating tanımlı her elemanı kapsar, dolayısıyla hükümden daha geniştir ve ihtiyatlıdır. Bunun nedeni, `FireRating` değerlerinin IFC'de serbest metin olmasıdır (örn. "EI60", "REI 120", "2 HR"); bu metinlerden süreye güvenilir biçimde ulaşılamamaktadır. Hükümdeki alternatif önlemler (şönt baca, özel kelepçe) de modellenmemiştir. Her iki fark da yanlış pozitif kaynağıdır ve Bölüm 5'te dikkate alınmalıdır.

### 3.2.4. Varsayılan Kural Seti ve Örnek Modeldeki Sonuçlar

| Kural | Tür | Önem | Özet |
|---|---|---|---|
| INFO-WALL-01 | özellik | minor | Her duvarda `Pset_WallCommon.FireRating` bulunmalı |
| FS-DUCT-WALL-01 | kesişim | critical | Yangın dayanımlı duvarı geçen kanalda 0,5 m içinde yangın damperi |
| FS-DUCT-SLAB-01 | kesişim | critical | Yangın dayanımlı döşemeyi geçen kanalda 0,5 m içinde yangın damperi |
| FS-PIPE-WALL-01 | kesişim | major | Yangın dayanımlı duvarı geçen boru (yangın durdurucu incelemesi) |
| CLASH-MEP-STR-01 | kesişim | major | Tesisat hattı segmenti × yapı elemanı (≥ 1 L) |

**Genel çakışma kuralının kapsamı:**
- Kural ilk tasarımda tüm dağıtım elemanlarını (`IfcDistributionElement`) kapsamaktaydı.
- Sentetik test modelinde bu tanımın, duvara bilinçli olarak yerleştirilen yangın damperini de çakışma olarak raporladığı görülmüştür.
- Bu nedenle kapsam hat segmentleriyle (`IfcFlowSegment`: kanal, boru, kablo taşıyıcı) sınırlandırılmıştır.

**Örnek modellerdeki sonuçlar (buildingSMART, federe):**
- INFO-WALL-01: 4 ihlal. Hiçbir duvarda yangın dayanım bilgisi yoktur.
- Yangın damperi kurallarında ihlal yoktur. Modelde yangın dayanımlı duvar bulunmamaktadır. Yangın dayanımlı tek döşeme olan zemin döşemesini (REI30) ise kanal kesmemektedir.
- CLASH-MEP-STR-01: 1 bulgu (kanal × sağ çatı döşemesi).

**Sentetik model doğrulaması:** Kural davranışı, bilinen sonuçlara sahip sentetik bir federe model üzerinde entegrasyon testleriyle doğrulanmıştır (`packages/graph/test/integration/audit.test.ts`). Testte sınanan durumlar:
- damperli geçiş,
- dampersiz geçiş,
- yanlış türde damper (BLASTDAMPER),
- yangın dayanımı olmayan duvar.
