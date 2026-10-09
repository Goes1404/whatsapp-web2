/** `fetch` da tela: sessão vencida leva de volta ao /entrar. */
export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (res.status === 401) {
    window.location.href = "/entrar";
    throw new Error("Sessão expirada.");
  }
  const json = (await res.json().catch(() => ({}))) as T & { erro?: string };
  if (!res.ok) throw new Error(json.erro ?? `Erro ${res.status}`);
  return json;
}

export function caminhoDaConversa(jid: string): string {
  return `/api/conversas/${encodeURIComponent(jid)}`;
}
