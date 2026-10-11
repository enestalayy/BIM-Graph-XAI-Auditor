
---

## 🏗️ BIM-KG-XAI Uygulama Planı (Implementation Plan)

### Aşama 1: Veri Elde Etme ve Ön İşleme (IFC-to-Data)
Bu aşamada amaç, hiyerarşik ve karmaşık olan IFC dosyasını, grafik veritabanına beslenecek temiz bir yapıya dönüştürmektir.

*   **Materyal:** Mimari ve MEP (Mekanik, Elektrik, Tesisat) disiplinlerine ait IFC dosyaları (IFC 2x3 veya IFC4)[cite: 2].
*   **Teknoloji:** `Python 3.10+` ve `IfcOpenShell` kütüphanesi[cite: 1, 2].
*   **İşlem:**
    *   **Parsing:** IFC dosyasındaki elemanların (IfcWall, IfcPipe, IfcDoor vb.) özniteliklerini (Attributes) ve mülkiyet setlerini (Pset) ayıklamak[cite: 2].
    *   **Geometrik Basitleştirme:** Her elemanın `GlobalID`'sini ana anahtar yaparak Bounding Box (sınırlayıcı kutu) ve merkez noktası (centroid) verilerini hesaplamak[cite: 13, 15].
    *   **Format Dönüşümü:** Verileri Neo4j'e aktarmak üzere ara format olan `JSON` veya `CSV` haline getirmek[cite: 11].

### Aşama 2: Bilgi Grafiği İnşası (Knowledge Graph Construction)
Statik IFC verisini canlı, sorgulanabilir bir ilişki ağına dönüştüreceğiz.

*   **Teknoloji:** `Neo4j` (Grafik Veritabanı) ve `Cypher` (Sorgu Dili)[cite: 2].
*   **Yöntem:** **Labeled Property Graph (LPG)** modeli[cite: 15].
*   **Mimarinin Kurulması:**
    *   **Düğümler (Nodes):** Her bina elemanı bir düğümdür (Etiketler: `:Wall`, `:Pipe`, `:Space`)[cite: 15].
    *   **İlişkiler (Relationships):** IFC'deki hiyerarşiyi grafik bağlarına dönüştürmek (Örn: `(Wall)-[:CONTAINS]->(Opening)`, `(Space)-[:PART_OF]->(Floor)`)[cite: 9, 15].
    *   **Semantik Zenginleştirme:** Bina kodlarından (yangın yönetmeliği) gelen kavramları (Örn: "Yangın Dayanımlı Duvar") düğüm özelliği olarak eklemek[cite: 11, 13].

### Aşama 3: Mekansal Akıl Yürütme ve Çakışma Denetimi (The Audit Logic)
Denetim sürecinin deterministik (kesin) olduğu aşamadır.

*   **Teknoloji:** `Neo4j Spatial` eklentisi veya Python tabanlı geometrik kontrolörler.
*   **Yöntem:** **Spatial Reasoning** (Mekansal Akıl Yürütme)[cite: 2].
*   **Algoritma Akışı:**
    1.  **Geometrik Kesişim:** İki farklı disiplinden elemanın (Örn: Boru ve Duvar) sınırlayıcı kutularının çakışıp çakışmadığını saptamak[cite: 13].
    2.  **Kural Uygulama:** Saptanan çakışmayı Cypher sorgularıyla yangın yönetmeliğine göre filtrelemek[cite: 2, 11].
    3.  **Örnek Senaryo:** "Eğer bir boru (`:Pipe`), `:FireWall` etiketli bir duvarı deliyorsa ve bu kesişim noktasında bir `:FireDamper` yoksa, bu bir ihlaldir"[cite: 2, 11].
    4.  **Sonuç:** Tespit edilen her ihlal, grafikte `:CLASH_OCCURRED` ilişkisiyle işaretlenir ve detaylar (kesişim hacmi, türü) bu ilişkiye özellik olarak atanır[cite: 2].

### Aşama 4: XAI Katmanı ve LLM Entegrasyonu (Explainable Reporting)
Tezinin "fark yaratan" ve doktora kabülünü sağlayacak en kritik aşamasıdır.

*   **Teknoloji:** `LangChain` çerçevesi, `Retrieval-Augmented Generation (RAG)` ve `Gemini 3 Flash` veya `Llama 3-8B` modelleri[cite: 1, 3, 11].
*   **Yöntem:** **Neuro-Symbolic AI**[cite: 9, 11].
*   **Süreç:**
    *   **RAG Mimari:** LLM'e sadece genel bir soru sormak yerine, Neo4j'den gelen somut veriyi (GlobalID, yönetmelik maddesi, teknik parametreler) "context" (bağlam) olarak sunmak[cite: 11].
    *   **XAI Layer:** LLM'in cevabı üretirken izlediği mantığı XML tabanlı karar ağaçlarıyla veya doğal dilde adım adım gerekçelendirmesini istemek[cite: 1, 11].
    *   **Prompt Engineering:** LLM'e bir "Dijital Denetçi" rolü vererek, "Bu bir hatadır çünkü..." ile başlayan, teknik kanıtlara dayalı raporlar ürettirmek[cite: 1, 11].

### Aşama 5: Validasyon ve Performans Analizi
Akademik etik gereği sistemin başarısını kanıtlaman gerekir.

*   **Metrikler:**
    *   **Hassasiyet ve Geri Çağırma (Precision & Recall):** Manuel denetim sonuçlarıyla (Gold Standard) AI sonuçlarını karşılaştırmak[cite: 1, 13].
    *   **Hallüsinasyon Oranı:** LLM'in ürettiği raporların ne kadarının grafik verisine sadık kaldığını ölçmek (Hedef: <%3 hata)[cite: 11, 12].
    *   **Zaman Verimliliği:** Manuel denetim süresi ile otomatik denetim süresini kıyaslamak[cite: 5, 13].

---

## 🛠️ Kullanılacak Teknoloji Yığını (Tech Stack)

| Katman | Araç / Teknoloji | Neden? |
| :--- | :--- | :--- |
| **BIM İşleme** | `IfcOpenShell (Python)` | Açık kaynaklı ve IFC şemasına tam erişim sağlar[cite: 2]. |
| **Veritabanı** | `Neo4j` | İlişkisel verilerde (BIM topolojisi) SQL'den çok daha hızlıdır[cite: 15]. |
| **Zeka (Core)** | `Gemini 3 Flash Image` | Doküman ve görsel (plan) analizi için optimize edilmiştir (Ücretli Tier avantajı). |
| **Orchestration** | `LangChain / LangGraph` | Grafik verisi ile LLM arasındaki veri akışını yönetmek için endüstri standardıdır[cite: 11]. |
| **Görselleştirme** | `Streamlit` | Mühendislerin raporları görebileceği hızlı ve şık bir web arayüzü sunar. |
