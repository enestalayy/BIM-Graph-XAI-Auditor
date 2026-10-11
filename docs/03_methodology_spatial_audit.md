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

*(Kural adımında yazılacaktır.)*
