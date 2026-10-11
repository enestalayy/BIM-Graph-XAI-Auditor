# Bölüm 5: Doğrulama Metrikleri ve Performans Analizi (Validation)

*(Yapay Zeka Asistanı İçin Not: `tests/validation/metrics.py` sonuçlarını, Precision, Recall, F1 skorlarını ve test senaryolarını çalıştırdıkça tablo ve analiz olarak buraya ekleyin.)*

## 5.1. Test Veri Seti (Gold Standard) ve Doğruluk (Accuracy) Metrikleri
Sistemin çakışma tespiti performansını ölçmek için uzmanlar tarafından manuel olarak işaretlenmiş (Gold Standard) bir BIM modeli kullanılmıştır. Performans ölçümü için Precision (Hassasiyet), Recall (Duyarlılık) ve F1 Skoru hesaplanmıştır:
- **Precision (Hassasiyet):** $TP / (TP + FP)$
- **Recall (Duyarlılık):** $TP / (TP + FN)$

## 5.2. LLM Rapor Kalitesi ve Halüsinasyon Oranı
Oluşturulan raporların akademik geçerliliği, Grounding Score eşik değerleriyle doğrulanmıştır...
