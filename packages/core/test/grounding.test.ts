import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { extractEntities, validateGrounding, type EvidenceFact } from '../src/index.ts';

const facts: EvidenceFact[] = [
  { id: 'F1', statement: 'Kural FS-DUCT-WALL-01 (critical): Binaların Yangından Korunması Hakkında Yönetmelik, madde doğrulanmadı.' },
  { id: 'F2', statement: 'Konu eleman: IfcDuctSegment "supply duct" (GlobalId 38WbwIGD90nB_3T2BTU5Ed).' },
  { id: 'F3', statement: 'Nesne eleman: IfcWall "core wall" (GlobalId 1AQAupaRP1txwK1AGiN61V), Pset_WallCommon.FireRating = EI60.' },
  { id: 'F4', statement: 'Kesişim hacmi 0,129 m³, penetrasyon derinliği 0,2 m.' },
  { id: 'F5', statement: 'En yakın IfcDamper 1,94 m uzaklıkta; izin verilen en büyük mesafe 0,5 m.' },
];

describe('extractEntities', () => {
  it('reads GlobalIds, rule ids, labels and numbers without reading digits inside ids', () => {
    const entities = extractEntities('FS-DUCT-WALL-01: 38WbwIGD90nB_3T2BTU5Ed duvarı (EI60) 0,129 m³ hacimle kesiyor [F4].');
    assert.deepEqual(entities, [
      { kind: 'globalId', value: '38WbwIGD90nB_3T2BTU5Ed' },
      { kind: 'ruleId', value: 'FS-DUCT-WALL-01' },
      { kind: 'label', value: 'EI60' },
      { kind: 'number', value: '0.129 m³' },
    ]);
  });

  it('reads article references', () => {
    assert.deepEqual(extractEntities('Yönetmeliğin Madde 51 hükmü'), [{ kind: 'article', value: '51' }]);
  });
});

describe('validateGrounding', () => {
  it('accepts a faithful explanation with rounded and unit-converted numbers', () => {
    const text = 'Bu bir hatadır çünkü kanal 38WbwIGD90nB_3T2BTU5Ed, EI60 sınıflı duvarı 0,13 m³ hacimle kesmektedir [F2][F3][F4]. ' +
      'Geçişte 0,5 m içinde yangın damperi yoktur; en yakını 194 cm uzaktadır [F5].';
    const report = validateGrounding(text, facts);
    assert.equal(report.hallucinated, false, JSON.stringify(report.unsupported));
    assert.equal(report.faithfulness, 1);
    assert.equal(report.citationCoverage, 1);
    assert.equal(report.startsWithRequiredPhrase, true);
  });

  it('flags an invented GlobalId, article and number', () => {
    const text = 'Bu bir hatadır çünkü 2X9yYbQ3H1PxZ0aBcDeFgH kimlikli kanal Madde 51 gereği 3,7 m³ kesişim oluşturmuştur [F4].';
    const report = validateGrounding(text, facts);
    assert.equal(report.hallucinated, true);
    assert.deepEqual(report.unsupported.map((e) => e.kind).sort(), ['article', 'globalId', 'number']);
    assert.equal(report.faithfulness, 0);
  });

  it('flags a wrong fire rating label', () => {
    assert.deepEqual(validateGrounding('Duvar EI120 sınıfındadır [F3].', facts).unsupported, [{ kind: 'label', value: 'EI120' }]);
  });

  it('counts sentences without citations or with unknown citations as uncovered', () => {
    const report = validateGrounding('Bu bir hatadır çünkü kanal duvarı kesiyor. Damper yok [F9].', facts);
    assert.equal(report.citationCoverage, 0);
    assert.equal(report.hallucinated, false);
  });

  it('notices when the required opening phrase is missing', () => {
    assert.equal(validateGrounding('Kanal duvarı kesiyor [F2].', facts).startsWithRequiredPhrase, false);
  });
});

describe('validateGrounding: unit-aware numbers and robust tokenisation', () => {
  const pool: EvidenceFact[] = [
    { id: 'F1', statement: 'Kural R-01: "Test" (önem derecesi: major). Dayanak: Yönetmelik; madde 7.' },
    { id: 'F2', statement: 'Konu eleman: IfcWall "Duvar 1. Kat" (GlobalId 1uS5vfZPn9R8PlAaVd73on).' },
    { id: 'F3', statement: 'Kesişim hacmi 0,129 m³, penetrasyon derinliği 0,2 m, kesişim merkezi (x 7,9 m; y 8 m; z 4,59 m).' },
    { id: 'F4', statement: 'En yakın eleman 1,94 m uzaklıktadır; sınıfı EI60.' },
  ];

  it('does not let a coordinate support a volume of the same magnitude', () => {
    const report = validateGrounding('Kanal 8 m³ hacimle kesiyor [F3].', pool);
    assert.deepEqual(report.unsupported, [{ kind: 'number', value: '8 m³' }]);
  });

  it('accepts unit conversions within the same dimension only', () => {
    assert.equal(validateGrounding('Hacim 129 L, uzaklık 194 cm, derinlik 200 mm [F3][F4].', pool).hallucinated, false);
    assert.equal(validateGrounding('Uzaklık 1,9416 m [F4].', pool).hallucinated, true);
  });

  it('treats classification labels case-insensitively', () => {
    assert.deepEqual(validateGrounding('Duvar Ei120 sınıfındadır [F4].', pool).unsupported, [{ kind: 'label', value: 'EI120' }]);
    assert.equal(validateGrounding('Duvar ei60 sınıfındadır [F4].', pool).hallucinated, false);
  });

  it('reads short rule ids and abbreviated articles without splitting the sentence', () => {
    const report = validateGrounding('Bu bir hatadır çünkü R-01 kuralı md. 7 gereği sağlanmıyor [F1].', pool);
    assert.equal(report.hallucinated, false, JSON.stringify(report.unsupported));
    assert.equal(report.sentences.length, 1);
  });

  it('does not split sentences at ordinals inside names', () => {
    const report = validateGrounding('Bu bir hatadır çünkü "Duvar 1. Kat" yangın sınıfı içermiyor [F2].', pool);
    assert.equal(report.sentences.length, 1);
    assert.equal(report.citationCoverage, 1);
  });
});

describe('validateGrounding: empty answers and completeness', () => {
  const pool: EvidenceFact[] = [
    { id: 'F1', statement: 'Kural CLASH-1 (önem derecesi: major).' },
    { id: 'F2', statement: 'Konu eleman: IfcDuctSegment "duct" (GlobalId 38WbwIGD90nB_3T2BTU5Ed); model: MEP; konum: 00 groundfloor.' },
    { id: 'F3', statement: 'Nesne eleman: IfcSlab "roof" (GlobalId 12UVOn4wvAJPMUExKdZLb8).' },
    { id: 'F4', statement: 'İki eleman kesişmektedir: kesişim hacmi 0,129 m³, penetrasyon derinliği 0,2 m.' },
  ];
  const required = { requiredFactIds: ['F2', 'F3', 'F4'] };

  it('leaves faithfulness undefined for a text without any checkable entity', () => {
    const report = validateGrounding('Bu bir hatadır çünkü [F1][F2][F3][F4].', pool, required);
    assert.equal(report.faithfulness, null);
    assert.equal(report.completeness, 0);
  });

  it('measures how many key evidence entities (ids, measures) the text mentions', () => {
    const report = validateGrounding('Bu bir hatadır çünkü 38WbwIGD90nB_3T2BTU5Ed kanalı döşemeyi 0,13 m³ hacimle kesiyor [F2][F4].', pool, required);
    assert.equal(report.completeness, 2 / 4); // duct id + volume of {duct id, slab id, volume, depth}
    assert.equal(report.faithfulness, 1);
  });

  it('has no completeness when no facts are required', () => {
    assert.equal(validateGrounding('Bu bir hatadır çünkü [F1].', pool).completeness, null);
  });

  it('accepts the opening phrase wrapped in Markdown emphasis', () => {
    assert.equal(validateGrounding('**Bu bir hatadır çünkü** kanal kesiyor [F2].', pool).startsWithRequiredPhrase, true);
  });
});
