# Bölüm 4: Açıklanabilir Yapay Zeka (XAI) ve RAG Mimarisi

*(Yapay Zeka Asistanı İçin Not: `src/xai/` altındaki LangChain kurgusunu, prompt mühendisliğini ve Grounding Validator stratejisini bu belgeye işleyin. LLM halüsinasyonunun nasıl sıfıra indirildiğine özellikle vurgu yapın.)*

## 4.1. Retrieval-Augmented Generation (RAG) Entegrasyonu
Büyük Dil Modelleri (LLM) doğaları gereği deterministik değildir ve endüstriyel standartlarda kritik öneme sahip "yönetmelik denetimi" gibi konularda halüsinasyon (yanlış bilgi üretme) riski barındırırlar. Bu projede, modele doğrudan soru sormak yerine Bilgi Grafı'ndan (Neo4j) elde edilen kesin veriler modelin bağlamına (context) enjekte edilmiştir...

## 4.2. Halüsinasyon Önleme ve Grounding Validator (Dayanaklandırma)
Üretilen XAI denetim raporlarının güvenilirliğini matematiksel olarak kanıtlamak için bir "Grounding Validator" mekanizması geliştirilmiştir. Modelin ürettiği her argüman, girdi olarak verilen kesin verilerle karşılaştırılarak bir "Grounding Score" (Dayanaklandırma Skoru) hesaplanmaktadır...
