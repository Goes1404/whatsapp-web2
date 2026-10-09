import "server-only";

/**
 * O único lugar que sabe falar HTTP com a Evolution API v2.
 *
 * As credenciais são as mesmas do next-home (`WHATSAPP_API_URL` e
 * `WHATSAPP_API_KEY`). A instância é uma só por instalação
 * (`WHATSAPP_INSTANCIA`): este app é o WhatsApp Web de UMA pessoa.
 */

export type Config = { baseUrl: string; apiKey: string; instancia: string };

export function configDoProvedor(): Config | null {
  const baseUrl = process.env.WHATSAPP_API_URL;
  const apiKey = process.env.WHATSAPP_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    apiKey,
    instancia: process.env.WHATSAPP_INSTANCIA?.trim() || "whatsapp-web2",
  };
}

export type RespostaProvedor<T = unknown> =
  | { ok: true; status: number; json: T }
  | { ok: false; status: number; detalhe: string };

/**
 * Chamada à Evolution com timeout. Nunca lança: o chamador recebe o motivo
 * em texto, com o começo do corpo — a única pista do que o provedor de fato
 * respondeu (lição do next-home: corpo descartado é diagnóstico perdido).
 */
export async function chamar<T = unknown>(
  config: Config,
  metodo: "GET" | "POST" | "DELETE" | "PUT",
  caminho: string,
  corpo?: unknown,
  timeoutMs = 15_000,
): Promise<RespostaProvedor<T>> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${config.baseUrl}${caminho}`, {
      method: metodo,
      headers: {
        apikey: config.apiKey,
        ...(corpo !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: controller.signal,
      cache: "no-store",
    });
    const texto = await res.text().catch(() => "");
    if (!res.ok) {
      return { ok: false, status: res.status, detalhe: `HTTP ${res.status}${texto ? `: ${texto.slice(0, 300)}` : ""}` };
    }
    let json: unknown = null;
    try {
      json = texto ? JSON.parse(texto) : null;
    } catch {
      json = null;
    }
    return { ok: true, status: res.status, json: json as T };
  } catch (err) {
    const detalhe = err instanceof Error ? (err.name === "AbortError" ? "tempo esgotado" : err.message) : String(err);
    return { ok: false, status: 0, detalhe };
  } finally {
    clearTimeout(timeoutId);
  }
}

export function instanciaUrl(config: Config): string {
  return encodeURIComponent(config.instancia);
}
