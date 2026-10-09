import "server-only";

import { chamar, configDoProvedor, instanciaUrl, type Config } from "./cliente";
import { lerChats, lerContatos, lerGrupos, lerMensagens, lerRegistros, type Chat, type Mensagem } from "./leitura";
import { banco } from "@/lib/banco/supabase";
import {
  brutoDaMensagem,
  listarConversasDoBanco,
  mensagensDoBanco,
  salvarMensagens,
  semConversas,
  semMensagens,
  semearConversas,
  zerarNaoLidas,
} from "@/lib/banco/repositorio";

/**
 * Conversas e mensagens.
 *
 * Com o Supabase configurado (`SUPABASE_URL` + `SUPABASE_SECRET_KEY`), a
 * fonte é o banco do app, que o webhook da Evolution preenche
 * (`/api/webhook/evolution`). Sem ele, a fonte é o armazenamento da própria
 * Evolution, que só existe se o servidor dela estiver com
 * `DATABASE_SAVE_DATA_*` ligados (ver README).
 *
 * Banco vazio (conexão recém-feita, ou mensagens anteriores ao webhook): o
 * que a Evolution tiver guardado é importado uma vez, na primeira leitura.
 */

export class ProvedorIndisponivel extends Error {}

function exigirConfig(): Config {
  const c = configDoProvedor();
  if (!c) throw new ProvedorIndisponivel("Provedor de WhatsApp não configurado (WHATSAPP_API_URL / WHATSAPP_API_KEY).");
  return c;
}

/*
 * Cache curto em memória dos nomes (contatos e grupos). A lista de conversas
 * é pedida a cada poucos segundos e esses dados quase não mudam; buscar os
 * três a cada vez triplicaria a carga na Evolution sem mudar nada na tela.
 */
let cacheNomes: { em: number; contatos: ReturnType<typeof lerContatos>; grupos: Map<string, string> } | null = null;
const TTL_NOMES_MS = 60_000;

async function nomes(config: Config) {
  if (cacheNomes && Date.now() - cacheNomes.em < TTL_NOMES_MS) return cacheNomes;
  const [c, g] = await Promise.all([
    chamar(config, "POST", `/chat/findContacts/${instanciaUrl(config)}`, {}, 15_000),
    chamar(config, "GET", `/group/fetchAllGroups/${instanciaUrl(config)}?getParticipants=false`, undefined, 15_000),
  ]);
  cacheNomes = {
    em: Date.now(),
    contatos: c.ok ? lerContatos(c.json) : new Map(),
    grupos: g.ok ? lerGrupos(g.json) : new Map(),
  };
  return cacheNomes;
}

async function conversasDaEvolution(config: Config): Promise<Chat[]> {
  const [r, n] = await Promise.all([
    chamar(config, "POST", `/chat/findChats/${instanciaUrl(config)}`, {}, 20_000),
    nomes(config),
  ]);
  if (!r.ok) throw new Error(r.detalhe);
  return lerChats(r.json, { contatos: n.contatos, grupos: n.grupos });
}

export async function listarConversas(): Promise<Chat[]> {
  const config = exigirConfig();
  const db = banco();
  if (!db) return conversasDaEvolution(config);

  if (await semConversas(db)) {
    const daEvolution = await conversasDaEvolution(config).catch(() => [] as Chat[]);
    if (daEvolution.length) await semearConversas(db, daEvolution);
  }
  const n = await nomes(config);
  return listarConversasDoBanco(db, n.grupos);
}

export const MENSAGENS_POR_PAGINA = 50;

/**
 * Uma página de mensagens do chat, da mais antiga para a mais recente.
 * `pagina` 1 = as mais recentes.
 */
export async function buscarMensagens(
  jid: string,
  pagina = 1,
): Promise<{ mensagens: Mensagem[]; temMais: boolean }> {
  const config = exigirConfig();
  const db = banco();
  if (!db) return mensagensDaEvolution(config, jid, pagina);

  if (pagina === 1 && (await semMensagens(db, jid))) {
    await importarDaEvolution(config, jid).catch((e) => console.warn(`[importar] ${jid}: ${e}`));
  }
  return mensagensDoBanco(db, jid, pagina, MENSAGENS_POR_PAGINA);
}

/** Traz para o banco o que a Evolution já guardou desta conversa (até 500). */
async function importarDaEvolution(config: Config, jid: string) {
  const db = banco();
  if (!db) return;
  const r = await chamar<unknown>(
    config,
    "POST",
    `/chat/findMessages/${instanciaUrl(config)}`,
    { where: { key: { remoteJid: jid } }, page: 1, offset: 500, limit: 500 },
    20_000,
  );
  if (!r.ok) return;
  const { mensagens, reacoes } = lerRegistros(r.json);
  if (!mensagens.length) return;
  await salvarMensagens(db, {
    mensagens: mensagens.filter((m) => m.jid === jid),
    reacoes,
    brutos: brutosDe(r.json),
    historico: true,
  });
}

function brutosDe(resposta: unknown): Map<string, unknown> {
  const mapa = new Map<string, unknown>();
  const lista = Array.isArray(resposta)
    ? resposta
    : ((resposta as { messages?: { records?: unknown[] } } | null)?.messages?.records ?? []);
  for (const i of lista) {
    const o = i as { key?: { id?: unknown }; message?: unknown };
    if (typeof o?.key?.id === "string" && o.message) mapa.set(o.key.id, { key: o.key, message: o.message });
  }
  return mapa;
}

async function mensagensDaEvolution(
  config: Config,
  jid: string,
  pagina: number,
): Promise<{ mensagens: Mensagem[]; temMais: boolean }> {
  const [r, n] = await Promise.all([
    chamar<unknown>(
      config,
      "POST",
      `/chat/findMessages/${instanciaUrl(config)}`,
      { where: { key: { remoteJid: jid } }, page: pagina, offset: MENSAGENS_POR_PAGINA, limit: MENSAGENS_POR_PAGINA },
      20_000,
    ),
    nomes(config),
  ]);
  if (!r.ok) throw new Error(r.detalhe);

  const nomesPorJid = new Map<string, string>();
  for (const [j, c] of n.contatos) if (c.nome) nomesPorJid.set(j, c.nome);

  const mensagens = lerMensagens(r.json, nomesPorJid).filter((m) => m.jid === jid);

  const corpo = (r.json ?? {}) as { messages?: { pages?: unknown; currentPage?: unknown } };
  const paginas = Number(corpo.messages?.pages);
  const atual = Number(corpo.messages?.currentPage ?? pagina);
  const temMais = Number.isFinite(paginas) ? atual < paginas : mensagens.length >= MENSAGENS_POR_PAGINA;
  return { mensagens, temMais };
}

export async function marcarComoLidas(jid: string, ids: string[]): Promise<void> {
  const db = banco();
  if (db) await zerarNaoLidas(db, jid);
  const config = configDoProvedor();
  if (!config || ids.length === 0) return;
  await chamar(config, "POST", `/chat/markMessageAsRead/${instanciaUrl(config)}`, {
    readMessages: ids.map((id) => ({ remoteJid: jid, fromMe: false, id })),
  });
}

export async function fotoDePerfil(jid: string): Promise<string | null> {
  const config = configDoProvedor();
  if (!config) return null;
  const r = await chamar<{ profilePictureUrl?: unknown }>(
    config,
    "POST",
    `/chat/fetchProfilePictureUrl/${instanciaUrl(config)}`,
    { number: jid },
    8_000,
  );
  const url = r.ok ? r.json?.profilePictureUrl : null;
  return typeof url === "string" && url ? url : null;
}

/** Mídia de uma mensagem, já decifrada pela Evolution. */
export async function baixarMidia(params: {
  jid: string;
  id: string;
  deMim: boolean;
}): Promise<{ bytes: Buffer; mimetype: string; nome: string | null } | null> {
  const config = configDoProvedor();
  if (!config) return null;
  /*
   * Com a mensagem INTEIRA (key + message) a Evolution decifra direto, sem
   * procurar a mensagem no banco dela. Só com o id ela procura — e servidor
   * que não guarda mensagens responde "Message not found" (lição do
   * next-home, 30/09/2026: 100% dos áudios falhavam assim).
   */
  const db = banco();
  const bruto = db ? await brutoDaMensagem(db, params.id) : null;
  const message = bruto?.key && bruto?.message
    ? { key: bruto.key, message: bruto.message }
    : { key: { id: params.id, remoteJid: params.jid, fromMe: params.deMim } };
  const r = await chamar<{ base64?: unknown; mimetype?: unknown; fileName?: unknown }>(
    config,
    "POST",
    `/chat/getBase64FromMediaMessage/${instanciaUrl(config)}`,
    { message, convertToMp4: false },
    30_000,
  );
  if (!r.ok) {
    console.warn(`[midia] ${params.id}: ${r.detalhe}`);
    return null;
  }
  const base64 = typeof r.json?.base64 === "string" ? r.json.base64.replace(/^data:[^;]+;base64,/, "") : "";
  if (!base64) return null;
  return {
    bytes: Buffer.from(base64, "base64"),
    mimetype: typeof r.json?.mimetype === "string" && r.json.mimetype ? r.json.mimetype : "application/octet-stream",
    nome: typeof r.json?.fileName === "string" ? r.json.fileName : null,
  };
}

export type ResultadoEnvio = { enviado: true; id: string } | { enviado: false; detalhe: string };

function idDaResposta(json: unknown): string | null {
  const key = (json as { key?: { id?: unknown } } | null)?.key;
  return typeof key?.id === "string" && key.id ? key.id : null;
}

/**
 * A prova de envio é a CHAVE da mensagem (`key.id`), não o HTTP 2xx — regra
 * do next-home depois de 27 mensagens "enviadas" que nunca saíram.
 */
async function comoEnvio(r: Awaited<ReturnType<typeof chamar>>): Promise<ResultadoEnvio> {
  if (!r.ok) return { enviado: false, detalhe: r.detalhe };
  const id = idDaResposta(r.json);
  if (!id) return { enviado: false, detalhe: "O WhatsApp não confirmou o envio." };

  // A resposta do envio É a mensagem: grava já, sem esperar o webhook.
  const db = banco();
  if (db) {
    const { mensagens } = lerRegistros([r.json]);
    if (mensagens.length) {
      await salvarMensagens(db, { mensagens, brutos: brutosDe([r.json]), historico: false }).catch((e) =>
        console.warn(`[envio] gravar ${id}: ${e}`),
      );
    }
  }
  return { enviado: true, id };
}

export async function enviarTexto(jid: string, textoMsg: string, citarId?: string | null): Promise<ResultadoEnvio> {
  const config = exigirConfig();
  const r = await chamar(config, "POST", `/message/sendText/${instanciaUrl(config)}`, {
    number: jid,
    text: textoMsg,
    ...(citarId ? { quoted: { key: { id: citarId } } } : {}),
  });
  return comoEnvio(r);
}

export async function enviarArquivo(params: {
  jid: string;
  base64: string;
  mimetype: string;
  nomeArquivo: string;
  legenda?: string | null;
}): Promise<ResultadoEnvio> {
  const config = exigirConfig();
  const mediatype = params.mimetype.startsWith("image/")
    ? "image"
    : params.mimetype.startsWith("video/")
      ? "video"
      : params.mimetype.startsWith("audio/")
        ? "audio"
        : "document";
  const r = await chamar(
    config,
    "POST",
    `/message/sendMedia/${instanciaUrl(config)}`,
    {
      number: params.jid,
      mediatype,
      mimetype: params.mimetype,
      media: params.base64,
      fileName: params.nomeArquivo,
      ...(params.legenda ? { caption: params.legenda } : {}),
    },
    60_000,
  );
  return comoEnvio(r);
}

/** Áudio gravado na hora: vai como mensagem de voz (o "microfone" do app). */
export async function enviarAudioDeVoz(jid: string, base64: string): Promise<ResultadoEnvio> {
  const config = exigirConfig();
  const r = await chamar(
    config,
    "POST",
    `/message/sendWhatsAppAudio/${instanciaUrl(config)}`,
    { number: jid, audio: base64, encoding: true },
    60_000,
  );
  return comoEnvio(r);
}

/** "digitando..." para o contato. Cosmético: falha nunca interrompe nada. */
export async function enviarDigitando(jid: string): Promise<void> {
  const config = configDoProvedor();
  if (!config) return;
  await chamar(config, "POST", `/chat/sendPresence/${instanciaUrl(config)}`, {
    number: jid,
    presence: "composing",
    delay: 3000,
  }, 5_000);
}
