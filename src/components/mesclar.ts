import type { Mensagem } from "./tipos";

/** Mensagem que a tela mostrou antes de o servidor devolvê-la. */
export type Pendente = Mensagem & { idReal?: string | null };

/**
 * Junta o que já está na tela com uma página nova do servidor: a versão do
 * servidor vence (traz o ✓✓ atualizado), nada se repete, ordem cronológica.
 */
export function mesclarMensagens(atual: Mensagem[], novas: Mensagem[]): Mensagem[] {
  const porId = new Map<string, Mensagem>();
  for (const m of atual) porId.set(m.id, m);
  for (const m of novas) porId.set(m.id, m);
  return [...porId.values()].sort((a, b) => a.em.localeCompare(b.em) || a.id.localeCompare(b.id));
}

/**
 * O que mostrar: as do servidor mais as pendentes que ele ainda não trouxe.
 * Pendente cujo `idReal` já chegou some — senão a mensagem apareceria duas
 * vezes por alguns segundos depois de enviada.
 */
export function comPendentes(doServidor: Mensagem[], pendentes: Pendente[]): Mensagem[] {
  const ids = new Set(doServidor.map((m) => m.id));
  const extras = pendentes.filter((p) => !(p.idReal && ids.has(p.idReal)));
  return [...doServidor, ...extras].sort((a, b) => a.em.localeCompare(b.em));
}

/** Ids das recebidas que ainda não foram marcadas como lidas. */
export function recebidasNaoMarcadas(mensagens: Mensagem[], jaMarcadas: Set<string>): string[] {
  return mensagens.filter((m) => !m.deMim && !jaMarcadas.has(m.id) && !m.id.startsWith("temp-")).map((m) => m.id);
}
