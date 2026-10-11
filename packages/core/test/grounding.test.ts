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
      { kind: 'number', value: '0.129' },
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
