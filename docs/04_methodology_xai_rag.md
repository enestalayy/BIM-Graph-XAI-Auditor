# Bölüm 4: Açıklanabilir Raporlama ve Dayanaklandırma

## 4.1. Mimari: Sembolik Karar, Nöral Anlatım

Sistemde karar ve anlatım katmanları kesin biçimde ayrılmıştır:
- **Karar:** Bir bulgunun ihlal olup olmadığına yalnızca deterministik kural motoru karar verir (Bölüm 3.2).
- **Anlatım:** Dil modeli yalnızca bu kararın gerekçesini doğal dilde anlatır.

Bu ayrım neuro-symbolic yaklaşımın temelidir ve iki sonucu vardır:
1. LLM'in hata yapması bir ihlali ortadan kaldıramaz ya da yeni bir ihlal üretemez. LLM'in hatası en fazla açıklamanın kalitesini düşürür.
2. Açıklamanın kalitesi, kararın dayandığı kanıta göre ölçülebilir hâle gelir (Bölüm 4.5).

**Terim tercihi:** Önceki prototipte bu katman "RAG" olarak adlandırılmaktaydı. Ancak sistemde bir doküman derleminden benzerlik tabanlı arama yapılmamaktadır. Bilgi, bilgi grafından yapısal sorgularla getirilmektedir. Bu nedenle yöntem **graf tabanlı bağlam getirme ile dayanaklandırılmış üretim** (graph-grounded generation) olarak adlandırılmıştır.

## 4.2. Graf Tabanlı Bağlam Getirme

Bir ihlal için graftan şu bilgiler getirilir (`loadViolationContext`):
1. **İhlal düğümü:** kanıt paketi, yani başarısız koşullar veya kesişim ölçüleri.
2. **Kural düğümü:** kuralın tam tanımı.
3. **İlgili elemanlar:** konu, nesne ve en yakın koruyucu eleman. Her biri için özellikleri, `CONTAINED_IN` üzerinden bulunduğu mekansal yapı ve `FROM_MODEL` üzerinden ait olduğu disiplin modeli getirilir.

Elemanların tüm özellikleri değil, yalnızca kuralın sınadığı özellikler bağlama alınır. Böylece açıklayıcıya, deterministik denetimin kullandığı kanıtın tam olarak kendisi verilmektedir.

## 4.3. Kanıt Olguları

Getirilen bağlam, numaralandırılmış ve kendi başına anlamlı **olgulara** (facts) dönüştürülür. Örneğin dampersiz bir kanal–yangın duvarı geçişi için olgular şunlardır:

| Kimlik | Olgu |
|---|---|
| F1 | Kural, önem derecesi, yönetmelik dayanağı ve madde durumu |
| F2 | Konu eleman (sınıf, ad, GlobalId, disiplin, konum, sınanan özellikler) |
| F3 | Nesne eleman (örn. `Pset_WallCommon.FireRating = EI60`) |
| F4 | Kesişim hacmi, penetrasyon derinliği, kesişim merkezi |
| F5 | Belirtilen mesafede koruyucu eleman bulunamadığı |
| F6 | En yakın koruyucu aday ve uzaklığı (ya da hiç aday olmadığı) |

**Sayı biçimi:** Sayılar üç anlamlı basamakla ve Türkçe ondalık virgülüyle yazılmaktadır (örn. 0,129 m³). Olgulardaki hassasiyet, açıklamada kullanılabilecek en yüksek hassasiyettir.

**Madde numarası:** Doğrulanmamış bir madde numarası olgularda "henüz doğrulanmamıştır" ibaresiyle yer alır.

## 4.4. Açıklayıcılar

### 4.4.1. Şablon Açıklayıcı (Temel Çizgi)

Olgulardan sabit Türkçe cümle kalıplarıyla açıklama üreten deterministik bir açıklayıcı tanımlanmıştır.
- Yapısı gereği halüsinasyon üretemez.
- Her cümlesi kaynak olgulara atıf yapar.
- Dayanaklandırma doğrulayıcısından tam puan alması birim testle güvence altına alınmıştır.

Bu açıklayıcının iki işlevi vardır:
- LLM açıklamaları için bir **karşılaştırma temel çizgisi** (baseline) oluşturur.
- Dil modeli olmadan da sistemin eksiksiz çalışmasını sağlar.

### 4.4.2. LLM Açıklayıcı

**Model tercihi:** Öneri formunda farklı LLM'lerin test edileceği belirtilmiştir. Maliyet ve tekrarlanabilirlik gerekçeleriyle birincil olarak yerelde çalışan, açık ağırlıklı modeller tercih edilmiştir (Ollama üzerinden, örn. Llama 3.1 8B).

**Tekrarlanabilirlik ayarları:**
- Sıcaklık (temperature) 0'a ayarlanmıştır.
- Sabit bir tohum (seed = 42) kullanılmıştır.
- Model kimliği her açıklamayla birlikte kaydedilmektedir (`method = "ollama:<model>"`).

**Sağlayıcı arayüzü:** Sağlayıcılar tek bir `TextGenerator` arayüzünün arkasındadır. Ücretli veya ücretsiz başka sağlayıcılar, değerlendirme düzeneği değiştirilmeden eklenebilir.

**İstem tasarımı:** İstem, modele bir "Dijital Denetçi" rolü verir ve şu kısıtları koyar:
1. Yalnızca verilen olguları kullan. Olgularda olmayan GlobalId, sayı, madde veya sınıflandırma yazma.
2. Açıklamaya "Bu bir hatadır çünkü" ifadesiyle başla. Bu ifade öneri formundaki rapor biçimidir.
3. Her cümlenin sonunda dayandığın olguları `[F2][F4]` biçiminde göster.
4. En fazla beş cümle, teknik ve tarafsız bir dil kullan.
5. Olgularda olmayan bir hassasiyet ekleme.
6. Doğrulanmamış madde numarası uydurma.

**Hata yönetimi:**
- Ağ hataları ile HTTP 429/5xx yanıtları üstel geri çekilmeyle (exponential backoff) yeniden denenir.
- Zaman aşımı, eksik model ve boş yanıt açık hata olarak raporlanır. Hiçbir hata sessizce yutulmaz.

## 4.5. Dayanaklandırma (Grounding) Doğrulaması

### 4.5.1. Yöntem

Önceki prototipteki "grounding score", modelin kendi seçtiği alıntıların bağlamda alt-dize olarak geçip geçmediğine bakıyordu. Bu yaklaşımın üç zayıflığı vardı:
- Modelin serbest metni hiç denetlenmiyordu.
- "true", "critical" gibi kısa değerler her zaman eşleşiyordu.
- Kanıtsız raporlara keyfi olarak 0,5 puan veriliyordu.

Bu nedenle yöntem tümüyle değiştirilmiştir. Yeni yöntemde açıklamanın **tüm metni** varlık düzeyinde (entity-level) denetlenmektedir. Bu yaklaşım, özetleme literatüründeki varlık düzeyinde olgusal tutarlılık ölçütlerine dayanmaktadır `[doğrulanacak: Nan vd., 2021, EACL]`.

**Varlık türleri.** Metinden düzenli ifadelerle beş tür doğrulanabilir varlık çıkarılır:

| Tür | Örnek | Normalleştirme |
|---|---|---|
| IFC GlobalId (22 karakter) | `38WbwIGD90nB_3T2BTU5Ed` | Birebir |
| Kural kimliği | `FS-DUCT-WALL-01`, `R-01` | Birebir |
| Yönetmelik madde atfı | `Madde 51`, `md. 7` | Madde numarası |
| Sınıflandırma etiketi | `EI60`, `REI30` | Büyük harf (`ei60` = `EI60`) |
| Birimli sayı | `0,129 m³`, `194 cm`, `3` | SI değeri ve boyut (uzunluk, alan, hacim, birimsiz) |

**Destek ölçütü.** Aynı çıkarıcı olgulara da uygulanır ve bir izinli varlık kümesi $\mathcal{A}$ elde edilir. Açıklamadaki bir $e$ varlığı şu durumlarda **desteklenmiş** sayılır:
- Sayı dışındaki türlerde: $e \in \mathcal{A}$.
- Sayılarda: değer yalnızca **aynı boyuttaki** bir kanıt değeriyle karşılaştırılır, yazıldığı hassasiyetin yarım basamağı kadar bir pay tanınır.

Sayılar için ölçüt şöyledir:

$$\text{destek}(n) \iff \exists a \in \mathcal{A}_{\text{sayı}} : \text{boyut}(a) = \text{boyut}(n) \;\wedge\; |a_{SI} - n_{SI}| \le \tfrac{1}{2}\,10^{-k}\, f_u$$

Burada $k$, $n$'nin yazıldığı ondalık basamak sayısı, $f_u$ ise yazıldığı birimin SI çarpanıdır.

Birim dönüşümleri yalnızca bir boyut içinde kabul edilir (m ↔ cm ↔ mm, m³ ↔ L). Bu sayede şu yazımlar kabul edilir:
- 0,129 m³ değerinin "0,13 m³" ya da "129 L" olarak yazılması,
- 1,94 m değerinin "194 cm" olarak yazılması.

Buna karşın şu yazımlar reddedilir:
- 1,94 m'nin "1,9416 m" olarak yazılması (uydurulmuş hassasiyet),
- "y 8 m" koordinatının "8 m³ hacim" olarak yazılması (boyut farkı).

Kanıt olgularındaki tüm ölçüler birimleriyle birlikte yazılmaktadır; buna kesişim merkezi koordinatları da dahildir.

**İlk tasarımın zayıflıkları.** Bu ölçüt, bağımsız kod incelemesinde ilk tasarımın iki zayıflığı ortaya çıktıktan sonra benimsenmiştir:
- **Boyutsuz eşleşme.** İlk tasarımda sayılar boyuttan bağımsız olarak $\{1, 100, 1000\}$ çarpanlarıyla herhangi bir kanıt değeriyle eşleşebiliyordu. Bu durum, olgu havuzu büyüdükçe sahte kabul olasılığını artırmaktaydı.
- **Yanlış cümle bölme.** "md. 7" ve "1. Kat" gibi kısaltma ve sıra sayıları cümleyi hatalı biçimde bölmekteydi.

**Rakam maskeleme.** Kimliklerin ve etiketlerin içindeki rakamların sayı olarak okunmaması için bu varlıklar sayı çıkarımından önce metinden maskelenmektedir.

### 4.5.2. Metrikler

Bir açıklama için şu metrikler tanımlanmıştır:

$$\text{Sadakat} = \frac{|\{e \in E : \text{destek}(e)\}|}{|E|}, \qquad \text{Atıf kapsaması} = \frac{|\{s \in S : \text{geçerli atıf}(s)\}|}{|S|}$$

- $E$ açıklamadaki varlıkları, $S$ cümleleri ifade eder.
- Bir cümlenin atfının geçerli sayılması için en az bir atıf içermesi ve atıf yaptığı tüm olguların var olması gerekir.
- En az bir desteksiz varlık içeren açıklama **halüsinasyonlu** olarak işaretlenir.

Bir açıklayıcının değerlendirme kümesi üzerindeki **halüsinasyon oranı**, halüsinasyonlu açıklamaların oranıdır. Öneri formunda bu oran için hedef %3'ün altıdır.

**Biçim uyumu.** Açıklamanın "Bu bir hatadır çünkü" ile başlayıp başlamadığı da ayrıca kaydedilmektedir.

Her açıklama, olguları ve doğrulama raporuyla birlikte grafta saklanır: `(:Explanation)-[:EXPLAINS]->(:Violation)`. Böylece değerlendirme sonradan yeniden hesaplanabilir.

### 4.5.3. Sınırlılıklar

Varlık düzeyindeki denetim, uydurulmuş kimlik, sayı, madde ve sınıflandırmaları yakalar. Buna karşın üç tür hatayı yakalayamaz:
- **Anlamsal çarpıtmalar.** Örneğin varlık içermeyen "damper mevcuttur" gibi bir olumsuzlama hatası bu denetimden geçer.
- **Aynı boyutta yanlış niceliğe bağlanan sayılar.** Örneğin derinlik değerinin uzaklıkmış gibi yazılması, her ikisi de uzunluk olduğundan kabul edilir.
- **Yazıyla yazılmış sayılar.** Örneğin "yüz yirmi" çıkarılamaz.

Bu tür hataların ölçülmesi için iki tamamlayıcı yöntem değerlendirmeye alınmıştır:
- doğrulama kümesinin bir örnekleminde uzman değerlendirmesi,
- doğal dil çıkarımı (NLI) tabanlı bir denetim.

Bu yöntemler Bölüm 5'te ele alınacaktır.
