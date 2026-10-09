import "server-only";

import { chamar, configDoProvedor, instanciaUrl, type Config } from "./cliente";
import { decidirPareamentoPorNumero } from "./pareamento";
import { normalizarTelefoneBr } from "./telefone";
import { EVENTOS_DO_WEBHOOK } from "./webhook";

/**
 * Conectar, consultar e desconectar o número — portado de
 * `next-home/src/lib/whatsapp/provider.ts`, com as mesmas regras:
 *
 * - pareamento por código olha o estado ANTES: em `connecting` a Evolution
 *   ignora o `?number=` e devolve o QR em cache (ver `pareamento.ts`);
 * - só `open` é conectado;
 * - `logout` preserva a instância (reconectar não refaz nada).
 *
 * Diferença deliberada: a instância nasce com `syncFullHistory`, porque um
 * WhatsApp Web sem as conversas que já existem no celular não é WhatsApp Web.
 */

export type EstadoConexao =
  | { ok: true; conectado: boolean; estado: string; telefone: string | null; nome: string | null; foto: string | null }
  | { ok: false; motivo: "provedor_nao_configurado" | "erro_provedor"; detalhe: string };

export type DesfechoPareamento = "codigo" | "qr" | "ja_conectado" | "sem_codigo";

export type ResultadoPareamento =
  | { ok: true; qrcodeBase64: string | null; codigoPareamento: string | null; desfecho: DesfechoPareamento }
  | { ok: false; motivo: "provedor_nao_configurado" | "erro_provedor"; detalhe: string };

const SEM_CONFIG = {
  ok: false as const,
  motivo: "provedor_nao_configurado" as const,
  detalhe: "Defina WHATSAPP_API_URL e WHATSAPP_API_KEY para conectar um número.",
};

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (typeof v === "object" && v !== null ? (v as Obj) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** O webhook que grava as mensagens no banco, quando há banco e endereço. */
function webhookDaInstancia(): Record<string, unknown> | null {
  const url = process.env.WHATSAPP_WEBHOOK_URL;
  const segredo = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!url || !segredo) return null;
  return {
    enabled: true,
    url,
    byEvents: false,
    base64: false,
    headers: { "x-webhook-secret": segredo },
    events: EVENTOS_DO_WEBHOOK,
  };
}

async function garantirInstancia(config: Config, numero?: string | null): Promise<void> {
  const webhook = webhookDaInstancia();
  // Se já existe, a Evolution recusa e seguimos para o connect — de propósito.
  await chamar(config, "POST", "/instance/create", {
    instanceName: config.instancia,
    qrcode: true,
    integration: "WHATSAPP-BAILEYS",
    syncFullHistory: true,
    ...(numero ? { number: numero } : {}),
    ...(webhook ? { webhook } : {}),
  });
  // A instância pode já existir de antes (o create acima é recusado): o
  // webhook é reafirmado sempre, senão as mensagens não chegariam ao banco.
  await garantirWebhook(config);
}

let webhookConferidoEm = 0;

/**
 * `webhook/set` na instância. Idempotente; refeito no máximo a cada 10 min
 * enquanto o número está conectado, para uma troca de endereço ou de
 * segredo valer sem reconectar.
 */
export async function garantirWebhook(config: Config, forcar = true): Promise<void> {
  const webhook = webhookDaInstancia();
  if (!webhook) {
    if (forcar) console.warn("[conexao] WHATSAPP_WEBHOOK_URL/SECRET ausentes: as mensagens não serão gravadas no banco.");
    return;
  }
  if (!forcar && Date.now() - webhookConferidoEm < 10 * 60_000) return;
  const r = await chamar(config, "POST", `/webhook/set/${instanciaUrl(config)}`, { webhook }, 10_000);
  if (r.ok) webhookConferidoEm = Date.now();
  else console.warn(`[conexao] webhook/set falhou: ${r.detalhe}`);
}

/** Dados do perfil conectado (nome e foto), da lista de instâncias. */
async function perfilDaInstancia(config: Config): Promise<{ nome: string | null; foto: string | null; telefone: string | null }> {
  const r = await chamar<unknown>(
    config,
    "GET",
    `/instance/fetchInstances?instanceName=${instanciaUrl(config)}`,
    undefined,
    8_000,
  );
  if (!r.ok) return { nome: null, foto: null, telefone: null };
  const lista = Array.isArray(r.json) ? r.json : [r.json];
  for (const item of lista) {
    const o = obj(item);
    const inst = Object.keys(obj(o.instance)).length ? obj(o.instance) : o;
    const nomeInst = str(inst.name) ?? str(inst.instanceName);
    if (nomeInst && nomeInst !== config.instancia) continue;
    const dono = str(inst.ownerJid) ?? str(inst.owner) ?? str(inst.number);
    return {
      nome: str(inst.profileName),
      foto: str(inst.profilePicUrl),
      telefone: dono ? dono.split("@")[0].replace(/\D/g, "") || null : null,
    };
  }
  return { nome: null, foto: null, telefone: null };
}

export async function consultarEstado(): Promise<EstadoConexao> {
  const config = configDoProvedor();
  if (!config) return SEM_CONFIG;

  const r = await chamar<unknown>(config, "GET", `/instance/connectionState/${instanciaUrl(config)}`, undefined, 10_000);
  if (!r.ok) {
    // 404 = a instância ainda não existe: é "desconectado", não erro.
    if (r.status === 404) return { ok: true, conectado: false, estado: "close", telefone: null, nome: null, foto: null };
    return { ok: false, motivo: "erro_provedor", detalhe: r.detalhe };
  }
  const json = obj(r.json);
  const estado = str(obj(json.instance).state) ?? str(json.state) ?? "desconhecido";
  const conectado = estado === "open";
  const perfil = conectado ? await perfilDaInstancia(config) : { nome: null, foto: null, telefone: null };
  if (conectado) await garantirWebhook(config, false);
  return { ok: true, conectado, estado, ...perfil };
}

/**
 * QR Code (sem telefone) ou código de 8 caracteres (com telefone), para
 * digitar em Aparelhos conectados → Conectar com número de telefone.
 */
export async function pedirPareamento(telefone?: string | null): Promise<ResultadoPareamento> {
  const config = configDoProvedor();
  if (!config) return SEM_CONFIG;

  const numero = telefone ? normalizarTelefoneBr(telefone) ?? "" : "";
  if (telefone && !numero) {
    return { ok: false, motivo: "erro_provedor", detalhe: "Número de telefone inválido." };
  }

  if (numero) {
    const atual = await consultarEstado();
    const decisao = decidirPareamentoPorNumero(atual.ok ? atual.estado : null);
    if (decisao.acao === "recusar") {
      return { ok: true, qrcodeBase64: null, codigoPareamento: null, desfecho: "ja_conectado" };
    }
    if (decisao.acao === "encerrar_antes") await desconectar();
  }

  await garantirInstancia(config, numero || null);

  const caminho = `/instance/connect/${instanciaUrl(config)}${numero ? `?number=${numero}` : ""}`;
  const r = await chamar<unknown>(config, "GET", caminho, undefined, 15_000);
  if (!r.ok) return { ok: false, motivo: "erro_provedor", detalhe: r.detalhe };

  const json = obj(r.json);
  const qr = obj(json.qrcode);
  const base64 = str(json.base64) ?? str(qr.base64);
  const codigo = str(json.pairingCode) ?? str(qr.pairingCode) ?? str(json.code);
  const jaConectado = str(obj(json.instance).state) === "open" || str(json.state) === "open";
  // O `code` cru às vezes é a string do QR (longa); só vale com cara de código.
  const codigoDigitavel = codigo && codigo.replace(/-/g, "").length <= 10 ? codigo : null;

  if (numero && !codigoDigitavel && !jaConectado) {
    console.warn(`[conexao] pareamento por número sem pairingCode — temQr=${Boolean(base64)}`);
  }

  const desfecho: DesfechoPareamento = jaConectado
    ? "ja_conectado"
    : codigoDigitavel
      ? "codigo"
      : base64
        ? "qr"
        : "sem_codigo";

  return { ok: true, qrcodeBase64: base64, codigoPareamento: codigoDigitavel, desfecho };
}

export async function desconectar(): Promise<{ ok: boolean; detalhe?: string }> {
  const config = configDoProvedor();
  if (!config) return { ok: false, detalhe: SEM_CONFIG.detalhe };
  const r = await chamar(config, "DELETE", `/instance/logout/${instanciaUrl(config)}`);
  // 404 = já não havia sessão: o desfecho pedido já é o atual.
  if (!r.ok && r.status !== 404) return { ok: false, detalhe: r.detalhe };
  return { ok: true };
}
