/**
 * Sessão por senha única (`APP_SENHA`). Quem entra aqui lê o WhatsApp
 * inteiro da pessoa, então nenhuma página nem rota responde sem sessão.
 *
 * O cookie é `<expira>.<hmac>` assinado com `SESSAO_SEGREDO` (Web Crypto,
 * para rodar igual no proxy e nas rotas). Sem estado no servidor.
 */

export const COOKIE_SESSAO = "wa_sessao";
export const DURACAO_SESSAO_S = 60 * 60 * 24 * 30;

function segredo(): string | null {
  return process.env.SESSAO_SEGREDO || null;
}

function paraHex(buf: ArrayBuffer): string {
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function assinar(valor: string, chave: string): Promise<string> {
  const k = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(chave),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return paraHex(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(valor)));
}

/** Comparação em tempo constante (para o tamanho dado). */
export function iguais(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function criarToken(agora = Date.now()): Promise<string | null> {
  const s = segredo();
  if (!s) return null;
  const expira = String(Math.floor(agora / 1000) + DURACAO_SESSAO_S);
  return `${expira}.${await assinar(`sessao:${expira}`, s)}`;
}

export async function tokenValido(token: string | undefined | null, agora = Date.now()): Promise<boolean> {
  const s = segredo();
  if (!s || !token) return false;
  const [expira, assinatura] = token.split(".");
  if (!expira || !assinatura || !/^\d+$/.test(expira)) return false;
  if (Number(expira) * 1000 < agora) return false;
  return iguais(assinatura, await assinar(`sessao:${expira}`, s));
}

export async function senhaConfere(digitada: string): Promise<boolean> {
  const certa = process.env.APP_SENHA;
  if (!certa || !digitada) return false;
  const s = segredo() ?? "";
  // Compara os HMACs, não as senhas: tamanho fixo, sem vazar o comprimento.
  return iguais(await assinar(digitada, s), await assinar(certa, s));
}
