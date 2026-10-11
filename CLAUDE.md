# BIM-Graph-XAI-Auditor — Proje Talimatları

Bu dosya kullanıcı seviyesindeki `~/.claude/CLAUDE.md`'ye ek olarak geçerlidir.
Çakışma olursa bu dosya kazanır.

## 1. Bu proje nedir

Enes Talay'ın yüksek lisans tezinin yazılım ürünü.

- **Tez (TR):** BIM Modellerinde Grafik Tabanlı ve Açıklanabilir Yapay Zeka ile
  Otomatik Çakışma Denetimi
- **Tez (EN):** Automated Clash Auditing in BIM Models using Graph-Based and
  Explainable AI
- **Kurum:** Ege Üniversitesi, Uluslararası Bilgisayar Enstitüsü, Bilgi
  Teknolojileri Tezli YL. Danışman: Dr. Öğr. Üyesi Cemre Candemir.

Öneri formundaki dört aşama projenin omurgasıdır. Kapsam dışına çıkmadan önce
kullanıcıya sor.

1. **Veri dönüşümü:** IFC (mimari + MEP) → Neo4j bilgi grafiği. Yalnızca denetim
   için gereken özellikler aktarılır.
2. **Mekansal akıl yürütme:** farklı disiplinlerin kesişimleri sınırlayıcı kutu
   ile saptanır ve grafa `INTERSECTS_WITH` ilişkisi olarak yazılır.
3. **Kural tabanlı denetim:** dijitalleştirilmiş yangın kuralları Cypher ile
   graf üzerinde deterministik olarak çalışır.
4. **Açıklanabilir raporlama:** LLM, graftaki somut kanıtlarla "Bu bir hatadır
   çünkü…" diye başlayan izlenebilir rapor üretir.

Öneri formunda Python/IfcOpenShell yazar. Projede TypeScript/web-ifc
kullanılır. Gerekçe ve parity testi: `docs/02_methodology_etl_kg.md`.

## 2. Mimari

npm workspaces, Node ≥ 24, ESM, TypeScript.

- Backend kodu Node'un type-stripping özelliğiyle doğrudan çalışır; build adımı
  yoktur. `tsc` yalnızca tip kontrolü yapar.
- Bu yüzden yalnızca silinebilir TS sözdizimi kullanılır: `enum`, `namespace`
  ve constructor parameter property yasak.
- Importlar `.ts` uzantısıyla yazılır.

```
packages/core   Saf alan mantığı, I/O yok: modeller, geometri, kural şeması + Cypher derleyici, grounding
packages/ifc    web-ifc adaptörü: IFC → Element[] + Relation[]
packages/graph  Neo4j erişimi. Tüm Cypher burada.
packages/xai    Kanıt paketi, şablon açıklayıcı, LLM sağlayıcıları
apps/server     Fastify API + CLI
apps/web        React + Vite arayüz (That Open Components ile 3D)
rules/          Kural setleri (JSON). Arayüz buraya yazar.
tools/parity    web-ifc ↔ IfcOpenShell karşılaştırması. Projedeki tek Python kodu.
docs/           Tez bölümleri (akademik Türkçe)
```

Bağımlılık yönü tek yönlüdür: `core` ← `ifc`, `graph`, `xai` ← `apps/*`.
`core` hiçbir pakete ve I/O'ya bağımlı olamaz.

## 3. Kurallar

- **Dil:** kod, tanımlayıcılar ve kod yorumları İngilizce. `docs/` akademik
  Türkçe. Commit mesajları Türkçe Conventional Commits. Kullanıcıyla Türkçe
  konuşulur.
- **Tez dokümantasyonu zorunlu:** algoritmik, mimari veya metrik düzeyindeki her
  karar, aynı iş parçasında ilgili `docs/0X_*.md` dosyasına işlenir.
  - Edilgen akademik dil kullanılır ("uygulanmıştır, saptanmıştır").
  - Formüller LaTeX ile yazılır.
  - Literatürdeki adı verilir.
  - Kaynak ancak doğrulanabiliyorsa yazılır, doğrulanmamışsa `[doğrulanacak]`
    olarak işaretlenir.
- **Uydurma yasak:**
  - Yönetmelik madde numarası, kaynakça girdisi ya da GUID uydurulmaz.
  - Kural dosyalarında `regulation.verified` alanı, kullanıcı maddeyi mevzuat
    metninden doğrulayana kadar `false` kalır.
  - Yönetmelik: Binaların Yangından Korunması Hakkında Yönetmelik, RG
    19.12.2007/26735 (güncel konsolide hali). "BYKHY 2015" adı kullanılmaz.
- **Abartılı terim yok:** yapılan şey AABB aralık örtüşmesiyse ona "SAT" denmez.
  RAG yoksa "RAG" denmez. Tez metni ile kod birebir uyuşmalı.
- **Cypher:**
  - Yalnızca `packages/graph` içinde yazılır. Tek istisna, kural derleyicisinin
    ürettiği sorgulardır.
  - Değerler her zaman parametre olarak geçer.
  - Etiket ve özellik adları beyaz liste regex'inden geçer ve backtick ile
    kaçırılır.
- **Birimler:** graftaki tüm uzunluklar metre, hacimler m³ cinsindendir.
  Dönüşüm `packages/ifc` içinde açıkça yapılır ve testle doğrulanır.
- **Testler:** `node:test` kullanılır. Birim testleri I/O gerektirmez. Neo4j
  isteyen testler `*.integration.test.ts` adını taşır. `NEO4J_URI` yoksa açıkça
  skip edilir, sessizce geçmez.
- **Sırlar:** `.env` okunmaz ve yazılmaz. Gereken değişkenler `.env.example`'da
  belgelenir.

## 4. Veri gerçekleri

`data/sample/*.ifc` dosyaları git'e girmez.

- **İçerik:** buildingSMART "silly sample scene" (IFC4X3_ADD2, mm birim).
  Mimari ve HVAC dosyaları aynı koordinat sistemini ve ortak site, bina ve kat
  GUID'lerini paylaşır.
- **Bilinen durum:**
  - Hiçbir duvarda FireRating yok. FireRating yalnızca zemin döşemesinde var
    (REI30).
  - Tek kanal (IfcDuctSegment) hiçbir duvarı kesmez; yalnızca çatı döşemesini
    keser.
  - Bu yüzden varsayılan kurallar az ihlal üretir; bu beklenen bir sonuçtur.

## 5. Komutlar

```
npm install
npm test                    # birim testleri
npm run test:integration    # Neo4j gerekir: docker compose up -d
npm run typecheck
npm run cli -- <komut>      # ingest | audit | explain | evaluate
npm run dev                 # API + web
```
