import type { CoverageStatus, Rule, RuleOutcome, Selector } from '../api/types.ts';
import { turkishClassName } from './ifc-names.ts';

export const STATUS_LABEL: Readonly<Record<CoverageStatus, string>> = {
  violations: 'İhlal var',
  compliant: 'Uygun',
  'insufficient-data': 'Veri yetersiz',
  'not-applicable': 'Uygulanamaz',
};

const STATUS_ORDER: Readonly<Record<CoverageStatus, number>> = { violations: 0, 'insufficient-data': 1, compliant: 2, 'not-applicable': 3 };
const SEVERITY_ORDER = { critical: 0, major: 1, minor: 2 } as const;

const classes = (selector: Pick<Selector, 'classes'>) => selector.classes.map(turkishClassName).filter((v, i, a) => a.indexOf(v) === i).join(' / ');
const conditionKeys = (selector: Selector) => selector.where.filter((c) => c.property.includes('.')).map((c) => c.property.split('.').pop()).join(', ');

/** One plain-Turkish sentence saying what the rule examined and what came out of it. */
export function coverageSentence(rule: Rule, outcome: RuleOutcome): string {
  const c = outcome.coverage.counts;
  const v = outcome.violations;
  if (rule.kind === 'property') {
    const target = classes(rule.target);
    if (outcome.coverage.status === 'not-applicable') {
      return c.targetClassMembers! > 0
        ? `Modelde ${c.targetClassMembers} ${target} var ama hiçbiri kuralın seçtiği türden değil.`
        : `Modelde bu kuralın hedeflediği eleman (${target}) yok.`;
    }
    return v > 0
      ? `${c.targets} ${target} kontrol edildi: ${v} tanesi uygun değil, ${c.targets! - v} tanesi uygun.`
      : `${c.targets} ${target} kontrol edildi, hepsi uygun.`;
  }
  const subject = classes(rule.subject);
  const object = classes(rule.object);
  switch (outcome.coverage.status) {
    case 'insufficient-data':
      return `Denetlenemedi: modelde ${c.objectClassMembers} ${object} var ama hiçbirinde gerekli bilgi (${conditionKeys(rule.object)}) yok.`;
    case 'not-applicable':
      if (c.subjects === 0) return `Modelde ${subject} yok; kural uygulanamadı.`;
      return c.objectClassMembers! > 0
        ? `Modelde ${c.objectClassMembers} ${object} var ama hiçbiri kuralın seçtiği türden değil; kural uygulanamadı.`
        : `Modelde ${object} yok; kural uygulanamadı.`;
    case 'compliant':
      return c.pairs === 0
        ? `${c.subjects} ${subject} ve ${c.objects} ${object} kontrol edildi; aralarında kesişim yok.`
        : `${c.pairs} kesişim kontrol edildi; hepsinde gerekli koruyucu eleman var.`;
    default: {
      const mitigation = rule.mitigation ? ` Modelde ${c.mitigations} uygun koruyucu eleman (${classes(rule.mitigation)}) var.` : '';
      return `${c.subjects} ${subject} ile ${c.objects} ${object} arasında ${c.pairs} kesişim incelendi, ${v} ihlal bulundu.${mitigation}`;
    }
  }
}

/** Violations first (most severe first), then not checkable, compliant and not applicable. */
export function sortOutcomes(outcomes: readonly RuleOutcome[], rules: ReadonlyMap<string, Rule>): RuleOutcome[] {
  return [...outcomes].sort((a, b) =>
    STATUS_ORDER[a.coverage.status] - STATUS_ORDER[b.coverage.status] ||
    SEVERITY_ORDER[rules.get(a.ruleId)?.severity ?? 'minor'] - SEVERITY_ORDER[rules.get(b.ruleId)?.severity ?? 'minor'] ||
    a.ruleId.localeCompare(b.ruleId));
}
