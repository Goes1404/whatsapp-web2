import { normalizarTelefoneBr } from "./telefone";

/** Só jids do WhatsApp: impede que a rota vire um proxy para qualquer coisa. */
export function jidValido(jid: string): boolean {
  return /^[0-9A-Za-z._:-]{3,64}@(s\.whatsapp\.net|g\.us|lid|c\.us)$/.test(jid);
}

/** Número digitado em "Nova conversa" → jid. `null` quando não é número. */
export function jidDoTelefone(bruto: string): string | null {
  const n = normalizarTelefoneBr(bruto);
  return n ? `${n}@s.whatsapp.net` : null;
}
