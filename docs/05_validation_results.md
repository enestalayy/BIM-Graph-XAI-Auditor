# Bölüm 5: Doğrulama ve Bulgular

## 5.1. Doğrulama Tasarımı

Öneri formunda üç metrik tanımlanmıştır: kesinlik/duyarlılık, halüsinasyon oranı ve zaman verimliliği. Sistemin doğrulanması, birbirini tamamlayan beş düzeyde tasarlanmıştır:

| Düzey | Soru | Yöntem | Durum |
|---|---|---|---|
| D1 Uygulama doğruluğu | Bileşenler tanımlandıkları gibi mi çalışıyor? | Birim ve entegrasyon testleri (113 + 33, `npm test`, `npm run test:integration`) | Tamamlandı |
| D2 Araç eşdeğerliği | web-ifc, IfcOpenShell ile aynı girdiyi üretiyor mu? | Parity karşılaştırması (Bölüm 2.1.6) | Tamamlandı |
| D3 Kural motoru doğruluğu | Doğru cevabı bilinen senaryolarda ihlaller eksiksiz ve fazlasız bulunuyor mu? | Tohumlu hata enjeksiyonu (Bölüm 5.2) | Tamamlandı |
| D4 Gerçek model başarımı | Gerçek modellerde uzman değerlendirmesine göre P/R/F1 nedir? | Altın standart karşılaştırması (Bölüm 5.4) | Uzman etiketi bekleniyor |
| D5 Açıklama güvenilirliği | Açıklamalar kanıta sadık ve eksiksiz mi? | Varlık düzeyinde dayanaklandırma (Bölüm 5.3) | Örnek modelde tamamlandı; büyük kümede bekleniyor |

**Gold standard yaklaşımı:** Önceki prototipteki "gold standard" dosyası yer tutucu kimlikler içermekteydi (`REPLACE_WITH_...`). Bu nedenle o dosya hiçbir ölçüme temel oluşturamazdı. Bu çalışmada iki tür doğru cevap kaynağı kesin olarak ayrılmıştır:
- **Yapı gereği bilinen doğru cevap (D3):** Hata enjeksiyonu senaryolarında beklenen sonuç, senaryonun kurgusundan gelir. Sistemin çıktısından türetilmez.
- **Uzman etiketi (D4):** Etiketler modeller sistem çıktısına bakılmadan incelenerek hazırlanır. Etiketlerin sistem çıktısından türetilmesi ölçümü döngüsel kılacağından geçersiz sayılır (`evaluation/README.md`).

Tüm deneyler `npm run cli -- evaluate …` komutlarıyla yeniden üretilebilmektedir. Her çalıştırma ham veriyi (`.json`) ve tablo özetini (`.md`) `evaluation/results/` altında saklar.

## 5.1a. Veri Setleri

Sistem dört açık veri seti üzerinde çalıştırılmıştır. Kaynak, lisans ve SHA-256 değerleri `data/catalog.json` dosyasında, atıflar `tools/datasets/README.md` dosyasında yer almaktadır.

| Veri seti | Bina | Disiplinler | Şema | Fiziksel/toplam eleman | Kesişim* |
|---|---|---|---|---|---|
| buildingSMART örnek sahne | Küçük tek katlı ev | ARCH, MEP | IFC4X3 | 32 | 7 |
| Duplex Apartment | İki katlı ikiz konut | ARCH, MEP | IFC2X3 | 1 218 | 1 324 |
| Medical-Dental Clinic | Gerçek klinik binası (anonimleştirilmiş) | ARCH, STR, HVAC, PLU | IFC2X3 | 14 553 | 14 414 |
| Schependomlaan | Konut projesi, Nijmegen | ARCH | IFC2X3 | 3 729 | 7 156 |

\* Ölçüm $\varepsilon = 0{,}01$ m toleransla yapılmıştır.

**Veri setlerinin kaynağı.** Duplex ve Clinic modelleri ABD Ulusal Yapı Bilimleri Enstitüsü (NIBS) tarafından 2009–2020 yılları arasında yayımlanmıştır. Model yazarı tarafından 2020'de buildingSMART örnek dosya deposuna CC BY 4.0 lisansıyla aktarılmıştır. Söz konusu depo daha sonra yeniden yapılandırılmış ve bu dosyalar depodan çıkarılmıştır. Bu nedenle dosyalar, yayımlanmış durumu koruyan bir çatal (fork) üzerinden sabit bir commit'ten alınmış ve SHA-256 ile doğrulanmıştır.

**Veri setlerinden çıkan gözlemler:**
1. **IFC2X3'te tesisat sınıfları.** IFC2X3 modellerinde tesisat elemanları genel `IfcFlowSegment` olarak tanımlanmıştır; türleri tip nesnesinde (`IfcDuctSegmentType`) yer alır. Ayrıştırıcı, IFC4 kalıtımıyla tutarlı olduğu durumlarda karşılık gelen IFC4 sınıfını türetmektedir (Bölüm 2.1.2). Bu türetme yapılmasaydı kanal kuralları IFC2X3 modellerinde hiçbir elemanla eşleşmezdi.
2. **Yer tutucu ve boş değerler.** Revit dışa aktarımlarında kapı ve pencerelerin `FireRating` değeri çoğunlukla doldurulmamış yer tutucu metinlerden oluşmaktadır ("Fire Rating", "FireRating"). Archicad dışa aktarımında ise bu değer boş metindir. Boş metinler değersiz sayılmaktadır. Yer tutucuların ayırt edilmesi ise genel olarak mümkün değildir ve bir veri kalitesi sınırlılığı olarak kaydedilmiştir.
3. **Clinic'te yangın dayanımlı duvarlar.** Clinic modelinde 1 ve 2 saat yangın dayanımlı duvarlar bulunmaktadır (`Pset_WallCommon.FireRating`). Modelde yangın damperi yoktur. FS-DUCT-WALL-01 kuralı bu modelde gerçek bir kanal–yangın duvarı geçişini kritik ihlal olarak saptamıştır.
4. **Duplex'te ayırıcı duvarlar.** Duplex modelinde bağımsız birimleri ayıran duvarlar ("Party Wall") bulunmaktadır. Madde 24/3'e göre bu duvarlar yangın duvarıdır. İlgili kurallar 4 bilgi eksikliği ve 50 tesisat geçişi raporlamıştır.

## 5.2. Kural Motorunun Hata Enjeksiyonu ile Doğrulanması

### 5.2.1. Yöntem

"Yangın dayanımlı duvarı geçen kanalda yangın damperi bulunmalı" kuralı (FS-DUCT-WALL-01) için tohumlu (seeded) bir sözde rastgele senaryo üreteci geliştirilmiştir (`apps/server/src/evaluation/fault-injection.ts`).

**Senaryo yerleşimi:**
- Yangın dayanımlı duvarlar (EI60) ve dayanımsız duvarlar sıralar hâlinde yerleştirilir.
- Her durum, 2 m aralıklı kendi yuvasında tek bir kanal içerir. Aralık, iki kat $d_{\max}$'tan büyük seçilmiştir; böylece bir damper komşu yuvaya hizmet edemez.

Altı durum türü eşit olasılıkla seçilmektedir:

| Tür | Kurgu | Beklenen |
|---|---|---|
| no-damper | Kanal yangın duvarını keser, damper yok | İhlal |
| damper-near | Kesişim merkezine 0,15 m'de FIREDAMPER | İhlal yok |
| damper-far | Kesişim merkezine 1,2 m'de FIREDAMPER ($> d_{\max} = 0{,}5$ m) | İhlal |
| wrong-damper | Kesişimde BLASTDAMPER (yanlış tür) | İhlal |
| near-miss | Kanal duvar yüzeyinden 0,15 m uzakta geçer | İhlal yok |
| unrated-wall | Kanal yangın dayanımı olmayan duvarı keser | İhlal yok |

**Doğru cevabın bağımsızlığı:**
- Her durum, tüm eşiklerden (tolerans, $d_{\max}$) belirgin bir pay bırakacak biçimde kurgulanmıştır. Böylece beklenen sonuç tartışmasızdır ve sistemin geometri kodundan bağımsız olarak senaryo parametrelerinden belirlenir.
- Bu özellikler üretecin kendi birim testleriyle sınanmaktadır. Testler kesişen kanalların duvarı en az 0,1 m toleransla delip geçtiğini, yakın geçişlerin ise ayrık kaldığını doğrular.

**Deney akışı:** Her tohum için şu adımlar uygulanmıştır:
1. Senaryo boş bir graf veritabanına yüklenir.
2. Kesişimler hesaplanır.
3. Kural çalıştırılır.
4. Bulunan ihlal kimlikleri beklenen kimliklerle karşılaştırılır.

Kesinlik, duyarlılık ve F1 tohum bazında ve toplamda (mikro ortalama) hesaplanmıştır.

### 5.2.2. Sonuçlar

5 tohum × 60 durum = 300 durum (2026-10-11):

| Tohum | Durum | TP | FP | FN | Kesinlik | Duyarlılık | F1 |
|---|---|---|---|---|---|---|---|
| 1 | 60 | 27 | 0 | 0 | 100 % | 100 % | 100 % |
| 2 | 60 | 30 | 0 | 0 | 100 % | 100 % | 100 % |
| 3 | 60 | 31 | 0 | 0 | 100 % | 100 % | 100 % |
| 4 | 60 | 30 | 0 | 0 | 100 % | 100 % | 100 % |
| 5 | 60 | 23 | 0 | 0 | 100 % | 100 % | 100 % |
| **Toplam** | 300 | 141 | 0 | 0 | 100 % | 100 % | 100 % |

Kaynak dosya: `evaluation/results/2026-10-11T08-43-55-658Z-injection.md`.

### 5.2.3. Yorum ve Geçerlilik Sınırları

Sonuç, kural motorunun belirgin marjlı durumlarda **tanımlandığı gibi** çalıştığını göstermektedir. Doğrulanan davranışlar şunlardır:
- kesişim tespiti,
- yangın dayanımı koşulu,
- damper türü filtresi,
- mesafe eşiği,
- tekillik.

Bu sonuç bir başarım iddiası değil, **uygulama doğruluğu** kanıtıdır. Deneyin kapsamadığı iki husus bulunmaktadır:
1. **Eşik civarındaki durumlar** (örn. tolerans altı penetrasyonlar). Duyarlılık analizi ileride ayrı bir deney olarak eklenebilir.
2. **AABB'nin döndürülmüş ve eğimli elemanlardaki aşırı kapsama etkisi.** Senaryo elemanları eksenlere hizalıdır. Bu etki ancak gerçek modellerde ölçülebilir (Bölüm 5.4).

## 5.3. Açıklamaların Dayanaklandırma Değerlendirmesi

Yöntem Bölüm 4.5'te tanımlanmıştır. Değerlendirme kümesi, buildingSMART örnek modellerinin denetiminden çıkan 5 ihlaldir. Bu ihlallerin 4'ü özellik, 1'i kesişim ihlalidir. LLM, yerelde Ollama üzerinde çalışan Llama 3.1 8B modelidir; sıcaklık 0 ve tohum 42 olarak ayarlanmıştır. Ölçüm tarihi 2026-10-11'dir.

| Açıklayıcı | n | Halüsinasyon oranı | Ort. sadakat | Ort. eksiksizlik | Boş açıklama | Atıf kapsaması | Biçim uyumu | Gecikme (medyan) |
|---|---|---|---|---|---|---|---|---|
| Şablon (temel çizgi) | 5 | 0 % | 100 % | 91,4 % | 0 % | 100 % | 100 % | < 1 ms |
| Llama 3.1 8B, istem p1 | 5 | 0 % | tanımsız | 0 % | 100 % | 100 % | 100 %* | 2,8 s |
| Llama 3.1 8B, istem p2 (tek örnekli) | 5 | 0 % | 100 % | 91,4 % | 0 % | 100 % | 100 % | 5,9 s |

\* İstem p1'de model açılış ifadesini Markdown kalın biçimiyle yazmıştır. Biçim denetimi baştaki vurgu işaretlerini yok sayacak şekilde güncellendikten sonra yeniden puanlanmıştır.

**Bulgular:**
1. **p1 ile içeriksiz çıktı.** İlk istemle model hiçbir kimlik veya ölçü içermeyen, yalnızca atıflardan oluşan açıklamalar üretmiştir. Bu açıklamalar uydurma içermediği için yalnızca sadakat ölçülseydi tam puan alacaktı. Bu gözlem, eksiksizlik ölçütünün eklenmesine yol açmıştır (Bölüm 4.5.2).
2. **p2 ile şablon düzeyi.** Tek örnekli istemle model, kesişim ihlalinde iki elemanın sınıfını, adını, GlobalId'sini, kesişim hacmini ve derinliğini doğru biçimde anmıştır. Kural kimliğini ve madde durumunu da doğru aktarmıştır. Uydurma varlık saptanmamıştır.
3. **Eksiksizlik sınırı.** Her iki açıklayıcının eksiksizliği %91,4'te kalmıştır. Nedeni, kesişim ihlalinde kesişim merkezi koordinatlarının açıklamada anılmamasıdır.

**Geçerlilik sınırları:**
- 5 açıklamalık küme istatistiksel bir genelleme için yetersizdir. Öneri formundaki "%3'ün altında halüsinasyon" hedefi, daha büyük bir ihlal kümesi üzerinde ve birden fazla modelle sınanmalıdır (Bölüm 5.4).
- Varlık düzeyindeki denetim anlamsal çarpıtmaları yakalamaz (Bölüm 4.5.3). Bir örneklem üzerinde uzman değerlendirmesi önerilmektedir.

## 5.4. Gerçek Modellerde Değerlendirme

**buildingSMART örnek modelleri.** Mimari ve HVAC modelleri federe edilmiş ve varsayılan kural setiyle denetlenmiştir. Sonuçlar:
- 4 bilgi eksikliği (FireRating tanımsız duvarlar),
- 1 koordinasyon çakışması (kanal × çatı döşemesi),
- yangın damperi ihlali yok.

Modelde yangın dayanımlı duvar bulunmadığından yangın kurallarının bu modelde sınanabilir bir örneği yoktur. Bölüm 3.1.4'te gözlenen duvar–eğimli çatı kesişimleri ise genel çakışma kuralının kapsamına girmemektedir, çünkü kural konu olarak yalnızca tesisat hattı segmentlerini almaktadır. Bu nedenle bu modelde AABB yanlış pozitifleri bulgu listesine yansımamıştır.

**Sonraki adımlar:**
- **İkinci veri seti:** Yangın kurallarının gerçek bir modelde değerlendirilmesi için gerçek tesisat–duvar geçişleri içeren daha gerçekçi bir veri seti gereklidir (öneri: NIBS/buildingSMART "Common BIM Files" Duplex Apartment mimari + MEP).
- **Uzman etiketi:** Altın standart, uzman tarafından `evaluation/gold/TEMPLATE.json` biçiminde hazırlanacaktır.

*(Bekleniyor.)*

## 5.5. Zaman Verimliliği

**Ölçülen süreler.** Her denetimde kural bazındaki süreler `:Audit` düğümünde saklanmaktadır. Örnek modellerde (32 eleman, 5 kural) tüm denetim yaklaşık 10–25 ms, kesişim hesabı birkaç ms sürmüştür. Hata enjeksiyonu senaryolarında (tohum başına yaklaşık 60 kanal, 6–12 duvar ve damperler) kesişim hesabı 6–47 ms, denetim 6–95 ms arasında ölçülmüştür. Uçtaki değerler ilk sorgunun soğuk önbelleğinden kaynaklanmaktadır.

**Manuel denetimle karşılaştırma.** Öneri formundaki karşılaştırma için aynı modelin uzman tarafından manuel denetim süresinin kaydedilmesi gerekmektedir. *(Bekleniyor.)*
