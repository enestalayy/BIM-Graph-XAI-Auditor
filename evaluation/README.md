# Değerlendirme

Tezin doğrulama bölümündeki (docs/05_validation_results.md) deneyler bu klasörde
üretilir ve saklanır.

| Komut | Ne ölçer |
|---|---|
| `npm run cli -- evaluate injection --seeds 1,2,3,4,5 --cases 60` | Kural motorunun doğruluğu: hata enjeksiyonu ile üretilmiş, doğru cevabı bilinen senaryolarda P/R/F1. **NEO4J_TEST_URI'deki veritabanını siler.** |
| `npm run cli -- evaluate gold --file evaluation/gold/<veri-seti>.json` | Gerçek modellerde, uzman etiketlerine (altın standart) göre P/R/F1. Önce modeller `ingest` edilmiş olmalı. |
| `npm run cli -- evaluate explanations --method template\|ollama` | Açıklamaların dayanaklandırması: halüsinasyon oranı, sadakat, atıf kapsaması, biçim uyumu, gecikme. |

Her çalıştırma `results/` altına zaman damgalı bir `.json` (ham veri) ve `.md`
(tabloya hazır özet) yazar.

## Altın standart nasıl hazırlanır

1. `gold/TEMPLATE.json` dosyasını `gold/<veri-seti>.json` olarak kopyalayın.
2. Modelleri sistem çıktısına **bakmadan** inceleyin. Her gerçek ihlal için kural
   kimliğini ve elemanların GlobalId'lerini yazın. Kesişim kurallarında iki eleman,
   özellik kurallarında tek eleman girilir; sıra önemli değildir.
3. `rules` alanına eksiksiz etiketlediğiniz kuralları yazın; yalnızca bu kurallar
   ölçülür (etiketlenmemiş bir kuralın bütün çıktısı yanlış pozitif sayılmasın diye).
4. Etiketleyen kişiyi ve tarihi doldurun. Etiketler sistem çıktısından türetilirse
   ölçüm döngüsel olur ve geçersiz sayılır.
