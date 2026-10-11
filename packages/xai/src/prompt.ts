import { REQUIRED_OPENING, type ViolationContext } from '@bim/core';
import type { Evidence } from './evidence.ts';
import type { GenerateRequest } from './generator.ts';

export const SYSTEM_PROMPT = [
  'Sen bir "Dijital Denetçi"sin: BIM modellerinde saptanan yönetmelik ihlallerini mühendislere açıklayan bir asistansın.',
  'Kurallar:',
  '1. Yalnızca OLGULAR listesindeki bilgileri kullan. Olgularda geçmeyen hiçbir GlobalId, sayı, ölçü, yönetmelik maddesi veya sınıflandırma (örn. EI60) yazma.',
  `2. Açıklamaya tam olarak "${REQUIRED_OPENING}" ifadesiyle başla.`,
  '3. Her cümlenin sonuna dayandığı olguların kimliklerini köşeli parantez içinde yaz, örneğin [F2][F4].',
  '4. Türkçe, teknik ve tarafsız yaz; en fazla 5 cümle. Başlık, madde işareti veya Markdown kullanma.',
  '5. Sayıları olgulardaki gibi yaz. Yuvarlayabilirsin ama olgularda olmayan bir hassasiyet ekleme.',
  '6. Olgularda madde numarası belirlenmemiş veya doğrulanmamışsa bunu belirt; madde numarası uydurma.',
].join('\n');

export function buildPrompt(context: ViolationContext, evidence: Evidence): GenerateRequest {
  const facts = evidence.facts.map((f) => `[${f.id}] ${f.statement}`).join('\n');
  return {
    system: SYSTEM_PROMPT,
    prompt: `İHLAL: ${context.violation.id}\nOLGULAR:\n${facts}\n\nBu ihlalin neden bir hata olduğunu açıkla.`,
  };
}
