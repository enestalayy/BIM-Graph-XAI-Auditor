# Bölüm 2: Veri İşleme ve Bilgi Grafı İnşası (ETL & KG)

*(Yapay Zeka Asistanı İçin Not: Kod tabanında `src/etl` ve `src/graph` dizinlerinde yapılan her türlü geometrik basitleştirme, veri çıkarma ve graf veritabanı tasarımı mantığını bu dosyaya yazın.)*

## 2.1. IFC Veri Çıkarımı ve AABB (Axis-Aligned Bounding Box) Yaklaşımı
Büyük ölçekli BIM modellerinde tam geometrik kesişim algoritmaları ($O(n^2)$ karmaşıklığı nedeniyle) yüksek hesaplama maliyeti gerektirir. Bu projede tam geometri yerine Eksenlere Hizalı Sınırlayıcı Kutu (AABB - Axis-Aligned Bounding Box) yaklaşımı benimsenmiştir...

## 2.2. Labeled Property Graph (LPG) Tasarımı ve Neo4j
Bina elemanları arasındaki mekansal hiyerarşi (`CONTAINS`, `PART_OF`) ve anlamsal özellikler Neo4j graf veritabanında Labeled Property Graph (LPG) veri modeli ile temsil edilmiştir...
