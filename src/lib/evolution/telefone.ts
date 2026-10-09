/**
 * Normalização de telefone brasileiro para o formato que o WhatsApp exige.
 *
 * Copiado do next-home (`src/lib/whatsapp/telefone.ts`). Lá, o envio só
 * tirava a pontuação: `11.95721-6675` virava `11957216675`, sem o `55`, e a
 * Evolution respondia `exists: false` — o erro culpava o número por um
 * defeito do envio. Aqui o número digitado em "Nova conversa" passa por esta
 * função antes de virar destino.
 */

/**
 * Devolve o número em dígitos com DDI, ou `null` quando não dá para
 * aproveitar nada. `null` em vez de "melhor esforço": mandar para um número
 * inventado é pior do que não mandar.
 */
export function normalizarTelefoneBr(bruto: string | null | undefined): string | null {
  const n = (bruto ?? "").replace(/\D/g, "");

  if (n.length === 0) return null;
  // Já tem DDI: 55 + DDD + 8 ou 9 dígitos.
  if (n.startsWith("55") && (n.length === 12 || n.length === 13)) return n;
  // DDD + número, sem DDI.
  if (n.length === 10 || n.length === 11) return `55${n}`;
  // Só o número, sem DDD: assume São Paulo (palpite declarado).
  if (n.length === 8 || n.length === 9) return `5511${n}`;
  // Estrangeiro ou formato que não reconhecemos: passa como está em vez de
  // inventar um DDI brasileiro em cima.
  if (n.length >= 8) return n;

  return null;
}
