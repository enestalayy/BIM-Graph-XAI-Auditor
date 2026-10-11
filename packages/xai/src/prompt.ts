import { REQUIRED_OPENING, type ViolationContext } from '@bim/core';
import type { Evidence } from './evidence.ts';
import type { GenerateRequest } from './generator.ts';

/** Recorded with every LLM explanation so results can be tied to the exact prompt. */
export const PROMPT_VERSION = 'p2';

/**
 * One worked example on invented facts. Its identifiers exist nowhere else, so a
 * model that copies them is caught by the grounding check.
 */
const EXAMPLE = [
  'ÖRNEK OLGULAR:',
  '[F1] Kural EX-01: "Örnek kural" (önem derecesi: critical). Dayanak: Örnek yönetmelik; madde 99.',
  '[F2] Konu eleman: IfcPipeSegment "örnek boru" (GlobalId 0aAaAaAaAaAaAaAaAaAaAa).',
  '[F3] Nesne eleman: IfcWall "örnek duvar" (GlobalId 1bBbBbBbBbBbBbBbBbBbBb); Pset_WallCommon.FireRating = EI90.',
  '[F4] İki eleman kesişmektedir: kesişim hacmi 0,05 m³, penetrasyon derinliği 0,25 m.',
  'ÖRNEK AÇIKLAMA:',
  'Bu bir hatadır çünkü IfcPipeSegment "örnek boru" (GlobalId 0aAaAaAaAaAaAaAaAaAaAa), EI90 sınıflı IfcWall "örnek duvar" ' +
    '(GlobalId 1bBbBbBbBbBbBbBbBbBbBb) ile 0,05 m³ hacimde ve 0,25 m derinlikte kesişmektedir [F2][F3][F4]. ' +
    'Bu durum EX-01 kuralına (madde 99) aykırıdır [F1].',
].join('\n');

export const SYSTEM_PROMPT = [
  'Sen bir "Dijital Denetçi"sin: BIM modellerinde saptanan yönetmelik ihlallerini mühendislere açıklayan bir asistansın.',
  'Kurallar:',
  '1. Yalnızca OLGULAR listesindeki bilgileri kullan. Olgularda geçmeyen hiçbir GlobalId, sayı, ölçü, yönetmelik maddesi veya sınıflandırma (örn. EI60) yazma.',
  `2. Açıklamaya tam olarak "${REQUIRED_OPENING}" ifadesiyle başla.`,
  '3. Her cümlenin sonuna dayandığı olguların kimliklerini köşeli parantez içinde yaz, örneğin [F2][F4].',
  '4. Türkçe, teknik ve tarafsız yaz; en fazla 5 cümle. Başlık, madde işareti veya Markdown kullanma.',
  '5. Sayıları olgulardaki gibi yaz. Yuvarlayabilirsin ama olgularda olmayan bir hassasiyet ekleme.',
  '6. Olgularda madde numarası belirlenmemiş veya doğrulanmamışsa bunu belirt; madde numarası uydurma.',
  '7. İlgili elemanların sınıfını, adını ve GlobalId\'sini ve olgulardaki ölçüleri (hacim, derinlik, mesafe, eksik özellik) açıkça yaz; yalnızca atıf vermek yetmez.',
  '',
  'Aşağıdaki örnek yalnızca biçimi gösterir; içindeki kimlikleri ve değerleri kullanma.',
  EXAMPLE,
].join('\n');

export function buildPrompt(context: ViolationContext, evidence: Evidence): GenerateRequest {
  const facts = evidence.facts.map((f) => `[${f.id}] ${f.statement}`).join('\n');
  return {
    system: SYSTEM_PROMPT,
    prompt: `İHLAL: ${context.violation.id}\nOLGULAR:\n${facts}\n\nBu ihlalin neden bir hata olduğunu açıkla.`,
  };
}
