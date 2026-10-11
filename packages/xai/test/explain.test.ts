import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { validateGrounding } from '@bim/core';
import { buildEvidence, createLlmExplainer, explainViolation, formatNumber, templateExplainer, type TextGenerator } from '../src/index.ts';
import { intersectionContext, propertyContext } from './fixtures.ts';

describe('formatNumber', () => {
  it('keeps three significant digits with a decimal comma', () => {
    assert.equal(formatNumber(0.12903), '0,129');
    assert.equal(formatNumber(1.9416), '1,94');
    assert.equal(formatNumber(0.0004), '0,0004');
    assert.equal(formatNumber(3), '3');
  });
});

describe('buildEvidence', () => {
  it('states the rule, both elements with the properties the rule tested, the intersection and the missing mitigation', () => {
    const { facts, roles } = buildEvidence(intersectionContext);
    const text = facts.map((f) => f.statement).join('\n');
    assert.match(text, /FS-DUCT-WALL-01/);
    assert.match(text, /Pset_WallCommon\.FireRating = EI60/);
    assert.match(text, /kesişim hacmi 0,008 m³/);
    assert.match(text, /1,94 m uzaklıktadır/);
    assert.match(text, /madde numarası henüz belirlenmemiştir/);
    assert.equal(roles.findings.length, 3);
  });
});

describe('buildEvidence: regulation articles', () => {
  it('names every article of a multi-article reference so each can be cited', () => {
    const context = { ...intersectionContext, rule: { ...intersectionContext.rule, regulation: { source: 'Yönetmelik', article: '24/7, 25/2', verified: true } } };
    const { facts } = buildEvidence(context);
    assert.match(facts[0]!.statement, /madde 24\/7, madde 25\/2\./);
    assert.equal(validateGrounding('Bu bir hatadır çünkü Madde 25/2 gereği geçiş yalıtılmalıdır [F1].', facts).hallucinated, false);
    assert.equal(validateGrounding('Bu bir hatadır çünkü Madde 26 gereği geçiş yalıtılmalıdır [F1].', facts).hallucinated, true);
  });
});

describe('buildEvidence for a property violation', () => {
  it('states the unmet requirement and the actual value in plain words', () => {
    const { facts } = buildEvidence(propertyContext);
    assert.ok(facts.some((f) => f.statement ===
      'Zorunlu koşul karşılanmamaktadır: Pset_WallCommon.FireRating tanımlı olmalı; modeldeki değer: tanımlı değil.'));
  });
});

describe('template explainer', () => {
  for (const [name, context] of [['intersection', intersectionContext], ['property', propertyContext]] as const) {
    it(`is fully grounded and cited for a ${name} violation`, async () => {
      const explanation = await explainViolation(context, templateExplainer);
      assert.equal(explanation.method, 'template');
      assert.equal(explanation.grounding.startsWithRequiredPhrase, true);
      assert.equal(explanation.grounding.hallucinated, false, JSON.stringify(explanation.grounding.unsupported));
      assert.equal(explanation.grounding.citationCoverage, 1);
    });
  }
});

describe('LLM explainer', () => {
  const generator = (answer: string): TextGenerator & { prompts: string[] } => {
    const prompts: string[] = [];
    return { id: 'fake:model', prompts, generate: async ({ prompt }) => { prompts.push(prompt); return answer; } };
  };

  it('sends the numbered facts and records the generator as the method', async () => {
    const fake = generator('Bu bir hatadır çünkü kanal duvarı kesiyor [F2][F3].');
    const explanation = await explainViolation(intersectionContext, createLlmExplainer(fake));
    assert.equal(explanation.method, 'fake:model');
    assert.match(fake.prompts[0]!, /\[F1\] Kural FS-DUCT-WALL-01/);
  });

  it('marks an answer with invented facts as hallucinated', async () => {
    const fake = generator('Bu bir hatadır çünkü Madde 51 gereği EI120 duvarda 3,5 m³ kesişim vardır [F4].');
    const explanation = await explainViolation(intersectionContext, createLlmExplainer(fake));
    assert.equal(explanation.grounding.hallucinated, true);
    assert.equal(explanation.grounding.unsupported.length, 3);
  });

  it('rejects an empty answer', async () => {
    await assert.rejects(explainViolation(intersectionContext, createLlmExplainer(generator('  '))), /empty explanation/);
  });
});
