# BIM-Graph-XAI-Auditor: Thesis Documentation Repository

Bu klasör (`docs/`), Yüksek Lisans tezinin yazım sürecinde kullanılacak teknik ve akademik materyallerin canlı (living) bir deposudur. 

Yapay zeka asistanları (Cursor, Windsurf, Antigravity vb.) projede yapılan her önemli algoritma, mimari karar ve validasyon sonucunu bu klasördeki ilgili Markdown dosyalarına aktarmakla yükümlüdür.

## 📂 Klasör Yapısı ve Tez Bölümleri

Bu klasör, standart bir akademik tezin iskeletine uygun olarak yapılandırılmıştır:

- **`01_introduction.md`**: Projenin amacı, Neuro-Symbolic yapay zeka yaklaşımının avantajları ve literatürdeki boşluklar.
- **`02_methodology_etl_kg.md`**: IFC ayrıştırma (parsing), AABB geometri çıkarımı ve Neo4j Labeled Property Graph (LPG) inşası sırasındaki kararlar. Neden tam geometri yerine AABB kullanıldığı gibi geometrik/matematiksel gerekçeler.
- **`03_methodology_spatial_audit.md`**: Deterministik mekansal akıl yürütme (Spatial Reasoning). Kesişim algoritmaları, tolerans değerlerinin seçimi ve BYKHY 2015 kurallarının sisteme nasıl entegre edildiği.
- **`04_methodology_xai_rag.md`**: LLM (Büyük Dil Modeli) halüsinasyonlarını engellemek için kurulan RAG (Retrieval-Augmented Generation) mimarisi. Prompt mühendisliği detayları ve "Grounding Validator" mantığı.
- **`05_validation_results.md`**: Sistemin başarısını kanıtlayan metrikler. Precision, Recall, F1 Score hesaplamaları ve Gold Standard veri seti ile kıyaslamalar.

## 🤖 Yapay Zeka Asistanları İçin Talimatlar
*(Instructions for AI Agents)*

**ZORUNLU KURAL (MANDATORY RULE):** Kod tabanında (`src/` veya `tests/`) mantıksal, algoritmik veya mimari bir değişiklik yaptığınızda, bu değişikliğin **AKADEMİK GEREKÇESİNİ (Academic Rationale)** ilgili dokümantasyon dosyasına eklemek zorundasınız.

Tez metnine girecek bu bilgilerde şu formatlara dikkat edin:
1. **Matematiksel İfadeler:** Algoritmaları açıklarken LaTeX mantığı kullanın (örneğin AABB kesişimi formülleri).
2. **Literatür Referansları:** Mümkünse literatürdeki karşılıklarını (Örn: "Separating Axis Theorem") belirterek yazın.
3. **Akademik Dil:** Günlük bir dil yerine, edilgen ve teknik bir akademik dil (Türkçe) kullanın. "Yaptık, ettik" yerine "tasarlanmıştır, uygulanmıştır, tespit edilmiştir" gibi ifadeler tercih edilmelidir.
