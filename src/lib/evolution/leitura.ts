/**
 * Leitura das respostas da Evolution v2 (`findChats`, `findMessages`,
 * `findContacts`) para o formato que a tela usa.
 *
 * Módulo PURO, sem rede: o formato muda entre versões da Evolution (lista
 * solta, `records`, `messages.records`; `id` que é jid numa versão e cuid na
 * outra) e é aqui que isso é absorvido e testado.
 */

export type StatusMensagem = "pendente" | "enviada" | "entregue" | "lida" | "erro" | null;

export type TipoMensagem =
  | "texto"
  | "imagem"
  | "video"
  | "audio"
  | "documento"
  | "figurinha"
  | "localizacao"
  | "contato"
  | "enquete"
  | "apagada"
  | "desconhecido";

export type Mensagem = {
  id: string;
  jid: string;
  deMim: boolean;
  /** ISO. */
  em: string;
  tipo: TipoMensagem;
  /** Texto da mensagem, ou a legenda da mídia. */
  texto: string | null;
  nomeArquivo: string | null;
  mimetype: string | null;
  /** Segundos de áudio/vídeo. */
  duracao: number | null;
  /** Miniatura JPEG em base64 que vem dentro da própria mensagem. */
  miniatura: string | null;
  status: StatusMensagem;
  /** Em grupo: quem mandou. */
  autor: string | null;
  autorJid: string | null;
  citada: { autor: string | null; texto: string } | null;
  localizacao: { lat: number; lng: number; nome: string | null } | null;
  /** Reações recebidas (emoji). Preenchido por `lerMensagens`. */
  reacoes: string[];
};

export type Chat = {
  jid: string;
  nome: string;
  /** Telefone legível quando não é grupo. */
  telefone: string | null;
  grupo: boolean;
  foto: string | null;
  naoLidas: number;
  /** ISO da última atividade, para ordenar. */
  em: string | null;
  ultima: { texto: string; deMim: boolean; status: StatusMensagem; tipo: TipoMensagem } | null;
};

type Obj = Record<string, unknown>;

function ehObj(v: unknown): v is Obj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v : null;
}
function numero(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  if (ehObj(v) && typeof v.low === "number") return v.low; // Long do protobuf serializado
  return null;
}

export function ehGrupo(jid: string): boolean {
  return jid.endsWith("@g.us");
}

/** Chats que o WhatsApp Web não lista: status, canais e transmissões. */
export function jidListavel(jid: string): boolean {
  return (
    !!jid &&
    jid !== "status@broadcast" &&
    !jid.endsWith("@broadcast") &&
    !jid.endsWith("@newsletter") &&
    jid.includes("@")
  );
}

/** "5511991234567@s.whatsapp.net" → "+55 11 99123-4567". */
export function telefoneLegivel(jid: string): string | null {
  if (!jid.endsWith("@s.whatsapp.net") && !jid.endsWith("@c.us")) return null;
  const d = jid.split("@")[0].split(":")[0].replace(/\D/g, "");
  if (!d) return null;
  if (d.startsWith("55") && (d.length === 12 || d.length === 13)) {
    const ddd = d.slice(2, 4);
    const resto = d.slice(4);
    const corte = resto.length - 4;
    return `+55 ${ddd} ${resto.slice(0, corte)}-${resto.slice(corte)}`;
  }
  return `+${d}`;
}

export function instante(v: unknown): string | null {
  const n = numero(v);
  if (n !== null && n > 0) return new Date(n < 1e12 ? n * 1000 : n).toISOString();
  if (typeof v === "string") {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return null;
}

/** Registros, em qualquer um dos formatos que a Evolution já devolveu. */
export function registros(resposta: unknown): unknown[] {
  if (Array.isArray(resposta)) return resposta;
  if (!ehObj(resposta)) return [];
  if (Array.isArray(resposta.records)) return resposta.records;
  if (ehObj(resposta.messages) && Array.isArray(resposta.messages.records)) return resposta.messages.records;
  if (Array.isArray(resposta.messages)) return resposta.messages;
  if (Array.isArray(resposta.chats)) return resposta.chats;
  if (Array.isArray(resposta.contacts)) return resposta.contacts;
  return [];
}

const STATUS_POR_TEXTO: Record<string, StatusMensagem> = {
  ERROR: "erro",
  PENDING: "pendente",
  SERVER_ACK: "enviada",
  DELIVERY_ACK: "entregue",
  READ: "lida",
  PLAYED: "lida",
};
const STATUS_POR_NUMERO: StatusMensagem[] = ["erro", "pendente", "enviada", "entregue", "lida", "lida"];
const ORDEM: StatusMensagem[] = [null, "erro", "pendente", "enviada", "entregue", "lida"];

function lerStatus(v: unknown): StatusMensagem {
  if (typeof v === "string") return STATUS_POR_TEXTO[v.toUpperCase()] ?? null;
  const n = numero(v);
  if (n !== null && n >= 0 && n < STATUS_POR_NUMERO.length) return STATUS_POR_NUMERO[n];
  return null;
}

/** O status mais avançado entre o da mensagem e o das atualizações dela. */
function statusDe(registro: Obj): StatusMensagem {
  let melhor = lerStatus(registro.status);
  const updates = Array.isArray(registro.MessageUpdate) ? registro.MessageUpdate : [];
  for (const u of updates) {
    if (!ehObj(u)) continue;
    const s = lerStatus(u.status);
    if (ORDEM.indexOf(s) > ORDEM.indexOf(melhor)) melhor = s;
  }
  return melhor;
}

/** Tira os envelopes (efêmera, visualização única, documento com legenda). */
function desembrulhar(message: Obj): Obj {
  let atual = message;
  for (let i = 0; i < 4; i++) {
    const envelope =
      atual.ephemeralMessage ??
      atual.viewOnceMessage ??
      atual.viewOnceMessageV2 ??
      atual.viewOnceMessageV2Extension ??
      atual.documentWithCaptionMessage ??
      atual.editedMessage;
    if (ehObj(envelope) && ehObj(envelope.message)) {
      atual = envelope.message;
      continue;
    }
    break;
  }
  return atual;
}

type Conteudo = Pick<
  Mensagem,
  "tipo" | "texto" | "nomeArquivo" | "mimetype" | "duracao" | "miniatura" | "localizacao"
> & { contexto: Obj | null };

function conteudoDe(messageCru: Obj): Conteudo | null {
  const m = desembrulhar(messageCru);
  const vazio = { nomeArquivo: null, mimetype: null, duracao: null, miniatura: null, localizacao: null };

  const t = texto(m.conversation);
  if (t) return { ...vazio, tipo: "texto", texto: t, contexto: null };

  if (ehObj(m.extendedTextMessage)) {
    const e = m.extendedTextMessage;
    return { ...vazio, tipo: "texto", texto: texto(e.text) ?? "", contexto: ehObj(e.contextInfo) ? e.contextInfo : null };
  }

  const midias: [string, TipoMensagem][] = [
    ["imageMessage", "imagem"],
    ["videoMessage", "video"],
    ["audioMessage", "audio"],
    ["documentMessage", "documento"],
    ["stickerMessage", "figurinha"],
  ];
  for (const [chave, tipo] of midias) {
    const x = m[chave];
    if (!ehObj(x)) continue;
    return {
      tipo,
      texto: texto(x.caption),
      nomeArquivo: texto(x.fileName) ?? texto(x.title),
      mimetype: texto(x.mimetype),
      duracao: numero(x.seconds),
      miniatura: texto(x.jpegThumbnail),
      localizacao: null,
      contexto: ehObj(x.contextInfo) ? x.contextInfo : null,
    };
  }

  const loc = m.locationMessage ?? m.liveLocationMessage;
  if (ehObj(loc)) {
    const lat = numero(loc.degreesLatitude);
    const lng = numero(loc.degreesLongitude);
    return {
      ...vazio,
      tipo: "localizacao",
      texto: texto(loc.name) ?? texto(loc.address),
      localizacao: lat !== null && lng !== null ? { lat, lng, nome: texto(loc.name) } : null,
      contexto: null,
    };
  }

  if (ehObj(m.contactMessage)) {
    return { ...vazio, tipo: "contato", texto: texto(m.contactMessage.displayName) ?? "Contato", contexto: null };
  }
  if (ehObj(m.contactsArrayMessage)) {
    return { ...vazio, tipo: "contato", texto: texto(m.contactsArrayMessage.displayName) ?? "Contatos", contexto: null };
  }

  const enquete = m.pollCreationMessage ?? m.pollCreationMessageV2 ?? m.pollCreationMessageV3;
  if (ehObj(enquete)) return { ...vazio, tipo: "enquete", texto: texto(enquete.name) ?? "Enquete", contexto: null };

  if (ehObj(m.protocolMessage)) {
    // type 0 = REVOKE ("mensagem apagada"). Os outros protocolos não são mensagem.
    const tipo = numero(m.protocolMessage.type) ?? (texto(m.protocolMessage.type) === "REVOKE" ? 0 : -1);
    return tipo === 0 ? { ...vazio, tipo: "apagada", texto: null, contexto: null } : null;
  }

  // Reação, chave de criptografia, recibo: nada que vire balão.
  if (m.reactionMessage || m.senderKeyDistributionMessage || m.messageContextInfo && Object.keys(m).length === 1) {
    return null;
  }

  return { ...vazio, tipo: "desconhecido", texto: null, contexto: null };
}

/** Texto curto para a prévia da lista de conversas. */
export function previa(tipo: TipoMensagem, t: string | null): string {
  const rotulo: Record<TipoMensagem, string> = {
    texto: "",
    imagem: "📷 Foto",
    video: "🎥 Vídeo",
    audio: "🎤 Áudio",
    documento: "📄 Documento",
    figurinha: "Figurinha",
    localizacao: "📍 Localização",
    contato: "👤 Contato",
    enquete: "📊 Enquete",
    apagada: "🚫 Mensagem apagada",
    desconhecido: "Mensagem",
  };
  if (tipo === "texto") return t ?? "";
  if (tipo === "apagada") return rotulo.apagada;
  return t ? `${rotulo[tipo]}${tipo === "documento" || tipo === "contato" ? `: ${t}` : ` · ${t}`}` : rotulo[tipo];
}

function lerUma(registro: unknown, nomes: Map<string, string>): (Mensagem & { _reacao?: { alvo: string; emoji: string } }) | null {
  if (!ehObj(registro)) return null;
  const key = ehObj(registro.key) ? registro.key : null;
  const message = ehObj(registro.message) ? registro.message : null;
  const id = texto(key?.id);
  const jid = texto(key?.remoteJid);
  if (!key || !message || !id || !jid) return null;
  const em = instante(registro.messageTimestamp);
  if (!em) return null;
  const deMim = key.fromMe === true;

  const reacao = ehObj(message.reactionMessage) ? message.reactionMessage : null;
  const autorJid = texto(key.participant) ?? texto(registro.participant);

  if (reacao) {
    const alvo = ehObj(reacao.key) ? texto(reacao.key.id) : null;
    const emoji = texto(reacao.text);
    if (!alvo) return null;
    return {
      id, jid, deMim, em, tipo: "desconhecido", texto: null, nomeArquivo: null, mimetype: null, duracao: null,
      miniatura: null, status: null, autor: null, autorJid, citada: null, localizacao: null, reacoes: [],
      _reacao: { alvo, emoji: emoji ?? "" },
    };
  }

  const c = conteudoDe(message);
  if (!c) return null;

  let citada: Mensagem["citada"] = null;
  if (c.contexto && ehObj(c.contexto.quotedMessage)) {
    const q = conteudoDe(c.contexto.quotedMessage);
    if (q) {
      const quem = texto(c.contexto.participant);
      citada = { autor: quem ? (nomes.get(quem) ?? telefoneLegivel(quem)) : null, texto: previa(q.tipo, q.texto) };
    }
  }

  return {
    id,
    jid,
    deMim,
    em,
    tipo: c.tipo,
    texto: c.texto,
    nomeArquivo: c.nomeArquivo,
    mimetype: c.mimetype,
    duracao: c.duracao,
    miniatura: c.miniatura,
    status: deMim ? statusDe(registro) : null,
    autor: deMim ? null : texto(registro.pushName) ?? (autorJid ? nomes.get(autorJid) ?? telefoneLegivel(autorJid) : null),
    autorJid,
    citada,
    localizacao: c.localizacao,
    reacoes: [],
  };
}

export type Reacao = { alvo: string; quem: string; emoji: string; em: string };

/**
 * Mensagens e reações de uma lista de registros (resposta de `findMessages`
 * ou `data` de um webhook), separadas: a reação não é balão, é um emoji
 * pendurado na mensagem que ela reage.
 */
export function lerRegistros(
  resposta: unknown,
  nomes: Map<string, string> = new Map(),
): { mensagens: Mensagem[]; reacoes: Reacao[] } {
  const vistas = new Map<string, Mensagem>();
  const reacoes: Reacao[] = [];
  for (const r of registros(resposta)) {
    const m = lerUma(r, nomes);
    if (!m) continue;
    if (m._reacao) {
      reacoes.push({ alvo: m._reacao.alvo, quem: m.deMim ? "eu" : m.autorJid ?? m.jid, emoji: m._reacao.emoji, em: m.em });
      continue;
    }
    if (!vistas.has(m.id)) vistas.set(m.id, m);
  }
  return {
    mensagens: [...vistas.values()].sort((a, b) => a.em.localeCompare(b.em)),
    reacoes: reacoes.sort((a, b) => a.em.localeCompare(b.em)),
  };
}

/**
 * Mensagens da resposta de `findMessages`, da mais antiga para a mais
 * recente, sem repetidas, com as reações penduradas na mensagem que reagem.
 */
export function lerMensagens(resposta: unknown, nomes: Map<string, string> = new Map()): Mensagem[] {
  const { mensagens, reacoes } = lerRegistros(resposta, nomes);
  const porAlvo = new Map<string, Map<string, string>>();
  for (const r of reacoes) {
    // A mais recente vale; emoji vazio = reação removida.
    const doAlvo = porAlvo.get(r.alvo) ?? new Map<string, string>();
    doAlvo.set(r.quem, r.emoji);
    porAlvo.set(r.alvo, doAlvo);
  }
  for (const m of mensagens) {
    const r = porAlvo.get(m.id);
    if (r) m.reacoes = [...r.values()].filter(Boolean);
  }
  return mensagens;
}

/** Nome por jid, a partir de `findContacts`. */
export function lerContatos(resposta: unknown): Map<string, { nome: string | null; foto: string | null }> {
  const mapa = new Map<string, { nome: string | null; foto: string | null }>();
  for (const r of registros(resposta)) {
    if (!ehObj(r)) continue;
    const jid = texto(r.remoteJid) ?? (texto(r.id)?.includes("@") ? texto(r.id) : null);
    if (!jid) continue;
    mapa.set(jid, { nome: texto(r.pushName) ?? texto(r.name), foto: texto(r.profilePicUrl) });
  }
  return mapa;
}

/** Nome por jid de grupo, a partir de `/group/fetchAllGroups`. */
export function lerGrupos(resposta: unknown): Map<string, string> {
  const mapa = new Map<string, string>();
  for (const r of registros(resposta)) {
    if (!ehObj(r)) continue;
    const jid = texto(r.id);
    const nome = texto(r.subject);
    if (jid && nome) mapa.set(jid, nome);
  }
  return mapa;
}

/** Conversas de `findChats`, da mais recente para a mais antiga. */
export function lerChats(
  resposta: unknown,
  extras: {
    contatos?: Map<string, { nome: string | null; foto: string | null }>;
    grupos?: Map<string, string>;
  } = {},
): Chat[] {
  const porJid = new Map<string, Chat>();
  for (const r of registros(resposta)) {
    if (!ehObj(r)) continue;
    const jid = texto(r.remoteJid) ?? (texto(r.id)?.includes("@") ? texto(r.id) : null);
    if (!jid || !jidListavel(jid)) continue;

    const grupo = ehGrupo(jid);
    const contato = extras.contatos?.get(jid);
    const ultimaCrua = ehObj(r.lastMessage) ? r.lastMessage : null;
    const ultimaLida = ultimaCrua ? lerMensagens([ultimaCrua])[0] ?? null : null;
    // Em chat individual, o pushName da última mensagem DO CONTATO é o nome dele.
    const nomeDaUltima = ultimaCrua && !grupo && ehObj(ultimaCrua.key) && ultimaCrua.key.fromMe !== true ? texto(ultimaCrua.pushName) : null;

    const nome =
      (grupo ? extras.grupos?.get(jid) ?? texto(r.name) ?? texto(r.subject) : null) ??
      contato?.nome ??
      texto(r.name) ??
      (!grupo ? texto(r.pushName) : null) ??
      nomeDaUltima ??
      telefoneLegivel(jid) ??
      jid.split("@")[0];

    const em = ultimaLida?.em ?? instante(r.updatedAt) ?? instante(r.conversationTimestamp);

    const chat: Chat = {
      jid,
      nome,
      telefone: grupo ? null : telefoneLegivel(jid),
      grupo,
      foto: texto(r.profilePicUrl) ?? contato?.foto ?? null,
      naoLidas: Math.max(0, numero(r.unreadCount) ?? numero(r.unreadMessages) ?? 0),
      em,
      ultima: ultimaLida
        ? {
            texto:
              (grupo && !ultimaLida.deMim && ultimaLida.autor ? `${ultimaLida.autor}: ` : "") +
              previa(ultimaLida.tipo, ultimaLida.texto),
            deMim: ultimaLida.deMim,
            status: ultimaLida.status,
            tipo: ultimaLida.tipo,
          }
        : null,
    };

    const anterior = porJid.get(jid);
    if (!anterior || (chat.em ?? "") > (anterior.em ?? "")) porJid.set(jid, chat);
  }
  return [...porJid.values()].sort((a, b) => (b.em ?? "").localeCompare(a.em ?? ""));
}

/** `READ`, `DELIVERY_ACK`, 3… → status da tela. Para o webhook de MESSAGES_UPDATE. */
export function lerStatusPublico(v: unknown): StatusMensagem {
  return lerStatus(v);
}
