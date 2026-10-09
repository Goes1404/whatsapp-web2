/** Formatos de data e hora da lista e do chat, como o WhatsApp mostra. */

function mesmoDia(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function diasEntre(a: Date, b: Date): number {
  const ia = new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime();
  const ib = new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime();
  return Math.round((ib - ia) / 86_400_000);
}

export function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** Na lista: hora se hoje, "Ontem", dia da semana nesta semana, senão a data. */
export function quandoNaLista(iso: string | null, agora = new Date()): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (mesmoDia(d, agora)) return hora(iso);
  const dias = diasEntre(d, agora);
  if (dias === 1) return "Ontem";
  if (dias > 1 && dias < 7) return d.toLocaleDateString("pt-BR", { weekday: "long" });
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/** Separador do chat: HOJE, ONTEM, dia da semana ou a data. */
export function separadorDoDia(iso: string, agora = new Date()): string {
  const d = new Date(iso);
  if (mesmoDia(d, agora)) return "HOJE";
  const dias = diasEntre(d, agora);
  if (dias === 1) return "ONTEM";
  if (dias > 1 && dias < 7) return d.toLocaleDateString("pt-BR", { weekday: "long" }).toUpperCase();
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export function chaveDoDia(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

export function duracao(segundos: number | null): string {
  if (!segundos || segundos < 0) return "0:00";
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function iniciais(nome: string): string {
  const partes = nome.replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}
