# BIM-Graph-XAI-Auditor — Dijital Denetçi

> **Automated Clash Auditing in BIM Models using Graph-Based and Explainable AI**
> *BIM Modellerinde Grafik Tabanlı ve Açıklanabilir Yapay Zeka ile Otomatik Çakışma Denetimi*
> Yüksek lisans tezi prototipi — Enes Talay, Ege Üniversitesi Uluslararası Bilgisayar Enstitüsü (danışman: Dr. Öğr. Üyesi Cemre Candemir)

Mimari ve MEP IFC modellerini tek bir **bilgi grafında** birleştirir. Elemanlar
arasındaki kesişimleri **mekansal akıl yürütme** ile saptar. Arayüzden
tanımlanabilen **bildirimsel kuralları Cypher'a derleyerek** yangın güvenliği
ihlallerini deterministik olarak bulur. Her ihlali, kanıta sadakati **ölçülen**
"Bu bir hatadır çünkü…" açıklamalarıyla raporlar.

```
IFC (ARCH, MEP) ──web-ifc──▶ alan modeli ──▶ Neo4j bilgi grafı
                                              │  Element / Model / CONTAINED_IN / AGGREGATES / HOSTED_BY
                                              ▼
                         AABB + sweep-and-prune ──▶ INTERSECTS_WITH {hacim, derinlik}
                                              ▼
       rules/*.json ──derleyici──▶ parametreli Cypher ──▶ Violation {kanıt} ──▶ Rule, Element
                                              ▼
                 kanıt olguları ──▶ şablon | LLM (Ollama) ──▶ açıklama + dayanaklandırma raporu
                                              ▼
                       Fastify API / CLI ──▶ React + three.js arayüz ──▶ değerlendirme
```

## Hızlı başlangıç

Gereksinimler: Node.js ≥ 24, Docker. LLM açıklamaları isteğe bağlıdır ve Ollama gerektirir.

```bash
npm install
cp .env.example .env              # NEO4J_PASSWORD değerini doldurun
docker compose up -d              # Neo4j 5.26
npm run cli -- ingest --discipline ARCH data/sample/Building-Architecture.ifc
npm run cli -- ingest --discipline MEP  data/sample/Building-Hvac.ifc
npm run cli -- audit
npm run cli -- explain --method template
npm run dev                       # API :3000 + arayüz http://localhost:5173
```

İsteğe bağlı yerel LLM (ücretsiz):

```bash
brew install ollama && ollama serve &
ollama pull llama3.1:8b
npm run cli -- explain --method ollama
```

## Komutlar

| Komut | Açıklama |
|---|---|
| `npm test` | Birim testleri (I/O gerektirmez) |
| `npm run test:integration` | Neo4j testleri: `docker compose --profile test up -d neo4j-test` ve `NEO4J_TEST_URI` |
| `npm run typecheck` | Tüm paketlerde tip kontrolü |
| `npm run parity` | web-ifc ↔ IfcOpenShell karşılaştırması (`.venv` içinde ifcopenshell gerekir) |
| `npm run cli -- ingest\|audit\|explain\|evaluate …` | Komut satırı (bkz. `npm run cli`) |
| `npm run dev` / `npm start` / `npm run build` | Geliştirme, yalnızca API, arayüz derlemesi |

## Proje yapısı

```
packages/core    saf alan mantığı: model, geometri, kural dili + Cypher derleyici, dayanaklandırma, metrikler
packages/ifc     web-ifc adaptörü (IFC → alan modeli, birim ve eksen dönüşümü)
packages/graph   Neo4j erişimi (tüm Cypher)
packages/xai     kanıt olguları, şablon açıklayıcı, Ollama
apps/server      Fastify API + CLI + değerlendirme deneyleri
apps/web         React + three.js arayüz
rules/           kural setleri (JSON)
evaluation/      altın standart şablonu ve deney sonuçları
docs/            tez bölümleri (yöntem ve bulgular)
tools/parity     IfcOpenShell karşılaştırma aracı
```

## Kural örneği

```json
{
  "id": "FS-DUCT-WALL-01",
  "kind": "intersection",
  "title": "Yangın dayanımlı duvarı geçen hava kanalında yangın damperi bulunmalı",
  "severity": "critical",
  "regulation": { "source": "Binaların Yangından Korunması Hakkında Yönetmelik (RG 19.12.2007/26735)", "article": "87/8", "verified": true },
  "subject": { "classes": ["IfcDuctSegment"] },
  "object": { "classes": ["IfcWall"], "where": [{ "property": "Pset_WallCommon.FireRating", "op": "exists" }] },
  "mitigation": { "classes": ["IfcDamper"], "where": [{ "property": "predefinedType", "op": "eq", "value": "FIREDAMPER" }], "maxDistance": 0.5 }
}
```

Madde numaraları resmî konsolide metinden (mevzuat.gov.tr) kontrol edilir; kaynak,
tarih ve fıkra alıntısı `regulation.note` alanında tutulur. Kontrol edilmemiş atıflar
`verified: false` kalır.

## Lisans

MIT. Örnek IFC dosyaları buildingSMART International'a aittir (CC BY 4.0, bkz. `data/sample/README.md`).
