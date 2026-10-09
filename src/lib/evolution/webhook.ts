/**
 * Interpretação dos eventos que a Evolution v2 manda ao webhook.
 *
 * Módulo PURO. O nome do evento chega em dois formatos (`messages.upsert` e
 * `MESSAGES_UPSERT`) e o `data` muda de forma conforme o evento e a versão:
 * objeto solto, lista, `{ messages: [...] }`. É aqui que isso é absorvido.
 */

import { lerRegistros, lerStatusPublico, registros, type Mensagem, type Reacao, type StatusMensagem } from "./leitura";

export const EVENTOS_DO_WEBHOOK = [
  "MESSAGES_SET",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
  "SEND_MESSAGE",
  "CONTACTS_SET",
  "CONTACTS_UPSERT",
  "CONTACTS_UPDATE",
  "CONNECTION_UPDATE",
];

export type Evento =
  | {
      tipo: "mensagens";
      /** true = histórico vindo do celular: não soma não lidas. */
      historico: boolean;
      mensagens: Mensagem[];
      reacoes: Reacao[];
      /** key + message de cada mensagem, para decifrar a mídia depois. */
      brutos: Map<string, { key: unknown; message: unknown }>;
    }
  | { tipo: "status"; itens: { id: string; status: StatusMensagem }[] }
  | { tipo: "contatos"; contatos: { jid: string; nome: string | null; foto: string | null }[] }
  | { tipo: "ignorar"; motivo: string };

type Obj = Record<string, unknown>;
const ehObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);

/** `messages.upsert` → `MESSAGES_UPSERT`. */
export function nomeDoEvento(v: unknown): string {
  return typeof v === "string" ? v.replace(/[.-]/g, "_").toUpperCase() : "";
}

function lista(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  const r = registros(data);
  if (r.length) return r;
  return ehObj(data) ? [data] : [];
}

export function interpretarEvento(corpo: unknown): Evento {
  if (!ehObj(corpo)) return { tipo: "ignorar", motivo: "corpo inválido" };
  const evento = nomeDoEvento(corpo.event);
  const data = corpo.data;

  switch (evento) {
    case "MESSAGES_UPSERT":
    case "MESSAGES_SET":
    case "SEND_MESSAGE": {
      const itens = lista(data);
      const { mensagens, reacoes } = lerRegistros(itens);
      const brutos = new Map<string, { key: unknown; message: unknown }>();
      for (const i of itens) {
        if (!ehObj(i) || !ehObj(i.key) || !ehObj(i.message)) continue;
        const id = texto(i.key.id);
        if (id) brutos.set(id, { key: i.key, message: i.message });
      }
      // Notificação "append" do upsert também é histórico (mensagem antiga
      // sincronizada), não mensagem que acabou de chegar.
      const historico = evento === "MESSAGES_SET" || (ehObj(data) && data.type === "append");
      return { tipo: "mensagens", historico, mensagens, reacoes, brutos };
    }

    case "MESSAGES_UPDATE": {
      const itens: { id: string; status: StatusMensagem }[] = [];
      for (const i of lista(data)) {
        if (!ehObj(i)) continue;
        const key = ehObj(i.key) ? i.key : null;
        const id = texto(i.keyId) ?? texto(i.messageId) ?? texto(key?.id);
        const status = lerStatusPublico(i.status ?? (ehObj(i.update) ? i.update.status : undefined));
        if (id && status) itens.push({ id, status });
      }
      return itens.length ? { tipo: "status", itens } : { tipo: "ignorar", motivo: "update sem status" };
    }

    case "CONTACTS_SET":
    case "CONTACTS_UPSERT":
    case "CONTACTS_UPDATE": {
      const contatos: { jid: string; nome: string | null; foto: string | null }[] = [];
      for (const i of lista(data)) {
        if (!ehObj(i)) continue;
        const jid = texto(i.remoteJid) ?? (texto(i.id)?.includes("@") ? texto(i.id) : null);
        if (!jid) continue;
        contatos.push({ jid, nome: texto(i.pushName) ?? texto(i.name) ?? texto(i.notify), foto: texto(i.profilePicUrl) });
      }
      return contatos.length ? { tipo: "contatos", contatos } : { tipo: "ignorar", motivo: "contatos vazios" };
    }

    default:
      return { tipo: "ignorar", motivo: evento || "sem evento" };
  }
}
