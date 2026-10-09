import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { ehGrupo, jidListavel, previa, telefoneLegivel, type Chat, type Mensagem, type Reacao, type StatusMensagem } from "@/lib/evolution/leitura";

/**
 * Leitura e escrita das três tabelas (`wa_conversas`, `wa_mensagens`,
 * `wa_contatos`). Quem escreve é o webhook (e o próprio envio); quem lê são
 * as rotas da tela.
 */

type Linha = {
  id: string;
  jid: string;
  de_mim: boolean;
  em: string;
  tipo: string;
  texto: string | null;
  nome_arquivo: string | null;
  mimetype: string | null;
  duracao: number | null;
  miniatura: string | null;
  status: string | null;
  autor: string | null;
  autor_jid: string | null;
  citada: Mensagem["citada"];
  localizacao: Mensagem["localizacao"];
  reacoes?: Record<string, string> | null;
  bruto?: unknown;
};

export function paraLinha(m: Mensagem, bruto: unknown): Linha {
  return {
    id: m.id,
    jid: m.jid,
    de_mim: m.deMim,
    em: m.em,
    tipo: m.tipo,
    texto: m.texto,
    nome_arquivo: m.nomeArquivo,
    mimetype: m.mimetype,
    duracao: m.duracao === null ? null : Math.round(m.duracao),
    // Miniatura gigante não vale o espaço; a tela usa só como borrão.
    miniatura: m.miniatura && m.miniatura.length <= 20_000 ? m.miniatura : null,
    status: m.status,
    autor: m.autor,
    autor_jid: m.autorJid,
    citada: m.citada,
    localizacao: m.localizacao,
    bruto: bruto ?? null,
  };
}

export function deLinha(l: Linha): Mensagem {
  return {
    id: l.id,
    jid: l.jid,
    deMim: l.de_mim,
    em: new Date(l.em).toISOString(),
    tipo: l.tipo as Mensagem["tipo"],
    texto: l.texto,
    nomeArquivo: l.nome_arquivo,
    mimetype: l.mimetype,
    duracao: l.duracao,
    miniatura: l.miniatura,
    status: (l.status as StatusMensagem) ?? null,
    autor: l.autor,
    autorJid: l.autor_jid,
    citada: l.citada,
    localizacao: l.localizacao,
    reacoes: Object.values(l.reacoes ?? {}).filter((e): e is string => typeof e === "string" && e !== ""),
  };
}

/**
 * Grava mensagens novas e atualiza a conversa de cada uma. Mensagem que já
 * existe não é reescrita (o status dela anda por `atualizarStatus`, e
 * reescrever poderia fazer um ✓✓ azul voltar a ✓). Só mensagem NOVA,
 * recebida e fora do histórico soma não lidas.
 */
export async function salvarMensagens(
  db: SupabaseClient,
  params: {
    mensagens: Mensagem[];
    reacoes?: Reacao[];
    brutos?: Map<string, unknown>;
    historico: boolean;
  },
): Promise<{ novas: number }> {
  const validas = params.mensagens.filter((m) => jidListavel(m.jid));
  let novas: Mensagem[] = [];

  for (let i = 0; i < validas.length; i += 200) {
    const lote = validas.slice(i, i + 200);
    const { data, error } = await db
      .from("wa_mensagens")
      .upsert(lote.map((m) => paraLinha(m, params.brutos?.get(m.id))), { onConflict: "id", ignoreDuplicates: true })
      .select("id");
    if (error) throw new Error(`gravar mensagens: ${error.message}`);
    const ids = new Set((data ?? []).map((r: { id: string }) => r.id));
    novas = novas.concat(lote.filter((m) => ids.has(m.id)));
  }

  // Uma chamada por conversa: a mais recente das novas vira a "última".
  const porJid = new Map<string, Mensagem[]>();
  for (const m of novas) porJid.set(m.jid, [...(porJid.get(m.jid) ?? []), m]);
  for (const [jid, lista] of porJid) {
    const ultima = lista.reduce((a, b) => (b.em > a.em ? b : a));
    const recebidas = params.historico ? 0 : lista.filter((m) => !m.deMim).length;
    const nome = ehGrupo(jid) ? null : lista.find((m) => !m.deMim && m.autor)?.autor ?? null;
    const grupo = ehGrupo(jid);
    const textoUltima =
      (grupo && !ultima.deMim && ultima.autor ? `${ultima.autor}: ` : "") + previa(ultima.tipo, ultima.texto);
    const { error } = await db.rpc("wa_tocar_conversa", {
      p_jid: jid,
      p_grupo: grupo,
      p_em: ultima.em,
      p_texto: textoUltima.slice(0, 500),
      p_de_mim: ultima.deMim,
      p_status: ultima.status,
      p_tipo: ultima.tipo,
      p_incrementar: recebidas,
      p_nome: nome,
    });
    if (error) throw new Error(`atualizar conversa: ${error.message}`);
  }

  for (const r of params.reacoes ?? []) {
    await db.rpc("wa_reagir", { p_id: r.alvo, p_quem: r.quem, p_emoji: r.emoji });
  }

  return { novas: novas.length };
}

/** ✓ → ✓✓ → ✓✓ azul. Nunca volta de "lida". */
export async function atualizarStatus(db: SupabaseClient, itens: { id: string; status: StatusMensagem }[]) {
  for (const { id, status } of itens) {
    if (!status) continue;
    let q = db.from("wa_mensagens").update({ status }).eq("id", id);
    if (status !== "lida") q = q.or("status.is.null,status.neq.lida");
    const { data } = await q.select("jid, em");
    // Se era a última da conversa, o tick da lista acompanha.
    for (const linha of (data ?? []) as { jid: string; em: string }[]) {
      await db.from("wa_conversas").update({ ultima_status: status }).eq("jid", linha.jid).eq("ultima_em", linha.em);
    }
  }
}

export async function salvarContatos(
  db: SupabaseClient,
  contatos: { jid: string; nome: string | null; foto: string | null }[],
) {
  const linhas = contatos
    .filter((c) => jidListavel(c.jid) && (c.nome || c.foto))
    .map((c) => ({
      jid: c.jid,
      ...(c.nome ? { nome: c.nome } : {}),
      ...(c.foto ? { foto: c.foto } : {}),
      atualizado_em: new Date().toISOString(),
    }));
  for (let i = 0; i < linhas.length; i += 500) {
    await db.from("wa_contatos").upsert(linhas.slice(i, i + 500), { onConflict: "jid" });
  }
}

type LinhaConversa = {
  jid: string;
  nome: string | null;
  foto: string | null;
  grupo: boolean;
  ultima_em: string | null;
  ultima_texto: string | null;
  ultima_de_mim: boolean | null;
  ultima_status: string | null;
  ultima_tipo: string | null;
  nao_lidas: number;
};

export async function listarConversasDoBanco(db: SupabaseClient, grupos: Map<string, string>): Promise<Chat[]> {
  const { data, error } = await db
    .from("wa_conversas")
    .select("jid, nome, foto, grupo, ultima_em, ultima_texto, ultima_de_mim, ultima_status, ultima_tipo, nao_lidas")
    .order("ultima_em", { ascending: false, nullsFirst: false })
    .limit(500);
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as LinhaConversa[];

  const contatos = new Map<string, { nome: string | null; foto: string | null }>();
  const jids = linhas.filter((l) => !l.grupo).map((l) => l.jid);
  for (let i = 0; i < jids.length; i += 100) {
    const { data: cs } = await db.from("wa_contatos").select("jid, nome, foto").in("jid", jids.slice(i, i + 100));
    for (const c of (cs ?? []) as { jid: string; nome: string | null; foto: string | null }[]) contatos.set(c.jid, c);
  }

  return linhas.map((l) => {
    const c = contatos.get(l.jid);
    return {
      jid: l.jid,
      nome: (l.grupo ? grupos.get(l.jid) : c?.nome) ?? l.nome ?? telefoneLegivel(l.jid) ?? l.jid.split("@")[0],
      telefone: l.grupo ? null : telefoneLegivel(l.jid),
      grupo: l.grupo,
      foto: l.foto ?? c?.foto ?? null,
      naoLidas: l.nao_lidas,
      em: l.ultima_em ? new Date(l.ultima_em).toISOString() : null,
      ultima: l.ultima_texto !== null
        ? {
            texto: l.ultima_texto,
            deMim: l.ultima_de_mim === true,
            status: (l.ultima_status as StatusMensagem) ?? null,
            tipo: (l.ultima_tipo as Mensagem["tipo"]) ?? "texto",
          }
        : null,
    };
  });
}

export async function mensagensDoBanco(
  db: SupabaseClient,
  jid: string,
  pagina: number,
  porPagina: number,
): Promise<{ mensagens: Mensagem[]; temMais: boolean }> {
  const inicio = (pagina - 1) * porPagina;
  const { data, error } = await db
    .from("wa_mensagens")
    .select("id, jid, de_mim, em, tipo, texto, nome_arquivo, mimetype, duracao, miniatura, status, autor, autor_jid, citada, localizacao, reacoes")
    .eq("jid", jid)
    .order("em", { ascending: false })
    .range(inicio, inicio + porPagina); // um a mais: diz se há página anterior
  if (error) throw new Error(error.message);
  const linhas = (data ?? []) as Linha[];
  const temMais = linhas.length > porPagina;
  return { mensagens: linhas.slice(0, porPagina).map(deLinha).reverse(), temMais };
}

export async function zerarNaoLidas(db: SupabaseClient, jid: string) {
  await db.from("wa_conversas").update({ nao_lidas: 0 }).eq("jid", jid);
}

/** `key` + `message` como chegaram: com eles a Evolution decifra a mídia sem procurar a mensagem. */
export async function brutoDaMensagem(db: SupabaseClient, id: string): Promise<{ key?: unknown; message?: unknown } | null> {
  const { data } = await db.from("wa_mensagens").select("bruto").eq("id", id).maybeSingle();
  const b = (data as { bruto?: unknown } | null)?.bruto;
  return b && typeof b === "object" ? (b as { key?: unknown; message?: unknown }) : null;
}

export async function semConversas(db: SupabaseClient): Promise<boolean> {
  const { count } = await db.from("wa_conversas").select("jid", { count: "exact", head: true });
  return (count ?? 0) === 0;
}

export async function semMensagens(db: SupabaseClient, jid: string): Promise<boolean> {
  const { count } = await db.from("wa_mensagens").select("id", { count: "exact", head: true }).eq("jid", jid);
  return (count ?? 0) === 0;
}

/** Conversas que vieram de `findChats` (sem mensagens) entram na lista. */
export async function semearConversas(db: SupabaseClient, chats: Chat[]) {
  const linhas = chats.map((c) => ({
    jid: c.jid,
    nome: c.grupo ? c.nome : null,
    foto: c.foto,
    grupo: c.grupo,
    ultima_em: c.em,
    ultima_texto: c.ultima?.texto ?? null,
    ultima_de_mim: c.ultima?.deMim ?? null,
    ultima_status: c.ultima?.status ?? null,
    ultima_tipo: c.ultima?.tipo ?? null,
    nao_lidas: c.naoLidas,
  }));
  for (let i = 0; i < linhas.length; i += 500) {
    await db.from("wa_conversas").upsert(linhas.slice(i, i + 500), { onConflict: "jid", ignoreDuplicates: true });
  }
}
